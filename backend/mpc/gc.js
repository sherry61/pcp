const { MPC_TASK_STATUSES, MPC_TERMINAL_STATUSES } = require('./constants');
const SELLER_ASSET_VALUE_FIELDS = ['total_assets', 'asset_value', 'amount', 'balance', 'value'];

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
  const computeMode = String(params.compute_mode || 'asset_threshold_batch').trim().toLowerCase();

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
    risk_factor: riskFactor,
    compute_mode: computeMode
  };
}

function parseCsvText(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    const error = new Error('CSV 至少需要表头和一行数据');
    error.statusCode = 400;
    throw error;
  }

  const headers = lines[0].split(',').map((item) => item.trim());
  const userIdIndex = headers.indexOf('user_id');
  const valueField = SELLER_ASSET_VALUE_FIELDS.find((field) => headers.includes(field));
  const valueIndex = valueField ? headers.indexOf(valueField) : -1;

  if (userIdIndex < 0 || valueIndex < 0) {
    const error = new Error(`CSV 必须包含 user_id 和 ${SELLER_ASSET_VALUE_FIELDS.join('/')} 之一`);
    error.statusCode = 400;
    throw error;
  }

  const preview = [];
  for (let i = 1; i < lines.length; i += 1) {
    const columns = lines[i].split(',').map((item) => item.trim());
    const userId = columns[userIdIndex];
    const rawValue = columns[valueIndex];
    const assetValue = Number(rawValue);

    if (!userId) {
      const error = new Error(`第 ${i + 1} 行缺少 user_id`);
      error.statusCode = 400;
      throw error;
    }

    if (!Number.isFinite(assetValue)) {
      const error = new Error(`第 ${i + 1} 行资产值不是合法数字`);
      error.statusCode = 400;
      throw error;
    }

    preview.push({ user_id: userId, total_assets: assetValue });
  }

  return {
    rowCount: preview.length,
    preview: preview.slice(0, 5)
  };
}

function parseSellerCsvFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    const error = new Error('卖方 CSV 文件不能为空');
    error.statusCode = 400;
    throw error;
  }

  const remoteFiles = [];
  const fileSummaries = [];

  for (const file of files) {
    if (!file?.buffer) {
      const error = new Error('卖方数据文件不能为空');
      error.statusCode = 400;
      throw error;
    }

    if (!String(file.originalname || '').toLowerCase().endsWith('.csv')) {
      const error = new Error('仅支持上传 CSV 文件');
      error.statusCode = 400;
      throw error;
    }

    const content = file.buffer.toString('utf8');
    const parsed = parseCsvText(content);

    remoteFiles.push({
      filename: file.originalname,
      content_base64: file.buffer.toString('base64')
    });
    fileSummaries.push({
      filename: file.originalname,
      row_count: parsed.rowCount,
      preview: parsed.preview
    });
  }

  return {
    remotePayload: {
      input_mode: 'asset_threshold_batch',
      files: remoteFiles
    },
    persistedInput: {
      input_mode: 'asset_threshold_batch',
      files: fileSummaries
    }
  };
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
  parseSellerCsvFiles,
  validateGcComputeParams
};
