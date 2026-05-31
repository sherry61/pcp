const fs = require('fs').promises;
const path = require('path');

const { normalizeHeResultSyncPayload } = require('./he');
const { normalizePreResultSyncPayload } = require('./pre');

function getHeResultStorageDir() {
  return process.env.HE_RESULT_STORAGE_DIR || path.join(__dirname, '..', 'storage', 'he-results');
}

async function persistHeResultFile({
  transactionId,
  file,
  preferredFilename,
  safeBaseName
}) {
  const storageDir = getHeResultStorageDir();
  await fs.mkdir(storageDir, { recursive: true });

  const sourceName = String(
    preferredFilename ||
    file?.originalname ||
    `he_result_${transactionId}.csv`
  );
  const extension = path.extname(sourceName) || '.csv';
  const safeName = `${safeBaseName(sourceName)}${extension}`;
  const storedName = `${safeBaseName(transactionId)}_${Date.now()}_${safeName}`;
  const storagePath = path.join(storageDir, storedName);

  await fs.writeFile(storagePath, file.buffer);

  return {
    resultFilename: safeName,
    resultStoragePath: storagePath
  };
}

async function resolveExistingHeResultPath(candidatePath) {
  const normalizedPath = String(candidatePath || '').trim();
  if (!normalizedPath) {
    return null;
  }

  const resolvedPath = path.resolve(normalizedPath);
  try {
    await fs.access(resolvedPath);
    return resolvedPath;
  } catch (error) {
    return null;
  }
}

function createHeResultSyncHandler(deps) {
  const {
    firstDefined,
    safeBaseName,
    getHeRecordByTransactionId,
    getHeRecordByPcpContractId,
    requireHeContext,
    upsertHeRecord,
    mergeHeRecordInput,
    toHeResponseRecord,
    formatHeRouteError
  } = deps;

  return async function heResultSyncHandler(req, res) {
    const uploadedFile = req.files?.resultFile?.[0] || req.files?.file?.[0] || null;

    let syncPayload;
    try {
      syncPayload = normalizeHeResultSyncPayload({
        transactionId: firstDefined(req.body.transactionId, req.body.transaction_id),
        pcpContractId: firstDefined(req.body.pcpContractId, req.body.pcp_contract_id),
        contractId: firstDefined(req.body.contractId, req.body.contract_id),
        pcpStatus: firstDefined(req.body.pcpStatus, req.body.pcp_status),
        status: req.body.status,
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
        ? await getHeRecordByTransactionId(syncPayload.transactionId)
        : null;

      if (!record && syncPayload.pcpContractId) {
        record = await getHeRecordByPcpContractId(syncPayload.pcpContractId);
      }

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '未找到对应的 HE 记录'
        });
      }

      const { transaction, digitalContract } = await requireHeContext(record.transaction_id);
      const existingStoragePath = await resolveExistingHeResultPath(syncPayload.resultStoragePath);

      let persistedResult = null;
      if (uploadedFile) {
        persistedResult = await persistHeResultFile({
          transactionId: record.transaction_id,
          file: uploadedFile,
          preferredFilename: syncPayload.resultFilename,
          safeBaseName
        });
      }

      const overrides = {
        transactionId: record.transaction_id,
        businessContractId: digitalContract.contract_id,
        pcpContractId: firstDefined(syncPayload.pcpContractId, record.pcp_contract_id),
        buyerId: transaction.buyer_address,
        sellerId: transaction.seller_address
      };

      if (syncPayload.pcpStatus) {
        overrides.pcpStatus = syncPayload.pcpStatus;
      } else if (uploadedFile || existingStoragePath) {
        overrides.pcpStatus = 'COMPLETED';
      }

      if (syncPayload.downloadToken) {
        overrides.downloadToken = syncPayload.downloadToken;
      }

      if (syncPayload.lastError) {
        overrides.lastError = syncPayload.lastError;
      } else if (uploadedFile || existingStoragePath) {
        overrides.lastError = null;
      }

      if (persistedResult?.resultFilename || syncPayload.resultFilename) {
        overrides.resultFilename = persistedResult?.resultFilename || syncPayload.resultFilename;
      }

      if (persistedResult?.resultStoragePath || existingStoragePath) {
        overrides.resultStoragePath = persistedResult?.resultStoragePath || existingStoragePath;
      }

      if (
        !Object.prototype.hasOwnProperty.call(overrides, 'pcpStatus') &&
        !Object.prototype.hasOwnProperty.call(overrides, 'downloadToken') &&
        !Object.prototype.hasOwnProperty.call(overrides, 'lastError') &&
        !Object.prototype.hasOwnProperty.call(overrides, 'resultFilename') &&
        !Object.prototype.hasOwnProperty.call(overrides, 'resultStoragePath')
      ) {
        return res.status(400).json({
          success: false,
          message: '缺少可同步的 HE 结果内容或元数据'
        });
      }

      const saved = await upsertHeRecord(mergeHeRecordInput(record, overrides));

      return res.status(200).json({
        success: true,
        message: 'HE 结果已持久化',
        item: toHeResponseRecord(saved, {
          transaction_id: record.transaction_id,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address,
          seller_id: transaction.seller_address
        })
      });
    } catch (error) {
      const routeError = formatHeRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  };
}

function extractHeResultNotificationPayload(body, firstDefined) {
  const payload = body?.data || body || {};
  const result = payload?.result || {};

  return {
    transactionId: firstDefined(payload.transaction_id, body?.transaction_id),
    pcpContractId: firstDefined(
      payload.contract_id,
      body?.contract_id,
      body?.pcp_contract_id
    ),
    pcpStatus: firstDefined(payload.status, body?.status),
    downloadToken: firstDefined(result.download_token, body?.download_token),
    resultFilename: firstDefined(result.filename, body?.result_filename),
    resultStoragePath: firstDefined(result.result_uri, body?.result_uri, body?.result_storage_path),
    lastError: firstDefined(payload.last_error, body?.last_error),
    resultRole: firstDefined(payload.result_role, body?.result_role),
    receiverId: firstDefined(payload.receiver_id, body?.receiver_id)
  };
}

function createHeResultNotificationHandler(deps) {
  const {
    firstDefined,
    getHeRecordByTransactionId,
    getHeRecordByPcpContractId,
    requireHeContext,
    upsertHeRecord,
    mergeHeRecordInput,
    toHeResponseRecord,
    formatHeRouteError
  } = deps;

  return async function heResultNotificationHandler(req, res) {
    const payload = extractHeResultNotificationPayload(req.body, firstDefined);

    if (payload.resultRole && payload.resultRole !== 'he_result') {
      return res.status(200).json({
        success: true,
        message: '忽略非 HE 结果通知'
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
        ? await getHeRecordByTransactionId(payload.transactionId)
        : null;

      if (!record && payload.pcpContractId) {
        record = await getHeRecordByPcpContractId(payload.pcpContractId);
      }

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '未找到对应的 HE 记录'
        });
      }

      const { transaction, digitalContract } = await requireHeContext(record.transaction_id);
      const saved = await upsertHeRecord(
        mergeHeRecordInput(record, {
          transactionId: record.transaction_id,
          businessContractId: digitalContract.contract_id,
          pcpContractId: firstDefined(payload.pcpContractId, record.pcp_contract_id),
          buyerId: transaction.buyer_address,
          sellerId: transaction.seller_address,
          pcpStatus: firstDefined(payload.pcpStatus, record.pcp_status, 'COMPLETED'),
          downloadToken: firstDefined(payload.downloadToken, record.download_token),
          resultFilename: firstDefined(payload.resultFilename, record.result_filename),
          resultStoragePath: firstDefined(payload.resultStoragePath, record.result_storage_path),
          lastError: payload.lastError || null
        })
      );

      return res.status(200).json({
        success: true,
        message: 'HE 结果通知已接收',
        item: toHeResponseRecord(saved, {
          transaction_id: record.transaction_id,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address,
          seller_id: transaction.seller_address
        })
      });
    } catch (error) {
      const routeError = formatHeRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  };
}

function extractPreResultNotificationPayload(body, firstDefined) {
  const payload = body?.data || body || {};
  const result = payload?.result || {};

  return {
    transactionId: firstDefined(payload.transaction_id, body?.transaction_id),
    pcpContractId: firstDefined(
      payload.contract_id,
      body?.contract_id,
      body?.pcp_contract_id
    ),
    pcpStatus: firstDefined(payload.status, body?.status),
    downloadToken: firstDefined(result.download_token, body?.download_token),
    resultFilename: firstDefined(result.filename, body?.result_filename),
    resultStoragePath: firstDefined(
      result.result_uri,
      body?.result_uri,
      body?.result_storage_path
    ),
    lastError: firstDefined(payload.last_error, body?.last_error),
    resultRole: firstDefined(payload.result_role, body?.result_role),
    receiverId: firstDefined(payload.receiver_id, body?.receiver_id)
  };
}

function detectResultNotificationRole(body, firstDefined = (...values) => values.find(
  (value) => value !== undefined && value !== null && value !== ''
)) {
  const payload = body?.data || body || {};
  const resultRole = firstDefined(payload.result_role, body?.result_role);

  if (!resultRole) {
    return null;
  }

  const normalizedRole = String(resultRole).trim().toLowerCase();
  if (normalizedRole === 'he_result' || normalizedRole === 'pre_result') {
    return normalizedRole;
  }

  return normalizedRole || null;
}

function createPreResultSyncHandler(deps) {
  const {
    firstDefined,
    getPreRecordByTransactionId,
    getPreRecordByPcpContractId,
    requirePreContext,
    upsertPreRecord,
    mergePreRecordInput,
    toPreResponseRecord,
    formatPreRouteError
  } = deps;

  return async function preResultSyncHandler(req, res) {
    let syncPayload;
    try {
      syncPayload = normalizePreResultSyncPayload({
        transactionId: firstDefined(req.body.transactionId, req.body.transaction_id),
        pcpContractId: firstDefined(req.body.pcpContractId, req.body.pcp_contract_id),
        contractId: firstDefined(req.body.contractId, req.body.contract_id),
        pcpStatus: firstDefined(req.body.pcpStatus, req.body.pcp_status),
        status: req.body.status,
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
        ? await getPreRecordByTransactionId(syncPayload.transactionId)
        : null;

      if (!record && syncPayload.pcpContractId) {
        record = await getPreRecordByPcpContractId(syncPayload.pcpContractId);
      }

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '未找到对应的 PRE 记录'
        });
      }

      const { transaction, digitalContract } = await requirePreContext(record.transaction_id);
      const saved = await upsertPreRecord(
        mergePreRecordInput(record, {
          transactionId: record.transaction_id,
          businessContractId: digitalContract.contract_id,
          pcpContractId: firstDefined(syncPayload.pcpContractId, record.pcp_contract_id),
          buyerId: transaction.buyer_address,
          sellerId: transaction.seller_address,
          pcpStatus: firstDefined(syncPayload.pcpStatus, record.pcp_status, 'COMPLETED'),
          downloadToken: firstDefined(syncPayload.downloadToken, record.download_token),
          resultFilename: firstDefined(syncPayload.resultFilename, record.result_filename),
          resultStoragePath: firstDefined(syncPayload.resultStoragePath, record.result_storage_path),
          lastError: syncPayload.lastError || null
        })
      );

      return res.status(200).json({
        success: true,
        message: 'PRE 结果元数据已同步',
        item: toPreResponseRecord(saved, {
          transaction_id: record.transaction_id,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address,
          seller_id: transaction.seller_address
        })
      });
    } catch (error) {
      const routeError = formatPreRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  };
}

function createPreResultNotificationHandler(deps) {
  const {
    firstDefined,
    getPreRecordByTransactionId,
    getPreRecordByPcpContractId,
    requirePreContext,
    upsertPreRecord,
    mergePreRecordInput,
    toPreResponseRecord,
    formatPreRouteError
  } = deps;

  return async function preResultNotificationHandler(req, res) {
    const payload = extractPreResultNotificationPayload(req.body, firstDefined);

    if (payload.resultRole && payload.resultRole !== 'pre_result') {
      return res.status(200).json({
        success: true,
        message: '忽略非 PRE 结果通知'
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
        ? await getPreRecordByTransactionId(payload.transactionId)
        : null;

      if (!record && payload.pcpContractId) {
        record = await getPreRecordByPcpContractId(payload.pcpContractId);
      }

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '未找到对应的 PRE 记录'
        });
      }

      const { transaction, digitalContract } = await requirePreContext(record.transaction_id);
      const saved = await upsertPreRecord(
        mergePreRecordInput(record, {
          transactionId: record.transaction_id,
          businessContractId: digitalContract.contract_id,
          pcpContractId: firstDefined(payload.pcpContractId, record.pcp_contract_id),
          buyerId: transaction.buyer_address,
          sellerId: transaction.seller_address,
          pcpStatus: firstDefined(payload.pcpStatus, record.pcp_status, 'COMPLETED'),
          downloadToken: firstDefined(payload.downloadToken, record.download_token),
          resultFilename: firstDefined(payload.resultFilename, record.result_filename),
          resultStoragePath: firstDefined(payload.resultStoragePath, record.result_storage_path),
          lastError: payload.lastError || null
        })
      );

      return res.status(200).json({
        success: true,
        message: 'PRE 结果通知已接收',
        item: toPreResponseRecord(saved, {
          transaction_id: record.transaction_id,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address,
          seller_id: transaction.seller_address
        })
      });
    } catch (error) {
      const routeError = formatPreRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  };
}

module.exports = {
  createHeResultSyncHandler,
  createHeResultNotificationHandler,
  createPreResultSyncHandler,
  createPreResultNotificationHandler,
  detectResultNotificationRole,
  extractPreResultNotificationPayload,
  persistHeResultFile
};
