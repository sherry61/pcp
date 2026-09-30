const { createTeeClient } = require('./client');
const { TEE_DELIVERY_METHOD } = require('./constants');
const { cleanupRemoteVms } = require('./hostVmCleanup');

function registerTeeRoutes({ app, upload, dbQuery, teeClient = createTeeClient() }) {
  if (!app || typeof dbQuery !== 'function') throw new Error('registerTeeRoutes requires app and dbQuery');
  const vmSetupInFlight = new Set();
  // 防止卖方在极短时间内重复点击“执行交付”而重复创建 attempt。
  const deliveryStarting = new Set();
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

  // ===== 交付尝试（交付详情数据源）=====
  const formatAttempt = (row) => {
    if (!row) return null;
    const started = row.started_at ? new Date(row.started_at).getTime() : null;
    const finished = row.finished_at ? new Date(row.finished_at).getTime() : null;
    return {
      id: row.id,
      transactionId: row.transaction_id,
      assetId: row.asset_id,
      attemptNo: row.attempt_no,
      status: row.status,
      step: row.step,
      vmId: row.vm_id,
      weightSource: row.weight_source,
      weightFileName: row.weight_file_name,
      errorMessage: row.error_message,
      triggeredBy: row.triggered_by,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: started != null && finished != null ? Math.max(0, finished - started) : null
    };
  };
  const listAttempts = async (transactionId) => (await dbQuery('SELECT * FROM tee_delivery_attempts WHERE transaction_id = ? ORDER BY attempt_no ASC', [String(transactionId)])).map(formatAttempt);
  const getLastAttempt = async (transactionId) => formatAttempt((await dbQuery('SELECT * FROM tee_delivery_attempts WHERE transaction_id = ? ORDER BY attempt_no DESC LIMIT 1', [String(transactionId)]))[0]);
  const finishAttempt = async (attemptId, status, fields = {}) => {
    if (!attemptId) return;
    await dbQuery(
      'UPDATE tee_delivery_attempts SET status = ?, step = ?, vm_id = COALESCE(?, vm_id), error_message = ?, finished_at = NOW() WHERE id = ?',
      [status, fields.step || null, fields.vmId || null, status === 'FAILED' ? (fields.error || '交付失败') : null, Number(attemptId)]
    ).catch((error) => console.warn('[TEE attempt]', attemptId, error.message));
  };
  // 每轮交付开始前清空上一轮运行态，避免 /get-result 返回上一轮密文、密钥串轮。
  // 结果文件按 attempt 分目录保留，无需删除历史轮次。
  const resetJobForAttempt = async (transactionId) => {
    await updateJob(transactionId, {
      vm_id: null, vm_status: null, qemu_pid: null, step: 'VM_CREATING', status: 'RUNNING', last_error: null,
      contract_status: null, data_file_status: null, weight_file_status: null, result_status: null,
      encrypted_result: null, weight_key_envelope: null,
      weight_public_key_pem: null, weight_private_key_pem: null,
      buyer_public_key_pem: null, buyer_private_key_pem: null,
      data_public_key_pem: null, data_private_key_pem: null
    });
  };
  const nextAttemptNo = async (transactionId) => {
    const rows = await dbQuery('SELECT COALESCE(MAX(attempt_no), 0) AS max_no FROM tee_delivery_attempts WHERE transaction_id = ?', [String(transactionId)]);
    return Number(rows[0]?.max_no || 0) + 1;
  };
  const createAttempt = async (transactionId, job, triggeredBy) => {
    await resetJobForAttempt(transactionId);
    const attemptNo = await nextAttemptNo(transactionId);
    const weightSource = job?.buyer_weight_file_path ? 'BUYER_UPLOADED' : 'ASSET_DEFAULT';
    let weightFileName = job?.buyer_weight_file_path ? job.buyer_weight_file_name : null;
    if (!weightFileName && job?.asset_id) {
      const material = (await dbQuery('SELECT weight_file_name FROM tee_asset_materials WHERE asset_id = ? LIMIT 1', [String(job.asset_id)]))[0];
      weightFileName = material?.weight_file_name || null;
    }
    const inserted = await dbQuery(
      'INSERT INTO tee_delivery_attempts (transaction_id, asset_id, attempt_no, status, step, weight_source, weight_file_name, triggered_by) VALUES (?,?,?,?,?,?,?,?)',
      [String(transactionId), job?.asset_id || null, attemptNo, 'RUNNING', 'VM_CREATING', weightSource, weightFileName, triggeredBy || null]
    );
    await updateJob(transactionId, { current_attempt_id: inserted.insertId });
    return { attemptId: inserted.insertId, attemptNo, weightSource, weightFileName };
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
  // 买方请求交付时上传的权重文件，仅覆盖本订单后续交付，不影响资产默认权重。
  const requestRoot = process.env.TEE_REQUEST_DIR || path.resolve(__dirname, '../storage/tee-requests');
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
  const safeTransactionId = (transactionId) => String(transactionId).replace(/[^a-zA-Z0-9._-]/g, '_');
  // 可重复交付：结果按“订单号/attempt-<第几次交付>”分目录，避免后一轮覆盖前一轮。
  const attemptResultDir = (transactionId, attemptNo) => attemptNo == null
    ? path.join(resultRoot, safeTransactionId(transactionId))
    : path.join(resultRoot, safeTransactionId(transactionId), `attempt-${attemptNo}`);
  const getCurrentAttemptNo = async (transactionId) => {
    const job = await getJob(transactionId);
    if (!job?.current_attempt_id) return null;
    const rows = await dbQuery('SELECT attempt_no FROM tee_delivery_attempts WHERE id = ? LIMIT 1', [Number(job.current_attempt_id)]);
    return rows[0]?.attempt_no ?? null;
  };
  const persistEncryptedResult = async (transactionId, vmId, result, attemptNo = null) => {
    const resolvedAttemptNo = attemptNo == null ? await getCurrentAttemptNo(transactionId).catch(() => null) : attemptNo;
    const dir = attemptResultDir(transactionId, resolvedAttemptNo);
    const target = path.join(dir, 'encrypted-result.json');
    const temp = path.join(dir, `.encrypted-result.${process.pid}.${Date.now()}.tmp`);
    const payload = JSON.stringify({ transactionId: String(transactionId), attemptNo: resolvedAttemptNo, vmId: String(vmId), storedAt: new Date().toISOString(), result });
    // The payload contains only TEE ciphertext.  Keep it writable by the
    // backend owner while allowing other local service users to read it.
    // chmod 是 best-effort：目录归其他用户时不应阻断结果落库。
    const bestEffortChmod = (target, mode) => { try { fs.chmodSync(target, mode); } catch (error) { console.warn('[TEE persist] chmod skipped', target, error.message); } };
    fs.mkdirSync(resultRoot, { recursive: true, mode: 0o755 });
    bestEffortChmod(resultRoot, 0o755);
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
    bestEffortChmod(dir, 0o755);
    fs.writeFileSync(temp, payload, { encoding: 'utf8', mode: 0o644 });
    fs.renameSync(temp, target);
    bestEffortChmod(target, 0o644);
    await updateJob(transactionId, { encrypted_result: JSON.stringify(result), result_status: 'READY', step: 'RESULT_READY', last_error: null });
    return target;
  };
  const getPersistedEncryptedResult = async (transactionId, job) => {
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

    // 优先读当前 attempt 的结果；兼容旧版 <订单号>/encrypted-result.json。
    const attemptNo = await getCurrentAttemptNo(transactionId).catch(() => null);
    const candidates = [
      attemptNo == null ? null : path.join(attemptResultDir(transactionId, attemptNo), 'encrypted-result.json'),
      path.join(resultRoot, safeTransactionId(transactionId), 'encrypted-result.json')
    ].filter(Boolean);
    for (const candidate of candidates) {
      try {
        const saved = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        const parsed = parseResult(saved?.result);
        if (parsed) return parsed;
      } catch (_) { /* try next candidate */ }
    }
    return null;
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
    // 买方在本轮请求时上传的 weight.csv 覆盖资产登记时的默认权重。
    const weightFilePath = job?.buyer_weight_file_path || material?.weight_file_path;
    if (!material?.data_file_path || !weightFilePath) throw new Error('TEE 资产尚未同时上传 data.csv 和 weight.csv');
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
      result = await upload('weight', weightFilePath);
    } catch (error) {
      // Some v2 deployments keep the key-flow state per role/kind. Repair the
      // data phase once before retrying weight, instead of leaving the job failed.
      if (String(error.message || '').includes('weight_key_before_data')) {
        await updateJob(transactionId, { step: 'DATA_KEY_NEGOTIATING', last_error: error.message });
        await upload('data', material.data_file_path);
        await updateJob(transactionId, { step: 'WEIGHT_KEY_NEGOTIATING' });
        result = await upload('weight', weightFilePath);
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

  // 买方请求交付：只落库 + 可选保存买方权重文件，不创建 VM、不调用海光主机。
  app.post('/api/privacy/tee/request', upload?.fields([{ name: 'weightFile', maxCount: 1 }]), async (req, res) => {
    const body = req.body || {};
    const transactionId = String(body.transactionId || '').trim();
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    try {
      const existing = await getJob(transactionId);
      if (existing && String(existing.status).toUpperCase() === 'RUNNING') {
        return res.status(409).json({ success: false, message: '当前交付正在进行中，请等待完成后再请求' });
      }
      const assetId = String(body.assetId || existing?.asset_id || '').trim();
      const material = assetId ? (await dbQuery('SELECT data_file_path,weight_file_path,weight_file_name FROM tee_asset_materials WHERE asset_id = ? LIMIT 1', [assetId]))[0] : null;
      if (!material?.data_file_path) return res.status(409).json({ success: false, message: 'TEE 资产尚未上传 data.csv' });

      const weightFile = req.files?.weightFile?.[0];
      let buyerWeight = {
        path: existing?.buyer_weight_file_path || null,
        name: existing?.buyer_weight_file_name || null,
        hash: existing?.buyer_weight_file_hash || null,
        size: existing?.buyer_weight_file_size || null
      };
      if (weightFile) {
        if (!/\.csv$/i.test(weightFile.originalname || '')) return res.status(400).json({ success: false, message: '权重文件必须为 CSV 文件' });
        // 买方每次都请求对应当前待交付轮次，目录按 订单号/attempt-<n>/ 编号。
        const upcomingAttemptNo = await nextAttemptNo(transactionId);
        const dir = path.join(requestRoot, safeTransactionId(transactionId), `attempt-${upcomingAttemptNo}`);
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        const target = path.join(dir, 'weight.csv');
        fs.writeFileSync(target, weightFile.buffer, { mode: 0o600 });
        buyerWeight = { path: target, name: weightFile.originalname, hash: crypto.createHash('sha256').update(weightFile.buffer).digest('hex'), size: weightFile.size };
      } else if (String(body.useDefaultWeight || '') === '1') {
        buyerWeight = { path: null, name: null, hash: null, size: null };
      }
      if (!buyerWeight.path && !material.weight_file_path) {
        return res.status(409).json({ success: false, message: '请上传 weight.csv，或先为该资产登记默认权重文件' });
      }

      await dbQuery(
        `INSERT INTO delivery_secure_jobs
           (transaction_id, buyer_address, seller_address, asset_id, vm_cpu, vm_memory_mb,
            buyer_weight_file_path, buyer_weight_file_name, buyer_weight_file_hash, buyer_weight_file_size,
            status, step, requested_at, current_attempt_id, last_error)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NULL,NULL)
         ON DUPLICATE KEY UPDATE
           buyer_address=VALUES(buyer_address), seller_address=VALUES(seller_address), asset_id=VALUES(asset_id),
           vm_cpu=VALUES(vm_cpu), vm_memory_mb=VALUES(vm_memory_mb),
           buyer_weight_file_path=VALUES(buyer_weight_file_path), buyer_weight_file_name=VALUES(buyer_weight_file_name),
           buyer_weight_file_hash=VALUES(buyer_weight_file_hash), buyer_weight_file_size=VALUES(buyer_weight_file_size),
           status='PENDING', step='REQUESTED', requested_at=NOW(), current_attempt_id=NULL, last_error=NULL,
           result_status=NULL, encrypted_result=NULL, contract_status=NULL,
           data_file_status=NULL, weight_file_status=NULL,
           weight_key_envelope=NULL, weight_private_key_pem=NULL, weight_public_key_pem=NULL,
           buyer_private_key_pem=NULL, buyer_public_key_pem=NULL,
           data_private_key_pem=NULL, data_public_key_pem=NULL`,
        [transactionId, body.buyerAddress || existing?.buyer_address || null, body.sellerAddress || existing?.seller_address || null, assetId || null,
         Number(body.vmCpu || existing?.vm_cpu || 8), Number(body.vmMemoryMb || existing?.vm_memory_mb || 4096),
         buyerWeight.path, buyerWeight.name, buyerWeight.hash, buyerWeight.size, 'PENDING', 'REQUESTED']
      );
      res.json({
        success: true, deliveryMethod: TEE_DELIVERY_METHOD, transactionId, step: 'REQUESTED',
        requestedAt: new Date().toISOString(),
        weightSource: buyerWeight.path ? 'BUYER_UPLOADED' : 'ASSET_DEFAULT',
        weightFileName: buyerWeight.name || material.weight_file_name || null
      });
    } catch (error) { fail(res, error, 'TEE 交付申请失败'); }
  });

  const startVmInBackground = async (transactionId, job, attemptId) => {
    if (vmSetupInFlight.has(String(transactionId))) return;
    vmSetupInFlight.add(String(transactionId));
    try {
      const created = await callTeeStage(transactionId, 'VM_CREATE', () => teeClient.createVm({ cpu: job.vm_cpu || 8, memoryMb: job.vm_memory_mb || 4096 }));
      const vmId = created.vmId || created.vm_id;
      if (!vmId) throw new Error('TEE VM create response missing vmId');
      await updateJob(transactionId, { vm_id: vmId, vm_status: created.status || 'created', step: 'VM_STARTING' });
      if (attemptId) await dbQuery('UPDATE tee_delivery_attempts SET vm_id = ? WHERE id = ?', [vmId, Number(attemptId)]).catch(() => {});
      const started = await callTeeStage(transactionId, 'VM_START', () => teeClient.startVm(vmId));
      await updateJob(transactionId, { vm_status: started.status || 'running', step: 'SERVICE_DEPLOYING', status: 'VM_RUNNING' });
      await callTeeStage(transactionId, 'SERVICE_READY', () => teeClient.waitForServices());
      await updateJob(transactionId, { step: 'DATA_KEY_NEGOTIATING', status: 'VM_RUNNING' });
      await autoDeliverMaterials(transactionId, vmId);
      await updateJob(transactionId, { status: 'SUCCESS', step: 'RESULT_READY', result_status: 'READY', last_error: null }).catch(() => {});
      await finishAttempt(attemptId, 'SUCCESS', { step: 'RESULT_READY', vmId });
    } catch (error) {
      await updateJob(transactionId, { status: 'FAILED', step: 'FAILED', last_error: error.message, result_status: null, encrypted_result: null }).catch(() => {});
      await finishAttempt(attemptId, 'FAILED', { step: 'FAILED', error: error.message });
    } finally { vmSetupInFlight.delete(String(transactionId)); }
  };

  // 卖方“执行交付”统一入口：先建 attempt，再清理海光主机上已有虚机，最后启动后台链路。
  // 清理失败也会作为一次 FAILED 交付记录在交付详情里。
  const beginDelivery = async (transactionId, triggeredBy) => {
    const tx = String(transactionId);
    if (vmSetupInFlight.has(tx) || deliveryStarting.has(tx)) return { code: 409, body: { success: false, message: '当前交付正在进行中，请稍后再试' } };
    const job = await getJob(tx);
    if (!job) return { code: 404, body: { success: false, message: '买方尚未请求交付' } };
    if (!job.requested_at) return { code: 409, body: { success: false, message: '请等待买方请求交付' } };
    if (String(job.status).toUpperCase() === 'RUNNING') return { code: 409, body: { success: false, message: '当前交付正在进行中，请稍后再试' } };
    if (job.current_attempt_id != null) return { code: 409, body: { success: false, message: '请等待买方重新请求交付' } };
    const material = (await dbQuery('SELECT data_file_path, weight_file_path FROM tee_asset_materials WHERE asset_id = ? LIMIT 1', [String(job.asset_id)]))[0];
    const weightFilePath = job.buyer_weight_file_path || material?.weight_file_path;
    if (!material?.data_file_path || !weightFilePath) return { code: 409, body: { success: false, message: 'TEE 资产缺少 data.csv 或 weight.csv，无法交付' } };

    deliveryStarting.add(tx);
    try {
      const attempt = await createAttempt(tx, job, triggeredBy);
      // 每次交付前先清理对面主机上已有的虚机（含本订单上一轮 vm_id）。
      let cleanup;
      try {
        cleanup = await cleanupRemoteVms({ extraVmIds: job.vm_id ? [job.vm_id] : [] });
      } catch (error) {
        const message = `海光主机虚机清理失败：${error.message}`;
        await updateJob(tx, { status: 'FAILED', step: 'FAILED', last_error: message }).catch(() => {});
        await finishAttempt(attempt.attemptId, 'FAILED', { step: 'CLEANUP_FAILED', error: message });
        return { code: 502, body: { success: false, message } };
      }
      if (cleanup.failed?.length) {
        const detail = cleanup.failed.map((item) => `${item.vmId}(${item.error})`).join('; ');
        const message = `海光主机虚机清理失败：${detail}`;
        await updateJob(tx, { status: 'FAILED', step: 'FAILED', last_error: message }).catch(() => {});
        await finishAttempt(attempt.attemptId, 'FAILED', { step: 'CLEANUP_FAILED', error: message });
        return { code: 502, body: { success: false, message, cleanup } };
      }
      void startVmInBackground(tx, job, attempt.attemptId);
      return { code: 202, body: { success: true, transactionId: tx, accepted: true, cleanup, ...attempt } };
    } finally {
      deliveryStarting.delete(tx);
    }
  };

  app.post('/api/privacy/tee/deliver', async (req, res) => {
    const { transactionId, sellerAddress } = req.body || {};
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    try {
      const job = await getJob(transactionId);
      const result = await beginDelivery(transactionId, sellerAddress || job?.seller_address);
      res.status(result.code).json(result.body);
    } catch (error) { fail(res, error, 'TEE 交付启动失败'); }
  });

  app.post('/api/privacy/tee/confirm', async (req, res) => {
    const { transactionId } = req.body || {};
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    try {
      const job = await getJob(transactionId);
      const result = await beginDelivery(transactionId, job?.seller_address);
      res.status(result.code).json(result.body);
    } catch (error) { fail(res, error, 'TEE 虚拟机启动失败'); }
  });

  app.get('/api/privacy/tee/status', async (req, res) => {
    const job = await getJob(req.query.transactionId);
    if (!job) return res.status(404).json({ success: false, message: '未找到 TEE 交付任务' });
    res.json({ success: true, transactionId: job.transaction_id, deliveryMethod: TEE_DELIVERY_METHOD, vmId: job.vm_id, status: job.status, step: job.step, vmStatus: job.vm_status, contractStatus: job.contract_status, dataFileStatus: job.data_file_status, weightFileStatus: job.weight_file_status, resultStatus: job.result_status, lastError: job.last_error, requestedAt: job.requested_at, currentAttemptId: job.current_attempt_id, buyerWeightFileName: job.buyer_weight_file_name || null });
  });

  // 交付详情：打开弹窗时拉一次，不做轮询。
  app.get('/api/privacy/tee/attempts', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    try {
      res.json({ success: true, transactionId, attempts: await listAttempts(transactionId) });
    } catch (error) { fail(res, error, '查询交付详情失败'); }
  });

  // 卖方执行交付前弹窗展示买方请求信息与上一轮结果。
  app.get('/api/privacy/tee/request-info', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    if (!transactionId) return res.status(400).json({ success: false, message: '缺少 transactionId' });
    try {
      const job = await getJob(transactionId);
      const lastAttempt = await getLastAttempt(transactionId);
      const running = String(job?.status || '').toUpperCase() === 'RUNNING';
      res.json({
        success: true,
        transactionId,
        requested: Boolean(job?.requested_at),
        requestedAt: job?.requested_at || null,
        awaitingDelivery: Boolean(job?.requested_at) && job?.current_attempt_id == null && !running,
        running,
        buyerWeight: job?.buyer_weight_file_path
          ? { source: 'BUYER_UPLOADED', fileName: job.buyer_weight_file_name, size: job.buyer_weight_file_size }
          : { source: 'ASSET_DEFAULT', fileName: null, size: null },
        lastAttempt
      });
    } catch (error) { fail(res, error, '查询交付请求失败'); }
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
      const cachedResult = transactionId ? await getPersistedEncryptedResult(transactionId, job) : null;
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
