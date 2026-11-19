'use strict';

// Both registration branches cross this boundary before any chain write.
// A future registration-audit integration belongs here, not in either UI.
function createRegistrationSubmission({ chainPost }) {
  return async function submitRegistration({ resourceType, operation, payload }) {
    if (!['DIGITAL_ASSET', 'COMPUTATION_MODEL'].includes(resourceType) ||
        !['Mint', 'En-Mint'].includes(operation) ||
        (resourceType === 'COMPUTATION_MODEL' && operation !== 'Mint')) {
      throw Object.assign(new Error('不支持的登记类型或上链操作'), { statusCode: 400 });
    }
    const result = await chainPost(operation, payload);
    if (result?.code !== 0) {
      throw Object.assign(new Error(result?.message || '登记上链未成功'), { statusCode: 502 });
    }
    return result;
  };
}

function registerRegistrationSubmissionRoute({ app, authenticate, upload, getRegisterCertificate, registry, submitRegistration }) {
  app.post('/api/registrations/submit', authenticate, upload, async (req, res) => {
    try {
      const cert = await getRegisterCertificate(req.authUser.id);
      if (!cert.address || (cert.expires_at && new Date(cert.expires_at).getTime() <= Date.now())) {
        throw Object.assign(new Error('上链默认证书缺少地址或已过期，请到个人中心更新'), { statusCode: 400 });
      }
      const resourceType = req.body.resourceType;
      if (resourceType === 'COMPUTATION_MODEL') {
        const model = await registry.register({ userId: req.authUser.id, ownerAddress: cert.address,
          name: req.body.name, version: req.body.version, description: req.body.description, file: req.file });
        return res.status(model.status === 'REGISTERED' ? 201 : 202).json({ success: true, model });
      }
      if (resourceType !== 'DIGITAL_ASSET') throw Object.assign(new Error('请选择登记类型'), { statusCode: 400 });
      const { chainType, payload } = req.body;
      if (!payload || typeof payload !== 'object' || !['divisible', 'indivisible'].includes(chainType)) {
        throw Object.assign(new Error('数字资产登记参数不完整'), { statusCode: 400 });
      }
      const submittedOwner = chainType === 'divisible' ? payload.from : payload.to;
      if (submittedOwner !== cert.address) throw Object.assign(new Error('登记地址必须为当前账号的上链默认证书地址'), { statusCode: 403 });
      const chainPayload = chainType === 'divisible'
        ? { from: cert.address, amount: String(payload.amount || '') }
        : { to: cert.address, tokenId: String(payload.tokenId || ''), categoryName: String(payload.categoryName || ''), metadata: payload.metadata };
      if (chainType === 'divisible' && !/^[1-9][0-9]*$/.test(chainPayload.amount)) {
        throw Object.assign(new Error('登记数量必须为正整数'), { statusCode: 400 });
      }
      if (chainType === 'indivisible' && (!chainPayload.tokenId || !chainPayload.categoryName || !chainPayload.metadata)) {
        throw Object.assign(new Error('缺少资产标识或登记信息'), { statusCode: 400 });
      }
      const result = await submitRegistration({ resourceType, operation: chainType === 'divisible' ? 'En-Mint' : 'Mint', payload: chainPayload });
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 502).json({ success: false, message: error.statusCode ? error.message : '登记提交失败，请稍后核对上链结果' });
    }
  });
}

module.exports = { createRegistrationSubmission, registerRegistrationSubmissionRoute };
