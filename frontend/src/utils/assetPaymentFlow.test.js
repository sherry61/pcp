const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');
const source = fs.readFileSync(path.join(__dirname, '../views/AssetDetail1.vue'), 'utf8');
const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const component = parse(script, { sourceType: 'module' }).program.body.find(n => n.type === 'ExportDefaultDeclaration').declaration;
function method(name, globals = {}) {
  const node = component.properties.find(n => n.key.name === 'methods').value.properties.find(n => n.key.name === name);
  return vm.runInNewContext(`({${script.slice(node.start, node.end)}}).${name}`, { console, FormData, ...globals });
}
function state() {
  return { asset: { file_hash: 'asset-227', user_id: 35, asset_name: '车险风险评分计算服务', price: 5000 }, userId: 36,
    stopPaymentPolling() {}, fetchBalance() {}, startPaymentPolling() { this.pollingStarted = true; },
    showPaymentModal: true, paymentStatus: 'PENDING', paymentOrderNo: 'ALI-existing' };
}

test('local order fetches the QR automatically so the dialog is never empty', async () => {
  const context = state(); const requests = [];
  context.loadPaymentQr = method('loadPaymentQr', {
    axios: { post: async url => {
      requests.push(url);
      return { data: { qr_status: 'READY', qr_code: 'qr-link' } };
    } },
    QRCode: { toDataURL: async () => 'qr-image' }
  });
  await method('startPayment', { axios: { post: async (url, payload) => {
    requests.push({ url, payload }); return { status: 201, data: { out_trade_no: 'ALI-local', amount: '5000.00', qr_status: 'NOT_REQUESTED' } };
  } }, alert: () => assert.fail('must not close on missing QR') }).call(context, { asset_id: 'asset-227' });
  assert.equal(requests.length, 2); assert.equal(requests[0].payload.prepare_only, true);
  assert.match(requests[1], /\/payments\/ALI-local\/qr$/);
  assert.equal(context.paymentOrderNo, 'ALI-local'); assert.equal(context.showPaymentModal, true);
  assert.equal(context.paymentLoading, false); assert.equal(context.paymentQr, 'qr-image');
  assert.equal(context.pollingStarted, true);
});

test('provider system failure keeps balance usable; retry uses the same order and can recover', async () => {
  const context = state(); const requests = []; let count = 0;
  const requestQr = method('loadPaymentQr', { axios: { post: async url => {
    requests.push(url); count++;
    return { data: count === 1 ? { qr_status: 'UNAVAILABLE', payment_message: '支付宝暂不可用，可使用余额支付或重试扫码', payment_error_detail: '系统异常' }
      : { qr_status: 'READY', qr_code: 'qr-link' } };
  } }, QRCode: { toDataURL: async () => 'qr-image' } });
  await requestQr.call(context);
  assert.equal(context.paymentOrderNo, 'ALI-existing'); assert.equal(context.showPaymentModal, true);
  assert.equal(context.paymentStatus, 'PENDING'); assert.equal(context.paymentQrLoading, false);
  assert.match(context.paymentQrMessage, /余额支付.*系统异常/);
  await requestQr.call(context);
  assert.deepEqual(requests, [requests[0], requests[0]]);
  assert.match(requests[0], /\/payments\/ALI-existing\/qr$/);
  assert.equal(context.paymentQr, 'qr-image'); assert.equal(context.pollingStarted, true);
});

test('late QR responses cannot overwrite a newer order or restart polling after payment', async () => {
  for (const update of [c => { c.paymentOrderNo = 'ALI-new'; }, c => { c.paymentStatus = 'PAID'; }, c => { c.showPaymentModal = false; }]) {
    const context = state(); let release;
    const task = method('loadPaymentQr', { axios: { post: () => new Promise(resolve => { release = resolve; }) },
      QRCode: { toDataURL: async () => assert.fail('stale response') } }).call(context);
    update(context); release({ data: { qr_code: 'late-link' } }); await task;
    assert.equal(context.pollingStarted, undefined);
  }
});

test('balance payment posts the pending local order without using Alipay', async () => {
  const context = state(); let paid; let success = false;
  context.openConfirmModal = () => { success = true; };
  await method('payWithBalance', { axios: { post: async (url, payload) => {
    assert.match(url, /\/balance\/pay$/); paid = payload;
    return { data: { status: 'PAID', transaction_id: 999, balance: '123.00' } };
  } }, setTimeout: callback => callback(), alert: message => assert.fail(message) }).call(context);
  assert.equal(paid.out_trade_no, 'ALI-existing'); assert.equal(paid.userId, 36);
  assert.equal(context.paymentStatus, 'PAID'); assert.equal(context.transactionId, 999);
  assert.equal(context.userBalance, '123.00'); assert.equal(success, true);
});
