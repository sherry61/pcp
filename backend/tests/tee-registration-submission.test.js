const test = require('node:test');
const assert = require('node:assert/strict');
const { createRegistrationSubmission, registerRegistrationSubmissionRoute } = require('../tee/registrationSubmission');

function setup(chainPost) {
  const submitRegistration = createRegistrationSubmission({ chainPost });
  let handler;
  registerRegistrationSubmissionRoute({
    app: { post(route, ...handlers) { assert.equal(route, '/api/registrations/submit'); handler = handlers.at(-1); } },
    authenticate() {}, upload() {}, getRegisterCertificate: async () => ({ address: 'owner' }),
    registry: { register: async () => {
      await submitRegistration({ resourceType: 'COMPUTATION_MODEL', operation: 'Mint', payload: { to: 'owner', metadata: { modelFileHash: 'a'.repeat(64) } } });
      return { status: 'REGISTERED' };
    } }, submitRegistration
  });
  return async body => {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
    await handler({ authUser: { id: 7 }, body }, response);
    return response;
  };
}

test('digital assets and computation models use the same authenticated submission handler and chain boundary', async () => {
  const calls = [];
  const submit = setup(async (operation, payload) => { calls.push({ operation, payload }); return { code: 0, data: { tx_id: 'receipt' } }; });
  const asset = await submit({ resourceType: 'DIGITAL_ASSET', chainType: 'indivisible', payload: { to: 'owner', tokenId: 'asset', categoryName: 'WH', metadata: { name: 'asset' } } });
  const model = await submit({ resourceType: 'COMPUTATION_MODEL', name: 'model' });
  assert.equal(asset.statusCode, 200);
  assert.equal(model.statusCode, 201);
  assert.deepEqual(calls.map(call => call.operation), ['Mint', 'Mint']);
});

test('divisible digital assets retain their existing En-Mint operation through the shared boundary', async () => {
  const calls = [];
  const submit = setup(async (operation, payload) => { calls.push({ operation, payload }); return { code: 0 }; });
  assert.equal((await submit({ resourceType: 'DIGITAL_ASSET', chainType: 'divisible', payload: { from: 'owner', amount: '2' } })).statusCode, 200);
  assert.deepEqual(calls, [{ operation: 'En-Mint', payload: { from: 'owner', amount: '2' } }]);
});

test('shared submission rejects forged ownership, invalid operations and invalid quantities', async () => {
  let calls = 0;
  const chainPost = async () => { calls++; return { code: 0 }; };
  const submit = setup(chainPost);
  const response = await submit({ resourceType: 'DIGITAL_ASSET', chainType: 'divisible', payload: { from: 'foreign', amount: '2' } });
  assert.equal(response.statusCode, 403);
  assert.equal((await submit({ resourceType: 'DIGITAL_ASSET', chainType: 'divisible', payload: { from: 'owner', amount: '-1' } })).statusCode, 400);
  await assert.rejects(createRegistrationSubmission({ chainPost })({ resourceType: 'COMPUTATION_MODEL', operation: 'En-Mint', payload: {} }), /不支持/);
  assert.equal(calls, 0);
});

test('shared registration failures never fall back to a direct mint path', async () => {
  const submit = setup(async () => { throw new Error('registration gateway unavailable'); });
  const model = await submit({ resourceType: 'COMPUTATION_MODEL' });
  const asset = await submit({ resourceType: 'DIGITAL_ASSET', chainType: 'divisible', payload: { from: 'owner', amount: '2' } });
  assert.equal(model.statusCode, 502);
  assert.equal(asset.statusCode, 502);
});
