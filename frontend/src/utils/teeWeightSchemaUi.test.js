const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const purchaseSource = fs.readFileSync(path.join(__dirname, '..', 'views', 'AssetDetail1.vue'), 'utf8');
const deliverySource = fs.readFileSync(path.join(__dirname, '..', 'views', 'DeliveryBuyer2.vue'), 'utf8');
const apiSource = fs.readFileSync(path.join(__dirname, 'teeApi.js'), 'utf8');

test('TEE purchase dialog shows asset data format and offers the template download', () => {
  assert.match(purchaseSource, /v-if="isTeeAsset"[^>]*class="form-row asset-data-schema-section"/);
  assert.match(purchaseSource, /class="asset-data-schema-card"/);
  assert.match(purchaseSource, /资产数据格式/);
  assert.doesNotMatch(purchaseSource, /卖方数据格式/);
  assert.match(purchaseSource, /teeAssetFields\.length/);
  assert.match(purchaseSource, /v-for="field in teeAssetFields"/);
  assert.match(purchaseSource, /下载权重模板/);
  assert.match(purchaseSource, /downloadTeeDataFormatTemplate/);
  assert.match(purchaseSource, /teeApi\.assetMaterials\(this\.asset\.file_hash\)/);
});

test('asset data format sits below rights with a neutral white card, and the quantity field is gone', () => {
  const rightsIndex = purchaseSource.indexOf('class="permission-list"');
  const schemaIndex = purchaseSource.indexOf('class="asset-data-schema-card"');
  assert.ok(rightsIndex >= 0 && rightsIndex < schemaIndex);
  assert.doesNotMatch(purchaseSource, /id="purchase-quantity"/);
  assert.match(purchaseSource, /purchaseQuantity: 1/);
  assert.match(purchaseSource, /\.asset-data-schema-card\s*\{[\s\S]*?background:\s*#fff;/);
  assert.doesNotMatch(purchaseSource, /购买 \{\{ purchaseQuantity \}\} 份，对应最多/);
  assert.doesNotMatch(purchaseSource, /请按照字段名称和排列顺序设计计算模型/);
  assert.doesNotMatch(purchaseSource, /下载的模板来自卖方数据表头/);
});

test('asset data format title is a form label outside the white card', () => {
  assert.match(
    purchaseSource,
    /class="form-row asset-data-schema-section"[\s\S]*?<label[^>]*>资产数据格式：<\/label>[\s\S]*?<div class="asset-data-schema-card"/
  );
  const cardStart = purchaseSource.indexOf('class="asset-data-schema-card"');
  const cardEnd = purchaseSource.indexOf('</div>', cardStart);
  assert.doesNotMatch(purchaseSource.slice(cardStart, cardEnd), /<strong>资产数据格式<\/strong>/);
});

test('asset data format card uses a compact two-row layout', () => {
  assert.match(purchaseSource, /class="schema-meta-row"[\s\S]*?class="schema-summary"[\s\S]*?下载权重模板/);
  assert.match(purchaseSource, /\.asset-data-schema-card\s*\{[^}]*padding:\s*10px 12px;/);
  assert.doesNotMatch(purchaseSource, /\.asset-data-schema-card\s*\{[^}]*min-height:/);
  assert.match(purchaseSource, /\.schema-fields\s*\{[^}]*gap:\s*4px 6px;/);
});

test('asset data format handles loading and failure in the purchase dialog only', () => {
  assert.match(purchaseSource, /teeSchemaLoading/);
  assert.match(purchaseSource, /teeSchemaError/);
  assert.match(purchaseSource, /资产数据格式加载失败/);
  const deliveryDialog = deliverySource.slice(
    deliverySource.indexOf('<el-dialog v-model="teeDialog.visible"'),
    deliverySource.indexOf('<el-dialog v-model="teeModelDialog.visible"')
  );
  assert.doesNotMatch(deliveryDialog, /权重项数量|所需字段|下载权重模板|资产数据格式/);
});

test('download builds the headerless template from fresh asset fields', () => {
  assert.match(purchaseSource, /await teeApi\.assetMaterials\(assetId\)/);
  assert.match(purchaseSource, /buildWeightTemplateText\(response\.weightSchema\)/);
  assert.doesNotMatch(purchaseSource, /await teeApi\.(?:weightTemplate|dataFormatTemplate)\(assetId\)/);
  assert.match(apiSource, /weightTemplate\(assetId\)/);
  assert.match(apiSource, /weight-template/);
  assert.match(apiSource, /responseType: 'blob'/);
});
