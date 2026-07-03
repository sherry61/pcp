const {
  createMpcClient,
  createRemoteTask,
  uploadRemoteTaskSellerData,
  startRemoteTask,
  getRemoteTaskStatus,
  getRemoteTaskResult
} = require('./client');
const {
  MPC_ALLOWED_PC_TYPES,
  MPC_TASK_TYPE_GC
} = require('./constants');
const {
  isTerminalMpcStatus,
  mapMpcRecordRow,
  normalizeMpcStatus,
  parseJsonFileBuffer,
  validateGcComputeParams
} = require('./gc');

function isMissingMpcTableError(error) {
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

function formatMpcRouteError(error) {
  if (isMissingMpcTableError(error)) {
    return {
      status: 500,
      body: {
        message: 'mpc_delivery_contracts 表不存在，请先执行 MPC 数据库初始化脚本',
        code: 'MPC_TABLE_MISSING'
      }
    };
  }

  if (error?.statusCode) {
    return {
      status: error.statusCode,
      body: {
        message: error.message,
        code: `MPC_${error.statusCode}`
      }
    };
  }

  const status = error?.response?.status;
  if (status) {
    return {
      status,
      body: {
        message: stringifyUpstreamErrorPayload(error?.response?.data) || `MPC 请求失败（${status}）`,
        code: `MPC_${status}`
      }
    };
  }

  return {
    status: 500,
    body: {
      message: 'MPC 路由处理失败',
      error: error.message
    }
  };
}

function normalizePcType(value) {
  return String(value || '').trim().toUpperCase();
}

function assertMpcPcType(digitalContract) {
  const actualPcType = normalizePcType(digitalContract?.pc_type);

  if (!actualPcType) {
    const error = new Error('数字合约未配置隐私计算方式');
    error.statusCode = 400;
    throw error;
  }

  if (!MPC_ALLOWED_PC_TYPES.includes(actualPcType)) {
    const error = new Error('当前交易配置的隐私计算方式不是 MPC');
    error.statusCode = 400;
    throw error;
  }
}

const DEFAULT_GC_COMPUTE_PARAMS = Object.freeze({
  threshold: 100000,
  risk_factor: 50
});

function registerMpcRoutes({ app, upload, dbQuery }) {
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

  async function getMpcRecordByTransactionId(transactionId) {
    const rows = await dbQuery(
      'SELECT * FROM mpc_delivery_contracts WHERE transaction_id = ? LIMIT 1',
      [transactionId]
    );

    return rows[0] || null;
  }

  async function requireMpcContext(transactionId) {
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

    assertMpcPcType(digitalContract);
    return { transaction, digitalContract };
  }

  async function upsertMpcRecord(transactionId, payload) {
    const {
      businessContractId,
      remoteTaskId,
      taskType,
      buyerId,
      sellerId,
      computeParams,
      sellerInput,
      sellerFilename,
      taskStatus,
      remoteStatus,
      result,
      lastError
    } = payload;

    await dbQuery(
      `
        INSERT INTO mpc_delivery_contracts (
          transaction_id,
          business_contract_id,
          remote_task_id,
          mpc_task_type,
          buyer_id,
          seller_id,
          compute_params_json,
          seller_input_json,
          seller_filename,
          task_status,
          remote_status,
          result_json,
          last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          business_contract_id = VALUES(business_contract_id),
          remote_task_id = VALUES(remote_task_id),
          mpc_task_type = VALUES(mpc_task_type),
          buyer_id = VALUES(buyer_id),
          seller_id = VALUES(seller_id),
          compute_params_json = VALUES(compute_params_json),
          seller_input_json = COALESCE(VALUES(seller_input_json), seller_input_json),
          seller_filename = COALESCE(VALUES(seller_filename), seller_filename),
          task_status = VALUES(task_status),
          remote_status = VALUES(remote_status),
          result_json = COALESCE(VALUES(result_json), result_json),
          last_error = VALUES(last_error)
      `,
      [
        String(transactionId),
        String(businessContractId),
        remoteTaskId || null,
        taskType || MPC_TASK_TYPE_GC,
        String(buyerId),
        String(sellerId),
        JSON.stringify(computeParams || {}),
        sellerInput ? JSON.stringify(sellerInput) : null,
        sellerFilename || null,
        normalizeMpcStatus(taskStatus),
        normalizeMpcStatus(remoteStatus || taskStatus),
        result ? JSON.stringify(result) : null,
        lastError || null
      ]
    );

    return mapMpcRecordRow(await getMpcRecordByTransactionId(transactionId));
  }

  function toMpcResponseRecord(record) {
    const mapped =
      record && record.remote_task_id && record.task_status && record.compute_params !== undefined
        ? record
        : mapMpcRecordRow(record);
    if (!mapped) {
      return null;
    }

    return {
      transaction_id: mapped.transaction_id,
      business_contract_id: mapped.business_contract_id,
      remote_task_id: mapped.remote_task_id,
      task_type: 'MPC',
      actual_task_type: mapped.mpc_task_type.toUpperCase(),
      buyer_id: mapped.buyer_id,
      seller_id: mapped.seller_id,
      compute_params: mapped.compute_params,
      seller_filename: mapped.seller_filename,
      task_status: mapped.task_status,
      remote_status: mapped.remote_status,
      result: mapped.result,
      last_error: mapped.last_error,
      created_at: mapped.created_at,
      updated_at: mapped.updated_at
    };
  }

  async function syncRemoteTask(record) {
    const mapped =
      record && record.remote_task_id && record.task_status && record.compute_params !== undefined
        ? record
        : mapMpcRecordRow(record);
    if (!mapped || !mapped.remote_task_id) {
      return mapped;
    }

    if (isTerminalMpcStatus(mapped.task_status) && mapped.task_status !== 'failed') {
      if (mapped.task_status === 'done' && !mapped.result) {
        const client = createMpcClient();
        const resultBody = await getRemoteTaskResult(client, mapped.remote_task_id);
        const nextResult = resultBody?.data || null;

        return upsertMpcRecord(mapped.transaction_id, {
          businessContractId: mapped.business_contract_id,
          remoteTaskId: mapped.remote_task_id,
          taskType: mapped.mpc_task_type,
          buyerId: mapped.buyer_id,
          sellerId: mapped.seller_id,
          computeParams: mapped.compute_params,
          sellerInput: mapped.seller_input,
          sellerFilename: mapped.seller_filename,
          taskStatus: mapped.task_status,
          remoteStatus: mapped.remote_status,
          result: nextResult,
          lastError: mapped.last_error
        });
      }

      return mapped;
    }

    const client = createMpcClient();
    const statusBody = await getRemoteTaskStatus(client, mapped.remote_task_id);
    const statusData = statusBody?.data || {};
    const remoteStatus = normalizeMpcStatus(statusData.status);

    let nextResult = mapped.result;
    let lastError = mapped.last_error;
    let taskStatus = remoteStatus;

    if (remoteStatus === 'done') {
      const resultBody = await getRemoteTaskResult(client, mapped.remote_task_id);
      nextResult = resultBody?.data || null;
      taskStatus = 'done';
      lastError = null;
    }

    const synced = await upsertMpcRecord(mapped.transaction_id, {
      businessContractId: mapped.business_contract_id,
      remoteTaskId: mapped.remote_task_id,
      taskType: mapped.mpc_task_type,
      buyerId: mapped.buyer_id,
      sellerId: mapped.seller_id,
      computeParams: mapped.compute_params,
      sellerInput: mapped.seller_input,
      sellerFilename: mapped.seller_filename,
      taskStatus,
      remoteStatus,
      result: nextResult,
      lastError
    });

    return synced;
  }

  app.post('/api/privacy/mpc/create-task', upload.none(), async (req, res) => {
    try {
      const transactionId = req.body.transaction_id;
      if (!transactionId) {
        return res.status(400).json({ success: false, message: 'transaction_id 不能为空' });
      }

      const computeParams = validateGcComputeParams({
        threshold: req.body.threshold ?? DEFAULT_GC_COMPUTE_PARAMS.threshold,
        risk_factor: req.body.risk_factor ?? DEFAULT_GC_COMPUTE_PARAMS.risk_factor
      });
      const { transaction, digitalContract } = await requireMpcContext(transactionId);
      const existing = mapMpcRecordRow(await getMpcRecordByTransactionId(transactionId));

      if (existing?.remote_task_id && !isTerminalMpcStatus(existing.task_status)) {
        return res.status(200).json({
          success: true,
          message: 'MPC 任务已存在',
          data: toMpcResponseRecord(existing)
        });
      }

      const client = createMpcClient();
      const taskName =
        String(req.body.task_name || '').trim() || `MPC-GC-${transactionId}`;
      const remoteBody = await createRemoteTask(client, {
        task_name: taskName,
        task_type: MPC_TASK_TYPE_GC,
        buyer_id: transaction.buyer_address,
        compute_params: computeParams,
        has_buyer_data: false
      });
      const remoteData = remoteBody?.data || {};

      const record = await upsertMpcRecord(transactionId, {
        businessContractId: digitalContract.contract_id,
        remoteTaskId: remoteData.task_id,
        taskType: MPC_TASK_TYPE_GC,
        buyerId: transaction.buyer_address,
        sellerId: transaction.seller_address,
        computeParams,
        taskStatus: normalizeMpcStatus(remoteData.status),
        remoteStatus: normalizeMpcStatus(remoteData.status),
        lastError: null
      });

      return res.status(200).json({
        success: true,
        message: 'MPC 任务创建成功',
        data: toMpcResponseRecord(record)
      });
    } catch (error) {
      const formatted = formatMpcRouteError(error);
      return res.status(formatted.status).json({
        success: false,
        ...formatted.body
      });
    }
  });

  app.post(
    '/api/privacy/mpc/upload-seller-data',
    upload.single('file'),
    async (req, res) => {
      let transactionId = null;
      let record = null;
      try {
        transactionId = req.body.transaction_id;
        if (!transactionId) {
          return res.status(400).json({ success: false, message: 'transaction_id 不能为空' });
        }

        record = mapMpcRecordRow(await getMpcRecordByTransactionId(transactionId));
        if (!record?.remote_task_id) {
          return res.status(404).json({ success: false, message: '请先创建 MPC 任务' });
        }

        const sellerInput = parseJsonFileBuffer(req.file);
        const client = createMpcClient();

        await uploadRemoteTaskSellerData(client, record.remote_task_id, {
          sellerId: record.seller_id,
          file: req.file
        });

        let statusBody = await getRemoteTaskStatus(client, record.remote_task_id);
        let statusData = statusBody?.data || {};
        let nextStatus = normalizeMpcStatus(statusData.status);

        if (nextStatus === 'ready') {
          await startRemoteTask(client, record.remote_task_id, {
            buyer_id: record.buyer_id
          });
          statusBody = await getRemoteTaskStatus(client, record.remote_task_id);
          statusData = statusBody?.data || {};
          nextStatus = normalizeMpcStatus(statusData.status);
        }

        const updated = await upsertMpcRecord(transactionId, {
          businessContractId: record.business_contract_id,
          remoteTaskId: record.remote_task_id,
          taskType: record.mpc_task_type,
          buyerId: record.buyer_id,
          sellerId: record.seller_id,
          computeParams: record.compute_params,
          sellerInput,
          sellerFilename: req.file?.originalname || null,
          taskStatus: nextStatus,
          remoteStatus: nextStatus,
          result: record.result,
          lastError: null
        });

        return res.status(200).json({
          success: true,
          message: nextStatus === 'computing' ? '卖方数据上传成功，MPC 计算已自动启动' : '卖方数据上传成功',
          data: toMpcResponseRecord(updated)
        });
      } catch (error) {
        const formatted = formatMpcRouteError(error);

        if (transactionId && record) {
          try {
            await upsertMpcRecord(transactionId, {
              businessContractId: record.business_contract_id,
              remoteTaskId: record.remote_task_id,
              taskType: record.mpc_task_type,
              buyerId: record.buyer_id,
              sellerId: record.seller_id,
              computeParams: record.compute_params,
              sellerInput: record.seller_input,
              sellerFilename: record.seller_filename,
              taskStatus: 'failed',
              remoteStatus: 'failed',
              result: record.result,
              lastError: formatted.body?.message || error.message
            });
          } catch (persistError) {
            // Ignore persistence failures here; the upstream error is the primary signal.
          }
        }

        return res.status(formatted.status).json({
          success: false,
          ...formatted.body
        });
      }
    }
  );

  app.post('/api/privacy/mpc/start', upload.none(), async (req, res) => {
    let transactionId = null;
    let record = null;
    try {
      transactionId = req.body.transaction_id;
      if (!transactionId) {
        return res.status(400).json({ success: false, message: 'transaction_id 不能为空' });
      }

      record = mapMpcRecordRow(await getMpcRecordByTransactionId(transactionId));
      if (!record?.remote_task_id) {
        return res.status(404).json({ success: false, message: '请先创建 MPC 任务' });
      }

      const client = createMpcClient();
      await startRemoteTask(client, record.remote_task_id, {
        buyer_id: record.buyer_id
      });

      const synced = await syncRemoteTask(record);
      return res.status(200).json({
        success: true,
        message: 'MPC 任务已启动',
        data: toMpcResponseRecord(synced)
      });
    } catch (error) {
      const formatted = formatMpcRouteError(error);

      if (transactionId && record) {
        try {
          await upsertMpcRecord(transactionId, {
            businessContractId: record.business_contract_id,
            remoteTaskId: record.remote_task_id,
            taskType: record.mpc_task_type,
            buyerId: record.buyer_id,
            sellerId: record.seller_id,
            computeParams: record.compute_params,
            sellerInput: record.seller_input,
            sellerFilename: record.seller_filename,
            taskStatus: 'failed',
            remoteStatus: 'failed',
            result: record.result,
            lastError: formatted.body?.message || error.message
          });
        } catch (persistError) {
          // Ignore persistence failures here; the upstream error is the primary signal.
        }
      }

      return res.status(formatted.status).json({
        success: false,
        ...formatted.body
      });
    }
  });

  app.get('/api/privacy/mpc/status', async (req, res) => {
    try {
      const transactionId = req.query.transaction_id;
      if (!transactionId) {
        return res.status(400).json({ success: false, message: 'transaction_id 不能为空' });
      }

      const record = await getMpcRecordByTransactionId(transactionId);
      if (!record) {
        return res.status(404).json({ success: false, message: 'MPC 任务不存在' });
      }

      const synced = await syncRemoteTask(record);
      return res.status(200).json({
        success: true,
        data: toMpcResponseRecord(synced)
      });
    } catch (error) {
      const formatted = formatMpcRouteError(error);
      return res.status(formatted.status).json({
        success: false,
        ...formatted.body
      });
    }
  });

  app.get('/api/privacy/mpc/result', async (req, res) => {
    try {
      const transactionId = req.query.transaction_id;
      if (!transactionId) {
        return res.status(400).json({ success: false, message: 'transaction_id 不能为空' });
      }

      const record = await getMpcRecordByTransactionId(transactionId);
      if (!record) {
        return res.status(404).json({ success: false, message: 'MPC 任务不存在' });
      }

      const synced = await syncRemoteTask(record);
      const mapped =
        synced && synced.remote_task_id && synced.task_status && synced.compute_params !== undefined
          ? synced
          : mapMpcRecordRow(synced);
      if (mapped.task_status !== 'done') {
        return res.status(400).json({
          success: false,
          message: `任务尚未完成，当前状态: ${mapped.task_status}`
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          transaction_id: mapped.transaction_id,
          task_type: 'MPC',
          actual_task_type: mapped.mpc_task_type.toUpperCase(),
          task_status: mapped.task_status,
          result: mapped.result
        }
      });
    } catch (error) {
      const formatted = formatMpcRouteError(error);
      return res.status(formatted.status).json({
        success: false,
        ...formatted.body
      });
    }
  });
}

module.exports = {
  registerMpcRoutes
};
