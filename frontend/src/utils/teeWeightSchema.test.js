const test = require('node:test');
const assert = require('node:assert/strict');

let weightSchema = {};
try { weightSchema = require('./teeWeightSchema'); } catch (_) { /* RED: module does not exist yet. */ }

test('validates standard CSV2 and legacy headerless buyer weight files', () => {
  assert.equal(typeof weightSchema.validateWeightCsvText, 'function');
  const standard = weightSchema.validateWeightCsvText('metric,weight\r\nm1,0.2\r\nm2,0.3\r\nm3,0.5\r\n', ['m1', 'm2', 'm3']);
  const legacy = weightSchema.validateWeightCsvText('m1,0.2\r\nm2,0.3\r\nm3,0.5\r\n', ['m1', 'm2', 'm3']);
  assert.deepEqual(standard, { fields: ['m1', 'm2', 'm3'], weights: [0.2, 0.3, 0.5] });
  assert.deepEqual(legacy, standard);
});

test('explains header and field mismatches before upload', () => {
  assert.equal(typeof weightSchema.validateWeightCsvText, 'function');
  assert.throws(
    () => weightSchema.validateWeightCsvText('category,weight\nA,0.5\nB,0.5\n', ['m1', 'm2', 'm3']),
    /表头必须为 metric,weight/
  );
  assert.throws(
    () => weightSchema.validateWeightCsvText('A,0.2\nB,0.3\nC,0.5\n', ['m1', 'm2', 'm3']),
    /字段不匹配.*m1、m2、m3/
  );
});
