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
  const heComputeMode = resolveHeComputeMode(encType, operation);

  if (!HE_ENC_TYPES.includes(encType)) {
    throw new Error(`encType must be one of: ${HE_ENC_TYPES.join(', ')}`);
  }

  return {
    idempotency_key: `${sourceContractId}-he-${heComputeMode}`,
    buyer_id: buyerId,
    source_contract_id: sourceContractId,
    seller_ids: buildHeLogicalSellerIds(sellerId),
    he_compute_mode: heComputeMode,
    csv_format: 'SINGLE_CIPHER_COLUMN'
  };
}

function resolveHeComputeMode(encType, operation) {
  const normalizedEncType = requireNonEmpty(encType, 'encType');
  const normalizedOperation = requireNonEmpty(operation, 'operation').toUpperCase();

  if (!HE_ENC_TYPES.includes(normalizedEncType)) {
    throw new Error(`encType must be one of: ${HE_ENC_TYPES.join(', ')}`);
  }

  if (!HE_OPERATIONS.includes(normalizedOperation)) {
    throw new Error(`operation must be one of: ${HE_OPERATIONS.join(', ')}`);
  }

  if (normalizedEncType === 'Paillier' && normalizedOperation === 'ADD') {
    return 'PAILLIER_ADD';
  }

  if (normalizedEncType === 'ElGamal' && normalizedOperation === 'MUL') {
    return 'ELGAMAL_MUL';
  }

  throw new Error(`PCC 当前不支持 ${normalizedEncType} + ${normalizedOperation}`);
}

function buildHeLogicalSellerIds(sellerId) {
  const normalizedSellerId = requireNonEmpty(sellerId, 'sellerId');
  return [
    `${normalizedSellerId}#file1`,
    `${normalizedSellerId}#file2`
  ];
}

function buildHeAttemptMetadata({
  contractId,
  sellerId,
  publicKey
}) {
  requireNonEmpty(contractId, 'contractId');
  const logicalSellerIds = buildHeLogicalSellerIds(sellerId);

  if (!publicKey || typeof publicKey !== 'object') {
    throw new Error('publicKey is required');
  }

  return {
    idempotency_key: `${contractId}-attempt-${Date.now()}`,
    public_key: publicKey,
    seller_files: [
      {
        seller_id: logicalSellerIds[0],
        file_field: 'file1'
      },
      {
        seller_id: logicalSellerIds[1],
        file_field: 'file2'
      }
    ]
  };
}

function buildPcpHePublicKey(encType, publicKey) {
  if (encType === 'Paillier') {
    const n = publicKey && publicKey.n ? String(publicKey.n) : '';
    if (!n) {
      throw new Error('Paillier 公钥缺少 n');
    }

    return {
      schema_version: 'pcc-he-public-key-v1',
      key_id: `he-key-${Date.now()}`,
      algorithm: 'PAILLIER',
      params: {
        n: encodeBase64UrlBigInt(n)
      }
    };
  }

  if (encType === 'ElGamal') {
    const p = publicKey && publicKey.p ? String(publicKey.p) : '';
    const q = publicKey && publicKey.q
      ? String(publicKey.q)
      : (p ? (BigInt(p) - 1n).toString() : '');
    const g = publicKey && publicKey.g ? String(publicKey.g) : '';
    const y = publicKey && publicKey.y ? String(publicKey.y) : '';

    if (!p || !q || !g || !y) {
      throw new Error('ElGamal 公钥缺少 p/q/g/y');
    }

    return {
      schema_version: 'pcc-he-public-key-v1',
      key_id: `he-key-${Date.now()}`,
      algorithm: 'ELGAMAL',
      params: {
        p: encodeBase64UrlBigInt(p),
        q: encodeBase64UrlBigInt(q),
        g: encodeBase64UrlBigInt(g),
        y: encodeBase64UrlBigInt(y)
      }
    };
  }

  throw new Error(`当前尚未适配 ${encType} 的 PCC 公钥格式`);
}

function encodeBase64UrlBigInt(value, width) {
  const bigint = BigInt(String(value));
  if (bigint < 0n) {
    throw new Error('公钥参数必须是非负整数');
  }

  const hex = bigint.toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : `0${hex}`;
  const rawBuffer = Buffer.from(paddedHex, 'hex');
  const buffer = width == null
    ? rawBuffer
    : leftPadBuffer(rawBuffer, width);
  return buffer.toString('base64url');
}

function leftPadBuffer(buffer, width) {
  if (buffer.length > width) {
    throw new Error('公钥参数长度超过固定宽度');
  }

  if (buffer.length === width) {
    return buffer;
  }

  const output = Buffer.alloc(width);
  buffer.copy(output, width - buffer.length);
  return output;
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
  if (headers.length !== 1 || headers[0] !== 'cipher') {
    throw new Error(`${encType} CSV 必须且只能包含 cipher 列`);
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
    current_attempt_id: input.currentAttemptId ? String(input.currentAttemptId) : null,
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
    current_attempt_id: row.current_attempt_id || null,
    paillier_public_key: parseJsonOrNull(row.paillier_public_key_json),
    elgamal_public_key: parseJsonOrNull(row.elgamal_public_key_json),
    public_keys_ready:
      Boolean(parseJsonOrNull(row.paillier_public_key_json)) &&
      Boolean(parseJsonOrNull(row.elgamal_public_key_json))
  };
}

module.exports = {
  buildHeContractPayload,
  buildHeAttemptMetadata,
  buildPcpHePublicKey,
  buildHeLogicalSellerIds,
  resolveHeComputeMode,
  normalizeHeRecord,
  normalizeHeResultSyncPayload,
  mapHeRecordRow,
  ensureCompatibleExistingHeContract,
  validateHeCsvFile,
  extractHeResultMetadata
};
