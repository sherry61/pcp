const test = require('node:test');
const assert = require('node:assert/strict');

let orchestration = {};
try { orchestration = require('../tee/orchestration'); } catch (_) { /* RED: module does not exist yet. */ }

test('manual calls can only use the VM bound to the transaction', () => {
  assert.equal(typeof orchestration.resolveBoundVmId, 'function');
  assert.equal(orchestration.resolveBoundVmId({ vm_id: '0123456789abcdef' }), '0123456789abcdef');
  assert.equal(orchestration.resolveBoundVmId({ vm_id: '0123456789abcdef' }, '0123456789abcdef'), '0123456789abcdef');
  assert.throws(
    () => orchestration.resolveBoundVmId({ vm_id: '0123456789abcdef' }, 'fedcba9876543210'),
    (error) => error.statusCode === 409 && /bound/i.test(error.message)
  );
  assert.throws(() => orchestration.resolveBoundVmId(null), /not bound/i);
});

test('a VM ID cannot be rebound to another delivery transaction', () => {
  assert.equal(typeof orchestration.assertVmBindingAvailable, 'function');
  assert.doesNotThrow(() => orchestration.assertVmBindingAvailable([], 'tx-2'));
  assert.doesNotThrow(() => orchestration.assertVmBindingAvailable([{ transaction_id: 'tx-2' }], 'tx-2'));
  assert.throws(
    () => orchestration.assertVmBindingAvailable([{ transaction_id: 'tx-1' }], 'tx-2'),
    (error) => error.statusCode === 409 && /another transaction/i.test(error.message)
  );
});

test('only non-sensitive remote attestation fields are persisted', () => {
  assert.equal(typeof orchestration.summarizeAttestation, 'function');
  const summary = orchestration.summarizeAttestation({
    remoteAttestation: {
      status: 'passed', passed: true, verifiedAt: 1791087959,
      verificationMode: 'online-kds', kdsOnline: true,
      report: 'sensitive-report', nonce: 'sensitive-nonce'
    }
  });
  assert.deepEqual(summary, {
    status: 'passed', passed: true, verifiedAt: 1791087959,
    verificationMode: 'online-kds', kdsOnline: true
  });
});

test('remote computation readiness is explicit', () => {
  assert.equal(typeof orchestration.isRemoteResultReady, 'function');
  assert.equal(orchestration.isRemoteResultReady({ computed: true }), true);
  assert.equal(orchestration.isRemoteResultReady({ ready: true }), true);
  assert.equal(orchestration.isRemoteResultReady({ result: { computed: true } }), true);
  assert.equal(orchestration.isRemoteResultReady({ code: 200 }), false);
});

test('data and weight are each uploaded once and key-order errors are not retried', async () => {
  assert.equal(typeof orchestration.uploadFilesOnce, 'function');
  const calls = [];
  await assert.rejects(
    () => orchestration.uploadFilesOnce({
      uploadData: async () => { calls.push('data'); },
      uploadWeight: async () => { calls.push('weight'); throw new Error('weight_key_before_data'); }
    }),
    /weight_key_before_data/
  );
  assert.deepEqual(calls, ['data', 'weight']);
});

test('pending calculation polls status and retrieves the result exactly once after ready', async () => {
  assert.equal(typeof orchestration.waitForRemoteResult, 'function');
  const calls = [];
  let poll = 0;
  const result = await orchestration.waitForRemoteResult({
    getStatus: async () => { calls.push('status'); poll += 1; return { ready: poll === 2 }; },
    getResult: async () => { calls.push('result'); return { iv: 'iv', ciphertext: 'ciphertext' }; },
    isReady: orchestration.isRemoteResultReady,
    sleep: async () => {},
    intervalMs: 1,
    timeoutMs: 1000,
    onStatus: async () => {}
  });
  assert.equal(result.ciphertext, 'ciphertext');
  assert.deepEqual(calls, ['status', 'status', 'result']);
});
