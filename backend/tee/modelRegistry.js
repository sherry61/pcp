'use strict';

const crypto = require('node:crypto');
const axios = require('axios');

function registryError(message, statusCode = 409) {
  return Object.assign(new Error(message), { statusCode });
}

function publicModel(row) {
  return {
    id: row.id, name: row.name, version: row.version, description: row.description,
    fileHash: row.file_hash, fileSize: Number(row.file_size), status: row.status,
    ownerAddress: row.owner_address, tokenId: row.token_id, chainTxId: row.chain_tx_id,
    chainConfirmationTxId: row.chain_confirmation_tx_id, chainContract: row.chain_contract,
    createdAt: row.created_at, lastError: row.last_error
  };
}

function modelMetadata(row) {
  return {
    resourceType: 'TEE_COMPUTATION_MODEL', registrationId: row.id,
    name: row.name, version: row.version, description: row.description,
    hashAlgorithm: 'SHA-256', modelFileHash: row.file_hash,
    fileSize: Number(row.file_size), ownerAddress: row.owner_address
  };
}

function assertChainModel(row, response) {
  if (response?.code !== 0 || !response.result?.metadata) throw registryError('无法确认模型的链上登记，请稍后核对上链状态');
  const actual = response.result.metadata;
  const expected = modelMetadata(row);
  if (response.result.owner !== row.owner_address ||
      Object.keys(expected).some(key => actual[key] !== expected[key])) {
    throw registryError('模型链上信息与登记版本不一致，不能用于交易');
  }
  return true;
}

function createModelRegistry({ dbQuery, chainBaseUrl, chainContract = 'new_credit2', chainPost, submitRegistration }) {
  const post = chainPost || (async (endpoint, body) => {
    const response = await axios.post(`${chainBaseUrl}/pre/${endpoint}`, body, { timeout: 60000 });
    return response.data;
  });
  async function confirm(row) {
    const response = await post('Metadata', { tokenId: row.token_id });
    assertChainModel(row, response);
    const confirmationTxId = response.data?.tx_id_metadata || null;
    await dbQuery("UPDATE tee_model_registrations SET status='REGISTERED', chain_confirmation_tx_id=?, last_error=NULL WHERE id=?", [confirmationTxId, row.id]);
    return publicModel({ ...row, status: 'REGISTERED', chain_confirmation_tx_id: confirmationTxId, last_error: null });
  }
  async function getOwned(id, userId) {
    const rows = await dbQuery('SELECT * FROM tee_model_registrations WHERE id=? AND user_id=? LIMIT 1', [String(id || ''), Number(userId)]);
    if (!rows[0]) throw registryError('所选计算模型不存在或不属于当前账号', 404);
    return rows[0];
  }
  return {
    async list(userId) {
      return (await dbQuery('SELECT * FROM tee_model_registrations WHERE user_id=? ORDER BY created_at DESC', [Number(userId)])).map(publicModel);
    },
    async register({ userId, ownerAddress, name, version, description, file }) {
      const modelName = String(name || '').trim();
      const modelVersion = String(version || '').trim();
      const modelDescription = String(description || '').trim();
      if (!modelName || modelName.length > 120 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(modelVersion) || modelDescription.length > 2000) {
        throw registryError('请填写模型名称（最多120字）及版本号（最多40位字母、数字、点、横线或下划线）', 400);
      }
      if (!file || !/^[a-f0-9]{64}$/.test(file.modelHash || '') || !Number.isSafeInteger(file.size) || file.size <= 0) {
        throw registryError('请上传有效的 .c 计算模型文件', 400);
      }
      const row = {
        id: crypto.randomUUID(), user_id: Number(userId), owner_address: ownerAddress,
        name: modelName, version: modelVersion, description: modelDescription,
        file_hash: file.modelHash, file_size: file.size, chain_contract: chainContract,
        status: 'PENDING', chain_tx_id: null
      };
      row.token_id = `tee-model-${row.id}`;
      try {
        await dbQuery(`INSERT INTO tee_model_registrations
          (id,user_id,owner_address,name,version,description,file_hash,file_size,token_id,chain_contract,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [row.id, row.user_id, row.owner_address, row.name, row.version,
          row.description, row.file_hash, row.file_size, row.token_id, row.chain_contract, row.status]);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw registryError('此名称和版本已登记，请刷新列表核对；修改后的模型请使用新版本号');
        throw error;
      }
      try {
        // Mint is never automatically retried: a lost response may still have
        // committed on chain. Reconciliation reads the same token instead.
        if (typeof submitRegistration !== 'function') throw registryError('统一登记提交服务尚未配置', 503);
        const receipt = await submitRegistration({ resourceType: 'COMPUTATION_MODEL', operation: 'Mint',
          payload: { to: ownerAddress, tokenId: row.token_id, categoryName: 'WH', metadata: modelMetadata(row) } });
        if (receipt?.code !== 0 || !receipt.data?.tx_id) throw registryError(receipt?.message || '模型上链未返回确认凭据');
        row.chain_tx_id = receipt.data.tx_id;
        await dbQuery('UPDATE tee_model_registrations SET chain_tx_id=? WHERE id=?', [row.chain_tx_id, row.id]);
        return await confirm(row);
      } catch (error) {
        await dbQuery('UPDATE tee_model_registrations SET last_error=? WHERE id=?', [String(error.message).slice(0, 1000), row.id]);
        return publicModel({ ...row, last_error: '上链结果待确认，请核对上链状态后再用于交易' });
      }
    },
    async reconcile(id, userId) { return confirm(await getOwned(id, userId)); },
    async resolveSelection({ id, userId, buyerAddress }) {
      if (!id) throw registryError('请选择已上链的计算模型', 400);
      const certificates = await dbQuery(`SELECT id FROM certificate_registry
        WHERE user_id=? AND address=? AND (expires_at IS NULL OR expires_at>NOW()) LIMIT 1`, [Number(userId), buyerAddress]);
      if (!certificates.length) throw registryError('交易证书不属于当前账号或已过期', 403);
      const row = await getOwned(id, userId);
      if (row.status !== 'REGISTERED') throw registryError('计算模型尚未确认上链成功');
      const response = await post('Metadata', { tokenId: row.token_id });
      assertChainModel(row, response);
      return {
        modelRegistrationId: row.id,
        modelFileHash: row.file_hash,
        modelSnapshotJson: JSON.stringify({ ...modelMetadata(row), tokenId: row.token_id,
          chainContract: row.chain_contract, chainTxId: row.chain_tx_id,
          chainConfirmationTxId: response.data?.tx_id_metadata || row.chain_confirmation_tx_id })
      };
    }
  };
}

function registerModelRegistryRoutes({ app, registry, catalog = registry, authenticate }) {
  const handle = action => async (req, res) => {
    try { await action(req, res); } catch (error) {
      res.status(error.statusCode || 502).json({ success: false, message: error.statusCode ? error.message : '模型登记服务暂不可用，请稍后重试' });
    }
  };
  app.get('/api/privacy/tee/models', authenticate, handle(async (req, res) => {
    res.json({ success: true, models: await catalog.list(req.authUser.id) });
  }));
  app.post('/api/privacy/tee/models/:id/confirm', authenticate, handle(async (req, res) => {
    res.json({ success: true, model: await registry.reconcile(req.params.id, req.authUser.id) });
  }));
}

module.exports = { createModelRegistry, registerModelRegistryRoutes, assertChainModel, modelMetadata };
