'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAssetModelCatalog } = require('../tee/assetModels');
const { modelMetadata } = require('../tee/modelRegistry');
const { buildTeeDigitalContract } = require('../tee/contractFinalization');
const { buildFormalContractDocument } = require('../tee/modelContractProtocol');

const hash = 'a'.repeat(64);
function fixture(imported = false) {
  const row = { id: 225, asset_name: '风险模型', file_hash: hash, owner_address: 'owner',
    description: '说明', token_id: hash, algorithm: 'SHA2_256', model_type: 'COMPUTATION_MODEL' };
  if (imported) Object.assign(row, { registry_id: 'registry-uuid', registry_version: '1.0',
    registry_name: row.asset_name, registry_description: row.description, registry_owner_address: 'owner',
    registry_file_hash: hash, registry_file_size: 50, registry_status: 'REGISTERED',
    token_id: 'tee-model-registry-uuid', chain_contract: 'new_credit2', chain_tx_id: 'mint-tx' });
  const metadata = imported ? modelMetadata({ id: row.registry_id, name: row.asset_name,
    version: '1.0', description: row.description, owner_address: 'owner', file_hash: hash, file_size: 50 })
    : { assetName: row.asset_name, algorithm: 'SHA2_256' };
  const receipt = { code: 0, result: { owner: 'owner', metadata }, data: { tx_id_metadata: 'query-tx' } };
  let allowed = true;
  const catalog = createAssetModelCatalog({
    dbQuery: async (sql, params) => sql.includes('FROM certificate_registry WHERE')
      ? (params[1] === 'buyer-cert' ? [{ id: 1 }] : [])
      : (allowed && (params.length < 3 || params[2] === 225) ? [row] : []),
    chainPost: async (operation, body) => {
      assert.equal(operation, 'Metadata'); assert.equal(body.tokenId, row.token_id); return receipt;
    }
  });
  return { catalog, row, receipt, revoke: () => { allowed = false; } };
}
const selection = { id: 'asset:225', userId: 36, buyerAddress: 'buyer-cert' };

test('ordinary model assets freeze the exact digest into the formal contract', async () => {
  const { catalog } = fixture();
  const chosen = await catalog.resolveSelection(selection);
  const contract = buildTeeDigitalContract({ transaction: { transaction_id: 99, pc_type: 'TEE',
    model_registration_id: chosen.modelRegistrationId, model_file_hash: chosen.modelFileHash,
    model_snapshot_json: chosen.modelSnapshotJson, delivery_limit: 1 } });
  assert.equal(buildFormalContractDocument({ ...contract, created_at: new Date() }).fileHash, hash);
  assert.equal(JSON.parse(contract.model_snapshot_json).assetId, 225);
  assert.equal(contract.model_registration_id, 'asset:225');
});

test('imported models retain their original chain token and proven version', async () => {
  const { catalog } = fixture(true);
  const snapshot = JSON.parse((await catalog.resolveSelection(selection)).modelSnapshotJson);
  assert.equal(snapshot.chainRegistrationId, 'registry-uuid');
  assert.equal(snapshot.tokenId, 'tee-model-registry-uuid');
  assert.equal(snapshot.version, '1.0'); assert.equal(snapshot.chainTxId, 'mint-tx');
});

test('unavailable rights, forged certificates and non-asset IDs cannot be purchased', async () => {
  const f = fixture();
  await assert.rejects(f.catalog.resolveSelection({ ...selection, id: 'registry-uuid' }), /资产管理/);
  await assert.rejects(f.catalog.resolveSelection({ ...selection, buyerAddress: 'foreign-cert' }), /证书/);
  f.revoke();
  assert.deepEqual(await f.catalog.list(36), []);
  await assert.rejects(f.catalog.resolveSelection(selection), /使用权限/);
});

test('chain failures, transfers and changed digests fail closed', async () => {
  for (const mutate of [r => { r.code = 1; }, r => { r.result.owner = 'other'; },
    r => { r.result.metadata.modelFileHash = 'b'.repeat(64); },
    r => { r.result.metadata.algorithm = 'FINGERPRINT'; }]) {
    const f = fixture(); mutate(f.receipt);
    await assert.rejects(f.catalog.resolveSelection(selection));
  }
  const f = fixture(true); f.receipt.result.metadata.version = '2.0';
  await assert.rejects(f.catalog.resolveSelection(selection), /链上摘要/);
});

test('real database enforces model ownership and confirmed, unexpired use grants',
  { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
    const mysql = require('mysql2/promise');
    const crypto = require('node:crypto');
    const connection = await mysql.createConnection({ host: 'localhost', user: 'root', password: '123456',
      database: process.env.MAIN_DB_NAME || 'r01_prod', connectTimeout: 10000 });
    const query = async (sql, params = []) => (await connection.query(sql, params))[0];
    try {
      await query('START TRANSACTION');
      const certs = await query('SELECT user_id,address FROM certificate_registry WHERE user_id IN (35,36) AND expires_at>NOW() ORDER BY id');
      const owner = certs.find(c => c.user_id === 35).address;
      const buyer = certs.find(c => c.user_id === 36).address;
      const digest = crypto.randomBytes(32).toString('hex');
      const inserted = await query(`INSERT INTO asset_registrations
        (asset_name,asset_type,owner_address,file_hash,user_id,industry,algorithm,model_type)
        VALUES ('__model_acl_rollback_test__','一般数据',?,?,35,'WH','SHA2_256','COMPUTATION_MODEL')`, [owner, digest]);
      const modelId = `asset:${inserted.insertId}`;
      const catalog = createAssetModelCatalog({ dbQuery: query, chainPost: async () => ({ code: 0,
        result: { owner, metadata: { assetName: '__model_acl_rollback_test__', algorithm: 'SHA2_256' } } }) });
      const visible = async userId => (await catalog.list(userId)).some(m => m.id === modelId);
      assert.equal(await visible(35), true, 'owner can select');
      assert.equal(await visible(36), false, 'unrelated buyer cannot select');
      const order = await query(`INSERT INTO transactions
        (asset_id,buyer_address,seller_address,status,quality,expiration_time)
        VALUES (?,?,?,'待确认','使用权','2099-01-01')`, [digest, buyer, owner]);
      await query(`INSERT INTO digital_contracts
        (contract_id,transaction_id,contract_name,token_id,buyer_address,seller_address,operations,expiration_time)
        VALUES (?,?, 'rollback test',?,?,?,'使用权','2099-01-01')`, [`TEST-${crypto.randomUUID()}`, order.insertId, digest, buyer, owner]);
      assert.equal(await visible(36), false, 'pending orders do not authorize model use');
      await query("UPDATE transactions SET status='已确认' WHERE transaction_id=?", [order.insertId]);
      assert.equal(await visible(36), true, 'confirmed use contract authorizes model use');
      const chosen = await catalog.resolveSelection({ id: modelId, userId: 36, buyerAddress: buyer });
      assert.equal(chosen.modelFileHash, digest);
      await query("UPDATE transactions SET expiration_time='2000-01-01' WHERE transaction_id=?", [order.insertId]);
      assert.equal(await visible(36), false, 'expired orders are excluded');
      await query("UPDATE transactions SET expiration_time='2099-01-01' WHERE transaction_id=?", [order.insertId]);
      await query("UPDATE digital_contracts SET expiration_time='2000-01-01' WHERE transaction_id=?", [order.insertId]);
      assert.equal(await visible(36), false, 'expired contracts are excluded');
      await query("UPDATE digital_contracts SET expiration_time='2099-01-01', operations='经营权' WHERE transaction_id=?", [order.insertId]);
      assert.equal(await visible(36), false, 'resale permission alone is insufficient');
      await query("UPDATE digital_contracts SET operations='加工' WHERE transaction_id=?", [order.insertId]);
      assert.equal(await visible(36), true, 'legacy processing permission is accepted');
      await query('UPDATE transactions SET is_deleted=1 WHERE transaction_id=?', [order.insertId]);
      assert.equal(await visible(36), false, 'revoked/deleted orders are excluded');
      await assert.rejects(catalog.resolveSelection({ id: modelId, userId: 36, buyerAddress: buyer }), /使用权限/);
    } finally {
      await query('ROLLBACK');
      await connection.end();
    }
  });
