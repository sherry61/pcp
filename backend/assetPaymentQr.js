'use strict';

function createAssetPaymentQr({ alipay, log = console }) {
  const inFlight = new Map();
  async function request(order) {
    if (!alipay.enabled) return { qr_status: 'UNAVAILABLE', payment_message: '支付宝支付未配置，可使用余额支付' };
    const bizContent = { out_trade_no: order.out_trade_no, total_amount: Number(order.amount).toFixed(2),
      subject: order.subject, timeout_express: '10m' };
    if (alipay.notifyUrl) bizContent.notify_url = alipay.notifyUrl;
    try {
      const result = await alipay.sdk.exec('alipay.trade.precreate', { bizContent });
      if (result?.code === '10000' && result.qrCode) return { qr_status: 'READY', qr_code: result.qrCode };
      log.error('支付宝二维码生成失败:', { outTradeNo: order.out_trade_no,
        code: result?.code, subCode: result?.subCode, subMsg: result?.subMsg, traceId: result?.traceId });
      return { qr_status: 'UNAVAILABLE', payment_message: '支付宝暂不可用，可使用余额支付或重试扫码',
        payment_error_code: result?.subCode || result?.code || 'ALIPAY_UNAVAILABLE',
        payment_error_detail: result?.subMsg || result?.msg || null };
    } catch (error) {
      log.error('支付宝二维码请求异常:', { outTradeNo: order.out_trade_no, message: error.message });
      return { qr_status: 'UNAVAILABLE', payment_message: '支付宝连接异常，可使用余额支付或重试扫码',
        payment_error_code: 'ALIPAY_CONNECTION_ERROR' };
    }
  }
  return function prepare(order) {
    // Concurrent retries reuse the exact local order and provider request.
    if (!inFlight.has(order.out_trade_no)) {
      const task = request(order).finally(() => inFlight.delete(order.out_trade_no));
      inFlight.set(order.out_trade_no, task);
    }
    return inFlight.get(order.out_trade_no);
  };
}

function registerAssetPaymentQrRoute({ app, authenticate, dbQuery, prepareQr }) {
  app.post('/api/payments/:outTradeNo/qr', authenticate, async (req, res) => {
    try {
      const rows = await dbQuery(`SELECT o.* FROM alipay_orders o WHERE o.out_trade_no=?
        AND (o.buyer_id=? OR (o.buyer_id IS NULL AND EXISTS
          (SELECT 1 FROM certificate_registry c WHERE c.address=o.buyer_address AND c.user_id=?))) LIMIT 1`,
      [String(req.params.outTradeNo || ''), req.authUser.id, req.authUser.id]);
      const order = rows[0];
      if (!order) return res.status(404).json({ message: '订单不存在或不属于当前账号' });
      if (order.status !== 'PENDING') return res.status(409).json({ message: '订单状态已变化，请刷新支付状态', status: order.status });
      const qr = await prepareQr(order);
      return res.json({ out_trade_no: order.out_trade_no, amount: Number(order.amount).toFixed(2), ...qr });
    } catch (error) {
      return res.status(500).json({ message: '无法读取支付订单，请稍后重试' });
    }
  });
}

module.exports = { createAssetPaymentQr, registerAssetPaymentQrRoute };
