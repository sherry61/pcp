'use strict';

const { JOB_STATUS, TERMINAL_STATUSES } = require('./constants');

function stringify(value) {
  return value == null ? null : JSON.stringify(value);
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    transaction_id: row.transaction_id,
    business_contract_id: row.business_contract_id,
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    coefficient: row.coefficient == null ? null : String(row.coefficient),
    threshold: row.threshold == null ? null : String(row.threshold),
    parties: parseJson(row.parties_json),
    status: row.status,
    samples: parseJson(row.samples_json),
    result: parseJson(row.result_json),
    evidence: parseJson(row.evidence_json),
    pcc_contract_id: row.pcc_contract_id || null,
    delivery_id: row.delivery_id || null,
    pam_event_id: row.pam_event_id || null,
    consensus_status: row.consensus_status || null,
    consensus_result: row.consensus_result || null,
    responded_nodes: row.responded_nodes == null ? 0 : Number(row.responded_nodes),
    passed_nodes: row.passed_nodes == null ? 0 : Number(row.passed_nodes),
    target_nodes: parseJson(row.target_nodes_json) || [],
    last_error: row.last_error || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getJob(dbQuery, transactionId) {
  const rows = await dbQuery(
    'SELECT * FROM mpc_audit_jobs WHERE transaction_id = ? LIMIT 1',
    [String(transactionId)]
  );
  return mapRow(rows && rows[0]);
}

async function createJob(dbQuery, input) {
  const transactionId = String(input.transactionId || '').trim();
  if (!transactionId) {
    const error = new Error('transactionId 不能为空');
    error.statusCode = 400;
    throw error;
  }

  await dbQuery(
    `INSERT INTO mpc_audit_jobs
       (transaction_id, business_contract_id, buyer_id, seller_id,
        coefficient, threshold, parties_json, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       business_contract_id = VALUES(business_contract_id),
       buyer_id = VALUES(buyer_id),
       seller_id = VALUES(seller_id),
       coefficient = VALUES(coefficient),
       threshold = VALUES(threshold),
       parties_json = VALUES(parties_json),
       status = VALUES(status),
       samples_json = NULL,
       result_json = NULL,
       evidence_json = NULL,
       pcc_contract_id = NULL,
       delivery_id = NULL,
       pam_event_id = NULL,
       consensus_status = NULL,
       consensus_result = NULL,
       responded_nodes = 0,
       passed_nodes = 0,
       target_nodes_json = NULL,
       last_error = NULL`,
    [
      transactionId,
      String(input.businessContractId || transactionId),
      String(input.buyerId || ''),
      String(input.sellerId || ''),
      String(input.coefficient),
      input.threshold == null ? null : String(input.threshold),
      stringify(input.parties || null),
      JOB_STATUS.CREATED
    ]
  );

  return getJob(dbQuery, transactionId);
}

async function saveSamples(dbQuery, transactionId, payload) {
  await dbQuery(
    `UPDATE mpc_audit_jobs
        SET samples_json = ?,
            result_json = ?,
            coefficient = ?,
            threshold = ?,
            parties_json = COALESCE(?, parties_json),
            status = ?,
            last_error = NULL
      WHERE transaction_id = ?`,
    [
      stringify(payload.samples),
      stringify(payload.result),
      String(payload.coefficient),
      payload.threshold == null ? null : String(payload.threshold),
      payload.parties ? stringify(payload.parties) : null,
      JOB_STATUS.DATA_READY,
      String(transactionId)
    ]
  );
  return getJob(dbQuery, transactionId);
}

async function saveSubmission(dbQuery, transactionId, payload) {
  await dbQuery(
    `UPDATE mpc_audit_jobs
        SET evidence_json = ?,
            pcc_contract_id = ?,
            delivery_id = ?,
            pam_event_id = ?,
            status = ?,
            consensus_status = ?,
            consensus_result = ?,
            responded_nodes = 0,
            passed_nodes = 0,
            target_nodes_json = ?,
            last_error = NULL
      WHERE transaction_id = ?`,
    [
      stringify(payload.evidence),
      payload.pccContractId,
      payload.deliveryId,
      payload.eventId,
      JOB_STATUS.AUDIT_PENDING,
      'PENDING',
      null,
      stringify(payload.targetNodes || []),
      String(transactionId)
    ]
  );
  return getJob(dbQuery, transactionId);
}

async function saveAuditStatus(dbQuery, transactionId, payload) {
  await dbQuery(
    `UPDATE mpc_audit_jobs
        SET status = ?,
            consensus_status = ?,
            consensus_result = ?,
            responded_nodes = ?,
            passed_nodes = ?,
            target_nodes_json = COALESCE(?, target_nodes_json),
            last_error = ?
      WHERE transaction_id = ?`,
    [
      payload.status,
      payload.consensusStatus == null ? null : String(payload.consensusStatus),
      payload.consensusResult == null ? null : String(payload.consensusResult),
      Number(payload.respondedNodes || 0),
      Number(payload.passedNodes || 0),
      payload.targetNodes ? stringify(payload.targetNodes) : null,
      payload.error || null,
      String(transactionId)
    ]
  );
  return getJob(dbQuery, transactionId);
}

async function markFailed(dbQuery, transactionId, message) {
  await dbQuery(
    `UPDATE mpc_audit_jobs
        SET status = ?, last_error = ?
      WHERE transaction_id = ?`,
    [JOB_STATUS.FAILED, String(message || 'unknown error'), String(transactionId)]
  );
  return getJob(dbQuery, transactionId);
}

function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

module.exports = {
  getJob,
  createJob,
  saveSamples,
  saveSubmission,
  saveAuditStatus,
  markFailed,
  isTerminal,
  mapRow
};
