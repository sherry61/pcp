const test = require('node:test');
const assert = require('node:assert/strict');

let csvSchema = {};
try { csvSchema = { ...require('../tee/csvSchema'), ...require('../tee/weightTemplate') }; } catch (_) { /* RED: module does not exist yet. */ }

test('extracts weight fields from the data CSV header and builds a headerless template', () => {
  assert.equal(typeof csvSchema.extractWeightSchema, 'function');
  assert.equal(typeof csvSchema.buildWeightTemplate, 'function');

  const schema = csvSchema.extractWeightSchema(Buffer.from('\ufeffid,m1,m2,m3\r\nrow-1,1,2,3\r\n'));
  assert.deepEqual(schema, {
    identifierField: 'id',
    featureCount: 3,
    fields: ['m1', 'm2', 'm3']
  });
  assert.equal(csvSchema.buildWeightTemplate(schema), 'm1,\nm2,\nm3,\n');
});

test('legacy data-format download also returns a vertical weight template without the identifier', () => {
  assert.equal(typeof csvSchema.buildDataFormatTemplate, 'function');
  const schema = csvSchema.extractWeightSchema(Buffer.from('id,m1,m2,m3\nrow-1,1,2,3\n'));
  assert.equal(csvSchema.buildDataFormatTemplate(schema), 'm1,\nm2,\nm3,\n');
});

test('filling downloaded weight cells produces a file accepted by the calculation validator', () => {
  const schema = csvSchema.extractWeightSchema('id,m1,m2,m3\nr1,10,20,30\nr2,4,5,6\nr3,7,8,9\n');
  const template = csvSchema.buildWeightTemplate(schema);
  const weights = [0.2, 0.3, 0.5];
  const filled = template.trim().split('\n').map((line, i) => line + weights[i]).join('\n');
  assert.deepEqual(csvSchema.validateWeightCsv(filled, schema), { fields: ['m1', 'm2', 'm3'], weights });
  assert.throws(() => csvSchema.validateWeightCsv(template, schema), /权重必须是有效数字/);
});

test('accepts both the standard CSV2 header and legacy headerless weight files', () => {
  assert.equal(typeof csvSchema.validateWeightCsv, 'function');
  const schema = { identifierField: 'id', featureCount: 3, fields: ['m1', 'm2', 'm3'] };

  const standard = csvSchema.validateWeightCsv(Buffer.from('metric,weight\nm1,0.2\nm2,0.3\nm3,0.5\n'), schema);
  const legacy = csvSchema.validateWeightCsv(Buffer.from('m1,0.2\nm2,0.3\nm3,0.5\n'), schema);
  assert.deepEqual(standard, { fields: ['m1', 'm2', 'm3'], weights: [0.2, 0.3, 0.5] });
  assert.deepEqual(legacy, standard);
});

test('rejects a non-standard header and reports the fields required by the current asset', () => {
  assert.equal(typeof csvSchema.validateWeightCsv, 'function');
  const schema = { identifierField: 'id', featureCount: 3, fields: ['m1', 'm2', 'm3'] };

  assert.throws(
    () => csvSchema.validateWeightCsv(Buffer.from('category,weight\nA,0.5\nB,0.5\n'), schema),
    /表头必须为 metric,weight.*m1、m2、m3/
  );
});

test('rejects mismatched field names, duplicate fields, and non-numeric weights', () => {
  assert.equal(typeof csvSchema.validateWeightCsv, 'function');
  const schema = { identifierField: 'id', featureCount: 3, fields: ['m1', 'm2', 'm3'] };

  assert.throws(
    () => csvSchema.validateWeightCsv(Buffer.from('A,0.2\nB,0.3\nC,0.5\n'), schema),
    /字段不匹配.*m1、m2、m3.*A、B、C/
  );
  assert.throws(
    () => csvSchema.validateWeightCsv(Buffer.from('m1,0.2\nm1,0.3\nm3,0.5\n'), schema),
    /字段不能重复/
  );
  assert.throws(
    () => csvSchema.validateWeightCsv(Buffer.from('m1,0.2\nm2,abc\nm3,0.5\n'), schema),
    /必须是有效数字/
  );
});

test('TEE request route exposes the schema and validates buyer files before persisting them', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'tee', 'routes.js'), 'utf8');
  assert.match(source, /extractWeightSchema/);
  assert.match(source, /validateWeightCsv\(weightFile\.buffer, weightSchema\)/);
  assert.match(source, /weightSchema/);
  assert.match(source, /buildWeightTemplate/);
  assert.match(source, /weight-template/);
  assert.match(source, /buildDataFormatTemplate/);
  assert.match(source, /data-format-template/);
});
