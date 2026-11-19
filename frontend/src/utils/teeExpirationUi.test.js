const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');
const { baseParse } = require('@vue/compiler-dom');
const teeProgress = require('./teeProgress');

function page(filename) {
  const source = fs.readFileSync(path.join(__dirname, '../views', filename), 'utf8');
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const ast = parse(script, { sourceType: 'module' });
  const component = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
  const methods = component.properties.find(node => node.key.name === 'methods').value.properties;
  const names = new Set(['isTeeSuccess', 'isTeeFailed', 'isTeeRunning', 'canUploadTeeModel',
    'getTeePhaseLabel', 'getSellerTeeStatusText', 'getSellerTeeActionLabel', 'getTeeActionLabel',
    'canBuyerRequestTee', 'canSellerDeliverTee', 'shouldPollRow', 'isTeeRow', 'normalizePcType']);
  const code = methods.filter(node => names.has(node.key.name)).map(node => script.slice(node.start, node.end));
  const context = vm.runInNewContext(`({${code.join(',')}})`, {
    teeProgress, teeModelUpload: require('./teeModelUpload')
  });
  context.isDeliveryExpired = () => true;
  return { source, context };
}

for (const [filename, statusMethod] of [
  ['DeliveryBuyer2.vue', 'getTeePhaseLabel'], ['DeliverySeller2.vue', 'getSellerTeeStatusText']
]) {
  test(`${filename}: expiration preserves successful and failed delivery outcomes`, () => {
    const { context } = page(filename);
    const expired = { teeContractExpired: true, teeRequested: true };
    assert.equal(context[statusMethod]({ ...expired, teeStatus: 'SUCCESS', teeStep: 'RESULT_READY' }), '已完成');
    assert.equal(context[statusMethod]({ ...expired, teeStatus: 'FAILED', teeStep: 'FAILED' }), '交付失败');
    assert.equal(context[statusMethod](expired), filename.includes('Buyer') ? '待卖方执行交付' : '待执行交付');
    assert.equal(context[statusMethod]({ teeRequested: false }), filename.includes('Buyer') ? '待请求交付' : '待买方请求交付');
  });

  test(`${filename}: a successful expired order cannot start another delivery`, () => {
    const { context } = page(filename);
    const row = { teeContractExpired: true, teeRequested: true, teeStatus: 'SUCCESS', teeStep: 'RESULT_READY' };
    const action = filename.includes('Buyer') ? 'getTeeActionLabel' : 'getSellerTeeActionLabel';
    const allowed = filename.includes('Buyer') ? 'canBuyerRequestTee' : 'canSellerDeliverTee';
    assert.equal(context[action](row), '已完成');
    assert.equal(context[allowed](row), false);
    const pending = { teeContractExpired: true, teeRequested: true };
    assert.equal(context[action](pending), filename.includes('Buyer') ? '修改请求' : '执行交付');
    assert.equal(context[allowed](pending), false);
  });
}

test('buyer can download an existing TEE result after the contract expires', () => {
  const { source } = page('DeliveryBuyer2.vue');
  const template = source.match(/<template>([\s\S]*?)<script/)[1].replace(/<\/template>\s*$/, '');
  let disabled;
  function visit(node) {
    if (node.tag === 'el-button' && node.props.some(prop => prop.name === 'on' && prop.exp?.content === 'getTeeResult(row)')) {
      disabled = node.props.find(prop => prop.name === 'bind' && prop.arg?.content === 'disabled').exp.content;
    }
    (node.children || []).forEach(visit);
  }
  visit(baseParse(template));
  assert.ok(disabled, 'missing TEE result download action');
  assert.equal(vm.runInNewContext(disabled, { row: { teeResultReady: true }, isDeliveryExpired: () => true }), false);
  assert.equal(vm.runInNewContext(disabled, { row: { teeResultReady: false }, isDeliveryExpired: () => false }), true);
});

test('buyer continues polling a started TEE task or scheduled cleanup after expiry', () => {
  const { context } = page('DeliveryBuyer2.vue');
  const row = { transaction_id: '543', pc_type: 'TEE', teeRequested: true, teeStatus: 'VM_RUNNING', teeStep: 'WAITING_MODEL' };
  assert.equal(context.shouldPollRow(row), true);
  assert.equal(context.shouldPollRow({ ...row, teeStatus: 'SUCCESS', teeStep: 'RESULT_READY', teeCleanupStatus: 'SCHEDULED' }), true);
  assert.equal(context.shouldPollRow({ ...row, teeStatus: 'SUCCESS', teeStep: 'RESULT_READY', teeCleanupStatus: 'SUCCESS' }), false);
});

test('buyer may upload the model for the current reserved attempt even when no quota remains for a new delivery', () => {
  const { context } = page('DeliveryBuyer2.vue');
  const row = { transaction_id: '561', teeStep: 'WAITING_MODEL', teeStatus: 'VM_RUNNING',
    teeDeliveryLimitReached: true, teeRemainingDeliveries: 0, teeContractExpired: false };
  assert.equal(context.canBuyerRequestTee(row), true);
  assert.equal(context.getTeeActionLabel(row), '上传模型');
  assert.equal(context.canBuyerRequestTee({ ...row, teeStep: 'RESULT_READY', teeStatus: 'SUCCESS' }), false);
  assert.equal(context.canBuyerRequestTee({ ...row, teeModelUploading: true }), false);
});

test('buyer and seller list status consistently shows delivery in progress for every active TEE stage', () => {
  const buyer = page('DeliveryBuyer2.vue').context;
  const seller = page('DeliverySeller2.vue').context;
  for (const teeStep of ['VM_CREATING', 'VM_STARTING', 'SERVICE_DEPLOYING', 'WAITING_MODEL', 'MODEL_KEY_NEGOTIATING',
    'MODEL_UPLOADING', 'MODEL_READY', 'CONTRACT_KEY_NEGOTIATING', 'CONTRACT_VERIFYING', 'CONTRACT_VERIFIED',
    'DATA_KEY_NEGOTIATING', 'DATA_UPLOADING', 'WEIGHT_KEY_NEGOTIATING', 'WEIGHT_UPLOADING', 'COMPUTING']) {
    const row = { teeStep, teeStatus: 'VM_RUNNING', teeRequested: true };
    assert.equal(buyer.getTeePhaseLabel(row), '交付中', teeStep);
    assert.equal(seller.getSellerTeeStatusText(row), '交付中', teeStep);
    assert.equal(seller.getSellerTeeActionLabel(row), '交付中', teeStep);
  }
  assert.equal(buyer.getTeeActionLabel({ teeStep: 'WAITING_MODEL', teeRequested: true }), '上传模型');
});
