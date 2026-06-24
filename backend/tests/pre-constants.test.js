const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DELIVERY_METHOD_PRE,
  PRE_ALLOWED_SOURCE_EXTENSIONS,
  PCP_PRE_STATUSES
} = require('../pcp/constants');

test('PRE constants expose the delivery method, source archive extensions, and statuses', () => {
  assert.equal(DELIVERY_METHOD_PRE, 'pre');
  assert.deepEqual(PRE_ALLOWED_SOURCE_EXTENSIONS, ['.zip', '.tar', '.tar.gz', '.tgz']);
  assert.ok(PCP_PRE_STATUSES.includes('WAITING_INPUT'));
  assert.ok(PCP_PRE_STATUSES.includes('PAM_PASSED'));
  assert.ok(PCP_PRE_STATUSES.includes('COMPLETED'));
});
