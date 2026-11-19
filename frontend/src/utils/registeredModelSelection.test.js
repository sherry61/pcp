const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTeeTerms } = require('./registeredModelSelection');
const fs = require('node:fs');
const path = require('node:path');

test('TEE selection requires an on-chain model with an exact SHA-256 digest', () => {
  const model = { id: 'asset:225', status: 'REGISTERED', fileHash: 'a'.repeat(64) };
  assert.equal(validateTeeTerms({ pcType: 'TEE', model }).valid, true);
  for (const invalid of [null, { ...model, id: '' }, { ...model, id: 'old-registry-id' }, { ...model, status: 'PENDING' }, { ...model, fileHash: 'fingerprint' }]) {
    assert.equal(validateTeeTerms({ pcType: 'TEE', model: invalid }).valid, false);
  }
  assert.equal(validateTeeTerms({ pcType: 'HE' }).valid, true);
});

test('purchase UI chooses a registered model and submits its ID without uploading a file', () => {
  const source = fs.readFileSync(path.join(__dirname, '../views/AssetDetail1.vue'), 'utf8');
  assert.match(source, /<label[^>]*><strong>计算模型文件：<\/strong><\/label>/);
  assert.match(source, /<select id="purchase-model" v-model="selectedTeeModelId"/);
  assert.match(source, /model_registration_id: this.selectedTeeModelId/);
  assert.doesNotMatch(source, /formData\.append\('modelFile'|teeModelFile|onTeeModelChange/);
  assert.match(source, /请选择本人或已获使用授权的模型/);
  assert.match(source, /model\.status === 'REGISTERED'/);
});
