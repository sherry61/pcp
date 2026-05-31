const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPreContractPayload,
  normalizePreRecord,
  normalizePreResultSyncPayload,
  extractPreResultMetadata,
  validatePreSourceArchive,
  validatePreHexString
} = require('../pcp/pre');

test('buildPreContractPayload maps transaction and contract data to PCP /pre/contract body', () => {
  const payload = buildPreContractPayload({
    transaction: {
      buyer_address: 'buyer_addr',
      seller_address: 'seller_addr'
    },
    businessContractId: 'CONTRACT-001'
  });

  assert.deepEqual(payload, {
    buyer_id: 'buyer_addr',
    source_contract_id: 'CONTRACT-001',
    seller_ids: ['seller_addr']
  });
});

test('normalizePreRecord stores buyer public key and PRE contract metadata in one row', () => {
  const record = normalizePreRecord({
    transactionId: 'TX-001',
    businessContractId: 'CONTRACT-001',
    buyerId: 'buyer_addr',
    sellerId: 'seller_addr',
    buyerPublicKey: 'A1B2',
    teeKeyId: 'tee-key-current'
  });

  assert.equal(record.transaction_id, 'TX-001');
  assert.equal(record.buyer_public_key, 'A1B2');
  assert.equal(record.tee_key_id, 'tee-key-current');
  assert.equal(record.pcp_status, 'CREATED');
});

test('validatePreSourceArchive only allows the agreed archive formats', () => {
  assert.doesNotThrow(() => validatePreSourceArchive({
    originalname: 'payload.tar.gz'
  }));

  assert.throws(() => validatePreSourceArchive({
    originalname: 'payload.pdf'
  }), /仅支持/);
});

test('validatePreHexString requires even-length hex strings', () => {
  assert.equal(validatePreHexString('A1B2', 'buyerPublicKey'), 'A1B2');
  assert.throws(() => validatePreHexString('XYZ', 'buyerPublicKey'), /hex string/);
});

test('extractPreResultMetadata and normalizePreResultSyncPayload read PCP result metadata', () => {
  assert.deepEqual(
    extractPreResultMetadata({
      data: {
        result: {
          download_token: 'token-1',
          filename: 'pre_result.tar',
          result_uri: '/tmp/pre_result.tar'
        }
      }
    }),
    {
      downloadToken: 'token-1',
      resultFilename: 'pre_result.tar',
      resultStoragePath: '/tmp/pre_result.tar'
    }
  );

  assert.deepEqual(
    normalizePreResultSyncPayload({
      contractId: 'PRE-001',
      status: 'COMPLETED',
      downloadToken: 'token-1'
    }),
    {
      transactionId: null,
      pcpContractId: 'PRE-001',
      pcpStatus: 'COMPLETED',
      downloadToken: 'token-1',
      resultFilename: null,
      resultStoragePath: null,
      lastError: null
    }
  );
});
