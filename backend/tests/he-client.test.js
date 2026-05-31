const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHeContractPayload } = require('../pcp/he');
const { buildPcpHeaders } = require('../pcp/client');

test('buildHeContractPayload maps transaction and business contract data to PCP /he/contract body', () => {
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
    buyer_id: 'buyer_addr',
    source_contract_id: 'CONTRACT-001',
    seller_ids: ['seller_addr'],
    operation_type: 'ADD',
    enc_type: 'Paillier',
    data_type_1: 'ciphertext',
    data_type_2: 'ciphertext'
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

test('buildHeContractPayload rejects unsupported encType and operation', () => {
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
});

test('buildPcpHeaders includes PCP auth headers required by HE endpoints', () => {
  const headers = buildPcpHeaders({ entityId: 'buyer_addr' });

  assert.equal(headers['x-entity-id'], 'buyer_addr');
  assert.match(headers['x-timestamp'], /^\d+$/);
  assert.equal(typeof headers['x-nonce'], 'string');
  assert.ok(headers['x-nonce'].length > 0);
});
