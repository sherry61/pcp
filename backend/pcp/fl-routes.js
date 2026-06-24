const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
const { execFile } = require('child_process');

const { createPcpClient } = require('./client');
const { PCP_FL_RESULT_ROLES } = require('./constants');
const {
  buildFlContractPayload,
  normalizeFlRecord,
  mapFlRecordRow,
  extractFlResultMetadata,
  normalizeFlResultSyncPayload,
  normalizeSellerIds,
  validateHexString,
  buildFlSellerResultKey,
  buildRsaPublicKeyObjectFromPemHex
} = require('./fl');

function isMissingPcpTableError(error) {
  return error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);
}

function stringifyUpstreamErrorPayload(payload) {
  if (payload == null) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (typeof payload === 'object') {
    const detail = payload.detail || payload.message || payload.error;
    if (detail) {
      return String(detail).trim();
    }

    try {
      return JSON.stringify(payload);
    } catch (error) {
      return '';
    }
  }

  return String(payload).trim();
}

function formatFlRouteError(error) {
  if (isMissingPcpTableError(error)) {
    return {
      status: 500,
      body: {
        message: 'fl_delivery_contracts 表不存在，请先执行 FL 数据库初始化脚本',
        code: 'FL_TABLE_MISSING'
      }
    };
  }

  const status = error?.response?.status;
  if (status) {
    const upstreamMessage = stringifyUpstreamErrorPayload(error?.response?.data);
    return {
      status,
      body: {
        message: upstreamMessage || `PCP 请求失败（${status}）`,
        code: `PCP_${status}`
      }
    };
  }

  return {
    status: 500,
    body: {
      message: 'FL 路由处理失败',
      error: error.message
    }
  };
}

function getPcpFlBaseUrl() {
  return (
    process.env.PCP_FL_BASE_URL ||
    process.env.PCP_BASE_URL ||
    'http://127.0.0.1:8130'
  ).replace(/\/+$/, '');
}

function normalizePcType(value) {
  return String(value || '').trim().toUpperCase();
}

function assertFlPcType(digitalContract) {
  const actualPcType = normalizePcType(digitalContract?.pc_type);

  if (!actualPcType) {
    const error = new Error('数字合约未配置隐私计算方式');
    error.statusCode = 400;
    throw error;
  }

  if (!['FL', 'FEDERATED'].includes(actualPcType)) {
    const error = new Error('当前交易配置的隐私计算方式不是 FL');
    error.statusCode = 400;
    throw error;
  }
}

function extractContractStatus(payload) {
  const data = payload?.data || payload || {};
  return {
    contractId: data.contract_id || payload?.contract_id || null,
    status: data.status || payload?.status || null,
    contractParams: data.contract_params || payload?.contract_params || null
  };
}

function extractFlNotificationPayload(body, firstDefined) {
  const payload = body?.data || body || {};
  const result = payload?.result || {};

  return {
    transactionId: firstDefined(payload.transaction_id, body?.transaction_id),
    pcpContractId: firstDefined(payload.contract_id, body?.contract_id, body?.pcp_contract_id),
    pcpStatus: firstDefined(payload.status, body?.status),
    currentEpoch: firstDefined(payload.current_epoch, body?.current_epoch),
    receiverId: firstDefined(payload.receiver_id, body?.receiver_id),
    resultRole: firstDefined(payload.result_role, body?.result_role),
    batchIndex: firstDefined(payload.batch_index, body?.batch_index),
    downloadToken: firstDefined(
      payload.download_token,
      result.download_token,
      body?.download_token,
      body?.data?.download_token
    ),
    resultFilename: firstDefined(result.filename, body?.result_filename),
    resultStoragePath: firstDefined(result.result_uri, body?.result_uri, body?.result_storage_path),
    lastError: firstDefined(payload.last_error, body?.last_error)
  };
}

function runExecFile(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'buffer',
      cwd: options.cwd || undefined
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function normalizeArchiveEntryName(name) {
  return String(name || '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
    .trim();
}

function resolveFlZipEntryMap(entryNames) {
  const normalizedNames = entryNames
    .map(normalizeArchiveEntryName)
    .filter(Boolean)
    .filter((name) => !name.endsWith('/'));

  const requiredSuffixes = [
    'smashed/cipher.bin',
    'smashed/wrapped_key.bin',
    'smashed/meta.json',
    'label/cipher.bin',
    'label/wrapped_key.bin',
    'label/meta.json'
  ];

  const hasAnyLegacyEntry = requiredSuffixes.some((suffix) => (
    normalizedNames.some((name) => name === suffix || name.endsWith(`/${suffix}`))
  ));

  if (!hasAnyLegacyEntry) {
    return null;
  }

  const entryMap = {};
  for (const suffix of requiredSuffixes) {
    const matches = normalizedNames.filter((name) => name === suffix || name.endsWith(`/${suffix}`));
    if (matches.length !== 1) {
      const error = new Error(`卖方 ZIP 缺少或重复 ${suffix}`);
      error.statusCode = 400;
      throw error;
    }
    entryMap[suffix] = matches[0];
  }

  return entryMap;
}

async function extractZipEntryBuffer(zipPath, entryName) {
  const { stdout } = await runExecFile('unzip', ['-p', zipPath, entryName]);
  return Buffer.from(stdout);
}

async function parseFlBatchZip(file) {
  if (!file?.buffer || !file?.originalname) {
    const error = new Error('卖方 batch ZIP 不能为空');
    error.statusCode = 400;
    throw error;
  }

  const lowerName = String(file.originalname).trim().toLowerCase();
  if (!lowerName.endsWith('.zip')) {
    const error = new Error('卖方 batch 仅支持 zip 压缩包');
    error.statusCode = 400;
    throw error;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcp-fl-batch-'));
  const zipPath = path.join(tempDir, 'batch.zip');

  try {
    await fs.writeFile(zipPath, file.buffer);
    const { stdout } = await runExecFile('unzip', ['-Z1', zipPath]);
    const entryNames = String(stdout || '')
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    const normalizedSet = new Set(
      entryNames
        .map(normalizeArchiveEntryName)
        .filter(Boolean)
        .filter((name) => !name.endsWith('/'))
    );

    const hasNativeEpochBundle =
      normalizedSet.has('metadata.json') &&
      normalizedSet.has('smashed.safetensors') &&
      normalizedSet.has('labels.safetensors');

    if (hasNativeEpochBundle) {
      const [metadataBuffer, smashedBuffer, labelsBuffer] = await Promise.all([
        extractZipEntryBuffer(zipPath, 'metadata.json'),
        extractZipEntryBuffer(zipPath, 'smashed.safetensors'),
        extractZipEntryBuffer(zipPath, 'labels.safetensors')
      ]);
      let metadata;
      try {
        metadata = JSON.parse(String(metadataBuffer));
      } catch (error) {
        const parseError = new Error('seller_epoch_input.zip 中的 metadata.json 不是合法 JSON');
        parseError.statusCode = 400;
        throw parseError;
      }

      return {
        mode: 'native_epoch_bundle',
        bundleBuffer: Buffer.from(file.buffer),
        bundleMetadata: metadata,
        smashedBuffer,
        labelsBuffer
      };
    }

    const legacyEntryMap = resolveFlZipEntryMap(entryNames);
    if (legacyEntryMap) {
      const error = new Error(
        '当前 seller_epoch_input.zip 仍是旧加密碎片结构；PCC 现要求 metadata.json + smashed.safetensors + labels.safetensors'
      );
      error.statusCode = 400;
      throw error;
    }

    const invalidError = new Error(
      'seller_epoch_input.zip 结构无效，必须包含 metadata.json、smashed.safetensors、labels.safetensors'
    );
    invalidError.statusCode = 400;
    throw invalidError;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function createZipFromBuffers(entries) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pcp-fl-epoch-bundle-'));
  try {
    const inputDir = path.join(tempDir, 'input');
    await fs.mkdir(inputDir, { recursive: true });

    for (const [entryName, content] of Object.entries(entries || {})) {
      const normalizedName = normalizeArchiveEntryName(entryName);
      const outputPath = path.join(inputDir, normalizedName);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, content);
    }

    const zipPath = path.join(tempDir, 'bundle.zip');
    await runExecFile('zip', ['-rq', zipPath, '.'], { cwd: inputDir });
    return fs.readFile(zipPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sha256WithPrefix(buffer) {
  return `sha256:${crypto.createHash('sha256').update(buffer).digest('hex')}`;
}

function registerFlRoutes({
  app,
  upload,
  dbQuery,
  firstDefined,
  safeBaseName,
  pickContentType
}) {
  async function getTransactionById(transactionId) {
    const rows = await dbQuery(
      'SELECT * FROM transactions WHERE transaction_id = ? LIMIT 1',
      [transactionId]
    );

    return rows[0] || null;
  }

  async function getDigitalContractByTransactionId(transactionId) {
    const rows = await dbQuery(
      'SELECT * FROM digital_contracts WHERE transaction_id = ? LIMIT 1',
      [transactionId]
    );

    return rows[0] || null;
  }

  async function getFlRecordByTransactionId(transactionId) {
    const rows = await dbQuery(
      'SELECT * FROM fl_delivery_contracts WHERE transaction_id = ? LIMIT 1',
      [transactionId]
    );

    return rows[0] || null;
  }

  async function getFlRecordByPcpContractId(pcpContractId) {
    const rows = await dbQuery(
      'SELECT * FROM fl_delivery_contracts WHERE pcp_contract_id = ? LIMIT 1',
      [pcpContractId]
    );

    return rows[0] || null;
  }

  function buildFlAttemptStatus(attemptId, status, currentEpoch) {
    return {
      attempt_id: attemptId || null,
      status: status || null,
      current_epoch_id: currentEpoch == null ? null : Number(currentEpoch)
    };
  }

  async function syncCurrentFlAttempt(record) {
    const mapped = mapFlRecordRow(record);
    const attemptId = mapped?.seller_result_packages?.__attempt_id || null;
    if (!record?.pcp_contract_id || !attemptId) {
      return record;
    }

    try {
      const client = createPcpClient({
        baseUrl: getPcpFlBaseUrl()
      });
      const attemptResp = await client.get(
        `/fl/${encodeURIComponent(record.pcp_contract_id)}/attempts/${encodeURIComponent(attemptId)}/status`
      );
      const attemptData = attemptResp?.data?.data || {};
      const nextAttemptId = firstDefined(attemptData.attempt_id, attemptId);
      const nextStatus = firstDefined(attemptData.status, record.pcp_status, 'WAITING_EPOCH_INPUT');
      const nextEpoch = firstDefined(
        attemptData.current_epoch_id,
        attemptData.current_epoch,
        record.current_epoch,
        0
      );
      const tokenSyncState = await syncFlResultTokens({
        record,
        mapped,
        attemptId: nextAttemptId,
        attemptData,
        client
      });
      const sellerResultPackages = {
        ...(mapped?.seller_result_packages || {}),
        ...(tokenSyncState.sellerResultPackages || {}),
        __attempt_id: nextAttemptId
      };

      return await upsertFlRecord(
        mergeFlRecordInput(record, {
          transactionId: record.transaction_id,
          businessContractId: record.business_contract_id,
          pcpContractId: record.pcp_contract_id,
          buyerId: record.buyer_id,
          pcpStatus: nextStatus,
          currentEpoch: nextEpoch,
          buyerDownloadToken: tokenSyncState.buyerDownloadToken,
          buyerResultFilename: tokenSyncState.buyerResultFilename,
          buyerResultStoragePath: tokenSyncState.buyerResultStoragePath,
          sellerResultPackages,
          lastError: null
        })
      );
    } catch (error) {
      if (error?.response?.status === 404) {
        const sellerResultPackages = { ...(mapped?.seller_result_packages || {}) };
        delete sellerResultPackages.__attempt_id;

        return await upsertFlRecord(
          mergeFlRecordInput(record, {
            transactionId: record.transaction_id,
            businessContractId: record.business_contract_id,
            pcpContractId: record.pcp_contract_id,
            buyerId: record.buyer_id,
            pcpStatus: 'ACTIVE',
            currentEpoch: 0,
            sellerResultPackages,
            lastError: null
          })
        );
      }

      throw error;
    }
  }

  async function syncFlResultTokens({
    record,
    mapped,
    attemptId,
    attemptData,
    client
  }) {
    const resultTokens = Array.isArray(attemptData?.result_tokens)
      ? attemptData.result_tokens
      : [];
    const sellerResultPackages = {
      ...(mapped?.seller_result_packages || {})
    };
    let buyerDownloadToken = mapped?.buyer_download_token || null;
    let buyerResultFilename = mapped?.buyer_result_filename || null;
    let buyerResultStoragePath = mapped?.buyer_result_storage_path || null;

    for (const tokenItem of resultTokens) {
      if (!tokenItem || tokenItem.revoked) {
        continue;
      }

      const receiverId = tokenItem.receiver_id ? String(tokenItem.receiver_id).trim() : '';
      const resultRole = tokenItem.result_role ? String(tokenItem.result_role).trim() : '';
      const epochId = Number.isInteger(tokenItem.epoch_id) ? tokenItem.epoch_id : null;

      if (!receiverId || !resultRole) {
        continue;
      }

      if (resultRole === 'fl_top_model') {
        if (buyerDownloadToken) {
          continue;
        }

        try {
          const resendResp = await client.post('/tokens/resend', {
            contract_id: record.pcp_contract_id,
            attempt_id: attemptId,
            receiver_id: receiverId,
            result_role: resultRole
          });
          const resendData = resendResp?.data?.data || {};
          buyerDownloadToken = firstDefined(
            resendData.download_token,
            buyerDownloadToken,
            null
          );
        } catch (error) {
          continue;
        }
        continue;
      }

      if (resultRole !== 'fl_gradient_epoch_bundle') {
        continue;
      }

      const resultKey = buildFlSellerResultKey({
        sellerId: receiverId,
        resultRole,
        batchIndex: null
      });
      if (sellerResultPackages[resultKey]?.download_token) {
        continue;
      }

      try {
        const resendResp = await client.post('/tokens/resend', {
          contract_id: record.pcp_contract_id,
          attempt_id: attemptId,
          receiver_id: receiverId,
          result_role: resultRole,
          ...(epochId == null ? {} : { epoch_id: epochId })
        });
        const resendData = resendResp?.data?.data || {};
        sellerResultPackages[resultKey] = {
          ...(sellerResultPackages[resultKey] || {}),
          seller_id: receiverId,
          receiver_id: receiverId,
          result_role: resultRole,
          epoch_id: epochId,
          batch_index: null,
          download_token: firstDefined(
            resendData.download_token,
            sellerResultPackages[resultKey]?.download_token,
            null
          ),
          result_filename: sellerResultPackages[resultKey]?.result_filename || null,
          result_storage_path: sellerResultPackages[resultKey]?.result_storage_path || null
        };
      } catch (error) {
        continue;
      }
    }

    return {
      buyerDownloadToken,
      buyerResultFilename,
      buyerResultStoragePath,
      sellerResultPackages
    };
  }

  async function requireFlContext(transactionId) {
    const transaction = await getTransactionById(transactionId);
    if (!transaction) {
      const error = new Error('交易不存在');
      error.statusCode = 404;
      throw error;
    }

    const digitalContract = await getDigitalContractByTransactionId(transactionId);
    if (!digitalContract) {
      const error = new Error('交易对应的数字合约不存在');
      error.statusCode = 404;
      throw error;
    }

    assertFlPcType(digitalContract);

    return { transaction, digitalContract };
  }

  function toFlResponseRecord(record, fallback = {}) {
    const mapped = mapFlRecordRow(record);
    const buyerId = fallback.buyer_id || fallback.buyerId || null;
    const businessContractId =
      fallback.business_contract_id || fallback.businessContractId || null;

    if (!mapped) {
      return {
        transaction_id: fallback.transaction_id || fallback.transactionId || null,
        business_contract_id: businessContractId,
        pcp_contract_id: null,
        buyer_id: buyerId,
        seller_ids: [],
        pcp_status: 'NOT_EXIST',
        has_record: false,
        current_epoch: 0,
        buyer_result_ready: false,
        buyer_download_token: null,
        buyer_result_filename: null,
        seller_join_packages: {},
        seller_result_packages: {},
        last_error: null
      };
    }

    return {
      summary: {
        seller_join_count: Object.keys(mapped.seller_join_packages || {}).filter((key) => !key.startsWith('__')).length,
        seller_bottom_model_ready_count: Object.values(mapped.seller_join_packages || {}).filter((item) => item?.download_token).length,
        seller_gradient_ready_count: Object.values(mapped.seller_result_packages || {}).filter((item) => item?.download_token).length,
        buyer_result_ready: Boolean(mapped.buyer_result_ready)
      },
      transaction_id: mapped.transaction_id,
      business_contract_id: mapped.business_contract_id || businessContractId,
      pcp_contract_id: mapped.pcp_contract_id || null,
      buyer_id: mapped.buyer_id || buyerId,
      seller_ids: mapped.seller_ids || [],
      buyer_result_public_key: mapped.buyer_result_public_key || null,
      max_epochs: mapped.max_epochs,
      learning_rate: mapped.learning_rate,
      batch_size: mapped.batch_size,
      loss_function: mapped.loss_function,
      dp_noise_scale: mapped.dp_noise_scale,
      dp_clipping_threshold: mapped.dp_clipping_threshold,
      pcp_status: mapped.pcp_status || 'CREATED',
      current_epoch: Number(mapped.current_epoch || 0),
      has_record: true,
      buyer_result_ready: Boolean(mapped.buyer_result_ready),
      buyer_download_token: mapped.buyer_download_token || null,
      buyer_result_filename: mapped.buyer_result_filename || null,
      seller_join_packages: mapped.seller_join_packages || {},
      seller_result_packages: mapped.seller_result_packages || {},
      current_attempt_id:
        mapped.seller_result_packages?.__attempt_id || null,
      last_error: mapped.last_error || null
    };
  }

  async function upsertFlRecord(recordInput) {
    const record = normalizeFlRecord(recordInput);
    const sql = `
      INSERT INTO fl_delivery_contracts (
        transaction_id,
        business_contract_id,
        pcp_contract_id,
        buyer_id,
        seller_ids_json,
        buyer_result_public_key,
        max_epochs,
        learning_rate,
        batch_size,
        loss_function,
        dp_noise_scale,
        dp_clipping_threshold,
        pcp_status,
        current_epoch,
        buyer_download_token,
        buyer_result_filename,
        buyer_result_storage_path,
        seller_join_packages_json,
        seller_result_packages_json,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        business_contract_id = VALUES(business_contract_id),
        pcp_contract_id = VALUES(pcp_contract_id),
        buyer_id = VALUES(buyer_id),
        seller_ids_json = VALUES(seller_ids_json),
        buyer_result_public_key = VALUES(buyer_result_public_key),
        max_epochs = VALUES(max_epochs),
        learning_rate = VALUES(learning_rate),
        batch_size = VALUES(batch_size),
        loss_function = VALUES(loss_function),
        dp_noise_scale = VALUES(dp_noise_scale),
        dp_clipping_threshold = VALUES(dp_clipping_threshold),
        pcp_status = VALUES(pcp_status),
        current_epoch = VALUES(current_epoch),
        buyer_download_token = VALUES(buyer_download_token),
        buyer_result_filename = VALUES(buyer_result_filename),
        buyer_result_storage_path = VALUES(buyer_result_storage_path),
        seller_join_packages_json = VALUES(seller_join_packages_json),
        seller_result_packages_json = VALUES(seller_result_packages_json),
        last_error = VALUES(last_error)
    `;

    await dbQuery(sql, [
      record.transaction_id,
      record.business_contract_id,
      record.pcp_contract_id,
      record.buyer_id,
      record.seller_ids_json,
      record.buyer_result_public_key,
      record.max_epochs,
      record.learning_rate,
      record.batch_size,
      record.loss_function,
      record.dp_noise_scale,
      record.dp_clipping_threshold,
      record.pcp_status,
      record.current_epoch,
      record.buyer_download_token,
      record.buyer_result_filename,
      record.buyer_result_storage_path,
      record.seller_join_packages_json,
      record.seller_result_packages_json,
      record.last_error
    ]);

    return getFlRecordByTransactionId(record.transaction_id);
  }

  function mergeFlRecordInput(baseRecord, overrides) {
    const mapped = mapFlRecordRow(baseRecord);
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(overrides, key);

    return {
      transactionId: firstDefined(overrides.transactionId, mapped && mapped.transaction_id),
      businessContractId: firstDefined(
        overrides.businessContractId,
        mapped && mapped.business_contract_id
      ),
      pcpContractId: firstDefined(overrides.pcpContractId, mapped && mapped.pcp_contract_id),
      buyerId: firstDefined(overrides.buyerId, mapped && mapped.buyer_id),
      sellerIds: hasOwn('sellerIds')
        ? normalizeSellerIds(overrides.sellerIds)
        : (mapped && mapped.seller_ids) || [],
      buyerResultPublicKey: firstDefined(
        overrides.buyerResultPublicKey,
        mapped && mapped.buyer_result_public_key
      ),
      maxEpochs: firstDefined(overrides.maxEpochs, mapped && mapped.max_epochs, 10),
      learningRate: firstDefined(overrides.learningRate, mapped && mapped.learning_rate, 0.001),
      batchSize: firstDefined(overrides.batchSize, mapped && mapped.batch_size, 32),
      lossFunction: firstDefined(
        overrides.lossFunction,
        mapped && mapped.loss_function,
        'CrossEntropy'
      ),
      dpNoiseScale: firstDefined(
        overrides.dpNoiseScale,
        mapped && mapped.dp_noise_scale,
        0
      ),
      dpClippingThreshold: firstDefined(
        overrides.dpClippingThreshold,
        mapped && mapped.dp_clipping_threshold,
        1
      ),
      pcpStatus: firstDefined(overrides.pcpStatus, mapped && mapped.pcp_status, 'CREATED'),
      currentEpoch: firstDefined(overrides.currentEpoch, mapped && mapped.current_epoch, 0),
      buyerDownloadToken: hasOwn('buyerDownloadToken')
        ? overrides.buyerDownloadToken
        : mapped && mapped.buyer_download_token,
      buyerResultFilename: hasOwn('buyerResultFilename')
        ? overrides.buyerResultFilename
        : mapped && mapped.buyer_result_filename,
      buyerResultStoragePath: hasOwn('buyerResultStoragePath')
        ? overrides.buyerResultStoragePath
        : mapped && mapped.buyer_result_storage_path,
      sellerJoinPackages: hasOwn('sellerJoinPackages')
        ? overrides.sellerJoinPackages
        : (mapped && mapped.seller_join_packages) || {},
      sellerResultPackages: hasOwn('sellerResultPackages')
        ? overrides.sellerResultPackages
        : (mapped && mapped.seller_result_packages) || {},
      lastError: hasOwn('lastError')
        ? overrides.lastError
        : mapped && mapped.last_error
    };
  }

  function updateFlResultPackages(baseRecord, payload) {
    const mapped = mapFlRecordRow(baseRecord);
    const sellerJoinPackages = { ...(mapped?.seller_join_packages || {}) };
    const sellerResultPackages = { ...(mapped?.seller_result_packages || {}) };
    const resultMetadata = {
      receiver_id: payload.receiverId || null,
      result_role: payload.resultRole || null,
      batch_index: payload.batchIndex == null ? null : Number(payload.batchIndex),
      download_token: payload.downloadToken || null,
      result_filename: payload.resultFilename || null,
      result_storage_path: payload.resultStoragePath || null
    };

    if (payload.resultRole === 'fl_top_model') {
      return {
        buyerDownloadToken: payload.downloadToken || null,
        buyerResultFilename: payload.resultFilename || null,
        buyerResultStoragePath: payload.resultStoragePath || null,
        sellerJoinPackages,
        sellerResultPackages
      };
    }

    if (payload.resultRole === 'fl_bottom_model') {
      const sellerId = firstDefined(payload.receiverId, payload.sellerId);
      if (!sellerId) {
        throw new Error('sellerId is required for fl_bottom_model');
      }

      sellerJoinPackages[sellerId] = {
        ...(sellerJoinPackages[sellerId] || {}),
        ...resultMetadata
      };

      return {
        sellerJoinPackages,
        sellerResultPackages
      };
    }

    if (payload.resultRole === 'fl_gradient') {
      const sellerId = firstDefined(payload.receiverId, payload.sellerId);
      if (!sellerId) {
        throw new Error('sellerId is required for fl_gradient');
      }

      const resultKey = buildFlSellerResultKey({
        sellerId,
        resultRole: payload.resultRole,
        batchIndex: payload.batchIndex
      });
      sellerResultPackages[resultKey] = {
        seller_id: sellerId,
        ...resultMetadata
      };

      return {
        sellerJoinPackages,
        sellerResultPackages
      };
    }

    if (payload.resultRole === 'fl_gradient_epoch_bundle') {
      const sellerId = firstDefined(payload.receiverId, payload.sellerId);
      if (!sellerId) {
        throw new Error('sellerId is required for fl_gradient_epoch_bundle');
      }

      const resultKey = buildFlSellerResultKey({
        sellerId,
        resultRole: payload.resultRole,
        batchIndex: payload.batchIndex
      });
      sellerResultPackages[resultKey] = {
        seller_id: sellerId,
        ...resultMetadata
      };

      return {
        sellerJoinPackages,
        sellerResultPackages
      };
    }

    return {
      sellerJoinPackages,
      sellerResultPackages
    };
  }

  function pickFlReceiverToken(record, {
    receiverRole,
    sellerId,
    resultRole,
    batchIndex
  }) {
    const mapped = mapFlRecordRow(record);
    const normalizedReceiverRole = String(receiverRole || 'buyer').trim().toLowerCase();

    if (normalizedReceiverRole === 'buyer') {
      return {
        receiverId: mapped?.buyer_id || null,
        downloadToken: mapped?.buyer_download_token || null,
        filename: mapped?.buyer_result_filename || null
      };
    }

    if (!sellerId) {
      const error = new Error('sellerId is required when receiverRole=seller');
      error.statusCode = 400;
      throw error;
    }

    if (resultRole === 'fl_bottom_model') {
      const joined = mapped?.seller_join_packages?.[sellerId] || null;
      return {
        receiverId: sellerId,
        downloadToken: joined?.download_token || null,
        filename: joined?.result_filename || joined?.filename || null
      };
    }

    const resultKey = buildFlSellerResultKey({
      sellerId,
      resultRole: resultRole || 'fl_gradient',
      batchIndex
    });
    const resultItem = mapped?.seller_result_packages?.[resultKey] || (
      resultRole === 'fl_gradient'
        ? mapped?.seller_result_packages?.[buildFlSellerResultKey({
          sellerId,
          resultRole: 'fl_gradient_epoch_bundle',
          batchIndex
        })] || null
        : null
    );

    return {
      receiverId: sellerId,
      downloadToken: resultItem?.download_token || null,
      filename: resultItem?.result_filename || null
    };
  }

  async function tryResendFlSellerBottomModelToken(record, sellerId) {
    if (!record?.pcp_contract_id || !sellerId) {
      return record;
    }

    const mapped = mapFlRecordRow(record);
    const joined = mapped?.seller_join_packages?.[sellerId] || null;
    if (!joined || joined.download_token) {
      return record;
    }

    try {
      const client = createPcpClient({
        baseUrl: getPcpFlBaseUrl()
      });
      const resendResp = await client.post('/tokens/resend', {
        contract_id: record.pcp_contract_id,
        attempt_id: 'CONTRACT_MATERIAL',
        receiver_id: sellerId,
        result_role: 'fl_bottom_model'
      });
      const resendData = resendResp?.data?.data || {};
      const sellerJoinPackages = {
        ...(mapped?.seller_join_packages || {})
      };
      sellerJoinPackages[sellerId] = {
        ...(sellerJoinPackages[sellerId] || {}),
        receiver_id: sellerId,
        result_role: 'fl_bottom_model',
        download_token: firstDefined(
          resendData.download_token,
          sellerJoinPackages[sellerId]?.download_token,
          null
        ),
        token_status: firstDefined(
          resendData.notify_status,
          sellerJoinPackages[sellerId]?.token_status,
          'RESENT'
        )
      };

      return await upsertFlRecord(
        mergeFlRecordInput(record, {
          transactionId: record.transaction_id,
          businessContractId: record.business_contract_id,
          pcpContractId: record.pcp_contract_id,
          buyerId: record.buyer_id,
          sellerJoinPackages,
          lastError: null
        })
      );
    } catch (error) {
      return await upsertFlRecord(
        mergeFlRecordInput(record, {
          transactionId: record.transaction_id,
          businessContractId: record.business_contract_id,
          pcpContractId: record.pcp_contract_id,
          buyerId: record.buyer_id,
          lastError: stringifyUpstreamErrorPayload(error?.response?.data) || error.message || null
        })
      );
    }
  }

  app.get('/api/privacy/fl/tee-materials', async (req, res) => {
    const entityId = String(req.query.entityId || req.query.buyerId || req.query.sellerId || '').trim();

    try {
      const client = createPcpClient({
        baseUrl: getPcpFlBaseUrl(),
        entityId: entityId || undefined
      });
      const response = await client.get('/fl/tee-materials');
      return res.status(200).json({
        success: true,
        item: response?.data?.data || response?.data || null
      });
    } catch (error) {
      const routeError = formatFlRouteError(error);
      return res.status(routeError.status).json({
        success: false,
        ...routeError.body
      });
    }
  });

  app.post(
    '/api/privacy/fl/create-contract',
    upload.fields([
      { name: 'top_model_initial_package', maxCount: 1 },
      { name: 'bottom_model_initial_package', maxCount: 1 },
      { name: 'top_model_cipher_file', maxCount: 1 },
      { name: 'top_model_wrapped_key_file', maxCount: 1 },
      { name: 'top_model_meta_file', maxCount: 1 },
      { name: 'bottom_model_cipher_file', maxCount: 1 },
      { name: 'bottom_model_wrapped_key_file', maxCount: 1 },
      { name: 'bottom_model_meta_file', maxCount: 1 }
    ]),
    async (req, res) => {
      const transactionId = String(req.body.transactionId || '').trim();
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          message: '缺少 transactionId'
        });
      }

      const topModelInitialPackage = req.files?.top_model_initial_package?.[0] || null;
      const bottomModelInitialPackage = req.files?.bottom_model_initial_package?.[0] || null;

      if (!topModelInitialPackage || !bottomModelInitialPackage) {
        return res.status(400).json({
          success: false,
          message: '缺少 FL 合同初始化所需的 top_model_initial_package / bottom_model_initial_package'
        });
      }

      try {
        const { transaction, digitalContract } = await requireFlContext(transactionId);
        const existing = await getFlRecordByTransactionId(transactionId);
        if (existing?.pcp_contract_id) {
          return res.status(409).json({
            success: false,
            message: '当前交易已存在 FL 合同，请勿重复创建'
          });
        }

        const contractPayload = buildFlContractPayload({
          transaction,
          businessContractId: digitalContract.contract_id,
          sellerIds: firstDefined(req.body.sellerIds, req.body.seller_ids, transaction.seller_address),
          buyerResultPublicKey: firstDefined(
            req.body.buyerResultPublicKey,
            req.body.buyer_result_public_key
          ),
          maxEpochs: 1,
          learningRate: 0.001,
          batchSize: 32,
          lossFunction: 'CrossEntropy',
          dpNoiseScale: 0,
          dpClippingThreshold: 1
        });

        const form = new FormData();
        form.append('metadata', JSON.stringify(contractPayload));
        form.append('top_model_initial_package', topModelInitialPackage.buffer, {
          filename: topModelInitialPackage.originalname || 'top-model.zip',
          contentType: topModelInitialPackage.mimetype || 'application/zip'
        });
        form.append('bottom_model_initial_package', bottomModelInitialPackage.buffer, {
          filename: bottomModelInitialPackage.originalname || 'bottom-model.zip',
          contentType: bottomModelInitialPackage.mimetype || 'application/zip'
        });

        const client = createPcpClient({
          baseUrl: getPcpFlBaseUrl()
        });
        const contractResp = await client.post('/fl/contract', form, {
          headers: form.getHeaders()
        });
        const pcpContractId = firstDefined(
          contractResp?.data?.data?.contract_id,
          contractResp?.data?.contract_id
        );

        if (!pcpContractId) {
          return res.status(502).json({
            success: false,
            message: 'PCP /fl/contract 未返回 contract_id'
          });
        }

        const resultMetadata = extractFlResultMetadata(contractResp?.data);
        const saved = await upsertFlRecord(
          mergeFlRecordInput(existing, {
            transactionId,
            businessContractId: digitalContract.contract_id,
            pcpContractId,
            buyerId: transaction.buyer_address,
            sellerIds: contractPayload.seller_ids,
            buyerResultPublicKey: req.body.buyerResultPublicKey || req.body.buyer_result_public_key,
            maxEpochs: contractPayload.training_params?.max_epochs,
            learningRate: contractPayload.training_params?.learning_rate,
            batchSize: contractPayload.training_params?.batch_size,
            lossFunction: contractPayload.training_params?.loss_function,
            dpNoiseScale: contractPayload.training_params?.dp_noise_scale,
            dpClippingThreshold: contractPayload.training_params?.dp_clipping_threshold,
            pcpStatus: firstDefined(contractResp?.data?.data?.status, 'ACTIVE'),
            currentEpoch: firstDefined(contractResp?.data?.data?.current_epoch, 0),
            buyerDownloadToken: resultMetadata.downloadToken,
            buyerResultFilename: resultMetadata.resultFilename,
            buyerResultStoragePath: resultMetadata.resultStoragePath,
            lastError: null
          })
        );

        return res.status(200).json({
          success: true,
          message: 'FL 合同已创建',
          item: toFlResponseRecord(saved, {
            transaction_id: transactionId,
            business_contract_id: digitalContract.contract_id,
            buyer_id: transaction.buyer_address
          }),
          pcp: {
            contract: contractResp?.data || null
          }
        });
      } catch (error) {
        const routeError = formatFlRouteError(error);
        return res.status(error.statusCode || routeError.status).json({
          success: false,
          ...routeError.body,
          message: error.statusCode ? error.message : routeError.body.message
        });
      }
    }
  );

  app.post('/api/privacy/fl/join', upload.none(), async (req, res) => {
    const transactionId = String(req.body.transactionId || '').trim();
    const sellerId = String(
      firstDefined(req.body.sellerId, req.body.seller_id, '')
    ).trim();
    const sellerPublicKey = String(
      firstDefined(req.body.sellerPublicKey, req.body.seller_public_key, '')
    ).trim();

    if (!transactionId || !sellerId || !sellerPublicKey) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId / sellerId / sellerPublicKey'
      });
    }

    try {
      validateHexString(sellerPublicKey, 'sellerPublicKey');
      const { transaction, digitalContract } = await requireFlContext(transactionId);
      const existing = await getFlRecordByTransactionId(transactionId);

      if (!existing?.pcp_contract_id) {
        return res.status(400).json({
          success: false,
          message: '当前交易尚未创建 FL 合同'
        });
      }

      const client = createPcpClient({
        baseUrl: getPcpFlBaseUrl()
      });
      const joinResp = await client.post(
        `/fl/${encodeURIComponent(existing.pcp_contract_id)}/join`,
        {
          idempotency_key: `${existing.pcp_contract_id}-${sellerId}-join`,
          seller_id: sellerId,
          seller_public_key: buildRsaPublicKeyObjectFromPemHex(sellerPublicKey, `${sellerId}-key`)
        }
      );

      const joinData = joinResp?.data?.data || {};
      const joinPackages = {
        ...(mapFlRecordRow(existing)?.seller_join_packages || {})
      };
      joinPackages[sellerId] = {
        seller_id: sellerId,
        seller_public_key: sellerPublicKey,
        status: firstDefined(joinData.join_status, joinData.status, 'JOINED'),
        key_id: joinData.key_id || null,
        mode: joinData.mode || null,
        public_key: joinData.public_key || null,
        attestation: joinData.attestation || null,
        receiver_id: sellerId,
        result_role: 'fl_bottom_model',
        download_token: null,
        result_filename: null,
        type: null,
        format: null,
        token_status: joinData.bottom_model_token_status || null
      };

      const saved = await upsertFlRecord(
        mergeFlRecordInput(existing, {
          transactionId,
          businessContractId: digitalContract.contract_id,
          pcpContractId: existing.pcp_contract_id,
          buyerId: transaction.buyer_address,
          sellerJoinPackages: joinPackages,
          pcpStatus: firstDefined(joinData.status, existing.pcp_status, 'JOINED'),
          lastError: null
        })
      );

      return res.status(200).json({
        success: true,
        message: 'FL seller 已加入合同',
        item: toFlResponseRecord(saved, {
          transaction_id: transactionId,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address
        }),
        pcp: {
          join: joinResp?.data || null
        }
      });
    } catch (error) {
      const routeError = formatFlRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });

  app.post(
    '/api/privacy/fl/upload-batch',
    upload.fields([
      { name: 'batch_zip', maxCount: 1 },
      { name: 'smashed_cipher_file', maxCount: 1 },
      { name: 'smashed_wrapped_key_file', maxCount: 1 },
      { name: 'smashed_meta_file', maxCount: 1 },
      { name: 'label_cipher_file', maxCount: 1 },
      { name: 'label_wrapped_key_file', maxCount: 1 },
      { name: 'label_meta_file', maxCount: 1 }
    ]),
    async (req, res) => {
      const transactionId = String(req.body.transactionId || '').trim();
      const sellerId = String(
        firstDefined(req.body.sellerId, req.body.seller_id, '')
      ).trim();
      const batchIndex = 0;

      if (!transactionId || !sellerId) {
        return res.status(400).json({
          success: false,
          message: '缺少 transactionId / sellerId'
        });
      }

      const batchZipFile = req.files?.batch_zip?.[0] || null;
      let smashedCipherFile = req.files?.smashed_cipher_file?.[0] || null;
      let smashedWrappedKeyFile = req.files?.smashed_wrapped_key_file?.[0] || null;
      let smashedMetaFile = req.files?.smashed_meta_file?.[0] || null;
      let labelCipherFile = req.files?.label_cipher_file?.[0] || null;
      let labelWrappedKeyFile = req.files?.label_wrapped_key_file?.[0] || null;
      let labelMetaFile = req.files?.label_meta_file?.[0] || null;

      let nativeEpochBundle = null;
      if (
        batchZipFile &&
        !smashedCipherFile &&
        !smashedWrappedKeyFile &&
        !smashedMetaFile &&
        !labelCipherFile &&
        !labelWrappedKeyFile &&
        !labelMetaFile
      ) {
        const unpacked = await parseFlBatchZip(batchZipFile);
        if (unpacked?.mode === 'native_epoch_bundle') {
          nativeEpochBundle = unpacked;
        } else {
          smashedCipherFile = unpacked.smashedCipherFile;
          smashedWrappedKeyFile = unpacked.smashedWrappedKeyFile;
          smashedMetaFile = unpacked.smashedMetaFile;
          labelCipherFile = unpacked.labelCipherFile;
          labelWrappedKeyFile = unpacked.labelWrappedKeyFile;
          labelMetaFile = unpacked.labelMetaFile;
        }
      }

      if (
        !nativeEpochBundle && (
          !smashedCipherFile ||
          !smashedWrappedKeyFile ||
          !smashedMetaFile ||
          !labelCipherFile ||
          !labelWrappedKeyFile ||
          !labelMetaFile
        )
      ) {
        return res.status(400).json({
          success: false,
          message: '缺少 FL batch 所需的 smashed/label 加密包文件'
        });
      }

      try {
        const { transaction, digitalContract } = await requireFlContext(transactionId);
        const existing = await getFlRecordByTransactionId(transactionId);

        if (!existing?.pcp_contract_id) {
          return res.status(400).json({
            success: false,
            message: '当前交易尚未创建 FL 合同'
          });
        }

        const client = createPcpClient({ baseUrl: getPcpFlBaseUrl() });
        let currentAttemptId = mapFlRecordRow(existing)?.seller_result_packages?.__attempt_id || null;
        let currentEpoch = Number(existing.current_epoch || 0);

        if (!currentAttemptId) {
          const attemptResp = await client.post(
            `/fl/${encodeURIComponent(existing.pcp_contract_id)}/attempts`,
            {
              idempotency_key: `${existing.pcp_contract_id}-attempt-${Date.now()}`
            }
          );
          currentAttemptId = firstDefined(
            attemptResp?.data?.data?.attempt_id,
            attemptResp?.data?.attempt_id
          );
          currentEpoch = firstDefined(
            attemptResp?.data?.data?.current_epoch_id,
            attemptResp?.data?.data?.current_epoch,
            1
          );
        } else if (!currentEpoch) {
          currentEpoch = 1;
        }

        let zipBundle;
        let metadataPayload;

        if (nativeEpochBundle) {
          metadataPayload = {
            ...(nativeEpochBundle.bundleMetadata || {}),
            schema_version: 'fl-epoch-input-v1',
            contract_id: existing.pcp_contract_id,
            attempt_id: currentAttemptId,
            epoch_id: Number(currentEpoch),
            seller_id: sellerId,
            batch_count: Number(nativeEpochBundle.bundleMetadata?.batch_count || 1),
            tensor_format: String(nativeEpochBundle.bundleMetadata?.tensor_format || 'safetensors'),
            label_format: String(nativeEpochBundle.bundleMetadata?.label_format || 'safetensors'),
            smashed_digest: sha256WithPrefix(nativeEpochBundle.smashedBuffer),
            label_digest: sha256WithPrefix(nativeEpochBundle.labelsBuffer)
          };
          zipBundle = await createZipFromBuffers({
            'metadata.json': Buffer.from(JSON.stringify(metadataPayload, null, 2), 'utf8'),
            'smashed.safetensors': nativeEpochBundle.smashedBuffer,
            'labels.safetensors': nativeEpochBundle.labelsBuffer
          });
        } else {
          const error = new Error(
            '当前仅支持 PCC 原生 FL epoch bundle：metadata.json + smashed.safetensors + labels.safetensors'
          );
          error.statusCode = 400;
          throw error;
        }

        const bundleDigest = `sha256:${require('crypto').createHash('sha256').update(zipBundle).digest('hex')}`;
        const form = new FormData();
        form.append('metadata', JSON.stringify({
          idempotency_key: `${existing.pcp_contract_id}-${currentAttemptId}-epoch-${currentEpoch}-${sellerId}`,
          seller_id: sellerId,
          bundle_digest: bundleDigest,
          batch_count: Number(metadataPayload.batch_count || 1),
          tensor_format: String(metadataPayload.tensor_format || 'safetensors'),
          label_format: String(metadataPayload.label_format || 'safetensors')
        }));
        form.append('epoch_input_bundle', zipBundle, {
          filename: `epoch-input-${currentEpoch}.zip`,
          contentType: 'application/zip'
        });

        const batchResp = await client.post(
          `/fl/${encodeURIComponent(existing.pcp_contract_id)}/attempts/${encodeURIComponent(currentAttemptId)}/epochs/${encodeURIComponent(currentEpoch)}/seller-input`,
          form,
          { headers: form.getHeaders() }
        );

        const batchData = batchResp?.data?.data || {};
        const sellerResultPackages = {
          ...(mapFlRecordRow(existing)?.seller_result_packages || {}),
          __attempt_id: currentAttemptId
        };
        const saved = await upsertFlRecord(
          mergeFlRecordInput(existing, {
            transactionId,
            businessContractId: digitalContract.contract_id,
            pcpContractId: existing.pcp_contract_id,
            buyerId: transaction.buyer_address,
            pcpStatus: firstDefined(batchData.status, 'WAITING_EPOCH_INPUT'),
            currentEpoch: firstDefined(batchData.current_epoch_id, currentEpoch, 1),
            sellerResultPackages,
            lastError: null
          })
        );

        return res.status(202).json({
          success: true,
          message: 'FL batch 已提交',
          item: toFlResponseRecord(saved, {
            transaction_id: transactionId,
            business_contract_id: digitalContract.contract_id,
            buyer_id: transaction.buyer_address
          }),
          pcp: {
            batch: batchResp?.data || null
          }
        });
      } catch (error) {
        const routeError = formatFlRouteError(error);
        return res.status(error.statusCode || routeError.status).json({
          success: false,
          ...routeError.body,
          message: error.statusCode ? error.message : routeError.body.message
        });
      }
    }
  );

  app.get('/api/privacy/fl/status', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    const entityId = String(
      firstDefined(req.query.entityId, req.query.buyerId, req.query.sellerId, '')
    ).trim();

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    try {
      const { transaction, digitalContract } = await requireFlContext(transactionId);
      let record = await getFlRecordByTransactionId(transactionId);
      let syncError = null;

      if (record?.pcp_contract_id) {
        try {
          const client = createPcpClient({
            baseUrl: getPcpFlBaseUrl()
          });
          const contractResp = await client.get(
            `/contracts/${encodeURIComponent(record.pcp_contract_id)}`
          );
          const contractData = extractContractStatus(contractResp?.data);

          record = await upsertFlRecord(
            mergeFlRecordInput(record, {
              transactionId,
              businessContractId: digitalContract.contract_id,
              buyerId: transaction.buyer_address,
              pcpContractId: firstDefined(contractData.contractId, record.pcp_contract_id),
              pcpStatus: firstDefined(contractData.status, record.pcp_status),
              currentEpoch: firstDefined(record.current_epoch, 0),
              lastError: record.last_error
            })
          );
        } catch (error) {
          if ([403, 404, 409].includes(error?.response?.status)) {
            throw error;
          }
          syncError = error.message;
        }
      }

      if (record?.pcp_contract_id) {
        try {
          record = await syncCurrentFlAttempt(record);
        } catch (error) {
          syncError = syncError || error.message;
        }
      }

      if (record?.pcp_contract_id && entityId) {
        record = await tryResendFlSellerBottomModelToken(record, entityId);
      }

      return res.status(200).json({
        success: true,
        item: toFlResponseRecord(record, {
          transaction_id: transactionId,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address
        }),
        syncError
      });
    } catch (error) {
      const routeError = formatFlRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });

  app.post('/api/privacy/fl/result', upload.none(), async (req, res) => {
    let syncPayload;
    try {
      syncPayload = normalizeFlResultSyncPayload({
        transactionId: firstDefined(req.body.transactionId, req.body.transaction_id),
        pcpContractId: firstDefined(req.body.pcpContractId, req.body.pcp_contract_id),
        contractId: firstDefined(req.body.contractId, req.body.contract_id),
        pcpStatus: firstDefined(req.body.pcpStatus, req.body.pcp_status),
        status: req.body.status,
        currentEpoch: firstDefined(req.body.currentEpoch, req.body.current_epoch),
        receiverId: firstDefined(req.body.receiverId, req.body.receiver_id),
        resultRole: firstDefined(req.body.resultRole, req.body.result_role),
        batchIndex: firstDefined(req.body.batchIndex, req.body.batch_index),
        downloadToken: firstDefined(req.body.downloadToken, req.body.download_token),
        resultFilename: firstDefined(req.body.resultFilename, req.body.result_filename),
        resultStoragePath: firstDefined(req.body.resultStoragePath, req.body.result_storage_path),
        resultUri: firstDefined(req.body.resultUri, req.body.result_uri),
        lastError: firstDefined(req.body.lastError, req.body.last_error)
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    try {
      let record = syncPayload.transactionId
        ? await getFlRecordByTransactionId(syncPayload.transactionId)
        : null;

      if (!record && syncPayload.pcpContractId) {
        record = await getFlRecordByPcpContractId(syncPayload.pcpContractId);
      }

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '未找到对应的 FL 记录'
        });
      }

      const { transaction, digitalContract } = await requireFlContext(record.transaction_id);
      const resultUpdates = syncPayload.resultRole
        ? updateFlResultPackages(record, syncPayload)
        : {};

      const saved = await upsertFlRecord(
        mergeFlRecordInput(record, {
          transactionId: record.transaction_id,
          businessContractId: digitalContract.contract_id,
          pcpContractId: firstDefined(syncPayload.pcpContractId, record.pcp_contract_id),
          buyerId: transaction.buyer_address,
          pcpStatus: firstDefined(syncPayload.pcpStatus, record.pcp_status),
          currentEpoch: firstDefined(syncPayload.currentEpoch, record.current_epoch, 0),
          lastError: syncPayload.lastError || null,
          ...resultUpdates
        })
      );

      return res.status(200).json({
        success: true,
        message: 'FL 结果元数据已同步',
        item: toFlResponseRecord(saved, {
          transaction_id: record.transaction_id,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address
        })
      });
    } catch (error) {
      const routeError = formatFlRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });

  app.post('/api/privacy/fl/result-notify', async (req, res) => {
    const payload = extractFlNotificationPayload(req.body, firstDefined);

    if (!payload.resultRole || !PCP_FL_RESULT_ROLES.includes(payload.resultRole)) {
      return res.status(200).json({
        success: true,
        message: '忽略非 FL 结果通知'
      });
    }

    if (!payload.pcpContractId && !payload.transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 contract_id / transaction_id'
      });
    }

    try {
      let record = payload.transactionId
        ? await getFlRecordByTransactionId(payload.transactionId)
        : null;

      if (!record && payload.pcpContractId) {
        record = await getFlRecordByPcpContractId(payload.pcpContractId);
      }

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '未找到对应的 FL 记录'
        });
      }

      const { transaction, digitalContract } = await requireFlContext(record.transaction_id);
      const resultUpdates = updateFlResultPackages(record, payload);
      const saved = await upsertFlRecord(
        mergeFlRecordInput(record, {
          transactionId: record.transaction_id,
          businessContractId: digitalContract.contract_id,
          pcpContractId: firstDefined(payload.pcpContractId, record.pcp_contract_id),
          buyerId: transaction.buyer_address,
          pcpStatus: firstDefined(payload.pcpStatus, record.pcp_status, 'COMPLETED'),
          currentEpoch: firstDefined(payload.currentEpoch, record.current_epoch, 0),
          lastError: payload.lastError || null,
          ...resultUpdates
        })
      );

      return res.status(200).json({
        success: true,
        message: 'FL 结果通知已接收',
        item: toFlResponseRecord(saved, {
          transaction_id: record.transaction_id,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address
        })
      });
    } catch (error) {
      const routeError = formatFlRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });

  app.get('/api/privacy/fl/result', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    const receiverRole = String(req.query.receiverRole || 'buyer').trim().toLowerCase();
    const sellerId = String(req.query.sellerId || '').trim();
    const resultRole = String(
      firstDefined(req.query.resultRole, receiverRole === 'buyer' ? 'fl_top_model' : 'fl_gradient')
    ).trim();
    const batchIndex = req.query.batchIndex == null
      ? null
      : Number.parseInt(String(req.query.batchIndex), 10);

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    try {
      const { transaction, digitalContract } = await requireFlContext(transactionId);
      let record = await getFlRecordByTransactionId(transactionId);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '当前交易暂无 FL 记录'
        });
      }

      if (receiverRole === 'seller' && sellerId && resultRole === 'fl_bottom_model') {
        record = await tryResendFlSellerBottomModelToken(record, sellerId);
      }

      const receiverData = pickFlReceiverToken(record, {
        receiverRole,
        sellerId,
        resultRole,
        batchIndex
      });

      if (!receiverData.downloadToken) {
        return res.status(404).json({
          success: false,
          message: '当前查询条件下尚未收到 FL 结果下载令牌'
        });
      }

      const client = createPcpClient({
        baseUrl: getPcpFlBaseUrl(),
        entityId: receiverData.receiverId
      });
      const downloadResp = await client.get(
        `/download/${encodeURIComponent(receiverData.downloadToken)}`,
        { responseType: 'arraybuffer' }
      );
      const headerFilenameMatch = String(
        downloadResp.headers?.['content-disposition'] || ''
      ).match(/filename="?([^"]+)"?/i);
      const fileName = firstDefined(
        receiverData.filename,
        headerFilenameMatch && headerFilenameMatch[1],
        `${resultRole}_${transactionId}.tar`
      );
      const extension = path.extname(fileName).replace('.', '').toLowerCase() || 'tar';

      res.setHeader('Content-Type', pickContentType(extension, extension));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeBaseName(fileName)}${path.extname(fileName) || '.tar'}"`
      );
      res.setHeader('x-fl-transaction-id', transactionId);
      res.setHeader('x-fl-business-contract-id', digitalContract.contract_id || '');
      res.setHeader('x-fl-receiver-id', receiverData.receiverId || '');
      res.setHeader('x-fl-buyer-id', transaction.buyer_address || '');
      res.setHeader('x-fl-result-role', resultRole);

      return res.status(200).send(Buffer.from(downloadResp.data));
    } catch (error) {
      const routeError = formatFlRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });
}

module.exports = {
  registerFlRoutes
};
