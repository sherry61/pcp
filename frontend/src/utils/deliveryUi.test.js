const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  TEE_NOTICE_STAGES,
  canOpenDeliveryDetail,
  claimTeeNotice,
  prepareInitialTeeResultNotice,
  getTeeNotice
} = require('./deliveryUi');

test('enables delivery details only when each method has a real delivery record', () => {
  assert.equal(canOpenDeliveryDetail('TEE', { teeRequested: false }), false);
  assert.equal(canOpenDeliveryDetail('TEE', { teeRequested: true }), true);
  assert.equal(canOpenDeliveryDetail('HE', { heRecord: { has_record: true } }), true);
  assert.equal(canOpenDeliveryDetail('HE', { heRecord: { public_keys_ready: false } }), false);
  assert.equal(canOpenDeliveryDetail('FL', { flRecord: { pcp_contract_id: 'fl-1' } }), true);
  assert.equal(canOpenDeliveryDetail('PRE', { preRecord: { current_attempt_id: 'pre-1' } }), true);
  assert.equal(canOpenDeliveryDetail('MPC', { mpcRecord: { remote_task_id: 'mpc-1' } }), true);
  assert.equal(canOpenDeliveryDetail('MPC', { mpcRecord: null }), false);
});

test('claims each TEE notice once per role, transaction and stage', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const input = { role: 'buyer', transactionId: 'tx-17', stage: TEE_NOTICE_STAGES.RESULT_READY };

  assert.equal(claimTeeNotice(storage, input), true);
  assert.equal(claimTeeNotice(storage, input), false);
  assert.equal(claimTeeNotice(storage, { ...input, role: 'seller' }), true);
});

test('result notices are scoped to the signed-in buyer and the delivery attempt', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const input = {
    role: 'buyer', identity: 'buyer-8', transactionId: '530',
    attemptId: 41, stage: TEE_NOTICE_STAGES.RESULT_READY
  };

  assert.equal(claimTeeNotice(storage, input), true);
  assert.equal(claimTeeNotice(storage, input), false);
  assert.equal(claimTeeNotice(storage, { ...input, attemptId: 42 }), true);
  assert.equal(claimTeeNotice(storage, { ...input, identity: 'buyer-9' }), true);
});

test('initial status sync suppresses old completed rows and leaves only the latest result eligible', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value)
  };
  const rows = [
    { transaction_id: '528', teeResultReady: true, teeCurrentAttemptId: 40 },
    { transaction_id: '529', teeResultReady: false, teeCurrentAttemptId: 41 },
    { transaction_id: '530', teeResultReady: true, teeCurrentAttemptId: 42 }
  ];

  const latest = prepareInitialTeeResultNotice(storage, rows, { role: 'buyer', identity: 'buyer-8' });
  assert.equal(latest.transaction_id, '530');
  assert.equal(claimTeeNotice(storage, {
    role: 'buyer', identity: 'buyer-8', transactionId: '528',
    attemptId: 40, stage: TEE_NOTICE_STAGES.RESULT_READY
  }), false, 'older completed results are acknowledged silently');
  assert.equal(claimTeeNotice(storage, {
    role: 'buyer', identity: 'buyer-8', transactionId: '530',
    attemptId: 42, stage: TEE_NOTICE_STAGES.RESULT_READY
  }), true, 'latest completed result is still eligible for one popup');
});

test('delivery pages leave status-triggered notifications to the global monitor', () => {
  for (const name of ['DeliveryBuyer2.vue', 'DeliverySeller2.vue']) {
    const source = fs.readFileSync(path.join(__dirname, '../views', name), 'utf8');
    assert.doesNotMatch(source, /this\.showTeeNotice\([^\n]*TEE_NOTICE_STAGES\.(?:RESULT_READY|MODEL_UPLOAD_REQUIRED|SELLER_ACTION_REQUIRED)/);
    assert.doesNotMatch(source, /prepareInitialTeeResultNotice/);
    assert.match(source, /openDeliveryNotificationTarget/);
  }
});

test('a storage failure suppresses the notice without interrupting delivery logic', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

  assert.doesNotThrow(() => claimTeeNotice(storage, { role: 'buyer', transactionId: 'tx-1', stage: 'REQUEST_STARTED' }));
  assert.equal(claimTeeNotice(storage, { role: 'buyer', transactionId: 'tx-1', stage: 'REQUEST_STARTED' }), false);
});

test('provides the approved TEE-only notice messages', () => {
  const expected = [
    TEE_NOTICE_STAGES.PREPARE_PARAMETERS,
    TEE_NOTICE_STAGES.REQUEST_STARTED,
    TEE_NOTICE_STAGES.MODEL_UPLOAD_REQUIRED,
    TEE_NOTICE_STAGES.SELLER_ACTION_REQUIRED,
    TEE_NOTICE_STAGES.RESULT_READY,
    TEE_NOTICE_STAGES.CLEANUP_SCHEDULED
  ];

  for (const stage of expected) {
    const notice = getTeeNotice(stage, 'tx-88');
    assert.ok(notice?.title);
    assert.match(notice.message, /tx-88/);
    assert.equal(notice.duration, 0);
    assert.equal(notice.showClose, true);
  }
  assert.equal(getTeeNotice('HE_RESULT_READY', 'tx-88'), null);
});

test('model upload notice tells the buyer that the secure service is waiting', () => {
  const notice = getTeeNotice(TEE_NOTICE_STAGES.MODEL_UPLOAD_REQUIRED, '513');
  assert.equal(notice.title, '需要上传计算模型');
  assert.match(notice.message, /交易 513/);
  assert.match(notice.message, /平台后端/);
  assert.doesNotMatch(notice.message, /浏览器内加密/);
  assert.equal(notice.showClose, true);
});
