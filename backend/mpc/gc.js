const { MPC_TASK_STATUSES, MPC_TERMINAL_STATUSES } = require('./constants');

function normalizeMpcStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (!status) {
    return 'pending';
  }

  if (MPC_TASK_STATUSES.includes(status)) {
    return status;
  }

  return status;
}

function isTerminalMpcStatus(status) {
  return MPC_TERMINAL_STATUSES.includes(normalizeMpcStatus(status));
}

function validateGcComputeParams(params = {}) {
  const threshold = Number(params.threshold);
  const riskFactor = Number(params.risk_factor);

  if (!Number.isFinite(threshold) || threshold < 0) {
    const error = new Error('threshold 必须是非负数字');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(riskFactor) || riskFactor < 0) {
    const error = new Error('risk_factor 必须是非负数字');
    error.statusCode = 400;
    throw error;
  }

  return {
    threshold,
    risk_factor: riskFactor
  };
}

function parseJsonFileBuffer(file) {
  if (!file || !file.buffer) {
    const error = new Error('卖方数据文件不能为空');
    error.statusCode = 400;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(file.buffer.toString('utf8'));
  } catch (error) {
    const parseError = new Error('卖方数据必须是合法 JSON');
    parseError.statusCode = 400;
    throw parseError;
  }

  if (parsed == null || Array.isArray(parsed) || typeof parsed !== 'object') {
    const error = new Error('卖方数据必须是 JSON 对象');
    error.statusCode = 400;
    throw error;
  }

  for (const field of ['user_id', 'income', 'credit_score']) {
    if (parsed[field] === undefined || parsed[field] === null || parsed[field] === '') {
      const error = new Error(`卖方数据缺少字段 ${field}`);
      error.statusCode = 400;
      throw error;
    }
  }

  return parsed;
}

function mapMpcRecordRow(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    transaction_id: record.transaction_id,
    business_contract_id: record.business_contract_id,
    remote_task_id: record.remote_task_id,
    mpc_task_type: record.mpc_task_type,
    buyer_id: record.buyer_id,
    seller_id: record.seller_id,
    compute_params:
      typeof record.compute_params_json === 'string'
        ? JSON.parse(record.compute_params_json)
        : record.compute_params_json,
    seller_input:
      typeof record.seller_input_json === 'string'
        ? JSON.parse(record.seller_input_json)
        : record.seller_input_json,
    result:
      typeof record.result_json === 'string'
        ? JSON.parse(record.result_json)
        : record.result_json,
    task_status: normalizeMpcStatus(record.task_status),
    remote_status: normalizeMpcStatus(record.remote_status),
    seller_filename: record.seller_filename || null,
    last_error: record.last_error || null,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}

module.exports = {
  isTerminalMpcStatus,
  mapMpcRecordRow,
  normalizeMpcStatus,
  parseJsonFileBuffer,
  validateGcComputeParams
};
