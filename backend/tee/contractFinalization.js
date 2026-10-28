'use strict';

const { normalizePcType, validateDeliveryLimit } = require('./contractPolicy');

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

function validateTeeTransactionProposal({ pcType, modelFileHash, purchaseQuantity, deliveryLimit } = {}) {
  const normalizedPcType = normalizePcType(pcType);
  if (normalizedPcType !== 'TEE') {
    return { pcType: normalizedPcType, modelFileHash: null, deliveryLimit: null };
  }
  const normalizedHash = String(modelFileHash || '').trim().toLowerCase();
  if (!SHA256_HEX_RE.test(normalizedHash)) {
    throw new TypeError('TEE model SHA-256 is required');
  }
  return {
    pcType: normalizedPcType,
    modelFileHash: normalizedHash,
    deliveryLimit: validateDeliveryLimit(purchaseQuantity ?? deliveryLimit)
  };
}

function normalizeOperations(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item === '持有权' ? '持有' : item)
    .join(',');
}

function buildTeeDigitalContract({ transaction, asset } = {}) {
  if (!transaction) throw new TypeError('transaction is required');
  const terms = validateTeeTransactionProposal({
    pcType: transaction.pc_type,
    modelFileHash: transaction.model_file_hash,
    deliveryLimit: transaction.delivery_limit
  });
  if (terms.pcType !== 'TEE') throw new TypeError('transaction is not TEE');
  const productName = asset?.asset_name || '数字产品';
  return {
    contract_id: `CONTRACT-${transaction.transaction_id}`,
    transaction_id: transaction.transaction_id,
    contract_name: `${productName}-数字合约`,
    product_name: productName,
    token_id: transaction.asset_id,
    contract_description: asset?.description || '自动生成数字合约',
    seller_address: transaction.seller_address,
    buyer_address: transaction.buyer_address,
    operations: normalizeOperations(transaction.quality),
    expiration_time: transaction.expiration_time || null,
    quantity_limit: transaction.quantity ?? null,
    processing_type: transaction.processing_type || null,
    pc_type: terms.pcType,
    model_file_hash: terms.modelFileHash,
    delivery_limit: terms.deliveryLimit
  };
}

module.exports = {
  validateTeeTransactionProposal,
  buildTeeDigitalContract
};
