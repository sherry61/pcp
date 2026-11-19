'use strict';

function notificationFor(row, role, now = Date.now()) {
  const status = String(row.status || '').toUpperCase();
  const step = String(row.step || '').toUpperCase();
  const expires = row.expiration_time ? new Date(row.expiration_time).getTime() : null;
  const active = expires === null || expires > now;
  let stage;
  if (role === 'seller' && active && !row.current_attempt_id && status === 'PENDING') stage = 'SELLER_ACTION_REQUIRED';
  else if (role === 'buyer' && active && status === 'VM_RUNNING' && step === 'WAITING_MODEL') stage = 'MODEL_UPLOAD_REQUIRED';
  else if (status === 'SUCCESS' && row.result_status === 'READY') stage = 'RESULT_READY';
  else if (status === 'FAILED') stage = 'DELIVERY_FAILED';
  if (!stage) return null;
  const transactionId = String(row.transaction_id);
  const version = row.current_attempt_id || new Date(row.requested_at).toISOString();
  return { id: `${transactionId}:${version}:${stage}`, transactionId, role, stage,
    actionable: ['SELLER_ACTION_REQUIRED', 'MODEL_UPLOAD_REQUIRED'].includes(stage) };
}

function registerTeeNotificationRoutes({ app, authenticate, dbQuery }) {
  const select = `SELECT t.transaction_id, t.asset_id, t.buyer_address, t.seller_address,
    COALESCE(dc.expiration_time,t.expiration_time) AS expiration_time,
    j.status,j.step,j.result_status,j.current_attempt_id,j.requested_at,j.updated_at
    FROM delivery_secure_jobs j
    JOIN transactions t ON t.transaction_id=j.transaction_id
    LEFT JOIN digital_contracts dc ON dc.id=(SELECT MAX(d.id) FROM digital_contracts d WHERE d.transaction_id=t.transaction_id)
    WHERE t.status='已确认' AND UPPER(COALESCE(dc.pc_type,t.pc_type,''))='TEE'
      AND j.requested_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM certificate_registry cr WHERE cr.user_id=? AND cr.address=`;
  const getRows = (req, transactionId) => {
    const role = req.query.role;
    if (!['buyer', 'seller'].includes(role)) throw Object.assign(new Error('交付身份无效'), { statusCode: 400 });
    const address = role === 'seller' ? 't.seller_address' : 't.buyer_address';
    const suffix = transactionId
      ? ' AND t.transaction_id=?'
      : " AND (UPPER(j.status) IN ('PENDING','RUNNING','VM_RUNNING') OR j.updated_at>=DATE_SUB(NOW(), INTERVAL 1 DAY))";
    return dbQuery(`${select}${address})${suffix} ORDER BY j.updated_at DESC,t.transaction_id DESC`,
      [req.authUser.id, ...(transactionId ? [String(transactionId)] : [])]);
  };
  const handle = action => async (req, res) => {
    try { await action(req, res); } catch (error) {
      res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : '读取交付通知失败' });
    }
  };
  app.get('/api/privacy/tee/notifications', authenticate, handle(async (req, res) => {
    const rows = await getRows(req);
    res.json({ success: true, notifications: rows.map(row => notificationFor(row, req.query.role)).filter(Boolean) });
  }));
  app.get('/api/privacy/tee/notifications/:transactionId', authenticate, handle(async (req, res) => {
    const rows = await getRows(req, req.params.transactionId);
    if (!rows.length) return res.status(404).json({ success: false, message: '交付订单不存在或无权访问' });
    const row = rows[0];
    res.json({ success: true, transaction: {
      transaction_id: row.transaction_id, asset_id: row.asset_id, pc_type: 'TEE',
      buyer_address: row.buyer_address, seller_address: row.seller_address,
      expiration_time: row.expiration_time
    } });
  }));
}

module.exports = { registerTeeNotificationRoutes, notificationFor };
