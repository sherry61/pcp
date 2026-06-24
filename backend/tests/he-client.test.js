const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHeContractPayload } = require('../pcp/he');
const { buildPcpHeaders } = require('../pcp/client');

test('buildHeContractPayload maps transaction and business contract data to new PCP /he/contract body', () => {
  const payload = buildHeContractPayload({
    transaction: {
      buyer_address: 'buyer_addr',
      seller_address: 'seller_addr'
    },
    businessContractId: 'CONTRACT-001',
    encType: 'Paillier',
    operation: 'ADD'
  });

  assert.deepEqual(payload, {
    idempotency_key: 'CONTRACT-001-he-PAILLIER_ADD',
    buyer_id: 'buyer_addr',
    source_contract_id: 'CONTRACT-001',
    seller_ids: ['seller_addr#file1', 'seller_addr#file2'],
    he_compute_mode: 'PAILLIER_ADD',
    csv_format: 'SINGLE_CIPHER_COLUMN'
  });
});

test('buildHeContractPayload rejects missing required transaction fields', () => {
  assert.throws(() => buildHeContractPayload({
    businessContractId: 'CONTRACT-001',
    encType: 'Paillier',
    operation: 'ADD'
  }), /transaction is required/);

  assert.throws(() => buildHeContractPayload({
    transaction: {
      seller_address: 'seller_addr'
    },
    businessContractId: 'CONTRACT-001',
    encType: 'Paillier',
    operation: 'ADD'
  }), /buyer_address is required/);

  assert.throws(() => buildHeContractPayload({
    transaction: {
      buyer_address: 'buyer_addr'
    },
    businessContractId: 'CONTRACT-001',
    encType: 'Paillier',
    operation: 'ADD'
  }), /seller_address is required/);

  assert.throws(() => buildHeContractPayload({
    transaction: {
      buyer_address: 'buyer_addr',
      seller_address: 'seller_addr'
    },
    encType: 'Paillier',
    operation: 'ADD'
  }), /businessContractId is required/);
});

test('buildHeContractPayload rejects unsupported or illegal encType and operation combinations', () => {
  assert.throws(() => buildHeContractPayload({
    transaction: {
      buyer_address: 'buyer_addr',
      seller_address: 'seller_addr'
    },
    businessContractId: 'CONTRACT-001',
    encType: 'RSA',
    operation: 'ADD'
  }), /encType must be one of/);

  assert.throws(() => buildHeContractPayload({
    transaction: {
      buyer_address: 'buyer_addr',
      seller_address: 'seller_addr'
    },
    businessContractId: 'CONTRACT-001',
    encType: 'Paillier',
    operation: 'sub'
  }), /operation must be one of/);

  assert.throws(() => buildHeContractPayload({
    transaction: {
      buyer_address: 'buyer_addr',
      seller_address: 'seller_addr'
    },
    businessContractId: 'CONTRACT-001',
    encType: 'Paillier',
    operation: 'MUL'
  }), /当前不支持/);
});

test('buildPcpHeaders includes PCC service auth identity header', () => {
  const headers = buildPcpHeaders();

  assert.equal(headers['x-client-id'], 'trading-system');
});
