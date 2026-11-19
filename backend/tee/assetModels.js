'use strict';

const { modelMetadata } = require('./modelRegistry');

const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const ownerSql = "COALESCE(NULLIF(a.current_owner_address,''),a.owner_address)";
// A resale/agency mandate is not permission to execute a model. Only ownership
// or a confirmed, unexpired contract granting use/processing qualifies here.
const accessSql = `(
  EXISTS (SELECT 1 FROM certificate_registry c WHERE c.user_id=?
    AND c.address=${ownerSql} AND (c.expires_at IS NULL OR c.expires_at>NOW()))
  OR EXISTS (SELECT 1 FROM transactions t
    JOIN digital_contracts dc ON dc.transaction_id=t.transaction_id
    JOIN certificate_registry c ON c.address=t.buyer_address AND c.user_id=?
    WHERE t.asset_id=a.file_hash AND t.status='已确认' AND t.is_deleted=0
      AND dc.buyer_address=t.buyer_address AND dc.token_id=a.file_hash
      AND (c.expires_at IS NULL OR c.expires_at>NOW())
      AND (t.expiration_time IS NULL OR t.expiration_time>NOW())
      AND (dc.expiration_time IS NULL OR dc.expiration_time>NOW())
      AND REPLACE(dc.operations,'，',',') REGEXP '(^|,)[[:space:]]*(使用|使用权|加工|加工权)[[:space:]]*(,|$)')
)`;
const querySql = `SELECT a.*, r.id AS registry_id,r.version AS registry_version,
  r.description AS registry_description,r.owner_address AS registry_owner_address,
  r.file_size AS registry_file_size,r.chain_contract,r.chain_tx_id,r.chain_confirmation_tx_id,
  r.status AS registry_status,r.name AS registry_name,r.file_hash AS registry_file_hash
  FROM asset_registrations a LEFT JOIN tee_model_registrations r ON r.token_id=a.token_id
  WHERE a.model_type IS NOT NULL AND a.model_type<>''
    AND UPPER(REPLACE(a.algorithm,'-','_')) IN ('SHA2_256','SHA_256','SHA256')
    AND a.file_hash REGEXP '^[a-fA-F0-9]{64}$' AND ${accessSql}`;

function publicAssetModel(row) {
  return {
    id: `asset:${row.id}`, assetId: row.id, name: row.asset_name,
    version: row.registry_version || '登记版本',
    description: row.description || '', fileHash: row.file_hash.toLowerCase(),
    status: 'REGISTERED', ownerAddress: row.current_owner_address || row.owner_address,
    tokenId: row.token_id || row.file_hash, createdAt: row.created_at
  };
}

function createAssetModelCatalog({ dbQuery, chainPost }) {
  async function available(userId, assetId) {
    const params = [Number(userId), Number(userId)];
    if (assetId !== undefined) params.push(assetId);
    return dbQuery(querySql + (assetId === undefined ? ' ORDER BY a.created_at DESC,a.id DESC' : ' AND a.id=? LIMIT 1'), params);
  }
  return {
    async list(userId) { return (await available(userId)).filter(r => !r.registry_id || r.registry_status === 'REGISTERED').map(publicAssetModel); },
    async resolveSelection({ id, userId, buyerAddress }) {
      if (!/^asset:[1-9][0-9]*$/.test(String(id || ''))) throw fail('请从资产管理选择本人或已获使用授权的计算模型', 400);
      const certs = await dbQuery(`SELECT id FROM certificate_registry WHERE user_id=? AND address=?
        AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1`, [Number(userId), buyerAddress]);
      if (!certs.length) throw fail('交易证书不属于当前账号或已过期', 403);
      const [row] = await available(userId, Number(id.slice(6)));
      if (!row) throw fail('所选模型不存在或当前账号没有有效的使用权限', 403);
      if (row.registry_id && row.registry_status !== 'REGISTERED') throw fail('计算模型尚未确认上链成功');
      const model = publicAssetModel(row);
      const receipt = await chainPost('Metadata', { tokenId: model.tokenId });
      if (receipt?.code !== 0 || !receipt.result?.metadata) throw fail('无法确认模型的链上存证，请核对资产登记凭据');
      const metadata = receipt.result.metadata;
      if (receipt.result.owner !== model.ownerAddress) throw fail('模型链上权属已发生变化，请刷新资产管理');
      if (row.registry_id) {
        const expected = modelMetadata({ id: row.registry_id, name: row.registry_name, version: row.registry_version,
          description: row.registry_description, file_hash: row.registry_file_hash,
          file_size: row.registry_file_size, owner_address: row.registry_owner_address });
        if (row.registry_file_hash !== model.fileHash || Object.keys(expected).some(key => metadata[key] !== expected[key])) {
          throw fail('模型链上摘要与资产登记不一致，不能用于交易');
        }
      } else {
        const algorithm = String(metadata.algorithm || metadata.hashAlgorithm || '').replace(/[-_]/g, '').toUpperCase();
        const digest = metadata.modelFileHash || (model.tokenId.toLowerCase() === model.fileHash ? model.tokenId.toLowerCase() : '');
        if (!['SHA2256', 'SHA256'].includes(algorithm) || digest !== model.fileHash ||
            (metadata.assetName || metadata.name) !== model.name) throw fail('资产链上信息未绑定同一模型摘要，不能用于交易');
      }
      return {
        modelRegistrationId: model.id, modelFileHash: model.fileHash,
        modelSnapshotJson: JSON.stringify({ resourceType: 'TEE_COMPUTATION_MODEL', registrationId: model.id,
          assetId: row.id, chainRegistrationId: row.registry_id || null, name: model.name, version: model.version,
          hashAlgorithm: 'SHA-256', modelFileHash: model.fileHash, ownerAddress: model.ownerAddress,
          tokenId: model.tokenId, chainContract: row.chain_contract || 'new_credit2',
          chainTxId: row.chain_tx_id || null, chainConfirmationTxId: receipt.data?.tx_id_metadata || null })
      };
    }
  };
}

module.exports = { createAssetModelCatalog, publicAssetModel };
