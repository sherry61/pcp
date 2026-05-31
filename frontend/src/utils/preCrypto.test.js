const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PRE_ALLOWED_SOURCE_EXTENSIONS,
  buildPrePrivateKeyFilename,
  parsePrePrivateKeyMaterial,
  isAllowedPreSourceFileName,
  createKeyPackageHex
} = require('./preCrypto');

test('PRE helpers expose the accepted archive extensions', () => {
  assert.deepEqual(PRE_ALLOWED_SOURCE_EXTENSIONS, ['.zip', '.tar', '.tar.gz', '.tgz']);
  assert.equal(isAllowedPreSourceFileName('payload.tar.gz'), true);
  assert.equal(isAllowedPreSourceFileName('payload.pdf'), false);
});

test('buildPrePrivateKeyFilename binds the downloaded private key to transactionId', () => {
  assert.equal(
    buildPrePrivateKeyFilename({ transactionId: 'TX-1' }),
    'pre-private-TX-1.json'
  );
});

test('parsePrePrivateKeyMaterial reads buyer private key files', () => {
  const parsed = parsePrePrivateKeyMaterial(JSON.stringify({
    algorithm: 'RSA-OAEP-SHA256',
    transactionId: 'TX-2',
    keyType: 'private',
    privateKeyPem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
  }));

  assert.equal(parsed.transactionId, 'TX-2');
  assert.equal(parsed.keyType, 'private');
  assert.match(parsed.privateKeyPem, /BEGIN PRIVATE KEY/);
});

test('createKeyPackageHex prefixes the part count and byte lengths in little-endian order', () => {
  const hex = createKeyPackageHex([
    Uint8Array.from([0x01, 0x02]),
    Uint8Array.from([0x03])
  ]);

  assert.equal(
    hex,
    '020000000000000002000000000000000100000000000000010203'
      .toUpperCase()
  );
});
