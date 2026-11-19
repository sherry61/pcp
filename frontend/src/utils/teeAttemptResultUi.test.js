const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { canDownloadTeeAttemptResult } = require('./teeProgress');

test('only a successful attempt with a complete archive enables result download', () => {
  assert.equal(canDownloadTeeAttemptResult({ status: 'SUCCESS', resultAvailable: true }), true);
  assert.equal(canDownloadTeeAttemptResult({ status: 'SUCCESS', resultAvailable: false }), false);
  assert.equal(canDownloadTeeAttemptResult({ status: 'FAILED', resultAvailable: true }), false);
  assert.equal(canDownloadTeeAttemptResult({ status: 'RUNNING', resultAvailable: true }), false);
});

test('delivery table keeps the original time layout and expands error reasons without growing the row', () => {
  const component = fs.readFileSync(path.join(__dirname, '../components/TeeDeliveryProgress.vue'), 'utf8');
  const buyer = fs.readFileSync(path.join(__dirname, '../views/DeliveryBuyer2.vue'), 'utf8');
  const seller = fs.readFileSync(path.join(__dirname, '../views/DeliverySeller2.vue'), 'utf8');

  assert.match(component, /v-if="canDownloadResults"[\s\S]{0,120}label="下载结果"[\s\S]{0,80}width="94"/);
  assert.match(component, /label="开始时间"\s+width="155"/);
  assert.match(component, /label="完成时间"\s+width="155"/);
  assert.match(component, /formatTime\(attempt\.startedAt\)/);
  assert.match(component, /label="异常说明"\s+min-width="120"/);
  assert.match(component, /<el-popover[\s\S]{0,180}width="320"[\s\S]{0,100}trigger="click"/);
  assert.match(component, /查看原因/);
  assert.doesNotMatch(component, /formatCompactTime|class="attempt-time"/);
  assert.match(component, /download-attempt-result/);
  assert.match(buyer, /:can-download-results="true"/);
  assert.match(buyer, /@download-attempt-result="downloadTeeAttemptResult"/);
  assert.doesNotMatch(seller, /:can-download-results="true"/);
});

test('buyer requests and names the exact selected delivery attempt result', () => {
  const api = fs.readFileSync(path.join(__dirname, './teeApi.js'), 'utf8');
  const buyer = fs.readFileSync(path.join(__dirname, '../views/DeliveryBuyer2.vue'), 'utf8');

  assert.match(api, /getAttemptResult\(transactionId, attemptId\)/);
  assert.match(api, /post\('\/api\/privacy\/tee\/attempt-result'/);
  assert.match(buyer, /teeApi\.getAttemptResult\(row\.transaction_id, attempt\.id\)/);
  assert.match(buyer, /tee-result-\$\{row\.transaction_id\}-delivery-\$\{attempt\.attemptNo\}\.json/);
});
