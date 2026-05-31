const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

const {
  HE_ENC_TYPES,
  HE_OPERATIONS
} = require('./constants');
const { createPcpClient } = require('./client');
const {
  buildHeContractPayload,
  normalizeHeRecord,
  mapHeRecordRow,
  ensureCompatibleExistingHeContract,
  validateHeCsvFile,
  extractHeResultMetadata
} = require('./he');
const {
  buildPreContractPayload,
  normalizePreRecord,
  mapPreRecordRow,
  extractPreResultMetadata,
  validatePreHexString
} = require('./pre');
const {
  createHeResultSyncHandler,
  createHeResultNotificationHandler,
  createPreResultSyncHandler,
  createPreResultNotificationHandler,
  detectResultNotificationRole,
  persistHeResultFile
} = require('./result');

function isMissingPcpTableError(error) {
  return error && (error.code === 'ER_NO_SUCH_TABLE' || error.errno === 1146);
}

function isMissingHeTableError(error) {
  return isMissingPcpTableError(error);
}

function formatHeRouteError(error) {
  if (isMissingHeTableError(error)) {
    return {
      status: 500,
      body: {
        message: 'he_delivery_contracts 表不存在，请先执行 HE 数据库初始化脚本',
        code: 'HE_TABLE_MISSING'
      }
    };
  }

  const status = error?.response?.status;
  if ([400, 403, 404, 409, 422].includes(status)) {
    return {
      status,
      body: {
        message:
          error?.response?.data?.detail ||
          error?.response?.data?.message ||
          `PCP 请求失败（${status}）`,
        code: `PCP_${status}`
      }
    };
  }

  return {
    status: 500,
    body: {
      message: 'HE 路由处理失败',
      error: error.message
    }
  };
}

function formatPreRouteError(error) {
  if (isMissingPcpTableError(error)) {
    return {
      status: 500,
      body: {
        message: 'pre_delivery_contracts 表不存在，请先执行 PRE 数据库初始化脚本',
        code: 'PRE_TABLE_MISSING'
      }
    };
  }

  const status = error?.response?.status;
  if ([400, 403, 404, 409, 422].includes(status)) {
    return {
      status,
      body: {
        message:
          error?.response?.data?.detail ||
          error?.response?.data?.message ||
          `PCP 请求失败（${status}）`,
        code: `PCP_${status}`
      }
    };
  }

  return {
    status: 500,
    body: {
      message: 'PRE 路由处理失败',
      error: error.message
    }
  };
}

function getPcpHeBaseUrl() {
  return (
    process.env.PCP_HE_BASE_URL ||
    process.env.PCP_BASE_URL ||
    'http://127.0.0.1:8123'
  ).replace(/\/+$/, '');
}

function getPcpPreBaseUrl() {
  return (
    process.env.PCP_PRE_BASE_URL ||
    process.env.PCP_BASE_URL ||
    'http://127.0.0.1:8123'
  ).replace(/\/+$/, '');
}

function normalizePcType(value) {
  return String(value || '').trim().toUpperCase();
}

function assertPcTypeMatches(digitalContract, expectedPcType, label) {
  const actualPcType = normalizePcType(digitalContract?.pc_type);

  if (!actualPcType) {
    const error = new Error('数字合约未配置隐私计算方式');
    error.statusCode = 400;
    throw error;
  }

  if (actualPcType !== normalizePcType(expectedPcType)) {
    const error = new Error(`当前交易配置的隐私计算方式不是 ${label}`);
    error.statusCode = 400;
    throw error;
  }
}

function getHePublicKeyByEncType(record, encType) {
  const mapped = mapHeRecordRow(record);
  if (!mapped) {
    return null;
  }

  if (encType === 'Paillier') {
    return mapped.paillier_public_key || null;
  }

  if (encType === 'ElGamal') {
    return mapped.elgamal_public_key || null;
  }

  return null;
}

function isRemoteResultPath(candidatePath) {
  const value = String(candidatePath || '').trim();
  if (!value) {
    return false;
  }

  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

async function resolveLocalResultPath(candidatePath) {
  const value = String(candidatePath || '').trim();
  if (!value || isRemoteResultPath(value)) {
    return null;
  }

  const resolvedPath = path.resolve(value);
  try {
    await fs.access(resolvedPath);
    return resolvedPath;
  } catch (error) {
    return null;
  }
}

function registerHeRoutes({
  app,
  upload,
  dbQuery,
  firstDefined,
  parseJsonField,
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

  async function getHeRecordByTransactionId(transactionId) {
    const rows = await dbQuery(
      'SELECT * FROM he_delivery_contracts WHERE transaction_id = ? LIMIT 1',
      [transactionId]
    );

    return rows[0] || null;
  }

  async function getHeRecordByPcpContractId(pcpContractId) {
    const rows = await dbQuery(
      'SELECT * FROM he_delivery_contracts WHERE pcp_contract_id = ? LIMIT 1',
      [pcpContractId]
    );

    return rows[0] || null;
  }

  async function requireHeContext(transactionId) {
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

    assertPcTypeMatches(digitalContract, 'HE', 'HE');

    return { transaction, digitalContract };
  }

  function toHeResponseRecord(record, fallback = {}) {
    const mapped = mapHeRecordRow(record);
    const buyerId = fallback.buyer_id || fallback.buyerId || null;
    const sellerId = fallback.seller_id || fallback.sellerId || null;
    const businessContractId =
      fallback.business_contract_id || fallback.businessContractId || null;

    if (!mapped) {
      return {
        transaction_id: fallback.transaction_id || fallback.transactionId || null,
        business_contract_id: businessContractId,
        pcp_contract_id: null,
        buyer_id: buyerId,
        seller_id: sellerId,
        selected_enc_type: null,
        selected_operation: null,
        pcp_status: 'NOT_EXIST',
        has_record: false,
        has_paillier_public_key: false,
        has_elgamal_public_key: false,
        public_keys_ready: false,
        result_ready: false,
        download_token: null,
        result_filename: null,
        last_error: null
      };
    }

    return {
      transaction_id: mapped.transaction_id,
      business_contract_id: mapped.business_contract_id || businessContractId,
      pcp_contract_id: mapped.pcp_contract_id || null,
      buyer_id: mapped.buyer_id || buyerId,
      seller_id: mapped.seller_id || sellerId,
      selected_enc_type: mapped.selected_enc_type || null,
      selected_operation: mapped.selected_operation || null,
      paillier_public_key: mapped.paillier_public_key || null,
      elgamal_public_key: mapped.elgamal_public_key || null,
      pcp_status: mapped.pcp_status || 'WAITING_INPUT',
      has_record: true,
      has_paillier_public_key: Boolean(mapped.paillier_public_key),
      has_elgamal_public_key: Boolean(mapped.elgamal_public_key),
      public_keys_ready: Boolean(mapped.public_keys_ready),
      result_ready: Boolean(mapped.result_storage_path || mapped.download_token),
      download_token: mapped.download_token || null,
      result_filename: mapped.result_filename || null,
      last_error: mapped.last_error || null
    };
  }

  async function upsertHeRecord(recordInput) {
    const record = normalizeHeRecord(recordInput);
    const sql = `
      INSERT INTO he_delivery_contracts (
        transaction_id,
        business_contract_id,
        pcp_contract_id,
        buyer_id,
        seller_id,
        selected_enc_type,
        selected_operation,
        paillier_public_key_json,
        elgamal_public_key_json,
        pcp_status,
        download_token,
        result_filename,
        result_storage_path,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        business_contract_id = VALUES(business_contract_id),
        pcp_contract_id = VALUES(pcp_contract_id),
        buyer_id = VALUES(buyer_id),
        seller_id = VALUES(seller_id),
        selected_enc_type = VALUES(selected_enc_type),
        selected_operation = VALUES(selected_operation),
        paillier_public_key_json = VALUES(paillier_public_key_json),
        elgamal_public_key_json = VALUES(elgamal_public_key_json),
        pcp_status = VALUES(pcp_status),
        download_token = VALUES(download_token),
        result_filename = VALUES(result_filename),
        result_storage_path = VALUES(result_storage_path),
        last_error = VALUES(last_error)
    `;

    await dbQuery(sql, [
      record.transaction_id,
      record.business_contract_id,
      record.pcp_contract_id,
      record.buyer_id,
      record.seller_id,
      record.selected_enc_type,
      record.selected_operation,
      record.paillier_public_key_json,
      record.elgamal_public_key_json,
      record.pcp_status,
      record.download_token,
      record.result_filename,
      record.result_storage_path,
      record.last_error
    ]);

    return getHeRecordByTransactionId(record.transaction_id);
  }

  function mergeHeRecordInput(baseRecord, overrides) {
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(overrides, key);

    return {
      transactionId: firstDefined(
        overrides.transactionId,
        baseRecord && baseRecord.transaction_id
      ),
      businessContractId: firstDefined(
        overrides.businessContractId,
        baseRecord && baseRecord.business_contract_id
      ),
      pcpContractId: firstDefined(
        overrides.pcpContractId,
        baseRecord && baseRecord.pcp_contract_id
      ),
      buyerId: firstDefined(overrides.buyerId, baseRecord && baseRecord.buyer_id),
      sellerId: firstDefined(overrides.sellerId, baseRecord && baseRecord.seller_id),
      selectedEncType: firstDefined(
        overrides.selectedEncType,
        baseRecord && baseRecord.selected_enc_type
      ),
      selectedOperation: firstDefined(
        overrides.selectedOperation,
        baseRecord && baseRecord.selected_operation
      ),
      paillierPublicKey: firstDefined(
        overrides.paillierPublicKey,
        parseJsonField(baseRecord && baseRecord.paillier_public_key_json)
      ),
      elgamalPublicKey: firstDefined(
        overrides.elgamalPublicKey,
        parseJsonField(baseRecord && baseRecord.elgamal_public_key_json)
      ),
      pcpStatus: firstDefined(
        overrides.pcpStatus,
        baseRecord && baseRecord.pcp_status,
        'WAITING_INPUT'
      ),
      downloadToken: hasOwn('downloadToken')
        ? overrides.downloadToken
        : baseRecord && baseRecord.download_token,
      resultFilename: hasOwn('resultFilename')
        ? overrides.resultFilename
        : baseRecord && baseRecord.result_filename,
      resultStoragePath: hasOwn('resultStoragePath')
        ? overrides.resultStoragePath
        : baseRecord && baseRecord.result_storage_path,
      lastError: hasOwn('lastError')
        ? overrides.lastError
        : baseRecord && baseRecord.last_error
    };
  }

  function withHeResultMetadata(metadata = {}) {
    const overrides = {};

    if (metadata.downloadToken) {
      overrides.downloadToken = metadata.downloadToken;
    }

    if (metadata.resultFilename) {
      overrides.resultFilename = metadata.resultFilename;
    }

    if (metadata.resultStoragePath) {
      overrides.resultStoragePath = metadata.resultStoragePath;
    }

    return overrides;
  }

  app.get('/api/privacy/he/public-key-status', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    try {
      const { transaction, digitalContract } = await requireHeContext(transactionId);
      const record = await getHeRecordByTransactionId(transactionId);

      return res.status(200).json({
        success: true,
        item: toHeResponseRecord(record, {
          transaction_id: transactionId,
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
  });

  app.post('/api/privacy/he/public-keys', async (req, res) => {
    const transactionId = String(req.body.transactionId || '').trim();
    const paillierPublicKey = parseJsonField(
      firstDefined(req.body.paillierPublicKey, req.body.paillier_public_key)
    );
    const elgamalPublicKey = parseJsonField(
      firstDefined(req.body.elgamalPublicKey, req.body.elgamal_public_key)
    );

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    if (!paillierPublicKey || !elgamalPublicKey) {
      return res.status(400).json({
        success: false,
        message: 'Paillier 与 ElGamal 公钥必须同时上传'
      });
    }

    try {
      const { transaction, digitalContract } = await requireHeContext(transactionId);
      const existing = await getHeRecordByTransactionId(transactionId);
      const saved = await upsertHeRecord(
        mergeHeRecordInput(existing, {
          transactionId,
          businessContractId: digitalContract.contract_id,
          buyerId: transaction.buyer_address,
          sellerId: transaction.seller_address,
          paillierPublicKey,
          elgamalPublicKey,
          pcpStatus: firstDefined(existing && existing.pcp_status, 'WAITING_INPUT'),
          lastError: null
        })
      );

      return res.status(200).json({
        success: true,
        message: 'HE 公钥保存成功',
        item: toHeResponseRecord(saved, {
          transaction_id: transactionId,
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
  });

  app.post(
    '/api/privacy/he/submit',
    upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]),
    async (req, res) => {
      const transactionId = String(req.body.transactionId || '').trim();
      const encType = String(
        firstDefined(req.body.encType, req.body.enc_type, '')
      ).trim();
      const operation = String(req.body.operation || '').trim().toUpperCase();
      const file1 = req.files?.file1?.[0] || null;
      const file2 = req.files?.file2?.[0] || null;

      if (!transactionId || !encType || !operation) {
        return res.status(400).json({
          success: false,
          message: '缺少 transactionId / encType / operation'
        });
      }

      if (!HE_ENC_TYPES.includes(encType)) {
        return res.status(400).json({
          success: false,
          message: `不支持的 encType，允许值：${HE_ENC_TYPES.join(', ')}`
        });
      }

      if (!HE_OPERATIONS.includes(operation)) {
        return res.status(400).json({
          success: false,
          message: `不支持的 operation，允许值：${HE_OPERATIONS.join(', ')}`
        });
      }

      if (encType === 'ElGamal' && operation === 'ADD') {
        return res.status(400).json({
          success: false,
          message: 'ElGamal 当前仅支持 MUL'
        });
      }

      if (!file1 || !file2) {
        return res.status(400).json({
          success: false,
          message: '必须同时上传 file1 和 file2'
        });
      }

      try {
        const { transaction, digitalContract } = await requireHeContext(transactionId);
        const existing = await getHeRecordByTransactionId(transactionId);
        const publicKeys = getHePublicKeyByEncType(existing, encType);
        const mappedExisting = mapHeRecordRow(existing);

        if (!existing || !mappedExisting?.public_keys_ready) {
          return res.status(400).json({
            success: false,
            message: '买方尚未上传 HE 公钥'
          });
        }

        if (!publicKeys) {
          return res.status(400).json({
            success: false,
            message: `缺少 ${encType} 对应的公钥`
          });
        }

        ensureCompatibleExistingHeContract(mappedExisting, encType, operation);
        validateHeCsvFile(encType, file1);
        validateHeCsvFile(encType, file2);

        let pcpContractId = existing && existing.pcp_contract_id;
        let contractResponse = null;
        const heClient = createPcpClient({
          baseUrl: getPcpHeBaseUrl(),
          entityId: transaction.buyer_address
        });

        if (!pcpContractId) {
          const contractPayload = buildHeContractPayload({
            transaction,
            businessContractId: digitalContract.contract_id,
            encType,
            operation
          });

          const contractResp = await heClient.post('/he/contract', contractPayload);
          contractResponse = contractResp?.data || null;
          pcpContractId = firstDefined(
            contractResp?.data?.data?.contract_id,
            contractResp?.data?.contract_id
          );

          if (!pcpContractId) {
            return res.status(502).json({
              success: false,
              message: 'PCP /he/contract 未返回 contract_id'
            });
          }
        }

        const form = new FormData();
        form.append(
          'data',
          JSON.stringify({
            contract_id: pcpContractId,
            operation,
            enc_type: encType,
            public_keys: publicKeys
          })
        );
        form.append('file1', file1.buffer, {
          filename: file1.originalname || 'file1.csv',
          contentType: file1.mimetype || 'text/csv'
        });
        form.append('file2', file2.buffer, {
          filename: file2.originalname || 'file2.csv',
          contentType: file2.mimetype || 'text/csv'
        });

        const calculateResp = await heClient.post('/he/calculate_csv', form, {
          headers: form.getHeaders()
        });
        const resultMetadata = extractHeResultMetadata(calculateResp?.data);

        const saved = await upsertHeRecord(
          mergeHeRecordInput(existing, {
            transactionId,
            businessContractId: digitalContract.contract_id,
            pcpContractId,
            buyerId: transaction.buyer_address,
            sellerId: transaction.seller_address,
            selectedEncType: encType,
            selectedOperation: operation,
            pcpStatus: firstDefined(
              calculateResp?.data?.data?.status,
              contractResponse?.data?.status,
              'QUEUED'
            ),
            lastError: null,
            ...withHeResultMetadata(resultMetadata)
          })
        );

        return res.status(200).json({
          success: true,
          message: 'HE 计算任务已提交',
          item: toHeResponseRecord(saved, {
            transaction_id: transactionId,
            business_contract_id: digitalContract.contract_id,
            buyer_id: transaction.buyer_address,
            seller_id: transaction.seller_address
          }),
          pcp: {
            contract: contractResponse,
            calculate: calculateResp?.data || null
          }
        });
      } catch (error) {
        const routeError = formatHeRouteError(error);
        return res.status(error.statusCode || routeError.status).json({
          success: false,
          ...routeError.body,
          message: error.statusCode ? error.message : routeError.body.message
        });
      }
    }
  );

  app.get('/api/privacy/he/status', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    try {
      const { transaction, digitalContract } = await requireHeContext(transactionId);
      let record = await getHeRecordByTransactionId(transactionId);
      let syncError = null;

      if (record?.pcp_contract_id) {
        try {
          const client = createPcpClient({
            baseUrl: getPcpHeBaseUrl(),
            entityId: transaction.buyer_address
          });
          const statusResp = await client.get(
            `/he/${encodeURIComponent(record.pcp_contract_id)}/status`
          );
          const statusData = statusResp?.data?.data || {};
          const resultMetadata = extractHeResultMetadata(statusResp?.data);

          record = await upsertHeRecord(
            mergeHeRecordInput(record, {
              transactionId,
              businessContractId: digitalContract.contract_id,
              buyerId: transaction.buyer_address,
              sellerId: transaction.seller_address,
              pcpContractId: firstDefined(statusData.contract_id, record.pcp_contract_id),
              pcpStatus: firstDefined(statusData.status, record.pcp_status),
              lastError: firstDefined(statusData.last_error, record.last_error),
              ...withHeResultMetadata(resultMetadata)
            })
          );
        } catch (error) {
          if ([403, 404, 409].includes(error?.response?.status)) {
            throw error;
          }
          syncError = error.message;
        }
      }

      return res.status(200).json({
        success: true,
        item: toHeResponseRecord(record, {
          transaction_id: transactionId,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address,
          seller_id: transaction.seller_address
        }),
        syncError
      });
    } catch (error) {
      const routeError = formatHeRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });

  app.post(
    '/api/privacy/he/result',
    upload.fields([{ name: 'resultFile', maxCount: 1 }, { name: 'file', maxCount: 1 }]),
    createHeResultSyncHandler({
      firstDefined,
      safeBaseName,
      getHeRecordByTransactionId,
      getHeRecordByPcpContractId,
      requireHeContext,
      upsertHeRecord,
      mergeHeRecordInput,
      toHeResponseRecord,
      formatHeRouteError
    })
  );

  const heResultNotificationHandler = createHeResultNotificationHandler({
    firstDefined,
    getHeRecordByTransactionId,
    getHeRecordByPcpContractId,
    requireHeContext,
    upsertHeRecord,
    mergeHeRecordInput,
    toHeResponseRecord,
    formatHeRouteError
  });

  app.post(
    '/api/privacy/he/result-notify',
    heResultNotificationHandler
  );

  app.get('/api/privacy/he/result', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    try {
      const { transaction, digitalContract } = await requireHeContext(transactionId);
      let record = await getHeRecordByTransactionId(transactionId);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '当前交易暂无 HE 记录'
        });
      }

      let storagePath = await resolveLocalResultPath(record.result_storage_path);

      if (!storagePath && record.download_token) {
        const client = createPcpClient({
          baseUrl: getPcpHeBaseUrl(),
          entityId: transaction.buyer_address
        });
        const downloadResp = await client.get(
          `/download/${encodeURIComponent(record.download_token)}`,
          { responseType: 'arraybuffer' }
        );
        const headerFilenameMatch = String(
          downloadResp.headers?.['content-disposition'] || ''
        ).match(/filename="?([^"]+)"?/i);
        const downloadedFilename = firstDefined(
          record.result_filename,
          headerFilenameMatch && headerFilenameMatch[1],
          `he_result_${transactionId}.csv`
        );

        const persistedResult = await persistHeResultFile({
          transactionId,
          file: {
            originalname: downloadedFilename,
            buffer: Buffer.from(downloadResp.data)
          },
          preferredFilename: downloadedFilename,
          safeBaseName
        });

        const saved = await upsertHeRecord(
          mergeHeRecordInput(record, {
            transactionId,
            businessContractId: digitalContract.contract_id,
            pcpContractId: record.pcp_contract_id,
            buyerId: transaction.buyer_address,
            sellerId: transaction.seller_address,
            resultFilename: persistedResult.resultFilename,
            resultStoragePath: persistedResult.resultStoragePath,
            pcpStatus: firstDefined(record.pcp_status, 'COMPLETED'),
            lastError: null
          })
        );

        record = saved;
        storagePath = saved.result_storage_path;
      }

      if (!storagePath) {
        return res.status(404).json({
          success: false,
          message: '当前交易尚未收到 HE 结果下载令牌或结果文件'
        });
      }

      const resolvedPath = path.resolve(String(storagePath));
      const fileBuffer = await fs.readFile(resolvedPath);
      const fileName = firstDefined(
        record.result_filename,
        path.basename(resolvedPath),
        `he_result_${transactionId}.csv`
      );
      const extension = path.extname(fileName).replace('.', '').toLowerCase();

      res.setHeader('Content-Type', pickContentType(extension, extension));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeBaseName(fileName)}${path.extname(fileName) || '.csv'}"`
      );
      res.setHeader('x-he-enc-type', record.selected_enc_type || '');
      res.setHeader('x-he-transaction-id', transactionId);
      res.setHeader('x-he-business-contract-id', digitalContract.contract_id || '');
      res.setHeader('x-he-buyer-id', transaction.buyer_address || '');

      return res.status(200).send(fileBuffer);
    } catch (error) {
      const routeError = formatHeRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });
}

function registerPreRoutes({
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

  async function getPreRecordByTransactionId(transactionId) {
    const rows = await dbQuery(
      'SELECT * FROM pre_delivery_contracts WHERE transaction_id = ? LIMIT 1',
      [transactionId]
    );

    return rows[0] || null;
  }

  async function getPreRecordByPcpContractId(pcpContractId) {
    const rows = await dbQuery(
      'SELECT * FROM pre_delivery_contracts WHERE pcp_contract_id = ? LIMIT 1',
      [pcpContractId]
    );

    return rows[0] || null;
  }

  async function requirePreContext(transactionId) {
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

    assertPcTypeMatches(digitalContract, 'PRE', 'PRE');

    return { transaction, digitalContract };
  }

  function toPreResponseRecord(record, fallback = {}) {
    const mapped = mapPreRecordRow(record);
    const buyerId = fallback.buyer_id || fallback.buyerId || null;
    const sellerId = fallback.seller_id || fallback.sellerId || null;
    const businessContractId =
      fallback.business_contract_id || fallback.businessContractId || null;

    if (!mapped) {
      return {
        transaction_id: fallback.transaction_id || fallback.transactionId || null,
        business_contract_id: businessContractId,
        pcp_contract_id: null,
        buyer_id: buyerId,
        seller_id: sellerId,
        buyer_public_key: null,
        buyer_public_key_ready: false,
        tee_key_id: null,
        pcp_status: 'NOT_EXIST',
        has_record: false,
        result_ready: false,
        download_token: null,
        result_filename: null,
        last_error: null
      };
    }

    return {
      transaction_id: mapped.transaction_id,
      business_contract_id: mapped.business_contract_id || businessContractId,
      pcp_contract_id: mapped.pcp_contract_id || null,
      buyer_id: mapped.buyer_id || buyerId,
      seller_id: mapped.seller_id || sellerId,
      buyer_public_key: mapped.buyer_public_key || null,
      buyer_public_key_ready: Boolean(mapped.buyer_public_key_ready),
      tee_key_id: mapped.tee_key_id || null,
      pcp_status: mapped.pcp_status || 'CREATED',
      has_record: true,
      result_ready: Boolean(mapped.result_ready),
      download_token: mapped.download_token || null,
      result_filename: mapped.result_filename || null,
      last_error: mapped.last_error || null
    };
  }

  async function upsertPreRecord(recordInput) {
    const record = normalizePreRecord(recordInput);
    const sql = `
      INSERT INTO pre_delivery_contracts (
        transaction_id,
        business_contract_id,
        pcp_contract_id,
        buyer_id,
        seller_id,
        buyer_public_key,
        tee_key_id,
        pcp_status,
        download_token,
        result_filename,
        result_storage_path,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        business_contract_id = VALUES(business_contract_id),
        pcp_contract_id = VALUES(pcp_contract_id),
        buyer_id = VALUES(buyer_id),
        seller_id = VALUES(seller_id),
        buyer_public_key = VALUES(buyer_public_key),
        tee_key_id = VALUES(tee_key_id),
        pcp_status = VALUES(pcp_status),
        download_token = VALUES(download_token),
        result_filename = VALUES(result_filename),
        result_storage_path = VALUES(result_storage_path),
        last_error = VALUES(last_error)
    `;

    await dbQuery(sql, [
      record.transaction_id,
      record.business_contract_id,
      record.pcp_contract_id,
      record.buyer_id,
      record.seller_id,
      record.buyer_public_key,
      record.tee_key_id,
      record.pcp_status,
      record.download_token,
      record.result_filename,
      record.result_storage_path,
      record.last_error
    ]);

    return getPreRecordByTransactionId(record.transaction_id);
  }

  function mergePreRecordInput(baseRecord, overrides) {
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(overrides, key);

    return {
      transactionId: firstDefined(
        overrides.transactionId,
        baseRecord && baseRecord.transaction_id
      ),
      businessContractId: firstDefined(
        overrides.businessContractId,
        baseRecord && baseRecord.business_contract_id
      ),
      pcpContractId: firstDefined(
        overrides.pcpContractId,
        baseRecord && baseRecord.pcp_contract_id
      ),
      buyerId: firstDefined(overrides.buyerId, baseRecord && baseRecord.buyer_id),
      sellerId: firstDefined(overrides.sellerId, baseRecord && baseRecord.seller_id),
      buyerPublicKey: firstDefined(
        overrides.buyerPublicKey,
        baseRecord && baseRecord.buyer_public_key
      ),
      teeKeyId: firstDefined(overrides.teeKeyId, baseRecord && baseRecord.tee_key_id),
      pcpStatus: firstDefined(
        overrides.pcpStatus,
        baseRecord && baseRecord.pcp_status,
        'CREATED'
      ),
      downloadToken: hasOwn('downloadToken')
        ? overrides.downloadToken
        : baseRecord && baseRecord.download_token,
      resultFilename: hasOwn('resultFilename')
        ? overrides.resultFilename
        : baseRecord && baseRecord.result_filename,
      resultStoragePath: hasOwn('resultStoragePath')
        ? overrides.resultStoragePath
        : baseRecord && baseRecord.result_storage_path,
      lastError: hasOwn('lastError')
        ? overrides.lastError
        : baseRecord && baseRecord.last_error
    };
  }

  function withPreResultMetadata(metadata = {}) {
    const overrides = {};

    if (metadata.downloadToken) {
      overrides.downloadToken = metadata.downloadToken;
    }

    if (metadata.resultFilename) {
      overrides.resultFilename = metadata.resultFilename;
    }

    if (metadata.resultStoragePath) {
      overrides.resultStoragePath = metadata.resultStoragePath;
    }

    return overrides;
  }

  async function submitPreReEncryptTask({
    record,
    transaction,
    digitalContract
  }) {
    if (!record?.buyer_public_key) {
      const error = new Error('买方尚未上传 PRE 公钥');
      error.statusCode = 400;
      throw error;
    }

    const client = createPcpClient({
      baseUrl: getPcpPreBaseUrl(),
      entityId: transaction.buyer_address
    });
    const reEncryptResp = await client.post('/pre/re-encrypt', {
      contract_id: record.pcp_contract_id,
      buyer_public_key: record.buyer_public_key
    });
    const resultMetadata = extractPreResultMetadata(reEncryptResp?.data);
    const saved = await upsertPreRecord(
      mergePreRecordInput(record, {
        transactionId: record.transaction_id,
        businessContractId: digitalContract.contract_id,
        pcpContractId: record.pcp_contract_id,
        buyerId: transaction.buyer_address,
        sellerId: transaction.seller_address,
        pcpStatus: firstDefined(reEncryptResp?.data?.data?.status, 'QUEUED'),
        lastError: null,
        ...withPreResultMetadata(resultMetadata)
      })
    );

    return {
      saved,
      reEncryptResp
    };
  }

  async function ensurePreContract({ transactionId, existingRecord }) {
    const { transaction, digitalContract } = await requirePreContext(transactionId);
    const currentRecord = existingRecord || await getPreRecordByTransactionId(transactionId);

    if (currentRecord?.pcp_contract_id) {
      return {
        record: currentRecord,
        transaction,
        digitalContract,
        created: false
      };
    }

    const contractPayload = buildPreContractPayload({
      transaction,
      businessContractId: digitalContract.contract_id
    });
    const client = createPcpClient({
      baseUrl: getPcpPreBaseUrl(),
      entityId: transaction.buyer_address
    });
    const contractResp = await client.post('/pre/contract', contractPayload);
    const pcpContractId = firstDefined(
      contractResp?.data?.data?.contract_id,
      contractResp?.data?.contract_id
    );

    if (!pcpContractId) {
      throw new Error('PCP /pre/contract 未返回 contract_id');
    }

    const saved = await upsertPreRecord(
      mergePreRecordInput(currentRecord, {
        transactionId,
        businessContractId: digitalContract.contract_id,
        pcpContractId,
        buyerId: transaction.buyer_address,
        sellerId: transaction.seller_address,
        pcpStatus: firstDefined(contractResp?.data?.data?.status, 'CREATED'),
        lastError: null
      })
    );

    return {
      record: saved,
      transaction,
      digitalContract,
      created: true
    };
  }

  app.get('/api/privacy/pre/status', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    try {
      const { transaction, digitalContract } = await requirePreContext(transactionId);
      let record = await getPreRecordByTransactionId(transactionId);
      let syncError = null;

      if (record?.pcp_contract_id) {
        try {
          const client = createPcpClient({
            baseUrl: getPcpPreBaseUrl(),
            entityId: transaction.buyer_address
          });
          const statusResp = await client.get(
            `/pre/${encodeURIComponent(record.pcp_contract_id)}/status`
          );
          const statusData = statusResp?.data?.data || {};
          const resultMetadata = extractPreResultMetadata(statusResp?.data);

          record = await upsertPreRecord(
            mergePreRecordInput(record, {
              transactionId,
              businessContractId: digitalContract.contract_id,
              buyerId: transaction.buyer_address,
              sellerId: transaction.seller_address,
              pcpContractId: firstDefined(statusData.contract_id, record.pcp_contract_id),
              pcpStatus: firstDefined(statusData.status, record.pcp_status),
              lastError: firstDefined(statusData.last_error, record.last_error),
              ...withPreResultMetadata(resultMetadata)
            })
          );
        } catch (error) {
          if ([403, 404, 409].includes(error?.response?.status)) {
            throw error;
          }
          syncError = error.message;
        }
      }

      return res.status(200).json({
        success: true,
        item: toPreResponseRecord(record, {
          transaction_id: transactionId,
          business_contract_id: digitalContract.contract_id,
          buyer_id: transaction.buyer_address,
          seller_id: transaction.seller_address
        }),
        syncError
      });
    } catch (error) {
      const routeError = formatPreRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });

  app.get('/api/privacy/pre/tee-materials', async (req, res) => {
    const entityId = String(req.query.entityId || req.query.sellerId || '').trim();

    try {
      const client = createPcpClient({
        baseUrl: getPcpPreBaseUrl(),
        entityId: entityId || undefined
      });
      const response = await client.get('/pre/tee-materials');
      return res.status(200).json({
        success: true,
        item: response?.data?.data || response?.data || null
      });
    } catch (error) {
      const routeError = formatPreRouteError(error);
      return res.status(routeError.status).json({
        success: false,
        ...routeError.body
      });
    }
  });

  app.post('/api/privacy/pre/buyer-public-key', async (req, res) => {
    const transactionId = String(req.body.transactionId || '').trim();
    const buyerPublicKey = String(
      firstDefined(req.body.buyerPublicKey, req.body.buyer_public_key, '')
    ).trim();
    const teeKeyId = firstDefined(req.body.teeKeyId, req.body.tee_key_id);

    if (!transactionId || !buyerPublicKey) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId / buyerPublicKey'
      });
    }

    try {
      validatePreHexString(buyerPublicKey, 'buyerPublicKey');
      const ensured = await ensurePreContract({ transactionId });
      const saved = await upsertPreRecord(
        mergePreRecordInput(ensured.record, {
          transactionId,
          businessContractId: ensured.digitalContract.contract_id,
          pcpContractId: ensured.record.pcp_contract_id,
          buyerId: ensured.transaction.buyer_address,
          sellerId: ensured.transaction.seller_address,
          buyerPublicKey,
          teeKeyId: teeKeyId ? String(teeKeyId).trim() : ensured.record.tee_key_id,
          lastError: null
        })
      );

      return res.status(200).json({
        success: true,
        message: 'PRE buyer 公钥保存成功',
        item: toPreResponseRecord(saved, {
          transaction_id: transactionId,
          business_contract_id: ensured.digitalContract.contract_id,
          buyer_id: ensured.transaction.buyer_address,
          seller_id: ensured.transaction.seller_address
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
  });

  app.post(
    '/api/privacy/pre/publish',
    upload.fields([
      { name: 'source_cipher_file', maxCount: 1 },
      { name: 'source_wrapped_key_file', maxCount: 1 },
      { name: 'source_meta_file', maxCount: 1 }
    ]),
    async (req, res) => {
      const transactionId = String(req.body.transactionId || '').trim();
      const keyPackage = String(
        firstDefined(req.body.keyPackage, req.body.key_package, '')
      ).trim();
      const teeKeyId = firstDefined(req.body.teeKeyId, req.body.tee_key_id);
      const sourceCipherFile = req.files?.source_cipher_file?.[0] || null;
      const sourceWrappedKeyFile = req.files?.source_wrapped_key_file?.[0] || null;
      const sourceMetaFile = req.files?.source_meta_file?.[0] || null;

      if (!transactionId || !keyPackage || !sourceCipherFile || !sourceWrappedKeyFile || !sourceMetaFile) {
        return res.status(400).json({
          success: false,
          message: '缺少 transactionId / keyPackage / PRE 三件套'
        });
      }

      try {
        validatePreHexString(keyPackage, 'keyPackage');
        let existing = await getPreRecordByTransactionId(transactionId);
        const ensured = await ensurePreContract({ transactionId, existingRecord: existing });
        existing = ensured.record;

        const form = new FormData();
        form.append('contract_id', existing.pcp_contract_id);
        form.append('key_package', keyPackage);
        form.append('source_cipher_file', sourceCipherFile.buffer, {
          filename: sourceCipherFile.originalname || 'cipher.bin',
          contentType: sourceCipherFile.mimetype || 'application/octet-stream'
        });
        form.append('source_wrapped_key_file', sourceWrappedKeyFile.buffer, {
          filename: sourceWrappedKeyFile.originalname || 'wrapped_key.bin',
          contentType: sourceWrappedKeyFile.mimetype || 'application/octet-stream'
        });
        form.append('source_meta_file', sourceMetaFile.buffer, {
          filename: sourceMetaFile.originalname || 'meta.json',
          contentType: sourceMetaFile.mimetype || 'application/json'
        });

        const client = createPcpClient({
          baseUrl: getPcpPreBaseUrl(),
          entityId: ensured.transaction.seller_address
        });
        const publishResp = await client.post('/pre/publish', form, {
          headers: form.getHeaders()
        });
        const resultMetadata = extractPreResultMetadata(publishResp?.data);
        const status = firstDefined(publishResp?.data?.data?.status, 'WAITING_INPUT');

        const saved = await upsertPreRecord(
          mergePreRecordInput(existing, {
            transactionId,
            businessContractId: ensured.digitalContract.contract_id,
            pcpContractId: existing.pcp_contract_id,
            buyerId: ensured.transaction.buyer_address,
            sellerId: ensured.transaction.seller_address,
            teeKeyId: teeKeyId ? String(teeKeyId).trim() : existing.tee_key_id,
            pcpStatus: status,
            lastError: null,
            ...withPreResultMetadata(resultMetadata)
          })
        );

        let autoReEncrypt = null;
        let finalSaved = saved;
        let responseMessage = 'PRE 密态包已发布';

        if (saved?.buyer_public_key) {
          try {
            const submitted = await submitPreReEncryptTask({
              record: saved,
              transaction: ensured.transaction,
              digitalContract: ensured.digitalContract
            });
            finalSaved = submitted.saved;
            autoReEncrypt = {
              success: true,
              item: submitted.saved,
              pcp: submitted.reEncryptResp?.data || null
            };
            responseMessage = 'PRE 密态包已发布，并已自动发起重加密';
          } catch (autoError) {
            const routeError = formatPreRouteError(autoError);
            autoReEncrypt = {
              success: false,
              message: autoError.statusCode
                ? autoError.message
                : routeError.body.message,
              error: autoError.message
            };
            responseMessage = 'PRE 密态包已发布，但自动重加密未成功，请买方稍后手动发起';
          }
        }

        return res.status(200).json({
          success: true,
          message: responseMessage,
          item: toPreResponseRecord(finalSaved, {
            transaction_id: transactionId,
            business_contract_id: ensured.digitalContract.contract_id,
            buyer_id: ensured.transaction.buyer_address,
            seller_id: ensured.transaction.seller_address
          }),
          pcp: {
            publish: publishResp?.data || null
          },
          autoReEncrypt
        });
      } catch (error) {
        const routeError = formatPreRouteError(error);
        return res.status(error.statusCode || routeError.status).json({
          success: false,
          ...routeError.body,
          message: error.statusCode ? error.message : routeError.body.message
        });
      }
    }
  );

  app.post('/api/privacy/pre/re-encrypt', async (req, res) => {
    const transactionId = String(req.body.transactionId || '').trim();
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    try {
      let existing = await getPreRecordByTransactionId(transactionId);
      const ensured = await ensurePreContract({ transactionId, existingRecord: existing });
      existing = ensured.record;

      if (!['WAITING_INPUT', 'FAILED'].includes(String(existing.pcp_status || '').toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: '当前 PRE 交付状态不允许发起重加密，请等待卖方先完成交付'
        });
      }

      const submitted = await submitPreReEncryptTask({
        record: existing,
        transaction: ensured.transaction,
        digitalContract: ensured.digitalContract
      });

      return res.status(200).json({
        success: true,
        message: 'PRE 重加密任务已提交',
        item: toPreResponseRecord(submitted.saved, {
          transaction_id: transactionId,
          business_contract_id: ensured.digitalContract.contract_id,
          buyer_id: ensured.transaction.buyer_address,
          seller_id: ensured.transaction.seller_address
        }),
        pcp: {
          reEncrypt: submitted.reEncryptResp?.data || null
        }
      });
    } catch (error) {
      const routeError = formatPreRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });

  app.post(
    '/api/privacy/pre/result',
    upload.none(),
    createPreResultSyncHandler({
      firstDefined,
      getPreRecordByTransactionId,
      getPreRecordByPcpContractId,
      requirePreContext,
      upsertPreRecord,
      mergePreRecordInput,
      toPreResponseRecord,
      formatPreRouteError
    })
  );

  const preResultNotificationHandler = createPreResultNotificationHandler({
    firstDefined,
    getPreRecordByTransactionId,
    getPreRecordByPcpContractId,
    requirePreContext,
    upsertPreRecord,
    mergePreRecordInput,
    toPreResponseRecord,
    formatPreRouteError
  });

  app.post(
    '/api/privacy/pre/result-notify',
    preResultNotificationHandler
  );

  app.post('/api/privacy/result-notify', async (req, res) => {
    const resultRole = detectResultNotificationRole(req.body, firstDefined);

    if (resultRole === 'he_result') {
      return heResultNotificationHandler(req, res);
    }

    if (resultRole === 'pre_result') {
      return preResultNotificationHandler(req, res);
    }

    return res.status(400).json({
      success: false,
      message: '无法识别 result_role，仅支持 he_result / pre_result'
    });
  });

  app.get('/api/privacy/pre/result', async (req, res) => {
    const transactionId = String(req.query.transactionId || '').trim();
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    try {
      const { transaction, digitalContract } = await requirePreContext(transactionId);
      const record = await getPreRecordByTransactionId(transactionId);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: '当前交易暂无 PRE 记录'
        });
      }

      if (!record.download_token) {
        return res.status(404).json({
          success: false,
          message: '当前交易尚未收到 PRE 结果下载令牌'
        });
      }

      const client = createPcpClient({
        baseUrl: getPcpPreBaseUrl(),
        entityId: transaction.buyer_address
      });
      const downloadResp = await client.get(
        `/download/${encodeURIComponent(record.download_token)}`,
        { responseType: 'arraybuffer' }
      );
      const headerFilenameMatch = String(
        downloadResp.headers?.['content-disposition'] || ''
      ).match(/filename="?([^"]+)"?/i);
      const fileName = firstDefined(
        record.result_filename,
        headerFilenameMatch && headerFilenameMatch[1],
        `pre_result_${transactionId}.tar`
      );
      const extension = path.extname(fileName).replace('.', '').toLowerCase() || 'tar';

      res.setHeader('Content-Type', pickContentType(extension, extension));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeBaseName(fileName)}${path.extname(fileName) || '.tar'}"`
      );
      res.setHeader('x-pre-transaction-id', transactionId);
      res.setHeader('x-pre-business-contract-id', digitalContract.contract_id || '');
      res.setHeader('x-pre-buyer-id', transaction.buyer_address || '');

      return res.status(200).send(Buffer.from(downloadResp.data));
    } catch (error) {
      const routeError = formatPreRouteError(error);
      return res.status(error.statusCode || routeError.status).json({
        success: false,
        ...routeError.body,
        message: error.statusCode ? error.message : routeError.body.message
      });
    }
  });
}

module.exports = {
  registerHeRoutes,
  registerPreRoutes
};
