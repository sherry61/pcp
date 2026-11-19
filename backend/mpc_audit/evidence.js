'use strict';

const {
  MPC_AUDIT_METHOD,
  MPC_AUDIT_MODE,
  MPC_AUDIT_EVIDENCE_SCHEMA
} = require('./constants');

function requireNonEmpty(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    const error = new Error(`${fieldName} 不能为空`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

// 三方逻辑身份：卖方 A、卖方 B、买方系数 C。
// 用后缀区分，避免同一交易里卖方/买方地址相同导致承诺身份重复。
function buildParties({ sellerId, buyerId }) {
  const seller = requireNonEmpty(sellerId, 'sellerId');
  const buyer = requireNonEmpty(buyerId, 'buyerId');
  return {
    sellerA: `${seller}-A`,
    sellerB: `${seller}-B`,
    buyerC: `${buyer}-C`
  };
}

function toCipher(value) {
  const text = String(value);
  if (!/^[0-9]+$/.test(text)) {
    throw new Error(`evidence value must be a non-negative integer: ${text}`);
  }
  return `mpc1.${text}`;
}

function buildMpcCompositeEvidence({
  transactionId,
  businessContractId,
  sellerId,
  buyerId,
  samples
}) {
  const transaction = requireNonEmpty(transactionId, 'transactionId');
  const contractId = requireNonEmpty(businessContractId, 'businessContractId');
  const parties = buildParties({ sellerId, buyerId });

  if (!Array.isArray(samples) || samples.length === 0) {
    const error = new Error('samples 不能为空');
    error.statusCode = 400;
    throw error;
  }

  return {
    schema_version: MPC_AUDIT_EVIDENCE_SCHEMA,
    method: MPC_AUDIT_METHOD,
    attempt_id: `ATT_${transaction}`,
    contract_id: contractId,
    he_compute_mode: MPC_AUDIT_MODE,
    seller_ids: [parties.sellerA, parties.sellerB, parties.buyerC],
    samples: samples.map((sample, index) => ({
      row_index: sample.row_index || index + 1,
      seller_inputs: [
        { seller_id: parties.sellerA, cipher: toCipher(sample.a) },
        { seller_id: parties.sellerB, cipher: toCipher(sample.b) },
        { seller_id: parties.buyerC, cipher: toCipher(sample.c) }
      ],
      PCC_output: toCipher(sample.y)
    }))
  };
}

module.exports = {
  buildParties,
  buildMpcCompositeEvidence
};
