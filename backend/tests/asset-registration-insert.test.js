const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function splitTopLevelCommaList(source) {
  return source
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

test('save-asset2 INSERT keeps columns, placeholders, and values aligned', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const routeMatch = mainJs.match(/app\.post\('\/api\/save-asset2'[\s\S]*?\n}\);/);
  assert.ok(routeMatch, 'save-asset2 route should exist');

  const routeSource = routeMatch[0];
  const insertMatch = routeSource.match(/INSERT INTO asset_registrations \(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/);
  assert.ok(insertMatch, 'save-asset2 INSERT statement should exist');

  const valuesMatch = routeSource.match(/const values = \[([\s\S]*?)\];/);
  assert.ok(valuesMatch, 'save-asset2 values array should exist');

  const columnCount = splitTopLevelCommaList(insertMatch[1]).length;
  const placeholderCount = (insertMatch[2].match(/\?/g) || []).length;
  const valueCount = splitTopLevelCommaList(valuesMatch[1]).length;

  assert.equal(placeholderCount, columnCount);
  assert.equal(valueCount, columnCount);
});
