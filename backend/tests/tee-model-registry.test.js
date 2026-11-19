'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createModelRegistry, modelMetadata } = require('../tee/modelRegistry');
const { createRegistrationSubmission } = require('../tee/registrationSubmission');
const { buildTeeDigitalContract } = require('../tee/contractFinalization');
const { buildFormalContractDocument } = require('../tee/modelContractProtocol');

const hash = 'a'.repeat(64);
function fixture() {
  let row;
  let chainMetadata;
  let chainOwner = 'owner';
  let mintTimeout = false;
  const calls = [];
  const query = async (sql, params) => {
    if (sql.includes('INSERT INTO tee_model_registrations')) {
      if (row) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      const keys = ['id', 'user_id', 'owner_address', 'name', 'version', 'description', 'file_hash', 'file_size', 'token_id', 'chain_contract', 'status'];
      row = Object.fromEntries(keys.map((key, index) => [key, params[index]]));
      return { affectedRows: 1 };
    }
    if (sql.includes('certificate_registry')) return params[0] === 7 && params[1] === 'buyer-cert' ? [{ id: 1 }] : [];
    if (sql.startsWith('SELECT')) return row && (params.length === 1 || (params[0] === row.id && params[1] === row.user_id)) ? [{ ...row }] : [];
    if (sql.includes("SET status='REGISTERED'")) Object.assign(row, { status: 'REGISTERED', chain_confirmation_tx_id: params[0], last_error: null });
    else if (sql.includes('SET chain_tx_id')) row.chain_tx_id = params[0];
    else if (sql.includes('SET last_error')) row.last_error = params[0];
    else throw new Error(`unexpected SQL ${sql}`);
    return { affectedRows: 1 };
  };
  const chainPost = async (endpoint, body) => {
    calls.push({ endpoint, body });
    if (endpoint === 'Mint') {
      chainMetadata = { ...body.metadata };
      if (mintTimeout) throw new Error('ETIMEDOUT');
      return { code: 0, data: { tx_id: 'mint-tx' } };
    }
    return { code: 0, result: { metadata: chainMetadata, owner: chainOwner }, data: { tx_id_metadata: 'confirm-tx' } };
  };
  const registry = createModelRegistry({ dbQuery: query, chainPost, submitRegistration: createRegistrationSubmission({ chainPost }) });
  return {
    registry, calls, row: () => row,
    setTimeout: () => { mintTimeout = true; },
    tamperHash: () => { chainMetadata.modelFileHash = 'b'.repeat(64); },
    transfer: () => { chainOwner = 'someone-else'; }
  };
}
const registration = { userId: 7, ownerAddress: 'owner', name: '风险评分', version: '1.0', description: '测试', file: { modelHash: hash, size: 30 } };

test('registration anchors the raw digest and version on chain without model contents', async () => {
  const f = fixture();
  const model = await f.registry.register(registration);
  assert.equal(model.status, 'REGISTERED');
  assert.equal(model.fileHash, hash);
  assert.deepEqual(f.calls[0].body.metadata, modelMetadata(f.row()));
  assert.deepEqual(f.calls.map(call => call.endpoint), ['Mint', 'Metadata']);
  assert.equal(f.calls[0].body.metadata.hashAlgorithm, 'SHA-256');
  assert.equal(JSON.stringify(f.calls).includes('modelHash'), false);
});

test('purchase uses a verified owned model; snapshot hash reaches the formal TEE contract', async () => {
  const f = fixture();
  const model = await f.registry.register(registration);
  const selected = await f.registry.resolveSelection({ id: model.id, userId: 7, buyerAddress: 'buyer-cert' });
  const contract = buildTeeDigitalContract({ transaction: {
    transaction_id: 55, pc_type: 'TEE', model_file_hash: selected.modelFileHash,
    model_registration_id: selected.modelRegistrationId, model_snapshot_json: selected.modelSnapshotJson,
    delivery_limit: 2
  } });
  const formal = buildFormalContractDocument({ ...contract, created_at: new Date() });
  assert.equal(formal.fileHash, hash);
  assert.equal(formal.model_registration_id, model.id);
  assert.equal(JSON.parse(formal.model_snapshot_json).version, '1.0');
  assert.equal(JSON.parse(formal.model_snapshot_json).chainTxId, 'mint-tx');
  // Later chain metadata changes cannot silently change the order snapshot.
  f.tamperHash();
  assert.equal(JSON.parse(selected.modelSnapshotJson).modelFileHash, hash);
  await assert.rejects(f.registry.resolveSelection({ id: model.id, userId: 7, buyerAddress: 'buyer-cert' }), /链上信息/);
});

test('foreign model IDs, forged buyer certificates and unselected models are rejected', async () => {
  const f = fixture(); const model = await f.registry.register(registration);
  await assert.rejects(f.registry.resolveSelection({ id: model.id, userId: 8, buyerAddress: 'buyer-cert' }), /证书/);
  await assert.rejects(f.registry.resolveSelection({ id: model.id, userId: 7, buyerAddress: 'foreign' }), /证书/);
  await assert.rejects(f.registry.reconcile(model.id, 8), /不属于/);
  await assert.rejects(f.registry.resolveSelection({ userId: 7, buyerAddress: 'buyer-cert' }), /请选择/);
});

test('transferred model ownership is rejected even if the local status is REGISTERED', async () => {
  const f = fixture(); const model = await f.registry.register(registration); f.transfer();
  await assert.rejects(f.registry.resolveSelection({ id: model.id, userId: 7, buyerAddress: 'buyer-cert' }), /链上信息/);
});

test('lost mint response requires reconciliation and never mints a second token', async () => {
  const f = fixture(); f.setTimeout();
  const model = await f.registry.register(registration);
  assert.equal(model.status, 'PENDING');
  await assert.rejects(f.registry.resolveSelection({ id: model.id, userId: 7, buyerAddress: 'buyer-cert' }), /尚未确认/);
  assert.equal((await f.registry.reconcile(model.id, 7)).status, 'REGISTERED');
  await f.registry.resolveSelection({ id: model.id, userId: 7, buyerAddress: 'buyer-cert' });
  assert.equal(f.calls.filter(call => call.endpoint === 'Mint').length, 1);
  await assert.rejects(f.registry.register(registration), /此名称和版本已登记/);
});

test('contract creation rejects a substituted registered-model snapshot', () => {
  assert.throws(() => buildTeeDigitalContract({ transaction: {
    transaction_id: 55, pc_type: 'TEE', model_file_hash: hash, delivery_limit: 2,
    model_registration_id: 'model-a', model_snapshot_json: JSON.stringify({ registrationId: 'model-b', modelFileHash: hash })
  } }), /snapshot/);
});
