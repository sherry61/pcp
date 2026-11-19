// 交付列表状态汇总的落地逻辑。
//
// 后端 /api/privacy/delivery-status 一次返回当前页所有交易的交付状态，这里负责
// 把这些字段合并进列表行，避免首屏显示“待买方操作 / 待请求交付”这类占位文案。

const RECORD_KEY_BY_KIND = Object.freeze({
  HE: 'heRecord',
  PRE: 'preRecord',
  FL: 'flRecord',
  MPC: 'mpcRecord'
});

function normalizePcType(value) {
  return String(value || '').trim().toUpperCase();
}

function summaryIds(rows) {
  const seen = new Set();
  const ids = [];
  for (const row of rows || []) {
    const id = String(row?.transaction_id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function compactRecord(record) {
  if (!record) return null;
  const next = { pcp_status: record.pcp_status || null };
  if (record.pcp_contract_id) next.pcp_contract_id = record.pcp_contract_id;
  if (record.current_attempt_id) next.current_attempt_id = record.current_attempt_id;
  if (record.remote_task_id) next.remote_task_id = record.remote_task_id;
  if (record.task_status) next.task_status = record.task_status;
  if (record.public_keys_ready != null) next.public_keys_ready = record.public_keys_ready;
  if (record.buyer_public_key_ready != null) next.buyer_public_key_ready = record.buyer_public_key_ready;
  if (record.result_ready != null) next.result_ready = record.result_ready;
  if (record.last_error) next.last_error = record.last_error;
  return next;
}

function applyDeliveryStatusItem(row, item, options = {}) {
  if (!row || !item) return false;
  const kind = normalizePcType(item.pcType || (typeof options.pcTypeOf === 'function' ? options.pcTypeOf(row) : row.pc_type));

  if (kind === 'TEE') {
    const tee = item.tee;
    if (!tee) return false;
    if (row.teeStatusRefreshing) return false;
    row.teeRequested = Boolean(tee.requested);
    row.teeStatus = normalizePcType(tee.status);
    row.teeStep = tee.step || '';
    row.teeResultReady = Boolean(tee.resultReady);
    if (tee.currentAttemptId != null) row.teeCurrentAttemptId = tee.currentAttemptId;
    if (tee.cleanupStatus) row.teeCleanupStatus = tee.cleanupStatus;
    return true;
  }

  const key = RECORD_KEY_BY_KIND[kind];
  if (!key) return false;
  const record = compactRecord(item.record);
  if (!record) return false;
  row[key] = { ...(row[key] || {}), ...record };
  return true;
}

module.exports = {
  applyDeliveryStatusItem,
  compactRecord,
  summaryIds,
  normalizePcType
};

module.exports.default = module.exports;
