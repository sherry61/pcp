const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readView = (name) => fs.readFileSync(path.join(__dirname, '..', 'views', name), 'utf8');

test('TEE transaction application derives delivery limit from purchase quantity', () => {
  const source = readView('AssetDetail1.vue');
  assert.match(source, /v-model="selectedTeeModelId"/);
  assert.doesNotMatch(source, /购买 \{\{ purchaseQuantity \}\} 份，对应最多 \{\{ purchaseQuantity \}\} 次成功交付/);
  assert.match(source, /Number\.isSafeInteger\(this\.purchaseQuantity\)/);
  assert.match(source, /购买数量必须为大于 0 的整数/);
  assert.match(source, /model_registration_id: this\.selectedTeeModelId/);
  assert.doesNotMatch(source, /teeDeliveryLimit|purchase-delivery-limit|formData\.append\('delivery_limit'/);
});

test('TEE seller confirmation uses the backend-created complete digital contract', () => {
  const source = readView('MarketSeller1.vue');
  assert.match(source, /model_file_hash: tx\.model_file_hash/);
  assert.match(source, /delivery_limit: tx\.delivery_limit/);
  assert.match(source, /if \(pcType !== 'TEE'\)/);
  assert.match(source, /confirmTransaction\(a, false\)/);
});

for (const filename of ['DeliveryBuyer2.vue', 'DeliverySeller2.vue']) {
  test(`${filename} respects backend TEE entitlement state`, () => {
    const source = readView(filename);
    assert.match(source, /teeDeliveryLimitReached/);
    assert.match(source, /teeContractExpired/);
    assert.match(source, /teeRemainingDeliveries/);
  });
}
