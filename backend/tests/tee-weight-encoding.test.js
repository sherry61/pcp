'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTeeWeightCsv, assertTeeWeightResult } = require('../tee/weightEncoding');
const { extractWeightSchema, validateWeightCsv } = require('../tee/csvSchema');

const csv = 'm1,0.1\nm2,0.7\nm3,0.2\n';
const expected = { fields: ['m1', 'm2', 'm3'], weights: [0.1, 0.7, 0.2] };

test('weight delivery removes an Excel UTF-8 BOM while preserving the original uploaded bytes', () => {
  const original = Buffer.from('\uFEFF' + csv);
  const before = Buffer.from(original);
  assert.deepEqual(normalizeTeeWeightCsv(original), Buffer.from(csv));
  assert.deepEqual(original, before);
  const plain = Buffer.from(csv);
  assert.equal(normalizeTeeWeightCsv(plain), plain);
  const schema = extractWeightSchema('id,m1,m2,m3\na,1,2,3\n');
  assert.deepEqual(validateWeightCsv(normalizeTeeWeightCsv(original), schema), expected);
});

test('the incomplete result reported for order 566 cannot be accepted as successful delivery', () => {
  assert.throws(() => assertTeeWeightResult({ metrics: 2, weight_sum: 0.9,
    results: [{ id: 'row-001', score: 20 }, { id: 'row-002', score: 4.7 }, { id: 'row-003', score: 7.4 }] }, expected),
  error => error.code === 'TEE_WEIGHT_RESULT_MISMATCH' && /指标数为 2.*预期为 3/.test(error.message));
  assert.doesNotThrow(() => assertTeeWeightResult({ metrics: 3, weight_sum: 1 }, expected));
  assert.throws(() => assertTeeWeightResult({ metrics: 3, weight_sum: 0.9 }, expected), /权重总和/);
});

test('result verification compares the submitted weights without requiring their sum to equal one', () => {
  const arbitrary = { fields: ['m1', 'm2'], weights: [2, 0.3] };
  assert.doesNotThrow(() => assertTeeWeightResult({ metrics: 2, weight_sum: 2.3 }, arbitrary));
  assert.doesNotThrow(() => assertTeeWeightResult({ metrics: 3, weight_sum: 0.9999999999999999 }, expected));
});
