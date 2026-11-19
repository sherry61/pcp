'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  validateModelUpload,
  encryptModelPayload,
  buildFormalContractDocument,
  buildEncryptedContractPayload
} = require('../tee/modelContractProtocol');

const HASH = 'a'.repeat(64);

test('model upload accepts a non-empty .c file within the configured limit', () => {
  assert.doesNotThrow(() => validateModelUpload({
    originalname: 'risk.C',
    size: 17,
    buffer: Buffer.alloc(17, 1)
  }, 1024));
});

test('model upload rejects wrong extension, empty input, and oversize input', () => {
  assert.throws(
    () => validateModelUpload({ originalname: 'risk.txt', size: 1, buffer: Buffer.from('x') }, 1024),
    (error) => error.code === 'INVALID_MODEL_FILE' && error.statusCode === 400
  );
  assert.throws(
    () => validateModelUpload({ originalname: 'risk.c', size: 0, buffer: Buffer.alloc(0) }, 1024),
    (error) => error.code === 'INVALID_MODEL_FILE' && error.statusCode === 400
  );
  assert.throws(
    () => validateModelUpload({ originalname: 'risk.c', size: 1025, buffer: Buffer.alloc(1025) }, 1024),
    (error) => error.code === 'MODEL_TOO_LARGE' && error.statusCode === 400
  );
});

test('model encryption uses exact zero padding and never adds an aligned block', () => {
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const iv = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');

  for (const size of [1, 15, 16, 17]) {
    const plain = Buffer.alloc(size, 0x41);
    const payload = encryptModelPayload({ vmId: 'vm-1', model: plain, key, iv });
    const expectedSize = Math.ceil(size / 16) * 16;
    assert.equal(payload.fileType, 'model');
    assert.equal(payload.name, 'model.c');
    assert.equal(payload.plainSize, size);
    assert.equal(Buffer.from(payload.ciphertext, 'base64').length, expectedSize);

    const decipher = crypto.createDecipheriv('sm4-cbc', key, iv);
    decipher.setAutoPadding(false);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final()
    ]);
    assert.deepEqual(decrypted.subarray(0, size), plain);
    assert.ok(decrypted.subarray(size).every((byte) => byte === 0));
  }
});

test('formal contract preserves existing fields and adds the Hygon verification fields', () => {
  const document = buildFormalContractDocument({
    id: 91,
    contract_id: 'CONTRACT-513',
    transaction_id: 513,
    contract_name: '车辆风险合约',
    model_file_hash: HASH,
    delivery_limit: 3,
    created_at: '2026-10-07 16:00:01'
  });

  assert.equal(document.contract_id, 'CONTRACT-513');
  assert.equal(document.contract_name, '车辆风险合约');
  assert.equal(document.model_file_hash, HASH);
  assert.equal(document.delivery_limit, 3);
  assert.equal(document.fileHash, HASH);
  assert.equal(document.delivery_cnt, '3');
  assert.match(document.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(document.id, undefined);
});

test('formal contract rejects incomplete hash, limit, or timestamp instead of inventing values', () => {
  const valid = { model_file_hash: HASH, delivery_limit: 3, created_at: '2026-10-07 16:00:01' };
  for (const contract of [
    { ...valid, model_file_hash: null },
    { ...valid, delivery_limit: null },
    { ...valid, delivery_limit: 0 },
    { ...valid, created_at: null }
  ]) {
    assert.throws(
      () => buildFormalContractDocument(contract),
      (error) => error.code === 'CONTRACT_INCOMPLETE' && error.statusCode === 409
    );
  }
});

test('contract JSON and successful count use PKCS#7 with the same IV', () => {
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const iv = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
  const contract = buildFormalContractDocument({
    contract_id: 'CONTRACT-513',
    model_file_hash: HASH,
    delivery_limit: 3,
    created_at: '2026-10-07T08:00:01Z'
  });
  const payload = buildEncryptedContractPayload({ vmId: 'vm-1', contract, successfulDeliveries: 2, key, iv });

  assert.equal(payload.vmId, 'vm-1');
  assert.equal(payload.iv, iv.toString('base64'));

  const decrypt = (value) => {
    const decipher = crypto.createDecipheriv('sm4-cbc', key, iv);
    return Buffer.concat([decipher.update(Buffer.from(value, 'base64')), decipher.final()]).toString('utf8');
  };
  assert.deepEqual(JSON.parse(decrypt(payload.ciphertext)), contract);
  assert.equal(decrypt(payload.deliveried_cnt), '2');
});

test('successful count excludes the current running reservation before encryption', () => {
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const contract = buildFormalContractDocument({
    model_file_hash: HASH,
    delivery_limit: 3,
    created_at: '2026-10-07T08:00:01Z'
  });
  assert.throws(
    () => buildEncryptedContractPayload({ vmId: 'vm-1', contract, successfulDeliveries: -1, key }),
    (error) => error.code === 'INVALID_DELIVERY_COUNT'
  );
});
