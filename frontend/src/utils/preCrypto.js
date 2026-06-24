/* global BigInt */
const { downloadBlobFile, downloadTextFile, JSON_MIME_TYPE } = require('./heCsv');
const mcl = require('mcl-wasm');
const { unzipSync, zipSync } = require('fflate');

const PRE_ALLOWED_SOURCE_EXTENSIONS = Object.freeze(['.zip', '.tar', '.tar.gz', '.tgz']);
const PRE_PRIVATE_KEY_TYPE = 'private';
const PRE_SCHEME = 'AFGH_PRE';
const PRE_CURVE = 'bn254';
const PRE_PUBLIC_KEY_VERSION = 'afgh-pre-public-key-v1';
const PRE_REKEY_VERSION = 'afgh-pre-rekey-v1';
const PRE_CIPHERTEXT_VERSION = 'afgh-pre-ciphertext-v1';
const PRE_HKDF_INFO = utf8Encode('PCC-AFGH-PRE-V1-KDF');
const PRE_AEAD_AAD = utf8Encode('PCC-AFGH-PRE-V1');
const FIELD_BYTES = 32;
const CURVE_ORDER = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const GT_WIRE_ORDER = Object.freeze([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

const G2_GENERATOR = Object.freeze({
  x: [
    BigInt('10857046999023057135944570762232829481370756359578518086990519993285655852781'),
    BigInt('11559732032986387107991004021392285783925812861821192530917403151452391805634')
  ],
  y: [
    BigInt('8495653923123431417604973247489272438418190587263600148770280649306958101930'),
    BigInt('4082367875863433681332203403145435568316851327593401208105741076214120093531')
  ]
});

let mclReadyPromise = null;

function sanitizeFilenameSegment(value, fallback = 'unknown') {
  const normalized = String(value || '').trim();
  const sanitized = normalized.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-');
  return sanitized.replace(/^-|-$/g, '') || fallback;
}

function buildPrePrivateKeyFilename({ transactionId }) {
  return `pre-private-${sanitizeFilenameSegment(transactionId)}.json`;
}

function buildPreResultFilename({ transactionId }) {
  return `pre-result-${sanitizeFilenameSegment(transactionId)}.zip`;
}

function isAllowedPreSourceFileName(filename) {
  const normalized = String(filename || '').trim().toLowerCase();
  return PRE_ALLOWED_SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function ensureAllowedPreSourceFile(file) {
  if (!file?.name || !isAllowedPreSourceFileName(file.name)) {
    throw new Error(`仅支持 ${PRE_ALLOWED_SOURCE_EXTENSIONS.join(', ')} 压缩包`);
  }
}

function getNativeCryptoApi() {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }
  if (typeof self !== 'undefined' && self.crypto?.subtle) {
    return self.crypto;
  }
  return null;
}

function assertCryptoAvailable() {
  if (!getNativeCryptoApi()) {
    throw new Error('当前环境不支持 PRE 本地密码能力');
  }
}

async function ensureMclReady() {
  if (!mclReadyPromise) {
    mclReadyPromise = mcl.init(mcl.BN_SNARK1);
  }
  await mclReadyPromise;
}

function utf8Encode(text) {
  return new TextEncoder().encode(String(text || ''));
}

function utf8Decode(bytes) {
  return new TextDecoder().decode(bytes);
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64Value) {
  const binary = atob(String(base64Value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bigIntToBytes(value, length = FIELD_BYTES) {
  let remaining = BigInt(value);
  const bytes = new Uint8Array(length);
  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

function bytesToBigInt(bytes) {
  return bytes.reduce((accumulator, current) => (
    (accumulator << 8n) + BigInt(current)
  ), 0n);
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item));
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.keys(value).sort().reduce((accumulator, key) => {
      accumulator[key] = canonicalizeJson(value[key]);
      return accumulator;
    }, {});
  }
  return value;
}

function canonicalJsonBytes(document) {
  return utf8Encode(JSON.stringify(canonicalizeJson(document)));
}

function wrapBase64(bytes) {
  return `base64:${bytesToBase64(bytes)}`;
}

function unwrapBase64(value, fieldName) {
  const normalized = String(value || '');
  if (!normalized.startsWith('base64:')) {
    throw new Error(`${fieldName} 缺少 base64: 前缀`);
  }
  return base64ToBytes(normalized.slice(7));
}

function getRandomBytes(length) {
  const cryptoApi = getNativeCryptoApi();
  const bytes = new Uint8Array(length);
  cryptoApi.getRandomValues(bytes);
  return bytes;
}

function randomScalar() {
  let candidate = 0n;
  do {
    candidate = bytesToBigInt(getRandomBytes(FIELD_BYTES)) % CURVE_ORDER;
  } while (candidate === 0n);
  return candidate;
}

function createFp(value) {
  const fp = new mcl.Fp();
  fp.setStr(BigInt(value).toString(10), 10);
  return fp;
}

function createFp2(a, b) {
  const fp2 = new mcl.Fp2();
  fp2.set_a(createFp(a));
  fp2.set_b(createFp(b));
  return fp2;
}

function createG1Generator() {
  const point = new mcl.G1();
  point.setX(createFp(1n));
  point.setY(createFp(2n));
  point.setZ(createFp(1n));
  return point;
}

function createG2Generator() {
  const point = new mcl.G2();
  point.setX(createFp2(G2_GENERATOR.x[0], G2_GENERATOR.x[1]));
  point.setY(createFp2(G2_GENERATOR.y[0], G2_GENERATOR.y[1]));
  point.setZ(createFp2(1n, 0n));
  return point;
}

function normalizeG1(point) {
  const clone = point.clone();
  clone.normalize();
  return clone;
}

function normalizeG2(point) {
  const clone = point.clone();
  clone.normalize();
  return clone;
}

function encodeG1(point) {
  const normalized = normalizeG1(point);
  return new Uint8Array([
    ...bigIntToBytes(BigInt(`0x${normalized.getX().getStr(16)}`)),
    ...bigIntToBytes(BigInt(`0x${normalized.getY().getStr(16)}`))
  ]);
}

function encodeG2(point) {
  const normalized = normalizeG2(point);
  const x = normalized.getX();
  const y = normalized.getY();
  return new Uint8Array([
    ...bigIntToBytes(BigInt(`0x${x.get_a().getStr(16)}`)),
    ...bigIntToBytes(BigInt(`0x${x.get_b().getStr(16)}`)),
    ...bigIntToBytes(BigInt(`0x${y.get_a().getStr(16)}`)),
    ...bigIntToBytes(BigInt(`0x${y.get_b().getStr(16)}`))
  ]);
}

function decodeG1(bytes) {
  if (bytes.byteLength !== FIELD_BYTES * 2) {
    throw new Error('PRE G1 编码长度无效');
  }
  const point = new mcl.G1();
  point.setX(createFp(bytesToBigInt(bytes.slice(0, FIELD_BYTES))));
  point.setY(createFp(bytesToBigInt(bytes.slice(FIELD_BYTES, FIELD_BYTES * 2))));
  point.setZ(createFp(1n));
  if (!point.isValid() || !point.isValidOrder()) {
    throw new Error('PRE G1 点非法');
  }
  return point;
}

function decodeG2(bytes) {
  if (bytes.byteLength !== FIELD_BYTES * 4) {
    throw new Error('PRE G2 编码长度无效');
  }
  const point = new mcl.G2();
  point.setX(createFp2(
    bytesToBigInt(bytes.slice(0, FIELD_BYTES)),
    bytesToBigInt(bytes.slice(FIELD_BYTES, FIELD_BYTES * 2))
  ));
  point.setY(createFp2(
    bytesToBigInt(bytes.slice(FIELD_BYTES * 2, FIELD_BYTES * 3)),
    bytesToBigInt(bytes.slice(FIELD_BYTES * 3, FIELD_BYTES * 4))
  ));
  point.setZ(createFp2(1n, 0n));
  if (!point.isValid() || !point.isValidOrder()) {
    throw new Error('PRE G2 点非法');
  }
  return point;
}

function encodeGT(value) {
  const parts = value.getStr(16).split(' ').filter(Boolean);
  if (parts.length !== 12) {
    throw new Error('PRE GT 编码长度无效');
  }

  return new Uint8Array(
    GT_WIRE_ORDER.flatMap((index) => Array.from(bigIntToBytes(BigInt(`0x${parts[index]}`))))
  );
}

function decodeGT(bytes) {
  if (bytes.byteLength !== FIELD_BYTES * 12) {
    throw new Error('PRE GT 编码长度无效');
  }
  const parts = new Array(12);
  for (let index = 0; index < 12; index += 1) {
    const start = index * FIELD_BYTES;
    const end = start + FIELD_BYTES;
    parts[GT_WIRE_ORDER[index]] = `0x${bytesToHex(bytes.slice(start, end))}`;
  }
  const value = new mcl.GT();
  value.setStr(parts.join(' '), 16);
  return value;
}

function parsePublicKeyDocument(document, fieldName = 'publicKey') {
  if (!document || typeof document !== 'object') {
    throw new Error(`${fieldName} 必须是对象`);
  }
  if (
    document.schema_version !== PRE_PUBLIC_KEY_VERSION ||
    document.scheme !== PRE_SCHEME ||
    document.curve !== PRE_CURVE
  ) {
    throw new Error(`${fieldName} 协议版本不匹配`);
  }
  const keyId = String(document.key_id || '').trim();
  if (!keyId) {
    throw new Error(`${fieldName} 缺少 key_id`);
  }
  return {
    keyId,
    g1: decodeG1(unwrapBase64(document.point_g1, `${fieldName}.point_g1`)),
    g2: decodeG2(unwrapBase64(document.point_g2, `${fieldName}.point_g2`))
  };
}

async function hkdfSha256(ikmBytes, infoBytes) {
  const cryptoApi = getNativeCryptoApi();
  const key = await cryptoApi.subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits']);
  const derivedBits = await cryptoApi.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(),
      info: infoBytes
    },
    key,
    256
  );
  return new Uint8Array(derivedBits);
}

async function encryptAesGcm(plainBytes, keyBytes, ivBytes) {
  const cryptoApi = getNativeCryptoApi();
  const key = await cryptoApi.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  return cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes, additionalData: PRE_AEAD_AAD },
    key,
    plainBytes
  );
}

async function decryptAesGcm(cipherBytes, keyBytes, ivBytes) {
  const cryptoApi = getNativeCryptoApi();
  const key = await cryptoApi.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  try {
    return await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes, additionalData: PRE_AEAD_AAD },
      key,
      cipherBytes
    );
  } catch (error) {
    throw new Error('PRE 本地解密失败：AES-GCM 校验未通过，当前浏览器 PRE 实现与 PCC 结果字节协议仍不兼容。');
  }
}

async function derivePublicKey(privateScalar, keyId) {
  await ensureMclReady();
  const scalar = new mcl.Fr();
  scalar.setStr(BigInt(privateScalar).toString(10), 10);
  const publicG1 = mcl.mul(createG1Generator(), scalar);
  const publicG2 = mcl.mul(createG2Generator(), scalar);

  return {
    schema_version: PRE_PUBLIC_KEY_VERSION,
    scheme: PRE_SCHEME,
    curve: PRE_CURVE,
    key_id: keyId,
    point_g1: wrapBase64(encodeG1(publicG1)),
    point_g2: wrapBase64(encodeG2(publicG2))
  };
}

async function generateRekey(sourcePrivateScalar, targetPublicKeyDocument, sourceKeyId) {
  await ensureMclReady();
  const targetPublicKey = parsePublicKeyDocument(targetPublicKeyDocument, 'targetPublicKey');
  const sourceScalar = new mcl.Fr();
  sourceScalar.setStr(BigInt(sourcePrivateScalar).toString(10), 10);
  const inverseScalar = mcl.inv(sourceScalar);
  const pointG2 = mcl.mul(targetPublicKey.g2, inverseScalar);

  return {
    schema_version: PRE_REKEY_VERSION,
    scheme: PRE_SCHEME,
    curve: PRE_CURVE,
    source_key_id: sourceKeyId,
    target_key_id: targetPublicKey.keyId,
    point_g2: wrapBase64(encodeG2(pointG2))
  };
}

async function encryptSecondLevel(plaintextBytes, sourcePublicKeyDocument) {
  await ensureMclReady();
  const sourcePublicKey = parsePublicKeyDocument(sourcePublicKeyDocument, 'sourcePublicKey');
  const ephemeralScalarValue = randomScalar();
  const ephemeralScalar = new mcl.Fr();
  ephemeralScalar.setStr(ephemeralScalarValue.toString(10), 10);
  const ivBytes = getRandomBytes(12);
  const header = mcl.mul(sourcePublicKey.g1, ephemeralScalar);
  const sharedGt = mcl.pow(mcl.pairing(createG1Generator(), createG2Generator()), ephemeralScalar);
  const aesKey = await hkdfSha256(encodeGT(sharedGt), PRE_HKDF_INFO);
  const encrypted = new Uint8Array(await encryptAesGcm(plaintextBytes, aesKey, ivBytes));

  return canonicalJsonBytes({
    schema_version: PRE_CIPHERTEXT_VERSION,
    scheme: PRE_SCHEME,
    curve: PRE_CURVE,
    level: 2,
    source_key_id: sourcePublicKey.keyId,
    header_g1: wrapBase64(encodeG1(header)),
    nonce: wrapBase64(ivBytes),
    ciphertext: wrapBase64(encrypted)
  });
}

async function decryptFirstLevel(ciphertextBytes, targetPrivateScalarHex) {
  await ensureMclReady();
  const ciphertextText = utf8Decode(ciphertextBytes);
  const document = JSON.parse(ciphertextText);
  if (
    document.schema_version !== PRE_CIPHERTEXT_VERSION ||
    document.scheme !== PRE_SCHEME ||
    document.curve !== PRE_CURVE ||
    document.level !== 1
  ) {
    throw new Error('PRE 结果密文格式不匹配');
  }

  const privateScalar = BigInt(`0x${String(targetPrivateScalarHex || '').replace(/^0x/i, '')}`);
  const scalar = new mcl.Fr();
  scalar.setStr(privateScalar.toString(10), 10);
  const inverseScalar = mcl.inv(scalar);
  const headerGt = decodeGT(unwrapBase64(document.header_gt, 'header_gt'));
  const sharedGt = mcl.pow(headerGt, inverseScalar);
  const aesKey = await hkdfSha256(encodeGT(sharedGt), PRE_HKDF_INFO);
  const plain = await decryptAesGcm(
    unwrapBase64(document.ciphertext, 'ciphertext'),
    aesKey,
    unwrapBase64(document.nonce, 'nonce')
  );
  return new Uint8Array(plain);
}

function serializePrePrivateKeyMaterial({ transactionId, privateScalarHex, publicKey }) {
  return JSON.stringify(
    {
      algorithm: PRE_SCHEME,
      curve: PRE_CURVE,
      transactionId: String(transactionId || ''),
      keyType: PRE_PRIVATE_KEY_TYPE,
      exportedAt: new Date().toISOString(),
      privateScalarHex: String(privateScalarHex || ''),
      publicKey: publicKey || null
    },
    null,
    2
  );
}

function parsePrePrivateKeyMaterial(rawText) {
  const parsed = JSON.parse(String(rawText || '{}'));
  const privateScalarHex = String(parsed.privateScalarHex || '').replace(/^0x/i, '').trim();
  if (!/^[0-9a-fA-F]+$/.test(privateScalarHex)) {
    throw new Error('PRE 私钥文件内容无效');
  }
  return {
    algorithm: String(parsed.algorithm || ''),
    curve: String(parsed.curve || ''),
    transactionId: String(parsed.transactionId || ''),
    keyType: String(parsed.keyType || ''),
    privateScalarHex,
    publicKey: parsed.publicKey || null,
    exportedAt: parsed.exportedAt || ''
  };
}

function assertPrePrivateKeyMatchesRecord({
  parsedKey,
  transactionId,
  record,
}) {
  if (!parsedKey) {
    throw new Error('PRE 私钥文件无效。');
  }

  if (parsedKey.algorithm && parsedKey.algorithm !== PRE_SCHEME) {
    throw new Error('PRE 私钥算法不匹配。');
  }

  if (parsedKey.curve && parsedKey.curve !== PRE_CURVE) {
    throw new Error('PRE 私钥曲线参数不匹配。');
  }

  if (
    parsedKey.transactionId &&
    transactionId &&
    String(parsedKey.transactionId).trim() &&
    String(transactionId).trim() &&
    String(parsedKey.transactionId).trim() !== String(transactionId).trim()
  ) {
    throw new Error(`PRE 私钥文件不属于当前交易 ${transactionId}。`);
  }

  const expectedPublicKey = record?.buyer_public_key || null;
  const actualPublicKey = parsedKey.publicKey || null;
  if (!expectedPublicKey || !actualPublicKey) {
    return;
  }

  if (
    String(expectedPublicKey.key_id || '') !== String(actualPublicKey.key_id || '') ||
    String(expectedPublicKey.point_g1 || '') !== String(actualPublicKey.point_g1 || '') ||
    String(expectedPublicKey.point_g2 || '') !== String(actualPublicKey.point_g2 || '')
  ) {
    throw new Error('PRE 私钥文件与当前交易的买方公钥不匹配，请重新选择最新下载的私钥文件。');
  }
}

function downloadPrePrivateKeyFile({ transactionId, privateScalarHex, publicKey }) {
  return downloadTextFile({
    text: serializePrePrivateKeyMaterial({ transactionId, privateScalarHex, publicKey }),
    filename: buildPrePrivateKeyFilename({ transactionId }),
    mimeType: JSON_MIME_TYPE
  });
}

async function generatePreBuyerKeyPair({ transactionId }) {
  assertCryptoAvailable();
  await ensureMclReady();

  const privateScalar = randomScalar();
  const keyId = `pre-buyer-${sanitizeFilenameSegment(transactionId)}-${Date.now()}`;
  const publicKey = await derivePublicKey(privateScalar, keyId);

  return {
    publicKey,
    privateScalarHex: privateScalar.toString(16),
    keyId
  };
}

function unzipArchiveToEntries(bytes, fieldName) {
  try {
    return unzipSync(new Uint8Array(bytes));
  } catch (error) {
    throw new Error(`${fieldName} 不是有效的 ZIP 压缩包`);
  }
}

function normalizeZipEntries(entries, fieldName) {
  const result = {};
  Object.keys(entries).forEach((entryPath) => {
    const normalizedPath = String(entryPath || '');
    if (!normalizedPath || normalizedPath.endsWith('/')) {
      return;
    }
    if (normalizedPath.startsWith('/') || normalizedPath.includes('..')) {
      throw new Error(`${fieldName} 包含非法路径 ${normalizedPath}`);
    }
    const content = entries[entryPath];
    result[normalizedPath] = content instanceof Uint8Array
      ? content
      : new Uint8Array(content);
  });
  if (Object.keys(result).length === 0) {
    throw new Error(`${fieldName} 不能是空 ZIP`);
  }
  return result;
}

async function createPrePublishPayload({ file, buyerPublicKey, transactionId, sellerId }) {
  ensureAllowedPreSourceFile(file);
  assertCryptoAvailable();
  await ensureMclReady();

  const sellerPrivateScalar = randomScalar();
  const sourceKeyId = `pre-seller-${sanitizeFilenameSegment(transactionId)}-${Date.now()}`;
  const sourcePublicKey = await derivePublicKey(sellerPrivateScalar, sourceKeyId);
  const reencryptionKey = await generateRekey(sellerPrivateScalar, buyerPublicKey, sourceKeyId);

  const plainEntries = normalizeZipEntries(
    unzipArchiveToEntries(await file.arrayBuffer(), '原始压缩包'),
    '原始压缩包'
  );

  const cipherEntries = {};
  const entryPaths = Object.keys(plainEntries);
  for (const entryPath of entryPaths) {
    cipherEntries[entryPath] = await encryptSecondLevel(plainEntries[entryPath], sourcePublicKey);
  }

  const sourceCipherZipBytes = zipSync(cipherEntries, { level: 0 });
  const sourceCipherZipFile = new File(
    [sourceCipherZipBytes],
    `pre_source_${sanitizeFilenameSegment(transactionId)}.zip`,
    { type: 'application/zip' }
  );

  return {
    sourcePublicKey,
    reencryptionKey,
    sourceCipherZipFile,
    sellerPrivateScalarHex: sellerPrivateScalar.toString(16),
    entryCount: entryPaths.length,
    sellerId: String(sellerId || '')
  };
}

async function decryptPreResultArchive({ encryptedZipBuffer, privateKeyText, transactionId }) {
  assertCryptoAvailable();
  await ensureMclReady();

  const privateKeyMaterial = parsePrePrivateKeyMaterial(privateKeyText);
  const encryptedEntries = normalizeZipEntries(
    unzipArchiveToEntries(encryptedZipBuffer, 'PRE 结果 ZIP'),
    'PRE 结果 ZIP'
  );

  const plainEntries = {};
  const entryPaths = Object.keys(encryptedEntries);
  for (const entryPath of entryPaths) {
    plainEntries[entryPath] = await decryptFirstLevel(
      encryptedEntries[entryPath],
      privateKeyMaterial.privateScalarHex
    );
  }

  const plainZipBytes = zipSync(plainEntries, { level: 0 });
  return {
    filename: buildPreResultFilename({ transactionId }),
    blob: new Blob([plainZipBytes], { type: 'application/zip' }),
    entryCount: entryPaths.length
  };
}

async function downloadDecryptedPreResultArchive({ encryptedZipBuffer, privateKeyText, transactionId }) {
  const result = await decryptPreResultArchive({
    encryptedZipBuffer,
    privateKeyText,
    transactionId
  });

  downloadBlobFile({
    blob: result.blob,
    filename: result.filename
  });

  return result;
}

module.exports = {
  PRE_ALLOWED_SOURCE_EXTENSIONS,
  buildPrePrivateKeyFilename,
  isAllowedPreSourceFileName,
  ensureAllowedPreSourceFile,
  generatePreBuyerKeyPair,
  downloadPrePrivateKeyFile,
  createPrePublishPayload,
  decryptPreResultArchive,
  downloadDecryptedPreResultArchive,
  parsePrePrivateKeyMaterial,
  assertPrePrivateKeyMatchesRecord,
  serializePrePrivateKeyMaterial
};

module.exports.default = module.exports;
