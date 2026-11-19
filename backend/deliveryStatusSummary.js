'use strict';

// 交付列表状态汇总。
//
// 交付页面以前按“每笔交易一个请求”去补状态，一次要打十几个接口，遇到 PCP
// 等上游服务变慢时首屏会长时间停留在占位状态。这里提供一个只读数据库的批量
// 接口：不管传多少笔交易，都固定只查 6 张表，返回首页渲染真正需要的字段。

const MAX_IDS = 200;

function normalizeIds(input) {
  const source = Array.isArray(input)
    ? input
    : String(input == null ? '' : input).split(',');
  const ids = [];
  for (const raw of source) {
    const id = String(raw == null ? '' : raw).trim();
    if (!id || id.length > 128) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(id)) continue;
    if (ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= MAX_IDS) break;
  }
  return ids;
}

function normalizePcType(value) {
  return String(value || '').trim().toUpperCase();
}

function placeholders(count) {
  return new Array(count).fill('?').join(',');
}

function compactTee(row) {
  if (!row) return null;
  const status = String(row.status || '').toUpperCase();
  return {
    requested: true,
    status,
    step: row.step || '',
    resultReady: status === 'SUCCESS' || String(row.result_status || '').toUpperCase() === 'READY',
    currentAttemptId: row.current_attempt_id == null ? null : row.current_attempt_id,
    cleanupStatus: row.cleanup_status || null,
    lastError: row.last_error || null
  };
}

function compactRecord(row) {
  if (!row) return null;
  return {
    pcp_contract_id: row.pcp_contract_id || null,
    pcp_status: row.pcp_status || null,
    current_attempt_id: row.current_attempt_id || null,
    remote_task_id: row.remote_task_id || null,
    task_status: row.task_status || null,
    public_keys_ready: row.public_keys_ready == null ? null : Boolean(Number(row.public_keys_ready)),
    buyer_public_key_ready: row.buyer_public_key_ready == null ? null : Boolean(Number(row.buyer_public_key_ready)),
    result_ready: row.result_ready == null ? null : Boolean(Number(row.result_ready)),
    last_error: row.last_error || null
  };
}

function createDeliveryStatusSummary(dbQuery) {
  const byIds = (sql, ids) => dbQuery(sql.replace('__IDS__', placeholders(ids.length)), ids);

  async function summarize(input) {
    const ids = normalizeIds(input);
    if (!ids.length) return {};

    const contractRows = await byIds(
      `SELECT transaction_id, pc_type FROM digital_contracts
        WHERE transaction_id IN (__IDS__) ORDER BY id DESC`,
      ids
    );
    const typeById = new Map();
    for (const row of contractRows) {
      const id = String(row.transaction_id);
      if (typeById.has(id)) continue;
      const pcType = normalizePcType(row.pc_type);
      if (pcType) typeById.set(id, pcType);
    }

    const idsOfType = (type) => ids.filter((id) => typeById.get(id) === type);
    const teeIds = idsOfType('TEE');
    const heIds = idsOfType('HE');
    const preIds = idsOfType('PRE');
    const flIds = idsOfType('FL');
    const mpcIds = idsOfType('MPC');

    const [teeRows, heRows, preRows, flRows, mpcRows] = await Promise.all([
      teeIds.length ? byIds(
        `SELECT transaction_id, status, step, result_status, current_attempt_id, cleanup_status, last_error
           FROM delivery_secure_jobs WHERE transaction_id IN (__IDS__)`,
        teeIds
      ) : [],
      heIds.length ? byIds(
        `SELECT transaction_id, pcp_contract_id, pcp_status, current_attempt_id, last_error,
                (paillier_public_key_json IS NOT NULL AND elgamal_public_key_json IS NOT NULL) AS public_keys_ready,
                (download_token IS NOT NULL OR result_storage_path IS NOT NULL) AS result_ready
           FROM he_delivery_contracts WHERE transaction_id IN (__IDS__)`,
        heIds
      ) : [],
      preIds.length ? byIds(
        `SELECT transaction_id, pcp_contract_id, pcp_status, current_attempt_id, last_error,
                (buyer_public_key IS NOT NULL) AS buyer_public_key_ready,
                (download_token IS NOT NULL OR result_storage_path IS NOT NULL) AS result_ready
           FROM pre_delivery_contracts WHERE transaction_id IN (__IDS__)`,
        preIds
      ) : [],
      flIds.length ? byIds(
        `SELECT transaction_id, pcp_contract_id, pcp_status, last_error,
                (buyer_download_token IS NOT NULL OR buyer_result_storage_path IS NOT NULL) AS result_ready
           FROM fl_delivery_contracts WHERE transaction_id IN (__IDS__)`,
        flIds
      ) : [],
      mpcIds.length ? byIds(
        `SELECT transaction_id, remote_task_id, task_status, last_error,
                (result_json IS NOT NULL) AS result_ready
           FROM mpc_delivery_contracts WHERE transaction_id IN (__IDS__)`,
        mpcIds
      ) : []
    ]);

    const items = {};
    for (const id of ids) {
      items[id] = { transactionId: id, pcType: typeById.get(id) || null, tee: null, record: null };
    }
    for (const row of teeRows) {
      const item = items[String(row.transaction_id)];
      if (item) item.tee = compactTee(row);
    }
    for (const rows of [heRows, preRows, flRows, mpcRows]) {
      for (const row of rows) {
        const item = items[String(row.transaction_id)];
        if (item) item.record = compactRecord(row);
      }
    }
    return items;
  }

  return { summarize };
}

function registerDeliveryStatusRoutes({ app, dbQuery }) {
  const summary = createDeliveryStatusSummary(dbQuery);
  app.get('/api/privacy/delivery-status', async (req, res) => {
    const ids = normalizeIds(req.query.transactionIds ?? req.query.ids);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: '缺少有效的 transactionIds' });
    }
    try {
      const items = await summary.summarize(ids);
      res.json({ success: true, items });
    } catch (error) {
      console.error('查询交付状态汇总失败:', error?.message || error);
      res.status(500).json({ success: false, message: '查询交付状态失败' });
    }
  });
}

module.exports = {
  createDeliveryStatusSummary,
  registerDeliveryStatusRoutes,
  normalizeIds
};
