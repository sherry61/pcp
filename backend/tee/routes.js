const { createTeeClient } = require('./client');
const { TEE_DELIVERY_METHOD } = require('./constants');

function registerTeeRoutes({ app, upload, dbQuery, teeClient = createTeeClient() }) {
  if (!app || typeof dbQuery !== 'function') throw new Error('registerTeeRoutes requires app and dbQuery');
  const vmSetupInFlight = new Set();
  // The supplied TEE service keeps the active SM4 file key globally.  We
  // cannot change that remote implementation, so every key-request/file-upload
  // sequence must be serialized on this platform process.
  let teeKeyFlowTail = Promise.resolve();
  const runTeeKeyFlowExclusive = async (task) => {
    const previous = teeKeyFlowTail.catch(() => {});
    let release;
    teeKeyFlowTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await task(); } finally { release(); }
  };

  const getJob = async (transactionId) => {
    const rows = await dbQuery('SELECT * FROM delivery_secure_jobs WHERE transaction_id = ? LIMIT 1', [String(transactionId)]);
    return rows[0] || null;
  };
  const updateJob = async (transactionId, fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    await dbQuery(`UPDATE delivery_secure_jobs SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE transaction_id = ?`, [...keys.map((key) => fields[key]), String(transactionId)]);
  };
  const summarizeRemote = (body) => {
    const value = body && typeof body === 'object' ? body : {};
    const encodedBytes = (field) => value[field] ? Buffer.from(value[field], 'base64').length : 0;
    return {
      code: value.code ?? null, error: value.error ?? null, message: value.message ?? null,
      vmId: value.vmId ?? value.vm_id ?? null, fileType: value.fileType ?? null,
      dataReady: value.data_ready ?? null, weightReady: value.weight_ready ?? null,
      computed: value.computed ?? null, ready: value.ready ?? null, seq: value.seq ?? null,
      rows: value.rows ?? null, metrics: value.metrics ?? null,
      hasKeyEnvelope: Boolean(value.ephPub || value.ephemeralPublicKey),
      ivBytes: encodedBytes('iv'), ciphertextBytes: encodedBytes('ciphertext')
    };
  };
  const recordTeeEvent = async (transactionId, stage, outcome, startedAt, body = null) => {
    const details = summarizeRemote(body);
    await dbQuery(
      'INSERT INTO tee_delivery_events (transaction_id,stage,outcome,duration_ms,remote_code,details_json) VALUES (?,?,?,?,?,?)',
      [String(transactionId), stage, outcome, startedAt == null ? null : Date.now() - startedAt, Number.isFinite(Number(details.code)) ? Number(details.code) : null, JSON.stringify(details)]
    ).catch((error) => console.warn('[TEE event]', transactionId, stage, error.message));
  };
  const callTeeStage = async (transactionId, stage, task) => {
    const startedAt = Date.now();
    try {
      const response = await task();
      await recordTeeEvent(transactionId, stage, 'SUCCESS', startedAt, response);
      return response;
    } catch (error) {
      await recordTeeEvent(transactionId, stage, 'FAILED', startedAt, error.response?.data || { message: error.message });
      throw error;
    }
  };
  const fail = (res, error, fallback = 'TEE 请求失败') => res.status(error.statusCode && error.statusCode >= 400 ? error.statusCode : 502).json({ success: false, message: error.message || fallback, remote: error.response?.data });

  // Files are uploaded once during asset registration and reused by every TEE delivery.
  // Keep them outside the database; only metadata and hashes are stored in MySQL.
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const materialRoot = process.env.TEE_ASSET_MATERIAL_DIR || path.resolve(__dirname, '../storage/tee-assets');
  const hashFile = (file) => crypto.createHash('sha256').update(file.buffer).digest('hex');
  const b64 = (v) => Buffer.from(v).toString('base64');
  const unb64 = (v) => Buffer.from(v, 'base64');
  const decryptEnvelope = (envelope, privateKey) => {
    const eph = crypto.createPublicKey({ key: unb64(envelope.ephPub || envelope.ephemeralPublicKey), format: 'der', type: 'spki' });
    const secret = crypto.diffieHellman({ privateKey, publicKey: eph });
    const material = Buffer.concat([secret, unb64(envelope.salt), Buffer.from('HENC2-P256-AES256GCM')]);
    const aesKey = crypto.createHash('sha256').update(material).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, unb64(envelope.nonce));
    decipher.setAuthTag(unb64(envelope.tag));
    return Buffer.concat([decipher.update(unb64(envelope.ciphertext)), decipher.final()]);
  };
  const encryptSm4 = (plain, key) => {
    const padded = Buffer.alloc(Math.ceil(Math.max(1, plain.length) / 16) * 16); plain.copy(padded);
    const iv = crypto.randomBytes(16);
    const { sm4 } = require('sm-crypto');
    // The supplied TEE service removes zero padding after SM4-CBC decrypt;
    // disable sm-crypto's default PKCS#7 padding to keep the wire format compatible.
    const ciphertext = sm4.encrypt(Array.from(padded), Array.from(key), { mode: 'cbc', iv: Array.from(iv), padding: 'none', output: 'array' });
    return { iv: b64(iv), ciphertext: b64(Buffer.from(ciphertext)) };
  };
  const decryptAndValidateResult = (result, key) => {
    if (!result?.iv || !result?.ciphertext) throw new Error('TEE 返回结果缺少 iv 或 ciphertext');
    const decipher = crypto.createDecipheriv('sm4-cbc', key, unb64(result.iv));
    decipher.setAutoPadding(false);
    const raw = Buffer.concat([decipher.update(unb64(result.ciphertext)), decipher.final()]);
    let end = raw.length;
    while (end && raw[end - 1] === 0) end -= 1;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, end));
    return JSON.parse(text);
  };
  const resultRoot = process.env.TEE_RESULT_DIR || path.resolve(__dirname, '../storage/tee-results');
  const resultPollIntervalMs = Math.max(1000, Number(process.env.TEE_RESULT_POLL_MS || 5000));
  const resultPollTimeoutMs = Math.max(resultPollIntervalMs, Number(process.env.TEE_RESULT_POLL_TIMEOUT_MS || 300000));
  const persistEncryptedResult = async (transactionId, vmId, result) => {
    const safeId = String(transactionId).replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = path.join(resultRoot, safeId);
    const target = path.join(dir, 'encrypted-result.json');
    const temp = path.join(dir, `.encrypted-result.${process.pid}.${Date.now()}.tmp`);
    const payload = JSON.stringify({ transactionId: String(transactionId), vmId: String(vmId), storedAt: new Date().toISOString(), result });
    // The payload contains only TEE ciphertext.  Keep it writable by the
    // backend owner while allowing other local service users to read it.
    fs.mkdirSync(resultRoot, { recursive: true, mode: 0o755 });
    fs.chmodSync(resultRoot, 0o755);
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    fs.chmodSync(dir, 0o755);
    fs.writeFileSync(temp, payload, { encoding: 'utf8', mode: 0o644 });
    fs.renameSync(temp, target);
    fs.chmodSync(target, 0o644);
    await updateJob(transactionId, { encrypted_result: JSON.stringify(result), result_status: 'READY', step: 'RESULT_READY', last_error: null });
    return target;
  };
  const getPersistedEncryptedResult = (transactionId, job) => {
    const parseResult = (value) => {
      if (!value) return null;
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return parsed?.iv && parsed?.ciphertext ? parsed : null;
    };

    // MySQL is the fast path.  The result file is the durable recovery path
    // when the database cache was not retained.
    try {
      const result = parseResult(job?.encrypted_result);
      if (result) return result;
    } catch (_) { /* Fall through to the encrypted file. */ }

    try {
      const safeId = String(transactionId).replace(/[^a-zA-Z0-9._-]/g, '_');
      const saved = JSON.parse(fs.readFileSync(path.join(resultRoot, safeId, 'encrypted-result.json'), 'utf8'));
      return parseResult(saved?.result);
    } catch (_) {
      return null;
    }
  };
  const validateAndPersistResult = async (transactionId, vmId, result, key) => {
    const startedAt = Date.now();
    try {
      const parsed = decryptAndValidateResult(result, key);
      await persistEncryptedResult(transactionId, vmId, result);
      await recordTeeEvent(transactionId, 'RESULT_VALIDATE_AND_PERSIST', 'SUCCESS', startedAt, {
        code: parsed.code, message: 'encrypted result persisted after local validation', vmId,
        rows: parsed.rows, metrics: parsed.metrics, computed: true, ready: true
      });
      return parsed;
    } catch (error) {
      await recordTeeEvent(transactionId, 'RESULT_VALIDATE_AND_PERSIST', 'FAILED', startedAt, { message: error.message, vmId });
      throw error;
    }
  };
  const waitForResult = async (transactionId, vmId) => {
    const deadline = Date.now() + resultPollTimeoutMs;
    let attempts = 0;
    while (Date.now() < deadline) {
      const startedAt = Date.now();
      try {
        const result = await teeClient.getResult(vmId);
        await recordTeeEvent(transactionId, 'GET_RESULT_POLL', 'SUCCESS', startedAt, result);
        return result;
      } catch (error) {
        const remote = error.response?.data || { message: error.message };
        const pending = error.statusCode === 404 || remote.error === 'no_result' || remote.code === 404;
        await recordTeeEvent(transactionId, 'GET_RESULT_POLL', pending ? 'PENDING' : 'FAILED', startedAt, remote);
        if (!pending) throw error;
      }
      attempts += 1;
      await new Promise((resolve) => setTimeout(resolve, resultPollIntervalMs));
    }
    throw new Error(`TEE 结果轮询超时（${attempts} 次，${resultPollTimeoutMs}ms）`);
  };
  const createServerKeyPair = () => crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });

  const autoDeliverMaterials = async (transactionId, vmId) => runTeeKeyFlowExclusive(async () => {
    const job = await getJob(transactionId);
    const material = (await dbQuery('SELECT * FROM tee_asset_materials WHERE asset_id = ? LIMIT 1', [job.asset_id]))[0];
    if (!material?.data_file_path || !material?.weight_file_path) throw new Error('TEE 资产尚未同时上传 data.csv 和 weight.csv');
    // The reference integration creates a separate EC key pair for each file
    // session. Do not reuse the buyer key or send non-documented role/kind
    // fields: the remote services may include these values in their state key.
    let weightSm4Key = null;
    const upload = async (fileType, filePath) => {
      const pair = createServerKeyPair();
      const keyResp = await callTeeStage(transactionId, `${fileType.toUpperCase()}_KEY`, () => teeClient.receiveKey({ vmId, ecPublicKey: pair.publicKey, fileType }));
      const privateKey = crypto.createPrivateKey(pair.privateKey);
      const sm4Key = decryptEnvelope(keyResp.envelope || keyResp, privateKey);
      const encrypted = encryptSm4(require('fs').readFileSync(filePath), sm4Key);
      const result = await callTeeStage(transactionId, `${fileType.toUpperCase()}_UPLOAD`, () => teeClient.receiveFile({ vmId, fileType, name: `${fileType}.csv`, ...encrypted }));
      if (fileType === 'weight') {
        weightSm4Key = sm4Key;
        await updateJob(transactionId, {
          weight_key_envelope: JSON.stringify(keyResp.envelope || keyResp),
          weight_private_key_pem: pair.privateKey,
          weight_public_key_pem: pair.publicKey,
          buyer_private_key_pem: pair.privateKey,
          buyer_public_key_pem: pair.publicKey
        });
      } else {
        await updateJob(transactionId, {
          data_private_key_pem: pair.privateKey,
          data_public_key_pem: pair.publicKey
        });
      }
      return result;
    };
    await updateJob(transactionId, { step: 'DATA_KEY_NEGOTIATING' });
    await upload('data', material.data_file_path);
    await updateJob(transactionId, { step: 'WEIGHT_KEY_NEGOTIATING' });
    let result;
    try {
      result = await upload('weight', material.weight_file_path);
    } catch (error) {
      // Some v2 deployments keep the key-flow state per role/kind. Repair the
      // data phase once before retrying weight, instead of leaving the job failed.
      if (String(error.message || '').includes('weight_key_before_data')) {
        await updateJob(transactionId, { step: 'DATA_KEY_NEGOTIATING', last_error: error.message });
        await upload('data', material.data_file_path);
        await updateJob(transactionId, { step: 'WEIGHT_KEY_NEGOTIATING' });
        result = await upload('weight', material.weight_file_path);
      } else throw error;
    }
    let computed = Boolean(result?.computed || result?.result?.computed);
    if (computed) {
      // Fetch and validate while the exclusive key-flow lease is still held.
      // This catches a remote key overwrite before the job is marked ready.
      const encryptedResult = await callTeeStage(transactionId, 'GET_RESULT', () => teeClient.getResult(vmId));
      await validateAndPersistResult(transactionId, vmId, encryptedResult, weightSm4Key);
    } else {
      await updateJob(transactionId, { step: 'COMPUTING', result_status: 'PENDING', last_error: null });
      const encryptedResult = await waitForResult(transactionId, vmId);
      await validateAndPersistResult(transactionId, vmId, encryptedResult, weightSm4Key);
      computed = true;
    }
    await updateJob(transactionId, { step: computed ? 'RESULT_READY' : 'COMPUTING', result_status: computed ? 'READY' : 'PENDING', last_error: null });
    return result;
  });

  app.post('/api/privacy/tee/assets/materials', upload?.fields([
    { name: 'dataFile', maxCount: 1 },
    { name: 'weightFile', maxCount: 1 }
  ]), async (req, res) => {
    const assetId = String(req.body?.assetId || '').trim();
    if (!assetId) return res.status(400).json({ success: false, message: '缺少 assetId' });
    const files = req.files || {};
    const dataFile = files.dataFile?.[0];
    const weightFile = files.weightFile?.[0];
    if (!dataFile && !weightFile) return res.status(400).json({ success: false, message: '至少上传 data.csv 或 weight.csv' });
    try {
      const dir = path.join(materialRoot, assetId.replace(/[^a-zA-Z0-9._-]/g, '_'));
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const existing = (await dbQuery('SELECT * FROM tee_asset_materials WHERE asset_id = ? LIMIT 1', [assetId]))[0] || {};
      const fields = { seller_address: req.body?.sellerAddress || existing.seller_address || null, status: 'PENDING' };
      for (const [kind, file] of [['data', dataFile], ['weight', weightFile]]) {
        if (!file) continue;
        if (!/\.csv$/i.test(file.originalname || '')) return res.status(400).json({ success: false, message: `${kind}.csv 必须为 CSV 文件` });
        const safeName = `${kind}.csv`;
        const target = path.join(dir, safeName);
        fs.writeFileSync(target, file.buffer, { mode: 0o600 });
        fields[`${kind}_file_path`] = target;
        fields[`${kind}_file_name`] = file.originalname;
        fields[`${kind}_file_hash`] = hashFile(file);
        fields[`${kind}_file_size`] = file.size;
      }
      const columns = Object.keys(fields);
      const values = columns.map((key) => fields[key]);
      if (existing.id) {
        await dbQuery(`UPDATE tee_asset_materials SET ${columns.map((key) => `${key} = ?`).join(', ')} WHERE asset_id = ?`, [...values, assetId]);
      } else {
        await dbQuery(`INSERT INTO tee_asset_materials (asset_id,${columns.join(',')}) VALUES (?,${columns.map(() => '?').join(',')})`, [assetId, ...values]);
      }
      const material = (await dbQuery('SELECT * FROM tee_asset_materials WHERE asset_id = ? LIMIT 1', [assetId]))[0];
      const ready = Boolean(material?.data_file_path && material?.weight_file_path);
      if (ready) await dbQuery('UPDATE tee_asset_materials SET status = ? WHERE asset_id = ?', ['READY', assetId]);
      res.status(201).json({ success: true, assetId, status: ready ? 'READY' : 'PENDING', dataFile: material?.data_file_name || null, weightFile: material?.weight_file_name || null });
    } catch (error) { fail(res, error, 'TEE 文件持久化失败'); }
  });

  app.get('/api/privacy/tee/assets/:assetId/materials', async (req, res) => {
    const row = (await dbQuery('SELECT asset_id,seller_address,data_file_name,data_file_hash,data_file_size,weight_file_name,weight_file_hash,weight_file_size,status,created_at,updated_at FROM tee_asset_materials WHERE asset_id = ? LIMIT 1', [String(req.params.assetId)]))[0];
    if (!row) return res.status(404).json({ success: false, message: '未找到 TEE 资产文件' });
    res.json({ success: true, material: row });
  });

  app.post('/api/privacy/tee/request', async (req, res) => {
    const { transactionId, buyerAddress, sellerAddress, assetId, vmCpu = 8, vmMemoryMb = 4096, buyerPublicKeyPem, buyerPrivateKeyPem } = req.body || {};
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    try {
      const material = assetId && (await dbQuery('SELECT data_file_path,weight_file_path,status FROM tee_asset_materials WHERE asset_id = ? LIMIT 1', [String(assetId)]))[0];
      if (!material?.data_file_path || !material?.weight_file_path) return res.status(409).json({ success: false, message: 'TEE 资产尚未完成 data.csv 和 weight.csv 上传' });
      let generatedKeys = null;
      if (!buyerPublicKeyPem || !buyerPrivateKeyPem) generatedKeys = createServerKeyPair();
      const effectivePublicKey = buyerPublicKeyPem || generatedKeys?.publicKey;
      const effectivePrivateKey = buyerPrivateKeyPem || generatedKeys?.privateKey;
      await dbQuery(`INSERT INTO delivery_secure_jobs (transaction_id,buyer_address,seller_address,asset_id,vm_cpu,vm_memory_mb,buyer_public_key_pem,buyer_private_key_pem,status,step) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE buyer_address=VALUES(buyer_address),seller_address=VALUES(seller_address),asset_id=VALUES(asset_id),vm_cpu=VALUES(vm_cpu),vm_memory_mb=VALUES(vm_memory_mb),buyer_public_key_pem=COALESCE(VALUES(buyer_public_key_pem),buyer_public_key_pem),buyer_private_key_pem=COALESCE(VALUES(buyer_private_key_pem),buyer_private_key_pem),status='PENDING',step='REQUESTED',last_error=NULL`, [String(transactionId), buyerAddress || null, sellerAddress || null, assetId || null, Number(vmCpu), Number(vmMemoryMb), effectivePublicKey, effectivePrivateKey, 'PENDING', 'REQUESTED']);
      res.json({ success: true, deliveryMethod: TEE_DELIVERY_METHOD, transactionId: String(transactionId), step: 'REQUESTED', keyReady: Boolean(generatedKeys) });
    } catch (error) { fail(res, error, 'TEE 交付申请失败'); }
  });

  const startVmInBackground = async (transactionId, job) => {
    if (vmSetupInFlight.has(String(transactionId))) return;
    vmSetupInFlight.add(String(transactionId));
    try {
      const created = await callTeeStage(transactionId, 'VM_CREATE', () => teeClient.createVm({ cpu: job.vm_cpu || 8, memoryMb: job.vm_memory_mb || 4096 }));
      const vmId = created.vmId || created.vm_id;
      if (!vmId) throw new Error('TEE VM create response missing vmId');
      await updateJob(transactionId, { vm_id: vmId, vm_status: created.status || 'created', step: 'VM_STARTING' });
      const started = await callTeeStage(transactionId, 'VM_START', () => teeClient.startVm(vmId));
      await updateJob(transactionId, { vm_status: started.status || 'running', step: 'SERVICE_DEPLOYING', status: 'VM_RUNNING' });
      await callTeeStage(transactionId, 'SERVICE_READY', () => teeClient.waitForServices());
      await updateJob(transactionId, { step: 'DATA_KEY_NEGOTIATING', status: 'VM_RUNNING' });
      await autoDeliverMaterials(transactionId, vmId);
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
      // Idempotency: once a VM exists and is running, never restart provisioning
      // just because the business step has advanced to data/weight handling.
      if (job.vm_id && String(job.vm_status).toLowerCase() === 'running') return res.status(202).json({ success: true, transactionId, vmId: job.vm_id, step: job.step, accepted: true, resumed: true });
      if (['VM_CREATING', 'VM_STARTING', 'SERVICE_DEPLOYING', 'VM_RUNNING', 'WAITING_DATA'].includes(String(job.step))) return res.status(202).json({ success: true, transactionId, vmId: job.vm_id, step: job.step, accepted: true, resumed: true });
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

  app.get('/api/privacy/tee/events', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    const rows = await dbQuery('SELECT id,transaction_id,stage,outcome,duration_ms,remote_code,details_json,created_at FROM tee_delivery_events WHERE transaction_id = ? ORDER BY id ASC', [transactionId]);
    res.json({ success: true, transactionId, events: rows.map((row) => ({ ...row, details: row.details_json ? JSON.parse(row.details_json) : null, details_json: undefined })) });
  });

  app.get('/api/privacy/tee/key-file', async (req, res) => {
    const job = await getJob(req.query.transactionId);
    if (!job) return res.status(404).json({ success: false, message: '未找到 TEE 交付任务' });
    if (!job.buyer_private_key_pem || !job.weight_key_envelope) return res.status(409).json({ success: false, message: 'TEE 结果密钥尚未准备完成' });
    res.json({ success: true, transactionId: job.transaction_id, algorithm: 'ECDH-P256 + SM4-CBC', privateKeyPem: job.buyer_private_key_pem, weightKeyEnvelope: JSON.parse(job.weight_key_envelope) });
  });

  app.post('/api/privacy/tee/receive-key', async (req, res) => {
    const { transactionId, ecPublicKey, fileType, role, kind, name } = req.body || {};
    if (!transactionId || !ecPublicKey) return res.status(400).json({ success: false, message: '缺少 transactionId 或 ecPublicKey' });
    const normalizedType = String(fileType || '').toLowerCase();
    try {
      const job = await getJob(transactionId);
      if (!job?.vm_id) return res.status(409).json({ success: false, message: 'TEE 虚拟机尚未启动' });
      await updateJob(transactionId, { step: normalizedType === 'weight' ? 'WEIGHT_KEY_NEGOTIATING' : (normalizedType === 'contract' ? 'CONTRACT_VERIFYING' : 'DATA_KEY_NEGOTIATING') });
      const envelope = await teeClient.receiveKey({ vmId: job.vm_id, ecPublicKey, ...(fileType && { fileType }) });
      res.json({ success: true, transactionId, vmId: job.vm_id, envelope });
    } catch (error) {
      // Do not leave the job stuck in *_KEY_NEGOTIATING after a remote timeout/error.
      // Return to the appropriate waiting step so the UI can retry safely.
      const failedStep = normalizedType === 'weight' ? 'WEIGHT_KEY_FAILED' : (normalizedType === 'contract' ? 'CONTRACT_VERIFY_FAILED' : 'DATA_KEY_FAILED');
      await updateJob(transactionId, { step: failedStep, status: 'VM_RUNNING', last_error: error.message }).catch(() => {});
      fail(res, error, 'TEE 密钥获取失败');
    }
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
      await updateJob(transactionId, { step: String(fileType).toLowerCase() === 'weight' ? 'WEIGHT_UPLOADING' : 'DATA_UPLOADING' });
      const result = await teeClient.receiveFile({ vmId: effectiveVmId, iv, ciphertext, fileType, ...(name && { name }) });
      const isWeight = String(fileType).toLowerCase() === 'weight';
      await updateJob(transactionId, { [isWeight ? 'weight_file_status' : 'data_file_status']: 'RECEIVED', step: result.computed ? 'RESULT_READY' : (isWeight ? 'COMPUTING' : 'WAITING_WEIGHT'), result_status: result.computed ? 'READY' : 'PENDING', last_error: null });
      res.json({ success: true, transactionId, result });
    } catch (error) {
      const isWeight = String(fileType).toLowerCase() === 'weight';
      await updateJob(transactionId, { step: isWeight ? 'WEIGHT_UPLOAD_FAILED' : 'DATA_UPLOAD_FAILED', status: 'VM_RUNNING', last_error: error.message }).catch(() => {});
      fail(res, error, 'TEE 文件接收失败');
    }
  });

  app.post('/api/privacy/tee/get-result', async (req, res) => {
    const { transactionId, vmId } = req.body || {};
    if (!transactionId && !vmId) return res.status(400).json({ success: false, message: '缺少 transactionId 或 vmId' });
    try {
      const job = transactionId ? await getJob(transactionId) : null;
      const cachedResult = transactionId ? getPersistedEncryptedResult(transactionId, job) : null;
      // A completed transaction can be downloaded after its VM is deleted:
      // use our validated ciphertext cache and do not call the Hygon host.
      if (cachedResult) {
        return res.json({ success: true, transactionId, vmId: job?.vm_id || vmId || null, result: cachedResult, source: 'server-cache' });
      }

      const effectiveVmId = vmId || job?.vm_id;
      if (!effectiveVmId) return res.status(404).json({ success: false, message: '未找到 TEE 虚拟机' });
      const result = await callTeeStage(transactionId || String(vmId), 'GET_RESULT_MANUAL', () => teeClient.getResult(effectiveVmId));
      if (transactionId) {
        if (!job?.buyer_private_key_pem || !job?.weight_key_envelope) throw new Error('TEE 结果密钥尚未准备完成');
        const key = decryptEnvelope(JSON.parse(job.weight_key_envelope), crypto.createPrivateKey(job.buyer_private_key_pem));
        await validateAndPersistResult(transactionId, effectiveVmId, result, key);
      }
      res.json({ success: true, transactionId, vmId: effectiveVmId, result });
    } catch (error) { fail(res, error, 'TEE 结果获取失败'); }
  });
}

module.exports = { registerTeeRoutes };
