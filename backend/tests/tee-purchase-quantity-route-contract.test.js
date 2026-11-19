'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('TEE purchase route derives delivery limit from quantity instead of request delivery_limit', () => {
  const start = source.indexOf("app.post('/api/save-transaction'");
  const end = source.indexOf('// ================= 支付宝沙箱支付', start);
  assert.ok(start >= 0 && end > start, 'save-transaction route must exist');
  const route = source.slice(start, end);

  assert.match(route, /purchaseQuantity:\s*quantity/);
  assert.doesNotMatch(route, /deliveryLimit:\s*delivery_limit/);
});

