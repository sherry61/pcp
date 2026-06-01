const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFlContractPayload,
  normalizeFlRecord,
  mapFlRecordRow,
  extractFlResultMetadata,
  normalizeFlResultSyncPayload,
  normalizeSellerIds,
  validateHexString,
  buildFlSellerResultKey
} = require('../pcp/fl');

test('buildFlContractPayload maps buyer, sellers, and training params to PCP /fl/contract body', () => {
  const payload = buildFlContractPayload({
    transaction: {
      buyer_address: 'buyer_addr',
      seller_address: 'seller_addr'
    },
    businessContractId: 'CONTRACT-001',
    sellerIds: ['seller_addr'],
    buyerResultPublicKey: 'A1B2',
    maxEpochs: '3',
    learningRate: '0.01',
    batchSize: '16',
    lossFunction: 'BCE',
    dpNoiseScale: '0.2',
    dpClippingThreshold: '0.8'
  });

  assert.deepEqual(payload, {
    buyer_id: 'buyer_addr',
    source_contract_id: 'CONTRACT-001',
    seller_ids: 'seller_addr',
    max_epochs: 3,
    learning_rate: 0.01,
    batch_size: 16,
    loss_function: 'BCE',
    dp_noise_scale: 0.2,
    dp_clipping_threshold: 0.8,
    buyer_result_public_key: 'A1B2'
  });
});

test('normalizeFlRecord and mapFlRecordRow preserve seller package state', () => {
  const record = normalizeFlRecord({
    transactionId: 'TX-001',
    businessContractId: 'CONTRACT-001',
    pcpContractId: 'FL_TASK_001',
    buyerId: 'buyer_addr',
    sellerIds: ['seller_addr'],
    buyerResultPublicKey: 'A1B2',
    sellerJoinPackages: {
      seller_addr: {
        download_token: 'join-token'
      }
    }
  });

  assert.equal(record.transaction_id, 'TX-001');
  assert.match(record.seller_ids_json, /seller_addr/);

  const mapped = mapFlRecordRow(record);
  assert.deepEqual(mapped.seller_ids, ['seller_addr']);
  assert.equal(mapped.seller_join_packages.seller_addr.download_token, 'join-token');
});

test('normalizeSellerIds and validateHexString reject invalid values', () => {
  assert.deepEqual(normalizeSellerIds('seller_a,seller_b'), ['seller_a', 'seller_b']);
  assert.equal(validateHexString('A1B2', 'buyerResultPublicKey'), 'A1B2');
  assert.throws(() => validateHexString('XYZ', 'buyerResultPublicKey'), /hex string/);
});

test('extractFlResultMetadata and normalizeFlResultSyncPayload read PCP FL result fields', () => {
  assert.deepEqual(
    extractFlResultMetadata({
      data: {
        result: {
          download_token: 'token-1',
          filename: 'top_model.tar',
          result_uri: 's3://bucket/top_model.tar'
        }
      }
    }),
    {
      downloadToken: 'token-1',
      resultFilename: 'top_model.tar',
      resultStoragePath: 's3://bucket/top_model.tar'
    }
  );

  assert.deepEqual(
    normalizeFlResultSyncPayload({
      contractId: 'FL_TASK_001',
      status: 'COMPLETED',
      currentEpoch: 2,
      receiverId: 'buyer_addr',
      resultRole: 'fl_top_model',
      downloadToken: 'token-1'
    }),
    {
      transactionId: null,
      pcpContractId: 'FL_TASK_001',
      pcpStatus: 'COMPLETED',
      currentEpoch: 2,
      receiverId: 'buyer_addr',
      resultRole: 'fl_top_model',
      batchIndex: null,
      downloadToken: 'token-1',
      resultFilename: null,
      resultStoragePath: null,
      lastError: null
    }
  );
});

test('buildFlSellerResultKey makes seller result map keys stable', () => {
  assert.equal(
    buildFlSellerResultKey({
      sellerId: 'seller_addr',
      resultRole: 'fl_gradient',
      batchIndex: 0
    }),
    'seller_addr::fl_gradient::0'
  );
});
