function parseRow(line) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error('CSV 文件存在未闭合的引号');
  values.push(value.trim());
  return values;
}

function displayFields(fields) {
  return fields.length ? fields.join('、') : '无';
}

function validateWeightCsvText(text, expectedFields) {
  const expected = Array.isArray(expectedFields) ? expectedFields : [];
  if (!expected.length) throw new Error('当前资产没有可配置的权重字段');
  let rows = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()).map(parseRow);
  if (!rows.length) throw new Error('weight.csv 不能为空');
  const firstName = String(rows[0]?.[0] || '').toLowerCase();
  const firstValue = String(rows[0]?.[1] || '').toLowerCase();
  if (firstValue === 'weight') {
    if (firstName !== 'metric') throw new Error(`weight.csv 表头必须为 metric,weight；当前资产需要字段：${displayFields(expected)}`);
    rows = rows.slice(1);
    if (!rows.length) throw new Error('weight.csv 表头后至少需要一条权重记录');
  }

  const fields = [];
  const weights = [];
  for (const row of rows) {
    if (row.length !== 2) throw new Error('weight.csv 每行必须为“字段名,权重值”两列');
    const field = row[0];
    if (!field) throw new Error('weight.csv 字段名称不能为空');
    if (fields.includes(field)) throw new Error(`weight.csv 字段不能重复：${field}`);
    if (row[1] === '' || !Number.isFinite(Number(row[1]))) throw new Error(`字段 ${field} 的权重必须是有效数字`);
    fields.push(field);
    weights.push(Number(row[1]));
  }
  if (fields.length !== expected.length || fields.some((field, index) => field !== expected[index])) {
    throw new Error(`权重字段不匹配：当前资产需要 ${displayFields(expected)}；上传文件提供的是 ${displayFields(fields)}`);
  }
  return { fields, weights };
}

module.exports = { validateWeightCsvText };
module.exports.default = module.exports;
