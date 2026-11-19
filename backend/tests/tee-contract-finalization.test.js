const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

let finalization = {};
try { finalization = require('../tee/contractFinalization'); } catch (_) { /* RED */ }

const validHash = crypto.createHash('sha256').update('model').digest('hex');

test('TEE proposals bind delivery limit to purchase quantity', () => {
  assert.equal(typeof finalization.validateTeeTransactionProposal, 'function');
  assert.deepEqual(finalization.validateTeeTransactionProposal({
    pcType: 'tee', modelFileHash: validHash, purchaseQuantity: '3', deliveryLimit: '99'
  }), { pcType: 'TEE', modelFileHash: validHash, deliveryLimit: 3 });

  assert.throws(
    () => finalization.validateTeeTransactionProposal({ pcType: 'TEE', modelFileHash: 'bad', purchaseQuantity: 3 }),
    /SHA-256/
  );
  assert.throws(
    () => finalization.validateTeeTransactionProposal({ pcType: 'TEE', modelFileHash: validHash, purchaseQuantity: 0 }),
    /positive integer/i
  );
});

test('non-TEE proposals remain compatible without model terms', () => {
  assert.deepEqual(finalization.validateTeeTransactionProposal({ pcType: 'HE' }), {
    pcType: 'HE', modelFileHash: null, deliveryLimit: null
  });
});

test('TEE contract construction preserves existing fields and adds delivery limit', () => {
  assert.equal(typeof finalization.buildTeeDigitalContract, 'function');
  const contract = finalization.buildTeeDigitalContract({
    transaction: {
      transaction_id: 700,
      asset_id: 'asset-hash',
      buyer_address: 'buyer-address',
      seller_address: 'seller-address',
      quality: '持有权,使用权',
      expiration_time: '2026-12-01 00:00:00',
      quantity: 2,
      processing_type: 'model',
      pc_type: 'TEE',
      model_file_hash: validHash,
      delivery_limit: 3
    },
    asset: { asset_name: '风险模型服务', description: '计算服务说明' }
  });

  assert.deepEqual(contract, {
    contract_id: 'CONTRACT-700',
    transaction_id: 700,
    contract_name: '风险模型服务-数字合约',
    product_name: '风险模型服务',
    token_id: 'asset-hash',
    contract_description: '计算服务说明',
    seller_address: 'seller-address',
    buyer_address: 'buyer-address',
    operations: '持有,使用权',
    expiration_time: '2026-12-01 00:00:00',
    quantity_limit: 2,
    processing_type: 'model',
    pc_type: 'TEE',
    model_file_hash: validHash,
    delivery_limit: 3
  });
});
