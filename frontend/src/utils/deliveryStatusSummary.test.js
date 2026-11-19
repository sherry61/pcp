const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyDeliveryStatusItem,
  compactRecord,
  summaryIds
} = require('./deliveryStatusSummary');

test('summaryIds keeps the first occurrence and drops empty ids', () => {
  assert.deepEqual(
    summaryIds([{ transaction_id: 561 }, { transaction_id: '561' }, { transaction_id: '' }, {}, { transaction_id: 545 }]),
    ['561', '545']
  );
});

test('TEE summary fills the fields the status label depends on', () => {
  const row = { pc_type: 'TEE', teeRequested: false, teeStatus: '', teeStep: '', teeResultReady: false };
  const applied = applyDeliveryStatusItem(row, {
    pcType: 'TEE',
    tee: { requested: true, status: 'SUCCESS', step: 'RESULT_READY', resultReady: true, currentAttemptId: 34 }
  });
  assert.equal(applied, true);
  assert.equal(row.teeRequested, true);
  assert.equal(row.teeStatus, 'SUCCESS');
  assert.equal(row.teeStep, 'RESULT_READY');
  assert.equal(row.teeResultReady, true);
  assert.equal(row.teeCurrentAttemptId, 34);
});

test('an in-flight per-row refresh is not overwritten by the batch summary', () => {
  const row = { pc_type: 'TEE', teeRequested: false, teeStatusRefreshing: true };
  assert.equal(applyDeliveryStatusItem(row, { pcType: 'TEE', tee: { requested: true, status: 'PENDING' } }), false);
  assert.equal(row.teeRequested, false);
});

test('non-TEE summary merges into the record the label logic already reads', () => {
  const pre = { pc_type: 'PRE' };
  applyDeliveryStatusItem(pre, {
    pcType: 'PRE',
    record: { pcp_status: 'PAM_PASSED', pcp_contract_id: 'pcp-1', buyer_public_key_ready: true, result_ready: true }
  });
  assert.equal(pre.preRecord.pcp_status, 'PAM_PASSED');
  assert.equal(pre.preRecord.pcp_contract_id, 'pcp-1');
  assert.equal(pre.preRecord.buyer_public_key_ready, true);
  assert.equal(pre.preRecord.result_ready, true);

  const mpc = { pc_type: 'MPC' };
  applyDeliveryStatusItem(mpc, { pcType: 'MPC', record: { task_status: 'done', remote_task_id: 'task-1' } });
  assert.equal(mpc.mpcRecord.task_status, 'done');
  assert.equal(mpc.mpcRecord.remote_task_id, 'task-1');
});

test('missing local records leave the row untouched instead of inventing a state', () => {
  const row = { pc_type: 'PRE', preRecord: null };
  assert.equal(applyDeliveryStatusItem(row, { pcType: 'PRE', record: null }), false);
  assert.equal(row.preRecord, null);
  assert.equal(applyDeliveryStatusItem(row, { pcType: 'TEE', tee: null }), false);
  assert.equal(row.teeRequested, undefined);
});

test('compactRecord only carries status fields, never tokens', () => {
  const record = compactRecord({
    pcp_status: 'PAM_PASSED',
    download_token: 'secret-token',
    result_storage_path: '/tmp/x',
    result_ready: true
  });
  assert.equal(record.pcp_status, 'PAM_PASSED');
  assert.equal(record.result_ready, true);
  assert.equal('download_token' in record, false);
  assert.equal('result_storage_path' in record, false);
});
