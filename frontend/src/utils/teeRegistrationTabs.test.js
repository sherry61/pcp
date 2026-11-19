const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('one asset registration form handles both assets and models', () => {
  const view = read('views/ChainRegistrationView.vue');
  assert.match(view, /数字资产上链登记<\/span>/);
  assert.doesNotMatch(view, /TeeModelRegistration|registrationTab|计算模型上链登记/);
  assert.match(view, /model_selection', this.form.modelSelection/);
  assert.match(view, /modelFileHash: this.hashValue/);
  assert.match(view, /\/api\/registrations\/submit/);
});

test('both trading roles retain the single registration navigation entry', () => {
  const sidebar = read('components/AppSidebar.vue');
  const router = read('router.js');
  assert.match(sidebar, /v-if="isBuyer \|\| isSeller" to="\/chain-registration"/);
  assert.match(router, /path: '\/chain-registration'[^\n]*roles: \['buyer','seller'\]/);
  assert.doesNotMatch(sidebar + router, /\/tee-models|我的计算模型|TeeModels/);
});

test('purchase selects assets through asset management without displaying digests', () => {
  const purchase = read('views/AssetDetail1.vue');
  assert.match(purchase, /请选择本人或已获使用授权的模型。/);
  assert.match(purchase, /path: '\/asset-management2', query: \{ selectModel: '1'/);
  assert.doesNotMatch(purchase, /tab: 'model'|model\.fileHash\s*}}/);
});
