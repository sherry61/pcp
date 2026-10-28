'use strict';

const crypto = require('crypto');

const DEFAULT_MODEL_MAX_BYTES = 10 * 1024 * 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function protocolError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function validateModelUpload(file, maxBytes = DEFAULT_MODEL_MAX_BYTES) {
  const limit = Number(maxBytes);
  const size = Number(file?.size ?? file?.buffer?.length ?? 0);
  if (!file?.buffer || !Buffer.isBuffer(file.buffer) || size <= 0 || file.buffer.length !== size) {
    throw protocolError('INVALID_MODEL_FILE', '计算模型不能为空');
  }
  if (!/\.c$/i.test(String(file.originalname || ''))) {
    throw protocolError('INVALID_MODEL_FILE', '计算模型必须为 .c 文件');
  }
  if (!Number.isSafeInteger(limit) || limit <= 0 || size > limit) {
    throw protocolError('MODEL_TOO_LARGE', `计算模型不能超过 ${limit} 字节`);
  }
  return { size };
}

function assertSm4KeyAndIv(key, iv) {
  if (!Buffer.isBuffer(key) || key.length !== 16) {
    throw protocolError('INVALID_SM4_KEY', 'SM4 密钥长度必须为 16 字节', 500);
  }
  if (!Buffer.isBuffer(iv) || iv.length !== 16) {
    throw protocolError('INVALID_SM4_IV', 'SM4 IV 长度必须为 16 字节', 500);
  }
}

function encryptSm4NoPadding(plain, key, iv) {
  assertSm4KeyAndIv(key, iv);
  const paddedLength = Math.ceil(plain.length / 16) * 16;
  const padded = Buffer.alloc(paddedLength);
  plain.copy(padded);
  try {
    const cipher = crypto.createCipheriv('sm4-cbc', key, iv);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(padded), cipher.final()]);
  } finally {
    padded.fill(0);
  }
}

function encryptModelPayload({ vmId, model, key, iv = crypto.randomBytes(16) }) {
  if (!Buffer.isBuffer(model) || model.length <= 0) {
    throw protocolError('INVALID_MODEL_FILE', '计算模型不能为空');
  }
  const ciphertext = encryptSm4NoPadding(model, key, iv);
  return {
    vmId: String(vmId),
    fileType: 'model',
    name: 'model.c',
    plainSize: model.length,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function formatUtcSeconds(value) {
  if (value == null || value === '') {
    throw protocolError('CONTRACT_INCOMPLETE', 'TEE 数字合约缺少创建时间', 409);
  }
  let normalized = value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    normalized = value.replace(' ', 'T');
  }
  const date = value instanceof Date ? value : new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    throw protocolError('CONTRACT_INCOMPLETE', 'TEE 数字合约创建时间无效', 409);
  }
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildFormalContractDocument(contract) {
  const hash = String(contract?.model_file_hash || '').trim().toLowerCase();
  const limit = Number(contract?.delivery_limit);
  if (!SHA256_HEX.test(hash)) {
    throw protocolError('CONTRACT_INCOMPLETE', 'TEE 数字合约缺少有效的模型哈希', 409);
  }
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw protocolError('CONTRACT_INCOMPLETE', 'TEE 数字合约缺少有效的约定交付次数', 409);
  }
  const timestamp = formatUtcSeconds(contract?.created_at);
  const { id: ignoredId, ...formalFields } = contract || {};
  return {
    ...formalFields,
    model_file_hash: hash,
    delivery_limit: limit,
    fileHash: hash,
    timestamp,
    delivery_cnt: String(limit)
  };
}

function encryptSm4Pkcs7(value, key, iv) {
  assertSm4KeyAndIv(key, iv);
  const plain = Buffer.from(String(value), 'utf8');
  try {
    const cipher = crypto.createCipheriv('sm4-cbc', key, iv);
    return Buffer.concat([cipher.update(plain), cipher.final()]);
  } finally {
    plain.fill(0);
  }
}

function buildEncryptedContractPayload({ vmId, contract, successfulDeliveries, key, iv = crypto.randomBytes(16) }) {
  const count = Number(successfulDeliveries);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw protocolError('INVALID_DELIVERY_COUNT', '历史成功交付次数无效', 409);
  }
  const contractCiphertext = encryptSm4Pkcs7(JSON.stringify(contract), key, iv);
  const countCiphertext = encryptSm4Pkcs7(String(count), key, iv);
  return {
    vmId: String(vmId),
    iv: iv.toString('base64'),
    deliveried_cnt: countCiphertext.toString('base64'),
    ciphertext: contractCiphertext.toString('base64')
  };
}

module.exports = {
  DEFAULT_MODEL_MAX_BYTES,
  validateModelUpload,
  encryptModelPayload,
  buildFormalContractDocument,
  buildEncryptedContractPayload,
  formatUtcSeconds
};
