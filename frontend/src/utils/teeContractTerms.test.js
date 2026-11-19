const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTeeTerms } = require('./teeContractTerms');

test('non-TEE applications bypass TEE-only fields', () => {
  assert.equal(validateTeeTerms({ pcType: 'HE' }).valid, true);
});

test('TEE applications require a non-empty C file', () => {
  assert.equal(validateTeeTerms({ pcType: 'TEE', file: null }).valid, false);
  assert.equal(validateTeeTerms({ pcType: 'TEE', file: { name: 'model.py', size: 3 } }).valid, false);
  assert.equal(validateTeeTerms({ pcType: 'TEE', file: { name: 'model.c', size: 0 } }).valid, false);
});

test('TEE applications do not accept a separately negotiated delivery limit', () => {
  const file = { name: 'model.c', size: 3 };
  assert.deepEqual(validateTeeTerms({ pcType: 'TEE', file, deliveryLimit: 999 }), {
    valid: true,
    message: ''
  });
});
