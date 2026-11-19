const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readView = (filename) => fs.readFileSync(path.join(__dirname, '..', 'views', filename), 'utf8');

for (const filename of ['DeliveryBuyer2.vue', 'DeliverySeller2.vue']) {
  test(`${filename} uses the shared delivery-page font for native and Element Plus content`, () => {
    const source = readView(filename);
    assert.match(source, /--delivery-font-family:\s*Arial, sans-serif;/);
    assert.match(source, /--el-font-family:\s*var\(--delivery-font-family\);/);
    assert.match(source, /font-family:\s*var\(--delivery-font-family\);/);
  });
}
