const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const { createTeeClient } = require('../tee/client');

test('TEE client uses strict create/start validation and exact result-status query', async () => {
  const originalCreate = axios.create;
  const calls = [];
  const fake = {
    async post(url, body, config) {
      calls.push({ method: 'POST', url, body, config });
      if (url.endsWith('/api/v2/vms')) return { status: 200, data: { success: true, status: 'created', vmId: '0123456789abcdef' } };
      if (url.endsWith('/start')) return { status: 200, data: { success: true, status: 'running', vmId: '0123456789abcdef', remoteAttestation: { status: 'passed', passed: true } } };
      throw new Error(`unexpected POST ${url}`);
    },
    async get(url, config) {
      calls.push({ method: 'GET', url, config });
      return { status: 200, data: { code: 200, vmId: '0123456789abcdef', ready: true } };
    }
  };
  axios.create = () => fake;
  try {
    const client = createTeeClient({
      host: 'http://tee.test', vmApiPort: 8000, gatewayPort: 18080,
      createTimeoutMs: 7300000, startTimeoutMs: 650000, timeoutMs: 600000
    });
    await client.createVm();
    await client.startVm('0123456789abcdef');
    const status = await client.getResultStatus('0123456789abcdef');

    assert.equal(status.ready, true);
    assert.equal(calls[0].config.timeout, 7300000);
    assert.equal(calls[1].config.timeout, 650000);
    assert.equal(calls[2].url, 'http://tee.test:18080/api/result-status?vmId=0123456789abcdef');
  } finally {
    axios.create = originalCreate;
  }
});

test('TEE client rejects a start response without passed attestation', async () => {
  const originalCreate = axios.create;
  axios.create = () => ({
    async post() { return { status: 200, data: { success: true, status: 'running', vmId: '0123456789abcdef' } }; }
  });
  try {
    const client = createTeeClient({ host: 'http://tee.test', vmApiPort: 8000 });
    await assert.rejects(() => client.startVm('0123456789abcdef'), /attestation/);
  } finally {
    axios.create = originalCreate;
  }
});

test('TEE client rejects result status for a different VM', async () => {
  const originalCreate = axios.create;
  axios.create = () => ({
    async get() { return { status: 200, data: { code: 200, vmId: 'fedcba9876543210', ready: true } }; }
  });
  try {
    const client = createTeeClient({ host: 'http://tee.test', gatewayPort: 18080 });
    await assert.rejects(() => client.getResultStatus('0123456789abcdef'), /does not match/);
  } finally {
    axios.create = originalCreate;
  }
});

test('TEE client preserves Hygon business error codes and messages', async () => {
  const originalCreate = axios.create;
  axios.create = () => ({
    async post() {
      return { status: 400, data: { code: 60012, error: 'model_hash_mismatch', message: 'model_hash_mismatch' } };
    }
  });
  try {
    const client = createTeeClient({ host: 'http://tee.test', gatewayPort: 18080 });
    await assert.rejects(
      () => client.verifyContract({ vmId: '0123456789abcdef' }),
      (error) => error.statusCode === 400 && error.code === 'model_hash_mismatch' && error.remoteCode === 60012 && error.message === 'model_hash_mismatch'
    );
  } finally {
    axios.create = originalCreate;
  }
});
