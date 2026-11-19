const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parse } = require('@babel/parser');

function methods(axios) {
  const source = fs.readFileSync(path.join(__dirname, '../views/DeliveryBuyer2.vue'), 'utf8');
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const component = parse(script, { sourceType: 'module' }).program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
  const methods = component.properties.find(node => node.key.name === 'methods').value.properties;
  const names = new Set(['refreshResults', 'getAllBuyerAddresses', 'initUser']);
  const code = methods.filter(node => names.has(node.key.name)).map(node => script.slice(node.start, node.end)).join(',');
  return vm.runInNewContext(`({${code}})`, { axios, API_BASE: 'http://backend',
    localStorage: { getItem: () => 'token' }, console: { warn() {}, error() {} } });
}

test('a timed-out order-list request releases the loading state and preserves existing delivery results', async () => {
  const calls = [];
  const view = methods({ get: async (url, options) => { calls.push(options); throw new Error('timeout'); } });
  const rows = [{ transaction_id: '561', buyer_address: 'buyer', teeStatus: 'SUCCESS' }];
  let message;
  Object.assign(view, { resultList: rows, isLoading: false, pagination: { page: 1, pageSize: 10 },
    getAllBuyerAddresses: async () => ['buyer'], $message: { error: text => { message = text; } } });
  await view.refreshResults();
  assert.equal(view.isLoading, false);
  assert.equal(view.resultList, rows);
  assert.equal(calls[0].timeout, 15000);
  assert.match(message, /暂时无法读取/);
});

test('certificate requests have finite timeouts and a network outage is not presented as missing certificates', async () => {
  const timeouts = [];
  const view = methods({ post: async (url, body, options) => { timeouts.push(options.timeout); throw new Error('timeout'); } });
  view.userId = '7';
  await assert.rejects(view.getAllBuyerAddresses(), /暂时无法读取证书信息/);
  assert.deepEqual(timeouts, [10000, 10000]);
});

test('buyer identity initialization uses the signed-in token ID without waiting behind unrelated database writes', async () => {
  let calls = 0;
  const view = methods({ post: async () => { calls++; } });
  view.parseJwt = () => ({ id: 7, username: 'buyer' });
  await view.initUser();
  assert.equal(view.userId, '7');
  assert.equal(calls, 0);
});
