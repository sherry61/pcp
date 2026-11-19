const test = require('node:test');
const assert = require('node:assert/strict');

let protocol = {};
try { protocol = require('../tee/protocol'); } catch (_) { /* RED: module does not exist yet. */ }

test('accepts only a successful created response with a real 16-character VM ID', () => {
  assert.equal(typeof protocol.validateCreateResponse, 'function');
  const value = protocol.validateCreateResponse({ success: true, status: 'created', vmId: '0123456789abcdef' });
  assert.equal(value.vmId, '0123456789abcdef');
  assert.throws(() => protocol.validateCreateResponse({ success: true, status: 'created', vmId: 'vm-test-001' }), /VM ID/);
  assert.throws(() => protocol.validateCreateResponse({ success: true, status: 'running', vmId: '0123456789abcdef' }), /created/);
});

test('requires a matching running VM and a passed remote attestation', () => {
  assert.equal(typeof protocol.validateStartResponse, 'function');
  const value = protocol.validateStartResponse({
    success: true,
    status: 'running',
    vmId: '0123456789abcdef',
    remoteAttestation: { status: 'passed', passed: true, verifiedAt: 1791087959, verificationMode: 'online-kds', kdsOnline: true }
  }, '0123456789abcdef');
  assert.equal(value.remoteAttestation.passed, true);
  assert.throws(() => protocol.validateStartResponse({ success: true, status: 'running', vmId: 'fedcba9876543210' }, '0123456789abcdef'), /does not match/);
  assert.throws(() => protocol.validateStartResponse({ success: true, status: 'running', vmId: '0123456789abcdef', remoteAttestation: { passed: false } }, '0123456789abcdef'), /attestation/);
});

test('validates decrypted calculation result structure and VM binding', () => {
  assert.equal(typeof protocol.validateDecryptedResult, 'function');
  const value = protocol.validateDecryptedResult({
    code: 200,
    vmId: '0123456789abcdef',
    results: [{ id: 'alice', score: 17.5 }]
  }, '0123456789abcdef');
  assert.equal(value.results.length, 1);
  assert.throws(() => protocol.validateDecryptedResult({ code: 500, vmId: '0123456789abcdef', results: [] }, '0123456789abcdef'), /code/);
  assert.throws(() => protocol.validateDecryptedResult({ code: 200, results: [] }, '0123456789abcdef'), /VM ID/);
  assert.throws(() => protocol.validateDecryptedResult({ code: 200, vmId: 'fedcba9876543210', results: [] }, '0123456789abcdef'), /does not match/);
  assert.throws(() => protocol.validateDecryptedResult({ code: 200, vmId: '0123456789abcdef' }, '0123456789abcdef'), /results/);
});

test('validates result-status responses against the bound VM', () => {
  assert.equal(typeof protocol.validateResultStatus, 'function');
  const value = protocol.validateResultStatus({ code: 200, vmId: '0123456789abcdef', ready: false }, '0123456789abcdef');
  assert.equal(value.ready, false);
  assert.throws(
    () => protocol.validateResultStatus({ code: 200, vmId: 'fedcba9876543210', ready: true }, '0123456789abcdef'),
    /does not match/
  );
});
