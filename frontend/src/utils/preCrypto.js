/* global BigInt */
const {
  downloadBlobFile,
  downloadTextFile,
  JSON_MIME_TYPE
} = require('./heCsv');
const forge = require('node-forge');

const PRE_ALLOWED_SOURCE_EXTENSIONS = Object.freeze(['.zip', '.tar', '.tar.gz', '.tgz']);
const PRE_PRIVATE_KEY_TYPE = 'private';

function sanitizeFilenameSegment(value, fallback = 'unknown') {
  const normalized = String(value || '').trim();
  const sanitized = normalized.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-');
  return sanitized.replace(/^-|-$/g, '') || fallback;
}

function buildPrePrivateKeyFilename({ transactionId }) {
  const safeTransactionId = sanitizeFilenameSegment(transactionId);
  return `pre-private-${safeTransactionId}.json`;
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
  const scope =
    (typeof window !== 'undefined' && window) ||
    (typeof self !== 'undefined' && self) ||
    null;

  if (scope?.crypto?.subtle) {
    return scope.crypto;
  }

  return null;
}

function getCryptoApi() {
  return getNativeCryptoApi();
}

function assertCryptoAvailable() {
  if (getCryptoApi()) {
    return;
  }

  if (forge?.pki?.rsa && forge?.cipher && forge?.random) {
    return;
  }

  throw new Error('当前环境不支持 PRE 本地加密能力');
}

function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }

  throw new Error('Expected ArrayBuffer or TypedArray');
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hexToBytes(hex) {
  const normalized = String(hex || '').trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function bytesToBinaryString(bytes) {
  let output = '';
  bytes.forEach((byte) => {
    output += String.fromCharCode(byte);
  });
  return output;
}

function binaryStringToBytes(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64ToBytes(base64Value) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64Value, 'base64'));
  }

  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function utf8Encode(text) {
  return new TextEncoder().encode(String(text || ''));
}

function utf8Decode(bytes) {
  return new TextDecoder().decode(bytes);
}

function pemToDer(pemText) {
  const base64Value = String(pemText || '')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');

  return base64ToBytes(base64Value);
}

function derToPem(label, derBytes) {
  const base64Value = bytesToBase64(derBytes);
  const lines = base64Value.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

function exportPemHexFromPemText(pemText) {
  return bytesToHex(utf8Encode(pemText));
}

async function generatePreBuyerKeyPair() {
  const cryptoApi = getCryptoApi();
  if (cryptoApi) {
    const keyPair = await cryptoApi.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['encrypt', 'decrypt']
    );

    const [spki, pkcs8] = await Promise.all([
      cryptoApi.subtle.exportKey('spki', keyPair.publicKey),
      cryptoApi.subtle.exportKey('pkcs8', keyPair.privateKey)
    ]);
    const publicPem = derToPem('PUBLIC KEY', new Uint8Array(spki));
    const privatePem = derToPem('PRIVATE KEY', new Uint8Array(pkcs8));

    return {
      publicKeyHex: exportPemHexFromPemText(publicPem),
      privateKeyPem: privatePem
    };
  }

  const keyPair = await new Promise((resolve, reject) => {
    forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 }, (error, generated) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(generated);
    });
  });
  const publicPem = forge.pki.publicKeyToPem(keyPair.publicKey);
  const privatePem = forge.pki.privateKeyToPem(keyPair.privateKey);

  return {
    publicKeyHex: exportPemHexFromPemText(publicPem),
    privateKeyPem: privatePem
  };
}

function serializePrePrivateKeyMaterial({ transactionId, privateKeyPem }) {
  return JSON.stringify(
    {
      algorithm: 'RSA-OAEP-SHA256',
      transactionId: String(transactionId || ''),
      keyType: PRE_PRIVATE_KEY_TYPE,
      exportedAt: new Date().toISOString(),
      privateKeyPem: String(privateKeyPem || '')
    },
    null,
    2
  );
}

function parsePrePrivateKeyMaterial(rawText) {
  const parsed = JSON.parse(String(rawText || '{}'));
  const privateKeyPem = String(parsed.privateKeyPem || '').trim();

  if (!privateKeyPem) {
    throw new Error('PRE 私钥文件内容无效');
  }

  return {
    algorithm: String(parsed.algorithm || ''),
    transactionId: String(parsed.transactionId || ''),
    keyType: String(parsed.keyType || ''),
    privateKeyPem,
    exportedAt: parsed.exportedAt || ''
  };
}

function downloadPrePrivateKeyFile({ transactionId, privateKeyPem }) {
  return downloadTextFile({
    text: serializePrePrivateKeyMaterial({ transactionId, privateKeyPem }),
    filename: buildPrePrivateKeyFilename({ transactionId }),
    mimeType: JSON_MIME_TYPE
  });
}

async function importRsaPublicKeyFromPemHex(publicKeyHex) {
  const cryptoApi = getCryptoApi();
  const pemText = utf8Decode(hexToBytes(publicKeyHex));
  if (!cryptoApi) {
    return forge.pki.publicKeyFromPem(pemText);
  }
  const der = pemToDer(pemText);
  return cryptoApi.subtle.importKey(
    'spki',
    der,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256'
    },
    false,
    ['encrypt']
  );
}

async function importRsaPrivateKeyFromPem(privateKeyPem) {
  const cryptoApi = getCryptoApi();
  if (!cryptoApi) {
    return forge.pki.privateKeyFromPem(String(privateKeyPem || ''));
  }

  const der = pemToDer(String(privateKeyPem || ''));
  return cryptoApi.subtle.importKey(
    'pkcs8',
    der,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256'
    },
    false,
    ['decrypt']
  );
}

function getRandomBytes(length) {
  const cryptoApi = getCryptoApi();
  if (cryptoApi) {
    return cryptoApi.getRandomValues(new Uint8Array(length));
  }

  return binaryStringToBytes(forge.random.getBytesSync(length));
}

async function encryptRsaOaep(publicKey, bytes) {
  const cryptoApi = getCryptoApi();
  if (cryptoApi) {
    return cryptoApi.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, bytes);
  }

  const encrypted = publicKey.encrypt(bytesToBinaryString(bytes), 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: {
      md: forge.md.sha256.create()
    }
  });
  return binaryStringToBytes(encrypted).buffer;
}

async function decryptRsaOaep(privateKey, bytes) {
  const cryptoApi = getCryptoApi();
  if (cryptoApi) {
    return cryptoApi.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, bytes);
  }

  const decrypted = privateKey.decrypt(bytesToBinaryString(new Uint8Array(bytes)), 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: {
      md: forge.md.sha256.create()
    }
  });
  return binaryStringToBytes(decrypted).buffer;
}

async function encryptAesGcm(plainBytes, aesKey, iv) {
  const cryptoApi = getCryptoApi();
  if (cryptoApi) {
    const cryptoAesKey = await cryptoApi.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    return cryptoApi.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoAesKey,
      plainBytes
    );
  }

  const cipher = forge.cipher.createCipher('AES-GCM', bytesToBinaryString(aesKey));
  cipher.start({
    iv: bytesToBinaryString(iv),
    tagLength: 128
  });
  cipher.update(forge.util.createBuffer(bytesToBinaryString(plainBytes)));
  const success = cipher.finish();
  if (!success) {
    throw new Error('PRE 文件加密失败');
  }

  const encryptedBytes = binaryStringToBytes(cipher.output.getBytes());
  const tagBytes = binaryStringToBytes(cipher.mode.tag.getBytes());
  const combined = new Uint8Array(encryptedBytes.length + tagBytes.length);
  combined.set(encryptedBytes, 0);
  combined.set(tagBytes, encryptedBytes.length);
  return combined.buffer;
}

async function decryptAesGcm(cipherBytes, aesKey, iv) {
  const cryptoApi = getCryptoApi();
  if (cryptoApi) {
    const cryptoAesKey = await cryptoApi.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    return cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoAesKey,
      cipherBytes
    );
  }

  const bytes = new Uint8Array(cipherBytes);
  const tagLength = 16;
  if (bytes.byteLength < tagLength) {
    throw new Error('PRE 密文内容无效');
  }

  const cipher = bytes.slice(0, bytes.byteLength - tagLength);
  const tag = bytes.slice(bytes.byteLength - tagLength);
  const decipher = forge.cipher.createDecipher('AES-GCM', bytesToBinaryString(aesKey));
  decipher.start({
    iv: bytesToBinaryString(iv),
    tagLength: 128,
    tag: forge.util.createBuffer(bytesToBinaryString(tag))
  });
  decipher.update(forge.util.createBuffer(bytesToBinaryString(cipher)));
  const success = decipher.finish();
  if (!success) {
    throw new Error('PRE 本地解密失败，私钥或结果包不匹配');
  }

  return binaryStringToBytes(decipher.output.getBytes()).buffer;
}

function decodeTarField(bytes, start, end) {
  const slice = bytes.slice(start, end);
  const zeroIndex = slice.indexOf(0);
  const usable = zeroIndex >= 0 ? slice.slice(0, zeroIndex) : slice;
  return utf8Decode(usable).trim();
}

function parseTarEntries(tarBuffer) {
  const bytes = new Uint8Array(toArrayBuffer(tarBuffer));
  const entries = new Map();
  let offset = 0;

  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = decodeTarField(header, 0, 100);
    const sizeOctal = decodeTarField(header, 124, 136).replace(/\0/g, '').trim();
    const size = sizeOctal ? Number.parseInt(sizeOctal, 8) : 0;
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;

    entries.set(name, bytes.slice(dataStart, dataEnd));

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function parsePackageParts(packageBytes) {
  const bytes = new Uint8Array(toArrayBuffer(packageBytes));
  if (bytes.byteLength < 8) {
    throw new Error('PRE key package 格式无效');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const partCount = Number(view.getBigUint64(0, true));
  const lengths = [];
  let offset = 8;

  for (let index = 0; index < partCount; index += 1) {
    if (offset + 8 > bytes.byteLength) {
      throw new Error('PRE key package 长度无效');
    }
    lengths.push(Number(view.getBigUint64(offset, true)));
    offset += 8;
  }

  const parts = [];
  lengths.forEach((length) => {
    const nextOffset = offset + length;
    if (nextOffset > bytes.byteLength) {
      throw new Error('PRE key package 内容越界');
    }
    parts.push(bytes.slice(offset, nextOffset));
    offset = nextOffset;
  });

  return parts;
}

function parseJsonEntry(entries, path) {
  const bytes = entries.get(path);
  if (!bytes) {
    throw new Error(`PRE 结果包缺少 ${path}`);
  }
  return JSON.parse(utf8Decode(bytes));
}

function requireEntry(entries, path) {
  const bytes = entries.get(path);
  if (!bytes) {
    throw new Error(`PRE 结果包缺少 ${path}`);
  }
  return bytes;
}

function detectArchiveExtension(bytes) {
  if (!bytes || bytes.byteLength < 4) {
    return '.bin';
  }

  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return '.zip';
  }

  if (bytes[0] === 0x1F && bytes[1] === 0x8B) {
    return '.tar.gz';
  }

  if (bytes.byteLength >= 262) {
    const signature = utf8Decode(bytes.slice(257, 262));
    if (signature === 'ustar') {
      return '.tar';
    }
  }

  return '.bin';
}

async function decryptPreResultArchive({
  encryptedTarBuffer,
  privateKeyText,
  transactionId
}) {
  const privateKeyMaterial = parsePrePrivateKeyMaterial(privateKeyText);
  const privateKey = await importRsaPrivateKeyFromPem(privateKeyMaterial.privateKeyPem);
  const entries = parseTarEntries(encryptedTarBuffer);

  parseJsonEntry(entries, 'manifest.json');
  const resultMeta = parseJsonEntry(entries, 'result/meta.json');
  const sourceMeta = parseJsonEntry(entries, 'source/meta.json');
  const resultCipher = requireEntry(entries, 'result/cipher.bin');
  const resultWrappedKey = requireEntry(entries, 'result/wrapped_key.bin');
  const sourceCipher = requireEntry(entries, 'source/cipher.bin');

  const resultDek = new Uint8Array(await decryptRsaOaep(privateKey, resultWrappedKey));
  const reEncryptedPackageBytes = new Uint8Array(await decryptAesGcm(
    resultCipher,
    resultDek,
    base64ToBytes(String(resultMeta.iv || ''))
  ));
  const parts = parsePackageParts(reEncryptedPackageBytes);
  if (parts.length < 1) {
    throw new Error('PRE 重加密结果内容无效');
  }

  const sourceAesKey = new Uint8Array(await decryptRsaOaep(privateKey, parts[0]));
  const plainArchiveBytes = new Uint8Array(await decryptAesGcm(
    sourceCipher,
    sourceAesKey,
    base64ToBytes(String(sourceMeta.iv || ''))
  ));

  const extension = detectArchiveExtension(plainArchiveBytes);
  const safeTransactionId = sanitizeFilenameSegment(transactionId);
  const filename = `pre-result-${safeTransactionId}${extension}`;

  return {
    filename,
    blob: new Blob([plainArchiveBytes], { type: 'application/octet-stream' })
  };
}

async function downloadDecryptedPreResultArchive({
  encryptedTarBuffer,
  privateKeyText,
  transactionId
}) {
  const result = await decryptPreResultArchive({
    encryptedTarBuffer,
    privateKeyText,
    transactionId
  });

  downloadBlobFile({
    blob: result.blob,
    filename: result.filename
  });

  return result;
}

function createKeyPackageHex(parts) {
  const normalizedParts = parts.map((part) => new Uint8Array(toArrayBuffer(part)));
  const header = new ArrayBuffer(8 + normalizedParts.length * 8);
  const view = new DataView(header);

  view.setBigUint64(0, BigInt(normalizedParts.length), true);
  normalizedParts.forEach((part, index) => {
    view.setBigUint64(8 + index * 8, BigInt(part.byteLength), true);
  });

  const totalPayloadBytes = normalizedParts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(header.byteLength + totalPayloadBytes);
  result.set(new Uint8Array(header), 0);

  let offset = header.byteLength;
  normalizedParts.forEach((part) => {
    result.set(part, offset);
    offset += part.byteLength;
  });

  return bytesToHex(result);
}

async function createPrePublishPayload({
  file,
  teePublicKeyHex,
  teeKeyId,
  producerId,
  taskId,
  contentType = 'archive'
}) {
  ensureAllowedPreSourceFile(file);
  assertCryptoAvailable();

  const teePublicKey = await importRsaPublicKeyFromPemHex(teePublicKeyHex);
  const plainBytes = new Uint8Array(await file.arrayBuffer());
  const aesKey = getRandomBytes(32);
  const hmacKey = getRandomBytes(32);
  const iv = getRandomBytes(12);

  const cipherBuffer = await encryptAesGcm(plainBytes, aesKey, iv);
  const [wrappedKeyBuffer, encryptedAesKeyBuffer, encryptedHmacKeyBuffer] = await Promise.all([
    encryptRsaOaep(teePublicKey, aesKey),
    encryptRsaOaep(teePublicKey, aesKey),
    encryptRsaOaep(teePublicKey, hmacKey)
  ]);

  const meta = {
    version: 1,
    payload_alg: 'AES-256-GCM',
    wrapped_key_alg: 'RSA-OAEP-SHA256',
    iv: bytesToBase64(iv),
    content_type: contentType,
    recipient_type: 'TEE',
    recipient_key_id: String(teeKeyId || ''),
    producer_id: String(producerId || ''),
    task_id: String(taskId || ''),
    batch_index: null
  };

  return {
    keyPackageHex: createKeyPackageHex([
      new Uint8Array(encryptedAesKeyBuffer),
      new Uint8Array(encryptedHmacKeyBuffer)
    ]),
    sourceCipherFile: new Blob([cipherBuffer], { type: 'application/octet-stream' }),
    sourceWrappedKeyFile: new Blob([wrappedKeyBuffer], { type: 'application/octet-stream' }),
    sourceMetaFile: new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
    filenames: {
      sourceCipherFile: `${file.name}.cipher.bin`,
      sourceWrappedKeyFile: `${file.name}.wrapped_key.bin`,
      sourceMetaFile: `${file.name}.meta.json`
    },
    meta
  };
}

module.exports = {
  PRE_ALLOWED_SOURCE_EXTENSIONS,
  buildPrePrivateKeyFilename,
  isAllowedPreSourceFileName,
  ensureAllowedPreSourceFile,
  generatePreBuyerKeyPair,
  downloadPrePrivateKeyFile,
  downloadDecryptedPreResultArchive,
  createPrePublishPayload,
  decryptPreResultArchive,
  parsePrePrivateKeyMaterial,
  serializePrePrivateKeyMaterial,
  createKeyPackageHex
};

module.exports.default = module.exports;
