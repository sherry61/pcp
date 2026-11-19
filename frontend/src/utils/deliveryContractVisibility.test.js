const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readView = (filename) => fs.readFileSync(path.join(__dirname, '..', 'views', filename), 'utf8');

function contractColumn(source) {
  const start = source.indexOf('<el-table-column label="数字合约"');
  const end = source.indexOf('<el-table-column label="操作"', start);
  assert.ok(start >= 0 && end > start, 'digital-contract table column must exist');
  return source.slice(start, end);
}

test('buyer can open the complete digital contract in read-only mode', () => {
  const source = readView('DeliveryBuyer2.vue');
  const column = contractColumn(source);
  assert.match(column, /<span>查看合约<\/span>/);
  assert.match(column, /#default="\{ row \}"/);
  assert.match(column, /@click="viewContract\(row\)"/);
  assert.doesNotMatch(column, /\bdisabled\b/);
  assert.doesNotMatch(column, /发送|上传|加密/);
  assert.match(source, /v-if="contractInfo\.data\.pc_type === 'TEE'"/);
  assert.match(source, /计算模型 SHA-256/);
  assert.match(source, /contractInfo\.data\.model_file_hash \|\| '-'/);
  assert.match(source, /约定交付次数/);
  assert.match(source, /formatDeliveryLimit\(contractInfo\.data\.delivery_limit\)/);
  assert.match(source, /pc_type:\s*this\.normalizePcType\(tx\.pc_type \|\| row\.pc_type\)/);
  assert.match(source, /model_file_hash:\s*tx\.model_file_hash \|\| null/);
  assert.match(source, /delivery_limit:\s*tx\.delivery_limit \?\? null/);
});

test('seller shows immutable TEE contract model hash and delivery limit', () => {
  const source = readView('DeliverySeller2.vue');
  assert.match(source, /v-if="contractInfo\.data\.pc_type === 'TEE'"/);
  assert.match(source, /计算模型 SHA-256/);
  assert.match(source, /contractInfo\.data\.model_file_hash \|\| '-'/);
  assert.match(source, /约定交付次数/);
  assert.match(source, /formatDeliveryLimit\(contractInfo\.data\.delivery_limit\)/);
  assert.match(source, /pc_type:\s*this\.normalizePcType\(tx\.pc_type \|\| transaction\.pc_type\)/);
  assert.match(source, /model_file_hash:\s*tx\.model_file_hash \|\| null/);
  assert.match(source, /delivery_limit:\s*tx\.delivery_limit \?\? null/);
});
