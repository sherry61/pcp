'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ARCHIVE_FILE_NAME = 'download-bundle.json';

function normalizeIdentity(transactionId, attemptNo) {
  const transaction = String(transactionId || '').trim();
  const attempt = Number(attemptNo);
  if (!transaction || !/^[a-zA-Z0-9._-]+$/.test(transaction)) return null;
  if (!Number.isSafeInteger(attempt) || attempt <= 0) return null;
  return { transactionId: transaction, attemptNo: attempt };
}

function archivePath(rootDir, transactionId, attemptNo) {
  const identity = normalizeIdentity(transactionId, attemptNo);
  if (!identity || !rootDir) return null;
  return path.join(path.resolve(rootDir), identity.transactionId, `attempt-${identity.attemptNo}`, ARCHIVE_FILE_NAME);
}

function validateResult(result) {
  if (!result?.iv || !result?.ciphertext) throw new Error('TEE 结果密文不完整');
}

function validateKeyInfo(keyInfo) {
  if (!keyInfo?.privateKeyPem || !keyInfo?.weightKeyEnvelope) throw new Error('TEE 结果解密材料不完整');
}

function saveAttemptResultArchive({ rootDir, transactionId, attemptNo, result, keyInfo } = {}) {
  const identity = normalizeIdentity(transactionId, attemptNo);
  const target = archivePath(rootDir, transactionId, attemptNo);
  if (!identity || !target) throw new Error('TEE 结果归档标识无效');
  validateResult(result);
  validateKeyInfo(keyInfo);

  const directory = path.dirname(target);
  const temporary = path.join(directory, `.${ARCHIVE_FILE_NAME}.${process.pid}.${Date.now()}.tmp`);
  const payload = {
    transactionId: identity.transactionId,
    attemptNo: identity.attemptNo,
    storedAt: new Date().toISOString(),
    result,
    keyInfo
  };
  fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
  fs.writeFileSync(temporary, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
  fs.chmodSync(target, 0o600);
  return target;
}

function loadAttemptResultArchive({ rootDir, transactionId, attemptNo } = {}) {
  const identity = normalizeIdentity(transactionId, attemptNo);
  const target = archivePath(rootDir, transactionId, attemptNo);
  if (!identity || !target) return null;
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (String(payload?.transactionId) !== identity.transactionId || Number(payload?.attemptNo) !== identity.attemptNo) {
    throw new Error('TEE 结果归档与交付记录不匹配');
  }
  validateResult(payload.result);
  validateKeyInfo(payload.keyInfo);
  return {
    transactionId: identity.transactionId,
    attemptNo: identity.attemptNo,
    result: payload.result,
    keyInfo: payload.keyInfo
  };
}

function hasAttemptResultArchive(input) {
  try {
    return Boolean(loadAttemptResultArchive(input));
  } catch (_) {
    return false;
  }
}

module.exports = {
  ARCHIVE_FILE_NAME,
  archivePath,
  saveAttemptResultArchive,
  loadAttemptResultArchive,
  hasAttemptResultArchive
};
