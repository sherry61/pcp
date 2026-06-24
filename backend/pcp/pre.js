const { PRE_ALLOWED_SOURCE_EXTENSIONS } = require('./constants');

function requireNonEmpty(value, fieldName) {
  if (value == null || value === '') {
    throw new Error(`${fieldName} is required`);
  }

  return String(value);
}

function serializeJsonOrNull(value) {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
}

function buildPreContractPayload({ transaction, businessContractId }) {
  if (!transaction) {
    throw new Error('transaction is required');
  }

  const buyerId = requireNonEmpty(transaction.buyer_address, 'buyer_address');
  const sellerId = requireNonEmpty(transaction.seller_address, 'seller_address');
  const sourceContractId = requireNonEmpty(businessContractId, 'businessContractId');

  return {
    idempotency_key: `${sourceContractId}-pre-afgh`,
    buyer_id: buyerId,
    source_contract_id: sourceContractId,
    seller_ids: [sellerId],
    pre_scheme: 'AFGH_PRE',
    pre_params: {
      curve: 'bn254',
      cipher_format: 'scheme-native'
    }
  };
}

function buildPreAttemptMetadata({
  contractId,
  targetPublicKey,
  reencryptionKey,
  sourcePublicKey
}) {
  requireNonEmpty(contractId, 'contractId');

  if (!targetPublicKey || typeof targetPublicKey !== 'object') {
    throw new Error('targetPublicKey is required');
  }

  if (!reencryptionKey || typeof reencryptionKey !== 'object') {
    throw new Error('reencryptionKey is required');
  }

  if (!sourcePublicKey || typeof sourcePublicKey !== 'object') {
    throw new Error('sourcePublicKey is required');
  }

  return {
    idempotency_key: `${contractId}-attempt-${Date.now()}`,
    source_public_key: sourcePublicKey,
    target_public_key: targetPublicKey,
    reencryption_key: reencryptionKey
  };
}

function normalizePreRecord(input = {}) {
  return {
    transaction_id: requireNonEmpty(input.transactionId, 'transactionId'),
    business_contract_id: requireNonEmpty(
      input.businessContractId,
      'businessContractId'
    ),
    current_attempt_id: input.currentAttemptId ? String(input.currentAttemptId) : null,
    pcp_contract_id: input.pcpContractId ? String(input.pcpContractId) : null,
    buyer_id: requireNonEmpty(input.buyerId, 'buyerId'),
    seller_id: requireNonEmpty(input.sellerId, 'sellerId'),
    buyer_public_key: input.buyerPublicKey ? serializeJsonOrNull(input.buyerPublicKey) : null,
    seller_source_public_key: input.sellerSourcePublicKey ? serializeJsonOrNull(input.sellerSourcePublicKey) : null,
    reencryption_key: input.reencryptionKey ? serializeJsonOrNull(input.reencryptionKey) : null,
    pcp_status: input.pcpStatus ? String(input.pcpStatus) : 'CREATED',
    download_token: input.downloadToken ? String(input.downloadToken) : null,
    result_filename: input.resultFilename ? String(input.resultFilename) : null,
    result_storage_path: input.resultStoragePath ? String(input.resultStoragePath) : null,
    last_error: input.lastError ? String(input.lastError) : null
  };
}

function normalizePreResultSyncPayload(input = {}) {
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

function mapPreRecordRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    current_attempt_id: row.current_attempt_id || null,
    buyer_public_key: row.buyer_public_key ? JSON.parse(row.buyer_public_key) : null,
    seller_source_public_key: row.seller_source_public_key ? JSON.parse(row.seller_source_public_key) : null,
    reencryption_key: row.reencryption_key ? JSON.parse(row.reencryption_key) : null,
    buyer_public_key_ready: Boolean(row.buyer_public_key),
    seller_source_public_key_ready: Boolean(row.seller_source_public_key),
    reencryption_key_ready: Boolean(row.reencryption_key),
    result_ready: Boolean(row.download_token || row.result_storage_path)
  };
}

function extractPreResultMetadata(payload) {
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

function withLowerCase(value) {
  return String(value || '').trim().toLowerCase();
}

function isAllowedPreSourceArchiveName(filename) {
  const normalized = withLowerCase(filename);
  return PRE_ALLOWED_SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function validatePreSourceArchive(file) {
  if (!file || !file.originalname) {
    throw new Error('原始压缩包不能为空');
  }

  if (!isAllowedPreSourceArchiveName(file.originalname)) {
    throw new Error(`仅支持 ${PRE_ALLOWED_SOURCE_EXTENSIONS.join(', ')} 压缩包`);
  }
}

function validatePreJsonPayload(value, fieldName) {
  if (!value || typeof value !== 'object') {
    throw new Error(`${fieldName} must be a JSON object`);
  }
  return value;
}

function normalizePreMetaFile(meta) {
  if (!meta) {
    return null;
  }

  if (typeof meta === 'object') {
    return meta;
  }

  try {
    return JSON.parse(String(meta));
  } catch (error) {
    return null;
  }
}

function buildPrePublishPayloadSummary({ keyPackage, metaFile }) {
  const meta = normalizePreMetaFile(metaFile);
  return {
    keyPackageHexLength: String(keyPackage || '').length,
    meta: serializeJsonOrNull(meta)
  };
}

module.exports = {
  buildPreContractPayload,
  buildPreAttemptMetadata,
  normalizePreRecord,
  normalizePreResultSyncPayload,
  mapPreRecordRow,
  extractPreResultMetadata,
  validatePreSourceArchive,
  validatePreJsonPayload,
  buildPrePublishPayloadSummary,
  isAllowedPreSourceArchiveName
};
