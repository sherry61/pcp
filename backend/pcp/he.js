const { HE_ENC_TYPES, HE_OPERATIONS } = require('./constants');

function requireNonEmpty(value, fieldName) {
  if (value == null || value === '') {
    throw new Error(`${fieldName} is required`);
  }

  return String(value);
}

function buildHeContractPayload({
  transaction,
  businessContractId,
  encType,
  operation
}) {
  if (!transaction) {
    throw new Error('transaction is required');
  }

  const buyerId = requireNonEmpty(transaction.buyer_address, 'buyer_address');
  const sellerId = requireNonEmpty(transaction.seller_address, 'seller_address');
  const sourceContractId = requireNonEmpty(businessContractId, 'businessContractId');
  const normalizedOperation = requireNonEmpty(operation, 'operation').toUpperCase();

  if (!HE_ENC_TYPES.includes(encType)) {
    throw new Error(`encType must be one of: ${HE_ENC_TYPES.join(', ')}`);
  }

  if (!HE_OPERATIONS.includes(normalizedOperation)) {
    throw new Error(`operation must be one of: ${HE_OPERATIONS.join(', ')}`);
  }

  return {
    buyer_id: buyerId,
    source_contract_id: sourceContractId,
    seller_ids: [sellerId],
    operation_type: normalizedOperation,
    enc_type: encType,
    data_type_1: 'ciphertext',
    data_type_2: 'ciphertext'
  };
}

function serializeJsonOrNull(value) {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
}

function parseJsonOrNull(value) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function ensureCompatibleExistingHeContract(record, encType, operation) {
  if (!record || !record.pcp_contract_id) {
    return;
  }

  if (record.selected_enc_type && record.selected_enc_type !== encType) {
    throw new Error('已存在的 HE 合同与当前 encType 不一致');
  }

  if (record.selected_operation && record.selected_operation !== operation) {
    throw new Error('已存在的 HE 合同与当前 operation 不一致');
  }
}

function validateHeCsvFile(encType, file) {
  if (!file || !file.buffer) {
    throw new Error('CSV 文件不能为空');
  }

  const content = String(file.buffer).trim();
  if (!content) {
    throw new Error('CSV 文件不能为空');
  }

  const firstNonEmptyLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstNonEmptyLine) {
    throw new Error('CSV 文件不能为空');
  }

  const headers = firstNonEmptyLine.split(',').map((part) => part.trim());

  if (encType === 'ElGamal') {
    if (!headers.includes('c1') || !headers.includes('c2')) {
      throw new Error('ElGamal CSV 必须包含 c1,c2 列');
    }
    return;
  }

  if (!headers[0]) {
    throw new Error('Paillier CSV 至少需要一列密文数据');
  }
}

function extractHeResultMetadata(payload) {
  const result = payload?.result || payload?.data?.result || null;
  if (!result || typeof result !== 'object') {
    return {
      downloadToken: null,
      resultFilename: null,
      resultStoragePath: null
    };
  }

  return {
    downloadToken: result.download_token || null,
    resultFilename: result.filename || null,
    resultStoragePath: result.result_uri || null
  };
}

function normalizeHeResultSyncPayload(input = {}) {
  const transactionId = input.transactionId ? String(input.transactionId) : null;
  const pcpContractId = input.pcpContractId
    ? String(input.pcpContractId)
    : (input.contractId ? String(input.contractId) : null);

  if (!transactionId && !pcpContractId) {
    throw new Error('transactionId or pcpContractId is required');
  }

  return {
    transactionId,
    pcpContractId,
    pcpStatus: input.pcpStatus
      ? String(input.pcpStatus)
      : (input.status ? String(input.status) : null),
    downloadToken: input.downloadToken ? String(input.downloadToken) : null,
    resultFilename: input.resultFilename ? String(input.resultFilename) : null,
    resultStoragePath: input.resultStoragePath
      ? String(input.resultStoragePath)
      : (input.resultUri ? String(input.resultUri) : null),
    lastError: input.lastError ? String(input.lastError) : null
  };
}

function normalizeHeRecord(input = {}) {
  const record = {
    transaction_id: requireNonEmpty(input.transactionId, 'transactionId'),
    business_contract_id: requireNonEmpty(
      input.businessContractId,
      'businessContractId'
    ),
    buyer_id: requireNonEmpty(input.buyerId, 'buyerId'),
    seller_id: requireNonEmpty(input.sellerId, 'sellerId'),
    pcp_contract_id: input.pcpContractId ? String(input.pcpContractId) : null,
    selected_enc_type: input.selectedEncType ? String(input.selectedEncType) : null,
    selected_operation: input.selectedOperation
      ? String(input.selectedOperation).toUpperCase()
      : null,
    paillier_public_key_json: serializeJsonOrNull(input.paillierPublicKey),
    elgamal_public_key_json: serializeJsonOrNull(input.elgamalPublicKey),
    pcp_status: input.pcpStatus ? String(input.pcpStatus) : 'WAITING_INPUT',
    download_token: input.downloadToken ? String(input.downloadToken) : null,
    result_filename: input.resultFilename ? String(input.resultFilename) : null,
    result_storage_path: input.resultStoragePath
      ? String(input.resultStoragePath)
      : null,
    last_error: input.lastError ? String(input.lastError) : null
  };

  return record;
}

function mapHeRecordRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    paillier_public_key: parseJsonOrNull(row.paillier_public_key_json),
    elgamal_public_key: parseJsonOrNull(row.elgamal_public_key_json),
    public_keys_ready:
      Boolean(parseJsonOrNull(row.paillier_public_key_json)) &&
      Boolean(parseJsonOrNull(row.elgamal_public_key_json))
  };
}

module.exports = {
  buildHeContractPayload,
  normalizeHeRecord,
  normalizeHeResultSyncPayload,
  mapHeRecordRow,
  ensureCompatibleExistingHeContract,
  validateHeCsvFile,
  extractHeResultMetadata
};
