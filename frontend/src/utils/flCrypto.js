const {
  downloadTextFile,
  downloadBlobFile,
  JSON_MIME_TYPE
} = require('./heCsv');
const forge = require('node-forge');

const FL_PRIVATE_KEY_TYPE = 'private';

function sanitizeFilenameSegment(value, fallback = 'unknown') {
  const normalized = String(value || '').trim();
  const sanitized = normalized.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-');
  return sanitized.replace(/^-|-$/g, '') || fallback;
}

function buildFlPrivateKeyFilename({ role, transactionId }) {
  const safeRole = sanitizeFilenameSegment(role || 'participant');
  const safeTransactionId = sanitizeFilenameSegment(transactionId);
  return `fl-${safeRole}-private-${safeTransactionId}.json`;
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

  throw new Error('当前环境不支持 FL 本地加密能力');
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

function getRandomBytes(length) {
  const cryptoApi = getCryptoApi();
  if (cryptoApi) {
    return cryptoApi.getRandomValues(new Uint8Array(length));
  }

  return binaryStringToBytes(forge.random.getBytesSync(length));
}

async function generateFlKeyPair() {
  assertCryptoAvailable();

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

function serializeFlPrivateKeyMaterial({ role, transactionId, privateKeyPem }) {
  return JSON.stringify(
    {
      algorithm: 'RSA-OAEP-SHA256',
      role: String(role || 'participant'),
      transactionId: String(transactionId || ''),
      keyType: FL_PRIVATE_KEY_TYPE,
      exportedAt: new Date().toISOString(),
      privateKeyPem: String(privateKeyPem || '')
    },
    null,
    2
  );
}

function parseFlPrivateKeyMaterial(rawText) {
  const parsed = JSON.parse(String(rawText || '{}'));
  const privateKeyPem = String(parsed.privateKeyPem || '').trim();

  if (!privateKeyPem) {
    throw new Error('FL 私钥文件内容无效');
  }

  return {
    algorithm: String(parsed.algorithm || ''),
    role: String(parsed.role || ''),
    transactionId: String(parsed.transactionId || ''),
    keyType: String(parsed.keyType || ''),
    privateKeyPem,
    exportedAt: parsed.exportedAt || ''
  };
}

function downloadFlPrivateKeyFile({ role, transactionId, privateKeyPem }) {
  return downloadTextFile({
    text: serializeFlPrivateKeyMaterial({ role, transactionId, privateKeyPem }),
    filename: buildFlPrivateKeyFilename({ role, transactionId }),
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
    throw new Error('FL 文件加密失败');
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
    throw new Error('FL 密文内容无效');
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
    throw new Error('FL 本地解密失败，私钥或结果包不匹配');
  }

  return binaryStringToBytes(decipher.output.getBytes()).buffer;
}

async function createFlPackagePayload({
  file,
  teePublicKeyHex,
  teeKeyId,
  producerId,
  taskId,
  contentType,
  batchIndex = null,
  logicalName
}) {
  if (!file) {
    throw new Error('FL 上传文件不能为空');
  }

  assertCryptoAvailable();

  const teePublicKey = await importRsaPublicKeyFromPemHex(teePublicKeyHex);
  const plainBytes = new Uint8Array(await file.arrayBuffer());
  const aesKey = getRandomBytes(32);
  const iv = getRandomBytes(12);

  const [cipherBuffer, wrappedKeyBuffer] = await Promise.all([
    encryptAesGcm(plainBytes, aesKey, iv),
    encryptRsaOaep(teePublicKey, aesKey)
  ]);

  const meta = {
    version: 1,
    payload_alg: 'AES-256-GCM',
    wrapped_key_alg: 'RSA-OAEP-SHA256',
    iv: bytesToBase64(iv),
    content_type: String(contentType || 'model-bytes'),
    recipient_type: 'TEE',
    recipient_key_id: String(teeKeyId || ''),
    producer_id: String(producerId || ''),
    task_id: String(taskId || ''),
    batch_index: batchIndex == null ? null : Number(batchIndex)
  };

  const baseName = sanitizeFilenameSegment(logicalName || file.name || 'payload');

  return {
    cipherFile: new Blob([cipherBuffer], { type: 'application/octet-stream' }),
    wrappedKeyFile: new Blob([wrappedKeyBuffer], { type: 'application/octet-stream' }),
    metaFile: new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' }),
    filenames: {
      cipherFile: `${baseName}.cipher.bin`,
      wrappedKeyFile: `${baseName}.wrapped_key.bin`,
      metaFile: `${baseName}.meta.json`
    },
    meta
  };
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

function requireEntry(entries, path) {
  const bytes = entries.get(path);
  if (!bytes) {
    throw new Error(`FL 结果包缺少 ${path}`);
  }
  return bytes;
}

function parseJsonEntry(entries, path) {
  return JSON.parse(utf8Decode(requireEntry(entries, path)));
}

function resolveFlResultExtension(contentType) {
  const normalized = String(contentType || '').trim().toLowerCase();

  if (normalized === 'torchscript' || normalized === 'model-bytes') {
    return 'pt';
  }

  if (normalized === 'safetensors') {
    return 'safetensors';
  }

  return 'bin';
}

function resolveFlResultMimeType(contentType) {
  const normalized = String(contentType || '').trim().toLowerCase();

  if (normalized === 'safetensors') {
    return 'application/octet-stream';
  }

  if (normalized === 'torchscript' || normalized === 'model-bytes') {
    return 'application/octet-stream';
  }

  return 'application/octet-stream';
}

function buildDefaultFlResultFilename({
  resultRole,
  transactionId,
  batchIndex,
  contentType
}) {
  const extension = resolveFlResultExtension(contentType);
  const safeTransactionId = sanitizeFilenameSegment(transactionId, 'result');
  const normalizedRole = String(resultRole || '').trim().toLowerCase();

  if (normalizedRole === 'fl_top_model') {
    return `fl_top_model_${safeTransactionId}.${extension}`;
  }

  if (normalizedRole === 'fl_bottom_model') {
    return `fl_bottom_model_${safeTransactionId}.${extension}`;
  }

  if (normalizedRole === 'fl_gradient') {
    const normalizedBatchIndex = Number.isFinite(Number(batchIndex))
      ? Number(batchIndex)
      : 0;
    return `fl_gradient_${safeTransactionId}_batch_${normalizedBatchIndex}.${extension}`;
  }

  return `fl_result_${safeTransactionId}.${extension}`;
}

async function decryptFlResultArchive({
  encryptedTarBuffer,
  privateKeyText
}) {
  const privateKeyMaterial = parseFlPrivateKeyMaterial(privateKeyText);
  const privateKey = await importRsaPrivateKeyFromPem(privateKeyMaterial.privateKeyPem);
  const entries = parseTarEntries(encryptedTarBuffer);
  parseJsonEntry(entries, 'manifest.json');
  const resultMeta = parseJsonEntry(entries, 'meta.json');
  const resultCipher = requireEntry(entries, 'cipher.bin');
  const resultWrappedKey = requireEntry(entries, 'wrapped_key.bin');
  const resultDek = new Uint8Array(await decryptRsaOaep(privateKey, resultWrappedKey));
  const plainBytes = new Uint8Array(await decryptAesGcm(
    resultCipher,
    resultDek,
    base64ToBytes(String(resultMeta.iv || ''))
  ));

  return {
    meta: resultMeta,
    blob: new Blob([plainBytes], {
      type: resolveFlResultMimeType(resultMeta.content_type)
    })
  };
}

async function downloadDecryptedFlResult({
  encryptedTarBuffer,
  privateKeyText,
  filename,
  resultRole,
  transactionId,
  batchIndex
}) {
  const result = await decryptFlResultArchive({
    encryptedTarBuffer,
    privateKeyText
  });

  downloadBlobFile({
    blob: result.blob,
    filename: filename || buildDefaultFlResultFilename({
      resultRole,
      transactionId,
      batchIndex,
      contentType: result.meta?.content_type
    })
  });

  return result;
}

module.exports = {
  buildFlPrivateKeyFilename,
  generateFlKeyPair,
  serializeFlPrivateKeyMaterial,
  parseFlPrivateKeyMaterial,
  downloadFlPrivateKeyFile,
  createFlPackagePayload,
  decryptFlResultArchive,
  downloadDecryptedFlResult
};

module.exports.default = module.exports;
