'use strict';

const { evaluateTeeEntitlement, normalizePcType } = require('./contractPolicy');
const { buildFormalContractDocument } = require('./modelContractProtocol');

function entitlementError(code, message, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function loadTeeEntitlement(dbQuery, transactionId, { nowMs = Date.now() } = {}) {
  const rows = await dbQuery(
    `SELECT t.transaction_id, dc.contract_id, dc.pc_type,
            COALESCE(dc.expiration_time, t.expiration_time) AS expiration_time,
            dc.delivery_limit, dc.model_file_hash
       FROM transactions t
       LEFT JOIN digital_contracts dc ON dc.transaction_id = t.transaction_id
      WHERE t.transaction_id = ?
      ORDER BY dc.id DESC
      LIMIT 1`,
    [String(transactionId)]
  );
  const contract = rows[0];
  if (!contract?.contract_id || normalizePcType(contract.pc_type) !== 'TEE') {
    throw entitlementError('CONTRACT_INCOMPLETE', 'TEE 数字合约不存在或交付方式不匹配');
  }
  if (contract.delivery_limit != null && !/^[0-9a-f]{64}$/.test(String(contract.model_file_hash || ''))) {
    throw entitlementError('CONTRACT_INCOMPLETE', 'TEE 数字合约缺少有效的模型哈希');
  }

  const countRows = await dbQuery(
    `SELECT COALESCE(SUM(status = 'SUCCESS'), 0) AS successful_deliveries,
            COALESCE(SUM(status = 'RUNNING'), 0) AS active_reservations
       FROM tee_delivery_attempts
      WHERE transaction_id = ?`,
    [String(transactionId)]
  );
  const successfulDeliveries = Number(countRows[0]?.successful_deliveries || 0);
  const activeReservations = Number(countRows[0]?.active_reservations || 0);
  const evaluation = evaluateTeeEntitlement({
    expirationTime: contract.expiration_time,
    deliveryLimit: contract.delivery_limit,
    successfulDeliveries,
    activeReservations,
    nowMs
  });

  return {
    contractId: contract.contract_id,
    deliveryLimit: contract.delivery_limit == null ? null : Number(contract.delivery_limit),
    successfulDeliveries,
    activeReservations,
    ...evaluation
  };
}

async function loadTeeVerificationContract(dbQuery, transactionId) {
  const rows = await dbQuery(
    `SELECT dc.*
       FROM digital_contracts dc
      WHERE dc.transaction_id = ?
      ORDER BY dc.id DESC
      LIMIT 1`,
    [String(transactionId)]
  );
  const row = rows[0];
  if (!row?.contract_id || normalizePcType(row.pc_type) !== 'TEE') {
    throw entitlementError('CONTRACT_INCOMPLETE', 'TEE 数字合约不存在或交付方式不匹配');
  }
  const contract = buildFormalContractDocument(row);
  const countRows = await dbQuery(
    `SELECT COUNT(*) AS successful_deliveries
       FROM tee_delivery_attempts
      WHERE transaction_id = ? AND status = 'SUCCESS'`,
    [String(transactionId)]
  );
  return {
    contract,
    successfulDeliveries: Number(countRows[0]?.successful_deliveries || 0)
  };
}

function assertTeeDeliveryAllowed(entitlement) {
  if (entitlement?.expired) {
    throw entitlementError('CONTRACT_EXPIRED', '数字合约已过期，不能继续交付');
  }
  if (Number(entitlement?.activeReservations || 0) > 0) {
    throw entitlementError('DELIVERY_IN_PROGRESS', '当前交付正在进行中，请等待完成');
  }
  if (entitlement?.limitReached) {
    throw entitlementError('DELIVERY_LIMIT_REACHED', '已达到约定交付次数');
  }
  return entitlement;
}

module.exports = {
  loadTeeEntitlement,
  loadTeeVerificationContract,
  assertTeeDeliveryAllowed,
  entitlementError
};
