const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DELIVERY_METHOD_FL,
  PCP_FL_STATUSES,
  PCP_FL_RESULT_ROLES
} = require('../pcp/constants');

test('FL constants expose delivery method, statuses, and result roles', () => {
  assert.equal(DELIVERY_METHOD_FL, 'fl');
  assert.ok(PCP_FL_STATUSES.includes('JOINED'));
  assert.ok(PCP_FL_STATUSES.includes('COMPLETED'));
  assert.deepEqual(PCP_FL_RESULT_ROLES, [
    'fl_bottom_model',
    'fl_gradient',
    'fl_top_model'
  ]);
});
