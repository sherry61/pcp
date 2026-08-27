const { createTeeClient } = require('./client');
const { TEE_DELIVERY_METHOD } = require('./constants');

function registerTeeRoutes({ app, dbQuery, teeClient = createTeeClient() }) {
  if (!app || typeof dbQuery !== 'function') throw new Error('registerTeeRoutes requires app and dbQuery');
  const vmSetupInFlight = new Set();

  const getJob = async (transactionId) => {
    const rows = await dbQuery('SELECT * FROM delivery_secure_jobs WHERE transaction_id = ? LIMIT 1', [String(transactionId)]);
    return rows[0] || null;
  };
  const updateJob = async (transactionId, fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    await dbQuery(`UPDATE delivery_secure_jobs SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE transaction_id = ?`, [...keys.map((key) => fields[key]), String(transactionId)]);
  };
  const fail = (res, error, fallback = 'TEE 请求失败') => res.status(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502).json({ success: false, message: error.message || fallback, remote: error.response?.data });

  app.post('/api/privacy/tee/request', async (req, res) => {
    const { transactionId, buyerAddress, sellerAddress, assetId, vmCpu = 8, vmMemoryMb = 4096 } = req.body || {};
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    try {
      await dbQuery(`INSERT INTO delivery_secure_jobs (transaction_id,buyer_address,seller_address,asset_id,vm_cpu,vm_memory_mb,status,step) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE buyer_address=VALUES(buyer_address),seller_address=VALUES(seller_address),asset_id=VALUES(asset_id),vm_cpu=VALUES(vm_cpu),vm_memory_mb=VALUES(vm_memory_mb),status='PENDING',step='REQUESTED',last_error=NULL`, [String(transactionId), buyerAddress || null, sellerAddress || null, assetId || null, Number(vmCpu), Number(vmMemoryMb), 'PENDING', 'REQUESTED']);
      res.json({ success: true, deliveryMethod: TEE_DELIVERY_METHOD, transactionId: String(transactionId), step: 'REQUESTED' });
    } catch (error) { fail(res, error, 'TEE 交付申请失败'); }
  });

  const startVmInBackground = async (transactionId, job) => {
    if (vmSetupInFlight.has(String(transactionId))) return;
    vmSetupInFlight.add(String(transactionId));
    try {
      const created = await teeClient.createVm({ cpu: job.vm_cpu || 8, memoryMb: job.vm_memory_mb || 4096 });
      const vmId = created.vmId || created.vm_id;
      if (!vmId) throw new Error('TEE VM create response missing vmId');
      await updateJob(transactionId, { vm_id: vmId, vm_status: created.status || 'created', step: 'VM_STARTING' });
      const started = await teeClient.startVm(vmId);
      await updateJob(transactionId, { vm_status: started.status || 'running', step: 'VM_RUNNING', status: 'VM_RUNNING' });
      await teeClient.waitForServices();
      await updateJob(transactionId, { step: 'WAITING_DATA', status: 'VM_RUNNING' });
    } catch (error) {
      await updateJob(transactionId, { status: 'FAILED', step: 'FAILED', last_error: error.message }).catch(() => {});
    } finally { vmSetupInFlight.delete(String(transactionId)); }
  };

  app.post('/api/privacy/tee/confirm', async (req, res) => {
    const { transactionId } = req.body || {};
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    try {
      const job = await getJob(transactionId);
      if (!job) return res.status(404).json({ success: false, message: '未找到 TEE 交付任务' });
      if (['VM_CREATING', 'VM_STARTING', 'VM_RUNNING', 'WAITING_DATA'].includes(String(job.step))) return res.status(202).json({ success: true, transactionId, vmId: job.vm_id, step: job.step, accepted: true, resumed: true });
      await updateJob(transactionId, { status: 'RUNNING', step: 'VM_CREATING', last_error: null });
      void startVmInBackground(transactionId, job);
      res.status(202).json({ success: true, transactionId: String(transactionId), step: 'VM_CREATING', accepted: true });
    } catch (error) { fail(res, error, 'TEE 虚拟机启动失败'); }
  });

  app.get('/api/privacy/tee/status', async (req, res) => {
    const job = await getJob(req.query.transactionId);
    if (!job) return res.status(404).json({ success: false, message: '未找到 TEE 交付任务' });
    res.json({ success: true, transactionId: job.transaction_id, deliveryMethod: TEE_DELIVERY_METHOD, vmId: job.vm_id, status: job.status, step: job.step, vmStatus: job.vm_status, contractStatus: job.contract_status, dataFileStatus: job.data_file_status, weightFileStatus: job.weight_file_status, resultStatus: job.result_status, lastError: job.last_error });
  });

  app.post('/api/privacy/tee/receive-key', async (req, res) => {
    const { transactionId, ecPublicKey, fileType, role, kind, name } = req.body || {};
    if (!transactionId || !ecPublicKey) return res.status(400).json({ success: false, message: '缺少 transactionId 或 ecPublicKey' });
    try {
      const job = await getJob(transactionId);
      if (!job?.vm_id) return res.status(409).json({ success: false, message: 'TEE 虚拟机尚未启动' });
      const envelope = await teeClient.receiveKey({ vmId: job.vm_id, ecPublicKey, ...(fileType && { fileType }), ...(role && { role }), ...(kind && { kind }), ...(name && { name }) });
      res.json({ success: true, transactionId, vmId: job.vm_id, envelope });
    } catch (error) { fail(res, error, 'TEE 密钥获取失败'); }
  });

  app.post('/api/privacy/tee/verify-contract', async (req, res) => {
    const { transactionId, iv, ciphertext, deliveried_cnt, delivered_cnt, fileHash, expirationTime, vmId } = req.body || {};
    if (!transactionId || !iv || !ciphertext || !fileHash) return res.status(400).json({ success: false, message: '缺少合约校验参数' });
    try {
      const job = await getJob(transactionId); const effectiveVmId = vmId || job?.vm_id;
      if (!effectiveVmId) return res.status(409).json({ success: false, message: 'TEE 虚拟机尚未启动' });
      const result = await teeClient.verifyContract({ vmId: effectiveVmId, iv, ciphertext, fileHash, expirationTime, deliveried_cnt: deliveried_cnt ?? delivered_cnt });
      await updateJob(transactionId, { contract_status: 'PASSED', step: 'CONTRACT_VERIFIED', contract_verify_result: JSON.stringify(result) });
      res.json({ success: true, transactionId, result });
    } catch (error) { await updateJob(transactionId, { contract_status: 'FAILED', step: 'CONTRACT_VERIFY_FAILED', last_error: error.message }).catch(() => {}); fail(res, error, 'TEE 合约校验失败'); }
  });

  app.post('/api/privacy/tee/receive-file', async (req, res) => {
    const { transactionId, iv, ciphertext, fileType, vmId, name, role, kind } = req.body || {};
    if (!transactionId || !iv || !ciphertext || !fileType) return res.status(400).json({ success: false, message: '缺少文件上传参数' });
    if (!['data', 'weight'].includes(String(fileType).toLowerCase())) return res.status(400).json({ success: false, message: 'fileType 只能是 data 或 weight' });
    try {
      const job = await getJob(transactionId); const effectiveVmId = vmId || job?.vm_id;
      if (!effectiveVmId) return res.status(409).json({ success: false, message: 'TEE 虚拟机尚未启动' });
      const result = await teeClient.receiveFile({ vmId: effectiveVmId, iv, ciphertext, fileType, ...(name && { name }), ...(role && { role }), ...(kind && { kind }) });
      const isWeight = String(fileType).toLowerCase() === 'weight';
      await updateJob(transactionId, { [isWeight ? 'weight_file_status' : 'data_file_status']: 'RECEIVED', step: result.computed ? 'RESULT_READY' : (isWeight ? 'WAITING_DATA' : 'WAITING_WEIGHT'), result_status: result.computed ? 'READY' : 'PENDING' });
      res.json({ success: true, transactionId, result });
    } catch (error) { fail(res, error, 'TEE 文件接收失败'); }
  });

  app.post('/api/privacy/tee/get-result', async (req, res) => {
    const { transactionId, vmId } = req.body || {};
    if (!transactionId && !vmId) return res.status(400).json({ success: false, message: '缺少 transactionId 或 vmId' });
    try {
      const job = transactionId ? await getJob(transactionId) : null; const effectiveVmId = vmId || job?.vm_id;
      if (!effectiveVmId) return res.status(404).json({ success: false, message: '未找到 TEE 虚拟机' });
      const result = await teeClient.getResult(effectiveVmId);
      if (transactionId) await updateJob(transactionId, { result_status: 'READY', step: 'RESULT_READY', encrypted_result: JSON.stringify(result) });
      res.json({ success: true, transactionId, vmId: effectiveVmId, result });
    } catch (error) { fail(res, error, 'TEE 结果获取失败'); }
  });
}

module.exports = { registerTeeRoutes };
