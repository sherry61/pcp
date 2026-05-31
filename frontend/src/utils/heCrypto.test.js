const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPrivateKeyFilename,
  resolveOperationOptions,
  shouldRequirePrivateKeyUpload,
  createPrivateKeyDownload,
  parseHeKeyMaterial,
} = require('./heCrypto');

test('buildPrivateKeyFilename creates deterministic filenames per algorithm and transaction', () => {
  assert.equal(
    buildPrivateKeyFilename({ algorithm: 'Paillier', transactionId: 'TX-1' }),
    'he-paillier-private-TX-1.json'
  );
});

test('resolveOperationOptions matches backend-supported operators', () => {
  assert.deepEqual(resolveOperationOptions('ElGamal'), ['MUL']);
  assert.deepEqual(resolveOperationOptions('Paillier'), ['ADD']);
});

test('buyers must provide a local private key file before HE result decryption', () => {
  assert.equal(
    shouldRequirePrivateKeyUpload({ deliveryMethod: 'he', status: 'COMPLETED' }),
    true
  );
  assert.equal(
    shouldRequirePrivateKeyUpload({ deliveryMethod: 'he', status: 'RUNNING' }),
    false
  );
});

test('createPrivateKeyDownload and parseHeKeyMaterial round-trip HE key metadata', () => {
  const payload = createPrivateKeyDownload({
    algorithm: 'ElGamal',
    transactionId: 'TX_2',
    keyMaterial: { p: '23', g: '5', x: '7' },
  });

  assert.equal(payload.filename, 'he-elgamal-private-TX_2.json');

  const parsed = parseHeKeyMaterial(payload.text);
  assert.equal(parsed.algorithm, 'ElGamal');
  assert.equal(parsed.transactionId, 'TX_2');
  assert.equal(parsed.keyType, 'private');
  assert.deepEqual(parsed.keyMaterial, { p: 23n, g: 5n, x: 7n });
});
