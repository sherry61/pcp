'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createAssetPaymentQr, registerAssetPaymentQrRoute } = require('../assetPaymentQr');
const source = fs.readFileSync(require('node:path').join(__dirname, '../main.js'), 'utf8');
const order = { out_trade_no: 'ALI-test', amount: '5000.00', subject: '车险风险评分计算服务', buyer_id: 36, status: 'PENDING' };
const quiet = { error() {} };
const res = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });

test('the observed Alipay system error preserves the pending local order for balance payment', async () => {
  const prepare = createAssetPaymentQr({ alipay: { enabled: true, sdk: { exec: async () =>
    ({ code: '20000', subCode: 'aop.ACQ.SYSTEM_ERROR', subMsg: '系统异常' }) } }, log: quiet });
  const result = await prepare(order);
  assert.equal(result.qr_status, 'UNAVAILABLE');
  assert.equal(result.payment_error_code, 'aop.ACQ.SYSTEM_ERROR');
  assert.match(result.payment_message, /余额支付/);
  assert.equal(order.status, 'PENDING');
});

test('network failures and disabled Alipay remain recoverable payment choices', async () => {
  const disabled = createAssetPaymentQr({ alipay: { enabled: false }, log: quiet });
  assert.equal((await disabled(order)).qr_status, 'UNAVAILABLE');
  const failing = createAssetPaymentQr({ alipay: { enabled: true, sdk: { exec: async () => { throw new Error('timeout'); } } }, log: quiet });
  assert.equal((await failing(order)).payment_error_code, 'ALIPAY_CONNECTION_ERROR');
});

test('concurrent QR requests share a single provider call and retries reuse the order', async () => {
  let release; let count = 0; const seen = [];
  const prepare = createAssetPaymentQr({ alipay: { enabled: true, sdk: { exec: async (method, { bizContent }) => {
    count++; seen.push(bizContent); if (count === 1) await new Promise(resolve => { release = resolve; });
    return { code: '10000', qrCode: 'https://qr.example/test' };
  } } }, log: quiet });
  const first = prepare(order); const second = prepare(order);
  assert.equal(first, second); release();
  assert.equal((await first).qr_status, 'READY');
  assert.equal(count, 1); await prepare(order);
  assert.equal(count, 2);
  assert.equal(seen[1].out_trade_no, order.out_trade_no);
  assert.equal(seen[1].total_amount, '5000.00');
});

test('QR endpoint requires authentication and scopes the lookup to the authenticated buyer', async () => {
  let handler; let middleware; let queryParams; let providerCalls = 0;
  const authenticate = () => {};
  registerAssetPaymentQrRoute({ app: { post(path, auth, fn) { middleware = auth; handler = fn; } }, authenticate,
    dbQuery: async (sql, params) => { queryParams = params; return params[1] === 36 ? [order] : []; },
    prepareQr: async () => { providerCalls++; return { qr_status: 'READY', qr_code: 'qr' }; } });
  assert.equal(middleware, authenticate);
  const response = res(); await handler({ params: { outTradeNo: order.out_trade_no }, authUser: { id: 36 } }, response);
  assert.deepEqual(queryParams, [order.out_trade_no, 36, 36]);
  assert.equal(response.body.qr_code, 'qr');
  const forbidden = res(); await handler({ params: { outTradeNo: order.out_trade_no }, authUser: { id: 99 } }, forbidden);
  assert.equal(forbidden.statusCode, 404); assert.equal(providerCalls, 1);
});

function creationFixture({ qr, stock = 994, selectionError } = {}) {
  let handler; let inserts = 0; let qrCalls = 0;
  const start = source.indexOf("app.post('/api/create-payment'");
  const end = source.indexOf('// 查询支付状态', start);
  const context = {
    app: { post(path, auth, fn) { handler = fn; } }, requireTeeBuyer() {}, console: quiet,
    assetModelCatalog: { resolveSelection: async () => {
      if (selectionError) throw selectionError;
      return { modelFileHash: 'a'.repeat(64), modelRegistrationId: 'asset:257', modelSnapshotJson: '{"frozen":true}' };
    } },
    validateTeeTransactionProposal: () => ({ pcType: 'TEE', deliveryLimit: 1 }),
    dbQuery: async (sql) => {
      if (sql.includes('SELECT number')) return [{ number: stock }];
      if (sql.includes('INSERT INTO alipay_orders')) { inserts++; return { insertId: 1 }; }
      throw new Error(sql);
    },
    resolveAssetPrice: (id, fallback, cb) => cb(null, 5000),
    prepareAssetPaymentQr: async () => { qrCalls++; return qr || { qr_status: 'UNAVAILABLE' }; }
  };
  vm.runInNewContext(source.slice(start, end), context);
  return { handler, inserts: () => inserts, qrCalls: () => qrCalls };
}
const body = { asset_id: 'asset-227', buyer_address: 'buyer', seller_address: 'seller', pc_type: 'TEE', quantity: 1,
  model_registration_id: 'asset:257', buyer_id: 999 };

test('actual creation route immediately returns a usable local order without contacting Alipay', async () => {
  const f = creationFixture(); const response = res();
  await f.handler({ body: { ...body, prepare_only: true }, authUser: { id: 36 } }, response);
  assert.equal(response.statusCode, 201); assert.match(response.body.out_trade_no, /^ALI/);
  assert.equal(response.body.amount, '5000.00'); assert.equal(f.inserts(), 1); assert.equal(f.qrCalls(), 0);
});

test('legacy clients still receive their local order when the provider fails', async () => {
  const f = creationFixture(); const response = res();
  await f.handler({ body: { ...body }, authUser: { id: 36 } }, response);
  assert.equal(response.statusCode, 201); assert.equal(response.body.qr_status, 'UNAVAILABLE');
  assert.equal(f.inserts(), 1); assert.equal(f.qrCalls(), 1);
});

test('stock and model permissions must pass before any payment order is created', async () => {
  for (const [options, status] of [[{ stock: 0 }, 409], [{ selectionError: Object.assign(new Error('model forbidden'), { statusCode: 403 }) }, 403]]) {
    const f = creationFixture(options); const response = res();
    await f.handler({ body: { ...body, prepare_only: true }, authUser: { id: 36 } }, response);
    assert.equal(response.statusCode, status); assert.equal(f.inserts(), 0); assert.equal(f.qrCalls(), 0);
  }
});

test('the existing balance handler can pay a local pending order without any provider dependency', async () => {
  let handler; let balance = 8000; let transactionCount = 0; let ledger = 0;
  const saved = { ...order, payload: JSON.stringify({ asset_id: 'asset-227', model_registration_id: 'asset:257' }) };
  const query = async (sql, params = []) => {
    if (sql.startsWith('SELECT * FROM alipay_orders')) return [{ ...saved }];
    if (sql.startsWith('SELECT balance')) return [{ balance }];
    if (sql.startsWith('UPDATE users SET balance = balance -')) { balance -= Number(params[0]); return {}; }
    if (sql.includes("SET status = 'PROCESSING'")) { saved.status = 'PROCESSING'; return {}; }
    if (sql.includes('INSERT INTO balance_ledger')) { ledger++; return {}; }
    if (sql.includes("SET status = 'PAID'")) { saved.status = 'PAID'; saved.transaction_id = params[1]; return {}; }
    throw new Error(sql);
  };
  const start = source.indexOf("app.post('/api/balance/pay'");
  const end = source.indexOf('const prepareAssetPaymentQr =', start);
  vm.runInNewContext(source.slice(start, end), {
    app: { post(path, fn) { handler = fn; } }, withMainDbTransaction: async work => work({ query }), dbQuery: query,
    insertTransaction(payload, cb) { assert.equal(payload.model_registration_id, 'asset:257'); transactionCount++; cb(null, 700); },
    console: quiet
  });
  const response = res(); await handler({ body: { out_trade_no: order.out_trade_no, userId: 36 } }, response);
  assert.equal(response.body.status, 'PAID'); assert.equal(response.body.transaction_id, 700);
  assert.equal(balance, 3000); assert.equal(ledger, 1); assert.equal(transactionCount, 1);
  const repeated = res(); await handler({ body: { out_trade_no: order.out_trade_no, userId: 36 } }, repeated);
  assert.equal(repeated.body.transaction_id, 700);
  assert.equal(balance, 3000); assert.equal(ledger, 1); assert.equal(transactionCount, 1);
});
