const { PCP_FL_RESULT_ROLES } = require('./constants');

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

function parseJsonOrNull(value, fallback = null) {
  if (value == null || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function validateHexString(value, fieldName) {
  const normalized = requireNonEmpty(value, fieldName).trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${fieldName} must be an even-length hex string`);
  }
  return normalized;
}

function pemHexToPemText(value, fieldName) {
  const normalized = validateHexString(value, fieldName);
  return Buffer.from(normalized, 'hex').toString('utf8');
}

function buildRsaPublicKeyObjectFromPemHex(value, keyIdPrefix) {
  const publicKeyPem = pemHexToPemText(value, `${keyIdPrefix}PublicKey`);
  return {
    key_id: `${keyIdPrefix}-${Date.now()}`,
    algorithm: 'RSA-OAEP-SHA256',
    public_key_pem: publicKeyPem
  };
}

function normalizeSellerIds(value, fallbackSellerId = null) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallbackSellerId ? [String(fallbackSellerId).trim()].filter(Boolean) : [];
    }

    if (trimmed.startsWith('[')) {
      const parsed = parseJsonOrNull(trimmed, []);
      if (Array.isArray(parsed)) {
        return normalizeSellerIds(parsed);
      }
    }

    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (fallbackSellerId) {
    return [String(fallbackSellerId).trim()].filter(Boolean);
  }

  return [];
}

function normalizeNumberOrDefault(value, defaultValue, parser = Number) {
  if (value == null || value === '') {
    return defaultValue;
  }

  const parsed = parser(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function normalizeIntegerOrDefault(value, defaultValue) {
  return normalizeNumberOrDefault(value, defaultValue, (input) => parseInt(input, 10));
}

function normalizeFlLossFunction(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return 'cross_entropy';
  }
  if (normalized === 'cross_entropy' || normalized === 'crossentropy') {
    return 'cross_entropy';
  }
  if (
    normalized === 'mse' ||
    normalized === 'mean_squared_error' ||
    normalized === 'meansquarederror'
  ) {
    return 'mse';
  }
  return normalized;
}

function buildFlContractPayload({
  transaction,
  businessContractId,
  sellerIds,
  buyerResultPublicKey,
  maxEpochs,
  learningRate,
  batchSize,
  lossFunction,
  dpNoiseScale,
  dpClippingThreshold
}) {
  if (!transaction) {
    throw new Error('transaction is required');
  }

  const buyerId = requireNonEmpty(transaction.buyer_address, 'buyer_address');
  const normalizedSellerIds = normalizeSellerIds(
    sellerIds,
    transaction.seller_address
  );

  if (!normalizedSellerIds.length) {
    throw new Error('sellerIds must not be empty');
  }

  if (normalizedSellerIds.includes(buyerId)) {
    throw new Error('sellerIds must not contain buyer_id');
  }

  return {
    idempotency_key: `fl-contract-${requireNonEmpty(businessContractId, 'businessContractId')}-${Date.now()}`,
    buyer_id: buyerId,
    source_contract_id: requireNonEmpty(businessContractId, 'businessContractId'),
    seller_ids: normalizedSellerIds,
    training_params: {
      max_epochs: normalizeIntegerOrDefault(maxEpochs, 10),
      learning_rate: normalizeNumberOrDefault(learningRate, 0.001),
      batch_size: normalizeIntegerOrDefault(batchSize, 32),
      loss_function: normalizeFlLossFunction(lossFunction),
      optimizer: 'sgd',
      dp_noise_scale: normalizeNumberOrDefault(dpNoiseScale, 0),
      dp_clipping_threshold: normalizeNumberOrDefault(dpClippingThreshold, 1)
    },
    buyer_result_public_key: buildRsaPublicKeyObjectFromPemHex(
      buyerResultPublicKey,
      'buyer-result-key'
    )
  };
}

function normalizeFlRecord(input = {}) {
  return {
    transaction_id: requireNonEmpty(input.transactionId, 'transactionId'),
    business_contract_id: requireNonEmpty(
      input.businessContractId,
      'businessContractId'
    ),
    pcp_contract_id: input.pcpContractId ? String(input.pcpContractId) : null,
    buyer_id: requireNonEmpty(input.buyerId, 'buyerId'),
    seller_ids_json: serializeJsonOrNull(normalizeSellerIds(input.sellerIds)),
    buyer_result_public_key: input.buyerResultPublicKey
      ? String(input.buyerResultPublicKey)
      : null,
    max_epochs: normalizeIntegerOrDefault(input.maxEpochs, 10),
    learning_rate: normalizeNumberOrDefault(input.learningRate, 0.001),
    batch_size: normalizeIntegerOrDefault(input.batchSize, 32),
    loss_function: normalizeFlLossFunction(input.lossFunction),
    dp_noise_scale: normalizeNumberOrDefault(input.dpNoiseScale, 0),
    dp_clipping_threshold: normalizeNumberOrDefault(input.dpClippingThreshold, 1),
    pcp_status: input.pcpStatus ? String(input.pcpStatus) : 'CREATED',
    current_epoch: normalizeIntegerOrDefault(input.currentEpoch, 0),
    buyer_download_token: input.buyerDownloadToken
      ? String(input.buyerDownloadToken)
      : null,
    buyer_result_filename: input.buyerResultFilename
      ? String(input.buyerResultFilename)
      : null,
    buyer_result_storage_path: input.buyerResultStoragePath
      ? String(input.buyerResultStoragePath)
      : null,
    seller_join_packages_json: serializeJsonOrNull(input.sellerJoinPackages || {}),
    seller_result_packages_json: serializeJsonOrNull(input.sellerResultPackages || {}),
    last_error: input.lastError ? String(input.lastError) : null
  };
}

function mapFlRecordRow(row) {
  if (!row) {
    return null;
  }

  const sellerIds = parseJsonOrNull(row.seller_ids_json, []);
  const sellerJoinPackages = parseJsonOrNull(row.seller_join_packages_json, {});
  const sellerResultPackages = parseJsonOrNull(row.seller_result_packages_json, {});

  return {
    ...row,
    seller_ids: Array.isArray(sellerIds) ? sellerIds : [],
    seller_join_packages: sellerJoinPackages && typeof sellerJoinPackages === 'object'
      ? sellerJoinPackages
      : {},
    seller_result_packages: sellerResultPackages && typeof sellerResultPackages === 'object'
      ? sellerResultPackages
      : {},
    buyer_result_ready: Boolean(row.buyer_download_token || row.buyer_result_storage_path)
  };
}

function extractFlResultMetadata(payload) {
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

function normalizeFlResultSyncPayload(input = {}) {
  const transactionId = input.transactionId ? String(input.transactionId) : null;
  const pcpContractId = input.pcpContractId
    ? String(input.pcpContractId)
    : (input.contractId ? String(input.contractId) : null);

  if (!transactionId && !pcpContractId) {
    throw new Error('transactionId or pcpContractId is required');
  }

  const resultRole = input.resultRole ? String(input.resultRole) : null;
  if (resultRole && !PCP_FL_RESULT_ROLES.includes(resultRole)) {
    throw new Error(`resultRole must be one of: ${PCP_FL_RESULT_ROLES.join(', ')}`);
  }

  return {
    transactionId,
    pcpContractId,
    pcpStatus: input.pcpStatus
      ? String(input.pcpStatus)
      : (input.status ? String(input.status) : null),
    currentEpoch: input.currentEpoch != null
      ? normalizeIntegerOrDefault(input.currentEpoch, 0)
      : (input.current_epoch != null
        ? normalizeIntegerOrDefault(input.current_epoch, 0)
        : null),
    receiverId: input.receiverId ? String(input.receiverId) : null,
    resultRole,
    batchIndex: input.batchIndex != null
      ? normalizeIntegerOrDefault(input.batchIndex, 0)
      : null,
    downloadToken: input.downloadToken ? String(input.downloadToken) : null,
    resultFilename: input.resultFilename ? String(input.resultFilename) : null,
    resultStoragePath: input.resultStoragePath
      ? String(input.resultStoragePath)
      : (input.resultUri ? String(input.resultUri) : null),
    lastError: input.lastError ? String(input.lastError) : null
  };
}

function buildFlSellerResultKey({ sellerId, resultRole, batchIndex }) {
  const normalizedSellerId = requireNonEmpty(sellerId, 'sellerId');
  const normalizedResultRole = requireNonEmpty(resultRole, 'resultRole');
  const normalizedBatchIndex =
    batchIndex == null ? 'na' : String(normalizeIntegerOrDefault(batchIndex, 0));

  return `${normalizedSellerId}::${normalizedResultRole}::${normalizedBatchIndex}`;
}

module.exports = {
  buildFlContractPayload,
  normalizeFlRecord,
  mapFlRecordRow,
  extractFlResultMetadata,
  normalizeFlResultSyncPayload,
  normalizeSellerIds,
  validateHexString,
  buildFlSellerResultKey,
  pemHexToPemText,
  buildRsaPublicKeyObjectFromPemHex
};
