const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPreContractPayload,
  buildPreAttemptMetadata,
  normalizePreRecord,
  normalizePreResultSyncPayload,
  extractPreResultMetadata,
  validatePreSourceArchive,
  validatePreJsonPayload
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
    idempotency_key: 'CONTRACT-001-pre-afgh',
    buyer_id: 'buyer_addr',
    source_contract_id: 'CONTRACT-001',
    seller_ids: ['seller_addr'],
    pre_scheme: 'AFGH_PRE',
    pre_params: {
      curve: 'bn254',
      cipher_format: 'scheme-native'
    }
  });
});

test('buildPreAttemptMetadata maps PRE attempt materials to PCP metadata body', () => {
  const metadata = buildPreAttemptMetadata({
    contractId: 'PCC_PRE_001',
    sourcePublicKey: { key_id: 'seller-src-key' },
    targetPublicKey: { key_id: 'buyer-key' },
    reencryptionKey: { key_id: 'rk-001' }
  });

  assert.equal(metadata.source_public_key.key_id, 'seller-src-key');
  assert.equal(metadata.target_public_key.key_id, 'buyer-key');
  assert.equal(metadata.reencryption_key.key_id, 'rk-001');
  assert.match(metadata.idempotency_key, /^PCC_PRE_001-attempt-/);
});

test('normalizePreRecord stores PRE attempt metadata in one row', () => {
  const record = normalizePreRecord({
    transactionId: 'TX-001',
    businessContractId: 'CONTRACT-001',
    buyerId: 'buyer_addr',
    sellerId: 'seller_addr',
    currentAttemptId: 'ATT-001',
    buyerPublicKey: { key_id: 'buyer-key' },
    sellerSourcePublicKey: { key_id: 'seller-src-key' },
    reencryptionKey: { key_id: 'rk-001' }
  });

  assert.equal(record.transaction_id, 'TX-001');
  assert.equal(record.current_attempt_id, 'ATT-001');
  assert.match(record.buyer_public_key, /buyer-key/);
  assert.match(record.seller_source_public_key, /seller-src-key/);
  assert.match(record.reencryption_key, /rk-001/);
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

test('validatePreJsonPayload requires object input', () => {
  assert.deepEqual(validatePreJsonPayload({ key_id: 'buyer-key' }, 'buyerPublicKey'), {
    key_id: 'buyer-key'
  });
  assert.throws(() => validatePreJsonPayload('XYZ', 'buyerPublicKey'), /JSON object/);
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
