const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viewFiles = ['DeliveryBuyer2.vue', 'DeliverySeller2.vue'];

for (const filename of viewFiles) {
  test(`${filename} keeps primary, detail and result actions in fixed ordered slots`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'views', filename), 'utf8');
    const primaryIndex = source.indexOf('class="action-slot action-slot-primary"');
    const detailIndex = source.indexOf('class="action-slot action-slot-detail"');
    const resultIndex = source.indexOf('class="action-slot action-slot-result"');

    assert.ok(primaryIndex >= 0, 'missing primary action slot');
    assert.ok(detailIndex > primaryIndex, 'detail action slot must follow the primary slot');
    assert.ok(resultIndex > detailIndex, 'result action slot must follow the detail slot');
    assert.match(source, /grid-template-columns:\s*repeat\(3, 112px\)/);
    assert.match(source, /\.action-cell\s*\{[^}]*justify-content:\s*center/s);
    assert.match(source, /\.action-slot\s+:deep\(\.el-button\)[^{]*\{[^}]*width:\s*112px/s);
    assert.match(source, /\.action-btn-detail\.el-button\.is-disabled/);
    assert.match(source, /\.action-btn-result\.el-button\.is-disabled/);
  });
}
