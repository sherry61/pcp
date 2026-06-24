const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPcpHePublicKey,
  normalizeHeRecord,
  normalizeHeResultSyncPayload,
  ensureCompatibleExistingHeContract,
  validateHeCsvFile,
  extractHeResultMetadata
} = require('../pcp/he');

test('normalizeHeRecord stores PCP contract id and uploaded public keys in a single HE record', () => {
  const record = normalizeHeRecord({
    transactionId: 'TX-001',
    businessContractId: 'CONTRACT-001',
    buyerId: 'buyer_addr',
    sellerId: 'seller_addr',
    paillierPublicKey: { n: '11', g: '12' },
    elgamalPublicKey: { p: '23', q: '22', g: '5', y: '9' }
  });

  assert.equal(record.transaction_id, 'TX-001');
  assert.equal(record.business_contract_id, 'CONTRACT-001');
  assert.equal(record.pcp_status, 'WAITING_INPUT');
  assert.match(record.paillier_public_key_json, /"n":"11"/);
  assert.match(record.elgamal_public_key_json, /"q":"22"/);
});

test('buildPcpHePublicKey converts ElGamal public keys into PCC format with q', () => {
  const payload = buildPcpHePublicKey('ElGamal', {
    p: '23',
    q: '22',
    g: '5',
    y: '9'
  });

  assert.equal(payload.schema_version, 'pcc-he-public-key-v1');
  assert.equal(payload.algorithm, 'ELGAMAL');
  assert.deepEqual(Object.keys(payload.params), ['p', 'q', 'g', 'y']);
  assert.equal(payload.params.p, 'Fw');
  assert.equal(payload.params.q, 'Fg');
  assert.equal(payload.params.g, 'BQ');
  assert.equal(payload.params.y, 'CQ');
});

test('ensureCompatibleExistingHeContract rejects mismatched encType or operation', () => {
  assert.throws(() => ensureCompatibleExistingHeContract({
    pcp_contract_id: 'HE_TASK_001',
    selected_enc_type: 'Paillier',
    selected_operation: 'ADD'
  }, 'ElGamal', 'ADD'), /encType/);

  assert.throws(() => ensureCompatibleExistingHeContract({
    pcp_contract_id: 'HE_TASK_001',
    selected_enc_type: 'Paillier',
    selected_operation: 'ADD'
  }, 'Paillier', 'MUL'), /operation/);
});

test('validateHeCsvFile enforces PCC single cipher column schema', () => {
  assert.throws(() => validateHeCsvFile('Paillier', {
    buffer: Buffer.from('ciphertext\n123')
  }), /cipher 列/);

  assert.doesNotThrow(() => validateHeCsvFile('Paillier', {
    buffer: Buffer.from('cipher\npai1.sample_cipher')
  }));
});

test('extractHeResultMetadata reads persisted result fields from PCP-style payloads', () => {
  assert.deepEqual(
    extractHeResultMetadata({
      data: {
        result: {
          download_token: 'token-1',
          filename: 'result.csv',
          result_uri: '/tmp/result.csv'
        }
      }
    }),
    {
      downloadToken: 'token-1',
      resultFilename: 'result.csv',
      resultStoragePath: '/tmp/result.csv'
    }
  );
});

test('normalizeHeResultSyncPayload accepts transaction or PCP contract identifiers', () => {
  assert.deepEqual(
    normalizeHeResultSyncPayload({
      contractId: 'PCP-001',
      status: 'COMPLETED',
      downloadToken: 'token-1',
      resultFilename: 'result.csv'
    }),
    {
      transactionId: null,
      pcpContractId: 'PCP-001',
      pcpStatus: 'COMPLETED',
      downloadToken: 'token-1',
      resultFilename: 'result.csv',
      resultStoragePath: null,
      lastError: null
    }
  );

  assert.throws(() => normalizeHeResultSyncPayload({}), /transactionId or pcpContractId is required/);
});
