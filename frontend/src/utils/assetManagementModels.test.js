const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');
const source = fs.readFileSync(path.join(__dirname, '../views/AssetManagementView2.vue'), 'utf8');
const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const component = parse(script, { sourceType: 'module' }).program.body.find(n => n.type === 'ExportDefaultDeclaration').declaration;
function method(group, name, globals = {}) {
  const node = component.properties.find(n => n.key.name === group).value.properties.find(n => n.key.name === name);
  return vm.runInNewContext(`({${script.slice(node.start, node.end)}}).${name}`, globals);
}

test('normal asset management retains the existing buyer and seller views', () => {
  const registered = [{ id: 257, assetName: '车辆客户风险计算模型' }];
  const purchased = [{ id: 'dataset-id' }];
  const context = { isSeller: false, isBuyer: true, selectingModel: false,
    registeredAssets: registered, purchasedAssets: purchased };
  const activeAssets = method('computed', 'activeAssets');
  assert.equal(activeAssets.call(context), purchased);
  context.isSeller = true; context.isBuyer = false;
  assert.equal(activeAssets.call(context), registered);
});

test('normal buyers keep loading purchased assets', async () => {
  let registered = 0; let purchased = 0;
  const context = { isSeller: false, isBuyer: true, selectingModel: false,
    fetchAssetData: async () => { registered++; }, fetchPurchasedAssets: async () => { purchased++; }, setPagination() {} };
  await method('methods', 'fetchAllAssets').call(context);
  assert.equal(registered, 0); assert.equal(purchased, 1); assert.equal(context.isLoading, false);
});

test('selection mode uses the same authenticated model catalog as the purchase page', async () => {
  const model = { id: 'asset:257', assetId: 257, name: '车辆客户风险计算模型', status: 'REGISTERED' };
  const context = { isSeller: false, isBuyer: true, selectingModel: true, setPagination() {} };
  await method('methods', 'fetchAllAssets', { registeredModelsApi: { list: async () => [model, { id: 'pending', status: 'PENDING' }] } }).call(context);
  assert.equal(context.selectableModels.length, 1);
  assert.equal(context.selectableModels[0].id, model.id);
  assert.equal(context.selectableModels[0].assetName, model.name);
  assert.equal(context.selectableModels[0].modelType, 'COMPUTATION_MODEL');
});
