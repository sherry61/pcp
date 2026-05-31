const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DELIVERY_METHOD_HE,
  HE_ENC_TYPES,
  HE_OPERATIONS,
  PCP_HE_STATUSES
} = require('../pcp/constants');

test('HE constants expose the only enabled delivery method and supported PCP enums', () => {
  assert.equal(DELIVERY_METHOD_HE, 'he');
  assert.deepEqual(HE_ENC_TYPES, ['Paillier', 'ElGamal']);
  assert.deepEqual(HE_OPERATIONS, ['ADD', 'MUL']);
  assert.deepEqual(PCP_HE_STATUSES, [
    'NOT_EXIST',
    'CREATED',
    'WAITING_INPUT',
    'QUEUED',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'AUDIT_FAILED'
  ]);
});
