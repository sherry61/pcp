const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWeightTemplateText } = require('./teeWeightTemplate');
const { validateWeightCsvText } = require('./teeWeightSchema');
const { extractWeightSchema, validateWeightCsv } = require('../../../backend/tee/csvSchema');
const { buildWeightTemplate } = require('../../../backend/tee/weightTemplate');

test('download is vertical with empty weight cells and no metric/weight header or ID', () => {
  const schema = extractWeightSchema('id,m1,m2,m3\na,1,2,3\n');
  const template = buildWeightTemplateText(schema);
  assert.equal(template, 'm1,\nm2,\nm3,\n');
  assert.equal(template, buildWeightTemplate(schema));
  const filled = template.trim().split('\n').map((row, i) => row + [0.2, 0.3, 0.5][i]).join('\n');
  const expected = { fields: ['m1', 'm2', 'm3'], weights: [0.2, 0.3, 0.5] };
  assert.deepEqual(validateWeightCsvText(filled, schema.fields), expected);
  assert.deepEqual(validateWeightCsv(filled, schema), expected);
});

test('download follows the current product fields and quotes commas in names', () => {
  assert.equal(buildWeightTemplateText({ identifierField: 'id', fields: ['A', 'B'] }), 'A,\nB,\n');
  assert.equal(buildWeightTemplateText({ identifierField: 'id', fields: ['id', 'm1'] }), 'm1,\n');
  assert.equal(buildWeightTemplateText({ fields: ['m,1'] }), '"m,1",\n');
  assert.throws(() => buildWeightTemplateText(null), /没有可配置/);
});

test('the actual download handler generates a headerless file even with an old backend', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const { parse } = require('@babel/parser');
  const source = fs.readFileSync(path.join(__dirname, '../views/AssetDetail1.vue'), 'utf8');
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
  const component = parse(script, { sourceType: 'module' }).program.body.find(n => n.type === 'ExportDefaultDeclaration').declaration;
  const method = component.properties.find(n => n.key.name === 'methods').value.properties.find(n => n.key.name === 'downloadTeeDataFormatTemplate');
  let downloaded; let clicked = false;
  const anchor = { click() { clicked = true; }, remove() {} };
  const handler = vm.runInNewContext(`({${script.slice(method.start, method.end)}}).downloadTeeDataFormatTemplate`, {
    teeApi: {
      assetMaterials: async assetId => {
        assert.equal(assetId, 'current-product');
        return { weightSchema: { identifierField: 'id', fields: ['m1', 'm2', 'm3'] } };
      },
      weightTemplate: () => { throw new Error('old backend template must not be used'); }
    },
    buildWeightTemplateText, Blob,
    URL: { createObjectURL(blob) { downloaded = blob; return 'blob:test'; }, revokeObjectURL() {} },
    document: { createElement() { return anchor; }, body: { appendChild() {} } },
    alert: message => { throw new Error(message); }
  });
  const context = { asset: { file_hash: 'current-product' }, teeTemplateDownloading: false };
  await handler.call(context);
  assert.equal(clicked, true);
  assert.equal(anchor.download, 'weight-template.csv');
  assert.equal((await downloaded.text()).replace(/^\uFEFF/, ''), 'm1,\nm2,\nm3,\n');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), Buffer.from('m1,\nm2,\nm3,\n'));
  assert.equal(context.teeTemplateDownloading, false);
});
