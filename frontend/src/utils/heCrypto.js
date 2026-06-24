/* global BigInt */
const {
  DELIVERY_METHOD_HE,
  HE_ENC_TYPE_OPTIONS,
  HE_OPERATION_OPTIONS,
  isHeDeliveryMethod,
} = require('./heDeliveryConfig');
const { downloadTextFile, ensureFilenameExtension, JSON_MIME_TYPE } = require('./heCsv');

const HE_PRIVATE_KEY_TYPE = 'private';
const HE_PUBLIC_KEY_TYPE = 'public';
const PAILLIER_DEFAULT_BIT_LENGTH = 2048;
const ELGAMAL_DEFAULT_BIT_LENGTH = 256;

function normalizeAlgorithmName(algorithm) {
  const normalized = String(algorithm || '').trim().toLowerCase();

  if (normalized === 'paillier') {
    return 'Paillier';
  }

  if (normalized === 'elgamal' || normalized === 'el-gamal') {
    return 'ElGamal';
  }

  return '';
}

function getAlgorithmSlug(algorithm) {
  const normalized = normalizeAlgorithmName(algorithm);
  return normalized ? normalized.toLowerCase() : 'unknown';
}

function sanitizeFilenameSegment(value, fallback = 'unknown') {
  const normalized = String(value || '').trim();
  const sanitized = normalized.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-');
  return sanitized.replace(/^-|-$/g, '') || fallback;
}

function buildPrivateKeyFilename({ algorithm, transactionId }) {
  const algorithmSlug = getAlgorithmSlug(algorithm);
  const safeTransactionId = sanitizeFilenameSegment(transactionId);
  return `he-${algorithmSlug}-private-${safeTransactionId}.json`;
}

function buildPublicKeyFilename({ algorithm, transactionId }) {
  const algorithmSlug = getAlgorithmSlug(algorithm);
  const safeTransactionId = sanitizeFilenameSegment(transactionId);
  return ensureFilenameExtension(`he-${algorithmSlug}-public-${safeTransactionId}`, 'json');
}

function resolveOperationOptions(encType) {
  return normalizeAlgorithmName(encType) === 'ElGamal'
    ? ['MUL']
    : [...HE_OPERATION_OPTIONS];
}

function shouldRequirePrivateKeyUpload({ deliveryMethod, status }) {
  return isHeDeliveryMethod(deliveryMethod) && String(status || '').trim().toUpperCase() === 'COMPLETED';
}

function serializeBigIntValue(value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeBigIntValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeBigIntValue(item)])
    );
  }

  return value;
}

function reviveBigIntValue(value) {
  if (Array.isArray(value)) {
    return value.map(reviveBigIntValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, reviveBigIntValue(item)])
    );
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return BigInt(value);
  }

  return value;
}

function serializeHeKeyMaterial({
  algorithm,
  transactionId,
  keyType = HE_PRIVATE_KEY_TYPE,
  keyMaterial,
}) {
  const normalizedAlgorithm = normalizeAlgorithmName(algorithm);

  if (!normalizedAlgorithm) {
    throw new Error('Unsupported HE algorithm.');
  }

  return JSON.stringify(
    {
      algorithm: normalizedAlgorithm,
      transactionId: String(transactionId || ''),
      keyType: String(keyType || HE_PRIVATE_KEY_TYPE),
      exportedAt: new Date().toISOString(),
      keyMaterial: serializeBigIntValue(keyMaterial || {}),
    },
    null,
    2
  );
}

function createPrivateKeyDownload({
  algorithm,
  transactionId,
  keyMaterial,
}) {
  return {
    filename: buildPrivateKeyFilename({ algorithm, transactionId }),
    text: serializeHeKeyMaterial({
      algorithm,
      transactionId,
      keyType: HE_PRIVATE_KEY_TYPE,
      keyMaterial,
    }),
  };
}

function downloadPrivateKeyFile(options) {
  const payload = createPrivateKeyDownload(options);

  return downloadTextFile({
    text: payload.text,
    filename: payload.filename,
    mimeType: JSON_MIME_TYPE,
  });
}

function parseHeKeyMaterial(rawText) {
  const parsed = JSON.parse(String(rawText || '{}'));
  const normalizedAlgorithm = normalizeAlgorithmName(parsed.algorithm);

  if (!normalizedAlgorithm) {
    throw new Error('Unsupported HE key file algorithm.');
  }

  return {
    algorithm: normalizedAlgorithm,
    transactionId: String(parsed.transactionId || ''),
    keyType: String(parsed.keyType || ''),
    keyMaterial: reviveBigIntValue(parsed.keyMaterial || {}),
    exportedAt: parsed.exportedAt || '',
  };
}

async function loadPaillierBigint() {
  const moduleRef = await import('paillier-bigint');
  return moduleRef?.default || moduleRef;
}

function assertBrowserCrypto() {
  const runtimeGlobal = typeof self !== 'undefined'
    ? self
    : (typeof window !== 'undefined' ? window : null);
  const cryptoApi = runtimeGlobal
    ? (runtimeGlobal.crypto || runtimeGlobal.msCrypto || null)
    : null;

  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('当前浏览器不支持 crypto.getRandomValues。');
  }

  return cryptoApi;
}

function randomBigInt(bitLength, { forceTopBit = true, forceOdd = true } = {}) {
  const bytes = Math.ceil(bitLength / 8);
  const cryptoApi = assertBrowserCrypto();
  const array = new Uint8Array(bytes);
  cryptoApi.getRandomValues(array);

  if (forceTopBit) {
    const highestBit = (bitLength - 1) % 8;
    array[0] |= 1 << highestBit;
  } else {
    const extraBits = bytes * 8 - bitLength;
    if (extraBits > 0) {
      array[0] &= 0xff >>> extraBits;
    }
  }

  if (forceOdd) {
    array[array.length - 1] |= 0x01;
  }

  return BigInt(`0x${Array.from(array, (item) => item.toString(16).padStart(2, '0')).join('')}`);
}

function randomBigIntBetween(min, max) {
  const range = max - min + 1n;
  const bitLength = range.toString(2).length;
  let candidate = 0n;

  do {
    candidate = randomBigInt(bitLength, {
      forceTopBit: false,
      forceOdd: false,
    });
  } while (candidate >= range);

  return min + candidate;
}

function modPow(base, exponent, modulus) {
  if (modulus === 1n) return 0n;
  let result = 1n;
  let value = ((base % modulus) + modulus) % modulus;
  let power = exponent;

  while (power > 0n) {
    if (power & 1n) {
      result = (result * value) % modulus;
    }
    power >>= 1n;
    value = (value * value) % modulus;
  }

  return result;
}

function extendedGcd(a, b) {
  if (b === 0n) {
    return { gcd: a, x: 1n, y: 0n };
  }

  const next = extendedGcd(b, a % b);
  return {
    gcd: next.gcd,
    x: next.y,
    y: next.x - (a / b) * next.y,
  };
}

function modInverse(value, modulus) {
  const { gcd, x } = extendedGcd(((value % modulus) + modulus) % modulus, modulus);
  if (gcd !== 1n) {
    throw new Error('模逆不存在');
  }
  return ((x % modulus) + modulus) % modulus;
}

function gcd(a, b) {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;

  while (right !== 0n) {
    const temp = left % right;
    left = right;
    right = temp;
  }

  return left;
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  bytes.forEach((item) => {
    binary += String.fromCharCode(item);
  });

  const encoder = typeof btoa === 'function'
    ? btoa
    : (value) => Buffer.from(value, 'binary').toString('base64');

  return encoder(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const decoder = typeof atob === 'function'
    ? atob
    : (input) => Buffer.from(input, 'base64').toString('binary');
  const binary = decoder(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bigintToFixedWidthBytes(value, width) {
  const hex = BigInt(value).toString(16);
  const paddedHex = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = Uint8Array.from(
    paddedHex.match(/.{1,2}/g) || [],
    (pair) => Number.parseInt(pair, 16)
  );

  if (bytes.length > width) {
    throw new Error('密文长度超过固定宽度。');
  }

  const output = new Uint8Array(width);
  output.set(bytes, width - bytes.length);
  return output;
}

function fixedWidthBase64UrlToBigInt(value, width) {
  const bytes = base64UrlDecodeToBytes(value);
  if (bytes.length !== width) {
    throw new Error('HE 密文宽度不正确。');
  }

  const hex = Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('');
  return BigInt(`0x${hex || '00'}`);
}

function getPaillierCiphertextWidth(publicKeyMaterial) {
  const n = BigInt(publicKeyMaterial.n);
  const modulusSquared = n * n;
  return Math.max(1, Math.ceil(modulusSquared.toString(2).length / 8));
}

function isProbablePrime(candidate, rounds = 16) {
  if (candidate === 2n || candidate === 3n) return true;
  if (candidate < 2n || candidate % 2n === 0n) return false;

  let d = candidate - 1n;
  let s = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    s += 1n;
  }

  for (let i = 0; i < rounds; i += 1) {
    const a = randomBigIntBetween(2n, candidate - 2n);
    let x = modPow(a, d, candidate);
    if (x === 1n || x === candidate - 1n) {
      continue;
    }

    let witness = true;
    for (let j = 1n; j < s; j += 1n) {
      x = modPow(x, 2n, candidate);
      if (x === candidate - 1n) {
        witness = false;
        break;
      }
    }

    if (witness) {
      return false;
    }
  }

  return true;
}

function generateProbablePrime(bitLength) {
  let candidate = randomBigInt(bitLength);
  while (!isProbablePrime(candidate)) {
    candidate += 2n;
  }
  return candidate;
}

function generateSafePrime(bitLength) {
  let q = generateProbablePrime(bitLength - 1);
  let p = 2n * q + 1n;

  while (!isProbablePrime(p)) {
    q = generateProbablePrime(bitLength - 1);
    p = 2n * q + 1n;
  }

  return { p, q };
}

function generateElGamalGenerator(p, q) {
  let generator = null;

  while (generator === null) {
    const h = randomBigIntBetween(2n, p - 2n);
    const g = modPow(h, 2n, p);
    if (g !== 1n && modPow(g, q, p) === 1n) {
      generator = g;
    }
  }

  return generator;
}

async function generatePaillierKeyPair(bitLength = PAILLIER_DEFAULT_BIT_LENGTH) {
  const paillier = await loadPaillierBigint();
  const { publicKey, privateKey } = await paillier.generateRandomKeys(bitLength);

  return {
    publicKey: {
      n: publicKey.n,
      g: publicKey.g,
    },
    privateKey: {
      lambda: privateKey.lambda,
      mu: privateKey.mu,
      n: publicKey.n,
      g: publicKey.g,
    },
  };
}

function generateElGamalKeyPair(bitLength = ELGAMAL_DEFAULT_BIT_LENGTH) {
  const { p, q } = generateSafePrime(bitLength);
  const g = generateElGamalGenerator(p, q);
  const x = randomBigIntBetween(2n, q - 1n);
  const y = modPow(g, x, p);

  return {
    publicKey: { p, g, y },
    privateKey: { p, g, y, x },
  };
}

async function generateHeKeyPairs({ paillierBitLength, elgamalBitLength } = {}) {
  const [paillierKeys, elgamalKeys] = await Promise.all([
    generatePaillierKeyPair(paillierBitLength || PAILLIER_DEFAULT_BIT_LENGTH),
    Promise.resolve(generateElGamalKeyPair(elgamalBitLength || ELGAMAL_DEFAULT_BIT_LENGTH)),
  ]);

  return {
    paillier: paillierKeys,
    elgamal: elgamalKeys,
  };
}

function parseDelimitedRows(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim()));
}

function parsePlainNumericCsv(csvText) {
  const rows = parseDelimitedRows(csvText);
  if (rows.length < 2) {
    throw new Error('CSV 至少需要表头和一行数字数据。');
  }

  const [header, ...dataRows] = rows;
  const headerName = header[0] || 'value';
  const values = dataRows.map((cells, index) => {
    const rawValue = cells[0];
    if (!rawValue || !/^-?\d+$/.test(rawValue)) {
      throw new Error(`第 ${index + 2} 行不是有效整数。`);
    }
    return BigInt(rawValue);
  });

  return { headerName, values };
}

function serializeCsvRows(rows) {
  return rows.map((cells) => cells.join(',')).join('\n');
}

function normalizePublicKeyMaterial(publicKey) {
  return reviveBigIntValue(publicKey || {});
}

function selectHePublicKey(record, algorithm) {
  const normalizedAlgorithm = normalizeAlgorithmName(algorithm);
  if (normalizedAlgorithm === 'Paillier') {
    return normalizePublicKeyMaterial(record?.paillier_public_key);
  }

  if (normalizedAlgorithm === 'ElGamal') {
    return normalizePublicKeyMaterial(record?.elgamal_public_key);
  }

  return null;
}

function generatePaillierRandomR(n) {
  let r = 1n;
  while (r <= 1n || r >= n || gcd(r, n) !== 1n) {
    r = randomBigIntBetween(2n, n - 1n);
  }
  return r;
}

function encryptPaillierValue(value, publicKeyMaterial) {
  const n = BigInt(publicKeyMaterial.n);
  const g = publicKeyMaterial.g == null ? n + 1n : BigInt(publicKeyMaterial.g);
  const nsq = n * n;

  if (value < 0n) {
    throw new Error('Paillier 当前仅支持非负整数。');
  }

  if (value >= n) {
    throw new Error('Paillier 明文必须小于公钥 n。');
  }

  const r = generatePaillierRandomR(n);
  return (modPow(g, value, nsq) * modPow(r, n, nsq)) % nsq;
}

function encryptElGamalValue(value, publicKeyMaterial) {
  const p = BigInt(publicKeyMaterial.p);
  const g = BigInt(publicKeyMaterial.g);
  const y = BigInt(publicKeyMaterial.y);

  if (value < 0n) {
    throw new Error('ElGamal 当前仅支持非负整数。');
  }

  if (value >= p) {
    throw new Error('ElGamal 明文必须小于公钥 p。');
  }

  const k = randomBigIntBetween(2n, p - 2n);
  const c1 = modPow(g, k, p);
  const c2 = (modPow(y, k, p) * value) % p;

  return { c1, c2 };
}

async function encryptHeCsv({
  algorithm,
  csvText,
  publicKey
}) {
  const normalizedAlgorithm = normalizeAlgorithmName(algorithm);
  const publicKeyMaterial = normalizePublicKeyMaterial(publicKey);
  const { values } = parsePlainNumericCsv(csvText);

  if (!normalizedAlgorithm) {
    throw new Error('Unsupported HE algorithm.');
  }

  if (!publicKeyMaterial || Object.keys(publicKeyMaterial).length === 0) {
    throw new Error('缺少 HE 公钥。');
  }

  if (normalizedAlgorithm === 'Paillier') {
    const ciphertextWidth = getPaillierCiphertextWidth(publicKeyMaterial);
    return serializeCsvRows([
      ['cipher'],
      ...values.map((value) => {
        const ciphertext = encryptPaillierValue(value, publicKeyMaterial);
        return [`pai1.${base64UrlEncodeBytes(bigintToFixedWidthBytes(ciphertext, ciphertextWidth))}`];
      })
    ]);
  }

  if (normalizedAlgorithm === 'ElGamal') {
    return serializeCsvRows([
      ['c1', 'c2'],
      ...values.map((value) => {
        const encrypted = encryptElGamalValue(value, publicKeyMaterial);
        return [encrypted.c1.toString(), encrypted.c2.toString()];
      })
    ]);
  }

  throw new Error('Unsupported HE algorithm.');
}

async function decryptPaillierCsv(csvText, privateKeyMaterial) {
  const paillier = await loadPaillierBigint();
  const rows = parseDelimitedRows(csvText);
  if (rows.length === 0) return 'result\n';

  const [header, ...dataRows] = rows;
  const width = getPaillierCiphertextWidth(privateKeyMaterial);
  const publicKey = new paillier.PublicKey(
    BigInt(privateKeyMaterial.n),
    privateKeyMaterial.g == null ? BigInt(privateKeyMaterial.n) + 1n : BigInt(privateKeyMaterial.g)
  );
  const privateKey = new paillier.PrivateKey(
    BigInt(privateKeyMaterial.lambda),
    BigInt(privateKeyMaterial.mu),
    publicKey
  );

  const decryptedRows = dataRows.map((cells) => {
    const rawCipher = String(cells[0] || '');
    if (!rawCipher.startsWith('pai1.')) {
      throw new Error('Paillier 结果文件格式无效。');
    }
    const cipher = fixedWidthBase64UrlToBigInt(rawCipher.slice(5), width);
    return privateKey.decrypt(cipher).toString();
  });

  return [
    header[0] || 'result',
    ...decryptedRows,
  ].join('\n');
}

function decryptElGamalPair({ c1, c2 }, privateKeyMaterial) {
  const p = BigInt(privateKeyMaterial.p);
  const x = BigInt(privateKeyMaterial.x);
  const sharedSecret = modPow(BigInt(c1), x, p);
  const sharedSecretInverse = modInverse(sharedSecret, p);
  return (BigInt(c2) * sharedSecretInverse) % p;
}

function decryptElGamalCsv(csvText, privateKeyMaterial) {
  const rows = parseDelimitedRows(csvText);
  if (rows.length === 0) return 'result\n';

  const [header, ...dataRows] = rows;
  const c1Index = header.indexOf('c1');
  const c2Index = header.indexOf('c2');

  if (c1Index === -1 || c2Index === -1) {
    throw new Error('ElGamal 结果文件缺少 c1,c2 列。');
  }

  const decryptedRows = dataRows.map((cells) => {
    const result = decryptElGamalPair({
      c1: cells[c1Index],
      c2: cells[c2Index],
    }, privateKeyMaterial);
    return result.toString();
  });

  return ['result', ...decryptedRows].join('\n');
}

async function decryptHeResultCsv({
  algorithm,
  encryptedCsvText,
  privateKeyText,
}) {
  const parsedKey = parseHeKeyMaterial(privateKeyText);
  const normalizedAlgorithm = normalizeAlgorithmName(algorithm || parsedKey.algorithm);

  if (normalizedAlgorithm !== parsedKey.algorithm) {
    throw new Error('私钥算法与结果算法不匹配。');
  }

  if (normalizedAlgorithm === 'Paillier') {
    return decryptPaillierCsv(encryptedCsvText, parsedKey.keyMaterial);
  }

  if (normalizedAlgorithm === 'ElGamal') {
    return decryptElGamalCsv(encryptedCsvText, parsedKey.keyMaterial);
  }

  throw new Error('Unsupported HE algorithm.');
}

function buildHePublicKeyPayload(keyPairs) {
  return {
    paillierPublicKey: serializeBigIntValue(keyPairs.paillier.publicKey),
    elgamalPublicKey: serializeBigIntValue(keyPairs.elgamal.publicKey),
  };
}

module.exports = {
  DELIVERY_METHOD_HE,
  HE_ENC_TYPE_OPTIONS,
  HE_PRIVATE_KEY_TYPE,
  HE_PUBLIC_KEY_TYPE,
  PAILLIER_DEFAULT_BIT_LENGTH,
  ELGAMAL_DEFAULT_BIT_LENGTH,
  normalizeAlgorithmName,
  getAlgorithmSlug,
  buildPrivateKeyFilename,
  buildPublicKeyFilename,
  resolveOperationOptions,
  shouldRequirePrivateKeyUpload,
  serializeHeKeyMaterial,
  createPrivateKeyDownload,
  downloadPrivateKeyFile,
  parseHeKeyMaterial,
  generatePaillierKeyPair,
  generateElGamalKeyPair,
  generateHeKeyPairs,
  selectHePublicKey,
  encryptHeCsv,
  decryptHeResultCsv,
  buildHePublicKeyPayload,
};

module.exports.default = module.exports;
