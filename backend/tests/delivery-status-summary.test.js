const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeliveryStatusSummary, normalizeIds } = require('../deliveryStatusSummary');

function fakeDb(rowsByTable) {
  const calls = [];
  const dbQuery = async (sql, params) => {
    calls.push({ sql, params });
    for (const [needle, rows] of Object.entries(rowsByTable)) {
      if (sql.includes(needle)) return rows;
    }
    return [];
  };
  return { dbQuery, calls };
}

test('normalizeIds drops empty, duplicated and unsafe values', () => {
  assert.deepEqual(normalizeIds('561, 545,,561,abc def,<script>,546'), ['561', '545', '546']);
  assert.deepEqual(normalizeIds(['561', '561', ' 545 ']), ['561', '545']);
  assert.deepEqual(normalizeIds(''), []);
});

test('a single summary call reads each table once instead of one query per transaction', async () => {
  const { dbQuery, calls } = fakeDb({
    digital_contracts: [
      { transaction_id: '561', pc_type: 'TEE' },
      { transaction_id: '545', pc_type: 'PRE' },
      { transaction_id: '544', pc_type: 'HE' },
      { transaction_id: '543', pc_type: 'FL' },
      { transaction_id: '542', pc_type: 'MPC' }
    ],
    delivery_secure_jobs: [{
      transaction_id: '561', status: 'SUCCESS', step: 'COMPLETED', result_status: 'READY',
      current_attempt_id: 34, cleanup_status: 'DONE', last_error: null
    }],
    pre_delivery_contracts: [{
      transaction_id: '545', pcp_contract_id: 'pcp-pre-1', pcp_status: 'PAM_PASSED',
      current_attempt_id: 'attempt-1', buyer_public_key_ready: 1, result_ready: 1, last_error: null
    }],
    he_delivery_contracts: [{
      transaction_id: '544', pcp_contract_id: 'pcp-he-1', pcp_status: 'COMPUTED',
      current_attempt_id: null, public_keys_ready: 1, result_ready: 0, last_error: null
    }],
    fl_delivery_contracts: [{
      transaction_id: '543', pcp_contract_id: 'pcp-fl-1', pcp_status: 'RUNNING', result_ready: 0, last_error: null
    }],
    mpc_delivery_contracts: [{
      transaction_id: '542', remote_task_id: 'task-9', task_status: 'computing', result_ready: 0, last_error: null
    }]
  });

  const { summarize } = createDeliveryStatusSummary(dbQuery);
  const items = await summarize(['561', '545', '544', '543', '542']);

  assert.equal(calls.length, 6, 'one contract query plus one query per pc_type');
  assert.equal(items['561'].tee.requested, true);
  assert.equal(items['561'].tee.resultReady, true);
  assert.equal(items['545'].record.pcp_status, 'PAM_PASSED');
  assert.equal(items['544'].record.public_keys_ready, true);
  assert.equal(items['543'].record.pcp_status, 'RUNNING');
  assert.equal(items['542'].record.task_status, 'computing');
  assert.equal(items['542'].record.remote_task_id, 'task-9');
});

test('transaction ids without a local delivery record stay null instead of guessing', async () => {
  const { dbQuery, calls } = fakeDb({
    digital_contracts: [{ transaction_id: '540', pc_type: 'PRE' }]
  });
  const { summarize } = createDeliveryStatusSummary(dbQuery);
  const items = await summarize(['540']);
  assert.equal(items['540'].record, null);
  assert.equal(items['540'].tee, null);
  assert.equal(calls.length, 2);
});

test('summary never issues per-transaction queries even for a full page', async () => {
  const ids = Array.from({ length: 50 }, (_, index) => String(500 + index));
  const { dbQuery, calls } = fakeDb({
    digital_contracts: ids.map((id, index) => ({ transaction_id: id, pc_type: index % 2 ? 'TEE' : 'PRE' })),
    delivery_secure_jobs: ids.filter((_, index) => index % 2).map((id) => ({
      transaction_id: id, status: 'PENDING', step: 'REQUESTED', result_status: null,
      current_attempt_id: null, cleanup_status: null, last_error: null
    })),
    pre_delivery_contracts: ids.filter((_, index) => !(index % 2)).map((id) => ({
      transaction_id: id, pcp_contract_id: `pcp-${id}`, pcp_status: 'CREATED',
      current_attempt_id: null, buyer_public_key_ready: 0, result_ready: 0, last_error: null
    }))
  });
  const { summarize } = createDeliveryStatusSummary(dbQuery);
  const items = await summarize(ids);
  assert.equal(calls.length, 3);
  assert.equal(Object.keys(items).length, 50);
});
