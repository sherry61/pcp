const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { execFile } = require('child_process');

const {
  HE_ENC_TYPES,
  HE_OPERATIONS
} = require('./constants');
const { createPcpClient } = require('./client');
const {
  buildHeContractPayload,
  buildHeAttemptMetadata,
  buildPcpHePublicKey,
  resolveHeComputeMode,
  normalizeHeRecord,
  mapHeRecordRow,
  ensureCompatibleExistingHeContract,
  validateHeCsvFile,
  extractHeResultMetadata
} = require('./he');
const {
  buildPreContractPayload,
  buildPreAttemptMetadata,
  normalizePreRecord,
  mapPreRecordRow,
  extractPreResultMetadata,
  validatePreJsonPayload,
  validatePreSourceArchive
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

  if (error?.statusCode) {
    return {
      status: error.statusCode,
      body: {
        message: error.message || 'HE 请求校验失败',
        code: error.code || `HE_${error.statusCode}`
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
      message: error?.message || 'HE 路由处理失败',
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
    'http://127.0.0.1:8130'
  ).replace(/\/+$/, '');
}

function getPcpPreBaseUrl() {
  return (
    process.env.PCP_PRE_BASE_URL ||
    process.env.PCP_BASE_URL ||
    'http://127.0.0.1:8130'
  ).replace(/\/+$/, '');
}

function getPreDecryptPythonPath() {
  const candidates = [
    process.env.PRE_DECRYPT_PYTHON,
    '/tmp/pcc-pre-interop/bin/python',
    '/usr/bin/python3',
    '/usr/local/bin/python3'
  ].filter(Boolean);

  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  }) || null;
}

function getPreDecryptHelperScriptPath() {
  return path.resolve(__dirname, '../../scripts/pre_decrypt_helper.py');
}

function getPrePublishHelperScriptPath() {
  return path.resolve(__dirname, '../../scripts/pre_publish_helper.py');
}

async function runPreDecryptHelper({ encryptedZipBuffer, privateScalarHex }) {
  const pythonPath = getPreDecryptPythonPath();
  if (!pythonPath) {
    const error = new Error('PRE 解密 helper 未配置，请先准备 Python 运行环境');
    error.statusCode = 500;
    throw error;
  }

  const helperScriptPath = getPreDecryptHelperScriptPath();
  try {
    await fsp.access(helperScriptPath);
  } catch (accessError) {
    const error = new Error('PRE 解密 helper 脚本不存在');
    error.statusCode = 500;
    throw error;
  }

  const payload = JSON.stringify({
    privateScalarHex: String(privateScalarHex || ''),
    encryptedZipBase64: Buffer.from(encryptedZipBuffer || Buffer.alloc(0)).toString('base64')
  });

  const stdoutText = await new Promise((resolve, reject) => {
    execFile(
      pythonPath,
      [helperScriptPath],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: {
          ...process.env,
          PCC_PRE_ROOT: process.env.PCC_PRE_ROOT || '/home/super/tr/pcc'
        },
        maxBuffer: 64 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve(String(stdout || ''));
      }
    ).stdin.end(payload);
  }).catch((error) => {
    let helperMessage = '';
    try {
      const parsed = JSON.parse(String(error?.stdout || '').trim() || '{}');
      helperMessage = parsed?.message || '';
    } catch (parseError) {
      helperMessage = '';
    }

    const routeError = new Error(
      helperMessage ||
      String(error?.stderr || '').trim() ||
      error.message ||
      'PRE 解密 helper 执行失败'
    );
    routeError.statusCode = 500;
    throw routeError;
  });

  let parsed;
  try {
    parsed = JSON.parse(stdoutText);
  } catch (error) {
    const routeError = new Error('PRE 解密 helper 返回内容非法');
    routeError.statusCode = 500;
    throw routeError;
  }

  if (!parsed?.success || !parsed?.zipBase64) {
    const routeError = new Error(parsed?.message || 'PRE 解密 helper 未返回结果');
    routeError.statusCode = 500;
    throw routeError;
  }

  return {
    zipBuffer: Buffer.from(String(parsed.zipBase64), 'base64'),
    entryCount: Number(parsed.entryCount || 0)
  };
}

async function runPrePublishHelper({ transactionId, buyerPublicKey, sourceArchiveBuffer }) {
  const pythonPath = getPreDecryptPythonPath();
  if (!pythonPath) {
    const error = new Error('PRE helper 未配置，请先准备 Python 运行环境');
    error.statusCode = 500;
    throw error;
  }

  const helperScriptPath = getPrePublishHelperScriptPath();
  try {
    await fsp.access(helperScriptPath);
  } catch (accessError) {
    const error = new Error('PRE publish helper 脚本不存在');
    error.statusCode = 500;
    throw error;
  }

  const payload = JSON.stringify({
    transactionId: String(transactionId || ''),
    buyerPublicKey,
    sourceArchiveBase64: Buffer.from(sourceArchiveBuffer || Buffer.alloc(0)).toString('base64')
  });

  const stdoutText = await new Promise((resolve, reject) => {
    execFile(
      pythonPath,
      [helperScriptPath],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: {
          ...process.env,
          PCC_PRE_ROOT: process.env.PCC_PRE_ROOT || '/home/super/tr/pcc'
        },
        maxBuffer: 64 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve(String(stdout || ''));
      }
    ).stdin.end(payload);
  }).catch((error) => {
    let helperMessage = '';
    try {
      const parsed = JSON.parse(String(error?.stdout || '').trim() || '{}');
      helperMessage = parsed?.message || '';
    } catch (parseError) {
      helperMessage = '';
    }

    const routeError = new Error(
      helperMessage ||
      String(error?.stderr || '').trim() ||
      error.message ||
      'PRE publish helper 执行失败'
    );
    routeError.statusCode = 500;
    throw routeError;
  });

  let parsed;
  try {
    parsed = JSON.parse(stdoutText);
  } catch (error) {
    const routeError = new Error('PRE publish helper 返回内容非法');
    routeError.statusCode = 500;
    throw routeError;
  }

  if (!parsed?.success || !parsed?.sourcePublicKey || !parsed?.reencryptionKey || !parsed?.sourceCipherZipBase64) {
    const routeError = new Error(parsed?.message || 'PRE publish helper 未返回结果');
    routeError.statusCode = 500;
    throw routeError;
  }

  return {
    sourcePublicKey: parsed.sourcePublicKey,
    reencryptionKey: parsed.reencryptionKey,
    sourceCipherZipBuffer: Buffer.from(String(parsed.sourceCipherZipBase64), 'base64'),
    entryCount: Number(parsed.entryCount || 0)
  };
}

function normalizePcType(value) {
  return String(value || '').trim().toUpperCase();
}

function extractContractStatus(payload) {
  const data = payload?.data || payload || {};
  return {
    contractId: data.contract_id || payload?.contract_id || null,
    status: data.status || payload?.status || null,
    contractParams: data.contract_params || payload?.contract_params || null
  };
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

function assertPcTypeIn(digitalContract, expectedPcTypes, label) {
  const actualPcType = normalizePcType(digitalContract?.pc_type);
  const allowedTypes = Array.isArray(expectedPcTypes)
    ? expectedPcTypes.map((item) => normalizePcType(item)).filter(Boolean)
    : [normalizePcType(expectedPcTypes)].filter(Boolean);

  if (!actualPcType) {
    const error = new Error('数字合约未配置隐私计算方式');
    error.statusCode = 400;
    throw error;
  }

  if (!allowedTypes.includes(actualPcType)) {
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
    await fsp.access(resolvedPath);
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

    assertPcTypeIn(digitalContract, ['HE', 'MPC'], 'HE 或 MPC');

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
        current_attempt_id: null,
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
      current_attempt_id: mapped.current_attempt_id || null,
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
        current_attempt_id,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        business_contract_id = VALUES(business_contract_id),
        current_attempt_id = VALUES(current_attempt_id),
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
      record.current_attempt_id,
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
      currentAttemptId: firstDefined(
        overrides.currentAttemptId,
        baseRecord && baseRecord.current_attempt_id
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
    upload.any(),
    async (req, res) => {
      const transactionId = String(req.body.transactionId || '').trim();
      const encType = String(
        firstDefined(req.body.encType, req.body.enc_type, '')
      ).trim();
      const operation = String(req.body.operation || '').trim().toUpperCase();
      const uploadedFiles = Array.isArray(req.files) ? req.files : [];
      const orderedFiles = uploadedFiles
        .filter((file) => file?.buffer)
        .sort((left, right) => String(left.fieldname || '').localeCompare(String(right.fieldname || '')));
      const sellerFileFields = orderedFiles.map((file) => String(file.fieldname || '').trim()).filter(Boolean);

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

      if (!orderedFiles.length) {
        return res.status(400).json({
          success: false,
          message: '至少需要上传一个 HE CSV 文件'
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

        const heComputeMode = resolveHeComputeMode(encType, operation);
        ensureCompatibleExistingHeContract(mappedExisting, encType, operation);
        orderedFiles.forEach((file) => validateHeCsvFile(encType, file));

        let pcpContractId = existing && existing.pcp_contract_id;
        let currentAttemptId = existing && existing.current_attempt_id;
        let contractResponse = null;
        let attemptResponse = null;
        const heClient = createPcpClient({
          baseUrl: getPcpHeBaseUrl()
        });

        if (!pcpContractId) {
          const contractPayload = buildHeContractPayload({
            transaction,
            businessContractId: digitalContract.contract_id,
            encType,
            operation,
            sellerFileCount: orderedFiles.length
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
        form.append('metadata', JSON.stringify(buildHeAttemptMetadata({
          contractId: pcpContractId,
          sellerId: transaction.seller_address,
          publicKey: buildPcpHePublicKey(encType, publicKeys),
          sellerFileFields
        })));
        orderedFiles.forEach((file, index) => {
          form.append(sellerFileFields[index], file.buffer, {
            filename: file.originalname || `${sellerFileFields[index]}.csv`,
            contentType: file.mimetype || 'text/csv'
          });
        });

        attemptResponse = await heClient.post(`/he/${encodeURIComponent(pcpContractId)}/attempts`, form, {
          headers: form.getHeaders()
        });
        currentAttemptId = firstDefined(
          attemptResponse?.data?.data?.attempt_id,
          attemptResponse?.data?.attempt_id,
          currentAttemptId
        );
        const resultMetadata = extractHeResultMetadata(attemptResponse?.data);

        const saved = await upsertHeRecord(
          mergeHeRecordInput(existing, {
            transactionId,
            businessContractId: digitalContract.contract_id,
            currentAttemptId,
            pcpContractId,
            buyerId: transaction.buyer_address,
            sellerId: transaction.seller_address,
            selectedEncType: encType,
            selectedOperation: operation,
            pcpStatus: firstDefined(
              attemptResponse?.data?.data?.status,
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
            attempt: attemptResponse?.data || null,
            he_compute_mode: heComputeMode
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

      if (record?.pcp_contract_id && record?.current_attempt_id) {
        try {
          const client = createPcpClient({
            baseUrl: getPcpHeBaseUrl()
          });
          const attemptResp = await client.get(
            `/he/${encodeURIComponent(record.pcp_contract_id)}/attempts/${encodeURIComponent(record.current_attempt_id)}/status`
          );
          const attemptData = attemptResp?.data?.data || attemptResp?.data || {};
          const resultTokens = Array.isArray(attemptData?.result_tokens)
            ? attemptData.result_tokens
            : [];
          let buyerResultToken = resultTokens.find((item) => (
            item?.result_role === 'he_result' &&
            item?.receiver_id === transaction.buyer_address
          )) || null;

          if (
            buyerResultToken &&
            !buyerResultToken.download_token &&
            String(firstDefined(attemptData.status, record.pcp_status, '')).toUpperCase() === 'PAM_PASSED'
          ) {
            try {
              const resendResp = await client.post('/tokens/resend', {
                contract_id: record.pcp_contract_id,
                attempt_id: firstDefined(attemptData.attempt_id, record.current_attempt_id),
                receiver_id: transaction.buyer_address,
                result_role: 'he_result'
              });
              const resendData = resendResp?.data?.data || {};
              buyerResultToken = {
                ...buyerResultToken,
                download_token: firstDefined(
                  resendData.download_token,
                  buyerResultToken.download_token,
                  null
                )
              };
            } catch (error) {
              // Keep best-effort status sync even if token resend fails.
            }
          }

          record = await upsertHeRecord(
            mergeHeRecordInput(record, {
              transactionId,
              businessContractId: digitalContract.contract_id,
              buyerId: transaction.buyer_address,
              sellerId: transaction.seller_address,
              currentAttemptId: firstDefined(attemptData.attempt_id, record.current_attempt_id),
              pcpContractId: record.pcp_contract_id,
              pcpStatus: firstDefined(attemptData.status, record.pcp_status),
              downloadToken: firstDefined(
                buyerResultToken?.download_token,
                record.download_token
              ),
              resultFilename: firstDefined(
                buyerResultToken?.filename,
                record.result_filename
              ),
              resultStoragePath: firstDefined(
                buyerResultToken?.result_uri,
                record.result_storage_path
              ),
              lastError: firstDefined(attemptData.last_error, record.last_error)
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
      const fileBuffer = await fsp.readFile(resolvedPath);
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
        current_attempt_id: null,
        pcp_contract_id: null,
        buyer_id: buyerId,
        seller_id: sellerId,
        buyer_public_key: null,
        buyer_public_key_ready: false,
        seller_source_public_key: null,
        seller_source_public_key_ready: false,
        reencryption_key_ready: false,
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
      current_attempt_id: mapped.current_attempt_id || null,
      pcp_contract_id: mapped.pcp_contract_id || null,
      buyer_id: mapped.buyer_id || buyerId,
      seller_id: mapped.seller_id || sellerId,
      buyer_public_key: mapped.buyer_public_key || null,
      buyer_public_key_ready: Boolean(mapped.buyer_public_key_ready),
      seller_source_public_key: mapped.seller_source_public_key || null,
      seller_source_public_key_ready: Boolean(mapped.seller_source_public_key_ready),
      reencryption_key_ready: Boolean(mapped.reencryption_key_ready),
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
        current_attempt_id,
        pcp_contract_id,
        buyer_id,
        seller_id,
        buyer_public_key,
        seller_source_public_key,
        reencryption_key,
        pcp_status,
        download_token,
        result_filename,
        result_storage_path,
        last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        business_contract_id = VALUES(business_contract_id),
        current_attempt_id = VALUES(current_attempt_id),
        pcp_contract_id = VALUES(pcp_contract_id),
        buyer_id = VALUES(buyer_id),
        seller_id = VALUES(seller_id),
        buyer_public_key = VALUES(buyer_public_key),
        seller_source_public_key = VALUES(seller_source_public_key),
        reencryption_key = VALUES(reencryption_key),
        pcp_status = VALUES(pcp_status),
        download_token = VALUES(download_token),
        result_filename = VALUES(result_filename),
        result_storage_path = VALUES(result_storage_path),
        last_error = VALUES(last_error)
    `;

    await dbQuery(sql, [
      record.transaction_id,
      record.business_contract_id,
      record.current_attempt_id,
      record.pcp_contract_id,
      record.buyer_id,
      record.seller_id,
      record.buyer_public_key,
      record.seller_source_public_key,
      record.reencryption_key,
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
      currentAttemptId: firstDefined(
        overrides.currentAttemptId,
        baseRecord && baseRecord.current_attempt_id
      ),
      pcpContractId: firstDefined(
        overrides.pcpContractId,
        baseRecord && baseRecord.pcp_contract_id
      ),
      buyerId: firstDefined(overrides.buyerId, baseRecord && baseRecord.buyer_id),
      sellerId: firstDefined(overrides.sellerId, baseRecord && baseRecord.seller_id),
      buyerPublicKey: firstDefined(
        overrides.buyerPublicKey,
        parseJsonField(baseRecord && baseRecord.buyer_public_key)
      ),
      sellerSourcePublicKey: firstDefined(
        overrides.sellerSourcePublicKey,
        parseJsonField(baseRecord && baseRecord.seller_source_public_key)
      ),
      reencryptionKey: firstDefined(
        overrides.reencryptionKey,
        parseJsonField(baseRecord && baseRecord.reencryption_key)
      ),
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
      baseUrl: getPcpPreBaseUrl()
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
        pcpStatus: firstDefined(contractResp?.data?.data?.status, 'ACTIVE'),
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

  async function submitPreAttempt({
    record,
    transaction,
    digitalContract,
    sourceCipherZipFile
  }) {
    const mappedRecord = mapPreRecordRow(record);

    if (!mappedRecord?.buyer_public_key) {
      const error = new Error('买方尚未上传 PRE 公钥');
      error.statusCode = 400;
      throw error;
    }

    if (!mappedRecord?.seller_source_public_key) {
      const error = new Error('卖方尚未提供 PRE source public key');
      error.statusCode = 400;
      throw error;
    }

    if (!mappedRecord?.reencryption_key) {
      const error = new Error('卖方尚未提供 PRE reencryption key');
      error.statusCode = 400;
      throw error;
    }

    validatePreSourceArchive(sourceCipherZipFile);

    const client = createPcpClient({
      baseUrl: getPcpPreBaseUrl()
    });
    const form = new FormData();
    form.append('metadata', JSON.stringify(buildPreAttemptMetadata({
      contractId: record.pcp_contract_id,
      sourcePublicKey: mappedRecord.seller_source_public_key,
      targetPublicKey: mappedRecord.buyer_public_key,
      reencryptionKey: mappedRecord.reencryption_key
    })));
    form.append('source_cipher_zip', sourceCipherZipFile.buffer, {
      filename: sourceCipherZipFile.originalname || 'source.zip',
      contentType: sourceCipherZipFile.mimetype || 'application/zip'
    });

    const attemptResp = await client.post(
      `/pre/${encodeURIComponent(record.pcp_contract_id)}/attempts`,
      form,
      { headers: form.getHeaders() }
    );
    const attemptData = attemptResp?.data?.data || {};
    const resultMetadata = extractPreResultMetadata(attemptResp?.data);
    const saved = await upsertPreRecord(
      mergePreRecordInput(record, {
        transactionId: record.transaction_id,
        businessContractId: digitalContract.contract_id,
        currentAttemptId: firstDefined(attemptData.attempt_id, record.current_attempt_id),
        pcpContractId: record.pcp_contract_id,
        buyerId: transaction.buyer_address,
        sellerId: transaction.seller_address,
        pcpStatus: firstDefined(attemptData.status, 'QUEUED'),
        lastError: null,
        ...withPreResultMetadata(resultMetadata)
      })
    );

    return {
      saved,
      attemptResp
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

      if (record?.pcp_contract_id && record?.current_attempt_id) {
        try {
          const client = createPcpClient({
            baseUrl: getPcpPreBaseUrl(),
          });
          const attemptResp = await client.get(
            `/pre/${encodeURIComponent(record.pcp_contract_id)}/attempts/${encodeURIComponent(record.current_attempt_id)}/status`
          );
          const attemptData = attemptResp?.data?.data || attemptResp?.data || {};
          const resultTokens = Array.isArray(attemptData?.result_tokens)
            ? attemptData.result_tokens
            : [];
          let buyerResultToken = resultTokens.find((item) => (
            item?.result_role === 'pre_result' &&
            item?.receiver_id === transaction.buyer_address
          )) || null;

          if (
            buyerResultToken &&
            !buyerResultToken.download_token &&
            String(firstDefined(attemptData.status, record.pcp_status, '')).toUpperCase() === 'PAM_PASSED'
          ) {
            try {
              const resendResp = await client.post('/tokens/resend', {
                contract_id: record.pcp_contract_id,
                attempt_id: firstDefined(attemptData.attempt_id, record.current_attempt_id),
                receiver_id: transaction.buyer_address,
                result_role: 'pre_result'
              });
              const resendData = resendResp?.data?.data || {};
              buyerResultToken = {
                ...buyerResultToken,
                download_token: firstDefined(
                  resendData.download_token,
                  buyerResultToken.download_token,
                  null
                )
              };
            } catch (error) {
              // Best-effort token recovery.
            }
          }

          record = await upsertPreRecord(
            mergePreRecordInput(record, {
              transactionId,
              businessContractId: digitalContract.contract_id,
              buyerId: transaction.buyer_address,
              sellerId: transaction.seller_address,
              currentAttemptId: firstDefined(attemptData.attempt_id, record.current_attempt_id),
              pcpContractId: record.pcp_contract_id,
              pcpStatus: firstDefined(attemptData.status, record.pcp_status),
              downloadToken: firstDefined(
                buyerResultToken?.download_token,
                record.download_token
              ),
              resultFilename: firstDefined(
                buyerResultToken?.filename,
                record.result_filename
              ),
              resultStoragePath: firstDefined(
                buyerResultToken?.result_uri,
                record.result_storage_path
              ),
              lastError: firstDefined(attemptData.last_error, record.last_error)
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
    return res.status(410).json({
      success: false,
      code: 'PRE_TEE_MATERIALS_DEPRECATED',
      message: 'PRE 已切换为 attempt 流程，不再需要 tee-materials，请升级前端提交流程'
    });
  });

  app.post('/api/privacy/pre/buyer-public-key', async (req, res) => {
    const transactionId = String(req.body.transactionId || '').trim();
    const buyerPublicKey = parseJsonField(
      firstDefined(req.body.buyerPublicKey, req.body.buyer_public_key)
    );

    if (!transactionId || !buyerPublicKey) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId / buyerPublicKey'
      });
    }

    try {
      validatePreJsonPayload(buyerPublicKey, 'buyerPublicKey');
      const ensured = await ensurePreContract({ transactionId });
      const saved = await upsertPreRecord(
        mergePreRecordInput(ensured.record, {
          transactionId,
          businessContractId: ensured.digitalContract.contract_id,
          pcpContractId: ensured.record.pcp_contract_id,
          buyerId: ensured.transaction.buyer_address,
          sellerId: ensured.transaction.seller_address,
          buyerPublicKey,
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
      { name: 'source_cipher_zip', maxCount: 1 },
      { name: 'source_archive', maxCount: 1 },
      { name: 'file', maxCount: 1 }
    ]),
    async (req, res) => {
      const transactionId = String(req.body.transactionId || '').trim();
      let sellerSourcePublicKey = parseJsonField(
        firstDefined(req.body.sellerSourcePublicKey, req.body.sourcePublicKey, req.body.source_public_key)
      );
      let reencryptionKey = parseJsonField(
        firstDefined(req.body.reencryptionKey, req.body.reencryption_key)
      );
      let sourceCipherZipFile =
        req.files?.source_cipher_zip?.[0] ||
        null;
      const sourceArchiveFile =
        req.files?.source_archive?.[0] ||
        req.files?.file?.[0] ||
        null;

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
        const mappedRecord = mapPreRecordRow(existing);

        if (!mappedRecord?.buyer_public_key) {
          return res.status(400).json({
            success: false,
            message: '买方尚未提交 PRE 公钥'
          });
        }

        if (!sourceCipherZipFile && sourceArchiveFile) {
          validatePreSourceArchive(sourceArchiveFile);
          const helperResult = await runPrePublishHelper({
            transactionId,
            buyerPublicKey: mappedRecord.buyer_public_key,
            sourceArchiveBuffer: sourceArchiveFile.buffer
          });
          sellerSourcePublicKey = helperResult.sourcePublicKey;
          reencryptionKey = helperResult.reencryptionKey;
          sourceCipherZipFile = {
            ...sourceArchiveFile,
            buffer: helperResult.sourceCipherZipBuffer,
            originalname: `pre_source_${transactionId}.zip`,
            mimetype: 'application/zip'
          };
        }

        if (!sellerSourcePublicKey || !reencryptionKey || !sourceCipherZipFile) {
          return res.status(400).json({
            success: false,
            message: '缺少 PRE 发布所需材料'
          });
        }

        validatePreJsonPayload(sellerSourcePublicKey, 'sellerSourcePublicKey');
        validatePreJsonPayload(reencryptionKey, 'reencryptionKey');

        const saved = await upsertPreRecord(
          mergePreRecordInput(existing, {
            transactionId,
            businessContractId: ensured.digitalContract.contract_id,
            pcpContractId: existing.pcp_contract_id,
            buyerId: ensured.transaction.buyer_address,
            sellerId: ensured.transaction.seller_address,
            sellerSourcePublicKey,
            reencryptionKey,
            lastError: null,
          })
        );

        const submitted = await submitPreAttempt({
          record: saved,
          transaction: ensured.transaction,
          digitalContract: ensured.digitalContract,
          sourceCipherZipFile
        });

        return res.status(200).json({
          success: true,
          message: 'PRE attempt 已提交',
          item: toPreResponseRecord(submitted.saved, {
            transaction_id: transactionId,
            business_contract_id: ensured.digitalContract.contract_id,
            buyer_id: ensured.transaction.buyer_address,
            seller_id: ensured.transaction.seller_address
          }),
          pcp: {
            attempt: submitted.attemptResp?.data || null
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
    }
  );

  app.post('/api/privacy/pre/re-encrypt', async (req, res) => {
    return res.status(410).json({
      success: false,
      code: 'PRE_REENCRYPT_DEPRECATED',
      message: 'PRE 已切换为 publish 即创建 attempt 的流程，不再支持单独 re-encrypt 接口'
    });
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
      try {
        const response = await axios.post(
          `http://127.0.0.1:${process.env.PORT ? Number(process.env.PORT) : 3000}/api/privacy/he/result-notify`,
          req.body
        );
        return res.status(response.status).json(response.data);
      } catch (error) {
        const status = error?.response?.status || 500;
        return res.status(status).json(
          error?.response?.data || {
            success: false,
            message: error.message || 'HE 结果通知转发失败'
          }
        );
      }
    }

    if (resultRole === 'pre_result') {
      try {
        const response = await axios.post(
          `http://127.0.0.1:${process.env.PORT ? Number(process.env.PORT) : 3000}/api/privacy/pre/result-notify`,
          req.body
        );
        return res.status(response.status).json(response.data);
      } catch (error) {
        const status = error?.response?.status || 500;
        return res.status(status).json(
          error?.response?.data || {
            success: false,
            message: error.message || 'PRE 结果通知转发失败'
          }
        );
      }
    }

    if (resultRole && resultRole.startsWith('fl_')) {
      try {
        const response = await axios.post(
          `http://127.0.0.1:${process.env.PORT ? Number(process.env.PORT) : 3000}/api/privacy/fl/result-notify`,
          req.body
        );
        return res.status(response.status).json(response.data);
      } catch (error) {
        const status = error?.response?.status || 500;
        return res.status(status).json(
          error?.response?.data || {
            success: false,
            message: error.message || 'FL 结果通知转发失败'
          }
        );
      }
    }

    return res.status(400).json({
      success: false,
      message: '无法识别 result_role，仅支持 he_result / pre_result / fl_*'
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

  app.post(
    '/api/privacy/pre/decrypt-result',
    upload.fields([
      { name: 'encrypted_result', maxCount: 1 },
      { name: 'private_key_file', maxCount: 1 }
    ]),
    async (req, res) => {
      const transactionId = String(req.body.transactionId || '').trim();
      if (!transactionId) {
        return res.status(400).json({
          success: false,
          message: '缺少 transactionId'
        });
      }

      const encryptedResultFile = req.files?.encrypted_result?.[0] || null;
      const privateKeyFile = req.files?.private_key_file?.[0] || null;
      if (!encryptedResultFile || !privateKeyFile) {
        return res.status(400).json({
          success: false,
          message: '缺少 encrypted_result / private_key_file'
        });
      }

      try {
        await requirePreContext(transactionId);
        const record = mapPreRecordRow(await getPreRecordByTransactionId(transactionId));
        if (!record) {
          return res.status(404).json({
            success: false,
            message: '当前交易暂无 PRE 记录'
          });
        }

        let parsedPrivateKey;
        try {
          parsedPrivateKey = JSON.parse(String(privateKeyFile.buffer || Buffer.alloc(0)));
        } catch (parseError) {
          return res.status(400).json({
            success: false,
            message: 'PRE 私钥文件内容无效'
          });
        }

        const privateScalarHex = String(parsedPrivateKey.privateScalarHex || '').replace(/^0x/i, '').trim();
        if (!/^[0-9a-fA-F]+$/.test(privateScalarHex)) {
          return res.status(400).json({
            success: false,
            message: 'PRE 私钥文件内容无效'
          });
        }

        if (
          parsedPrivateKey.transactionId &&
          String(parsedPrivateKey.transactionId).trim() &&
          String(parsedPrivateKey.transactionId).trim() !== transactionId
        ) {
          return res.status(400).json({
            success: false,
            message: `PRE 私钥文件不属于当前交易 ${transactionId}`
          });
        }

        if (record.buyer_public_key && parsedPrivateKey.publicKey) {
          const expected = record.buyer_public_key;
          const actual = parsedPrivateKey.publicKey;
          if (
            String(expected.key_id || '') !== String(actual.key_id || '') ||
            String(expected.point_g1 || '') !== String(actual.point_g1 || '') ||
            String(expected.point_g2 || '') !== String(actual.point_g2 || '')
          ) {
            return res.status(400).json({
              success: false,
              message: 'PRE 私钥文件与当前交易的买方公钥不匹配，请重新选择最新下载的私钥文件。'
            });
          }
        }

        const result = await runPreDecryptHelper({
          encryptedZipBuffer: encryptedResultFile.buffer,
          privateScalarHex
        });

        const outputName = `pre-result-${safeBaseName(transactionId) || 'result'}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
        res.setHeader('x-pre-transaction-id', transactionId);
        res.setHeader('x-pre-entry-count', String(result.entryCount || 0));
        return res.status(200).send(result.zipBuffer);
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
}

module.exports = {
  registerHeRoutes,
  registerPreRoutes
};
