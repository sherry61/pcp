const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readSource = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

test('TEE list status and action labels do not expose exhausted quota copy', () => {
  for (const filename of ['DeliveryBuyer2.vue', 'DeliverySeller2.vue']) {
    const source = readSource('views', filename);
    assert.doesNotMatch(source, /交付次数已用完|次数已用完/);
    assert.match(source, /teeDeliveryLimitReached/);
  }
});

test('TEE delivery details show quota once at the bottom of the shared detail component', () => {
  const source = readSource('components', 'TeeDeliveryProgress.vue');
  const attemptSection = source.indexOf('class="attempt-section"');
  const quotaSummary = source.indexOf('class="delivery-quota-summary"');
  const serviceDialog = source.indexOf('class="service-call-body"');

  assert.ok(attemptSection >= 0, 'missing delivery records section');
  assert.ok(quotaSummary > attemptSection, 'delivery quota must follow delivery records');
  assert.ok(serviceDialog > quotaSummary, 'delivery quota must remain in the detail page, before the nested service dialog');
  assert.match(source, /交付次数（\{\{ deliveryQuotaText \}\}）/);
});
