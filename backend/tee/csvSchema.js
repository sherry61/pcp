function invalid(message, code = 'INVALID_CSV_SCHEMA') {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = code;
  return error;
}

function parseCsvRow(line) {
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
  if (quoted) throw invalid('CSV 文件存在未闭合的引号');
  values.push(value.trim());
  return values;
}

function nonEmptyRows(input) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()).map(parseCsvRow);
}

function assertUniqueFields(fields, label) {
  const seen = new Set();
  for (const field of fields) {
    if (!field) throw invalid(`${label}字段名称不能为空`);
    if (seen.has(field)) throw invalid(`${label}字段不能重复：${field}`);
    seen.add(field);
  }
}

function extractWeightSchema(dataCsv) {
  const rows = nonEmptyRows(dataCsv);
  if (!rows.length) throw invalid('data.csv 不能为空');
  const header = rows[0];
  if (header.length < 2) throw invalid('data.csv 至少需要一个标识字段和一个可计算字段');
  assertUniqueFields(header, 'data.csv ');
  const [identifierField, ...fields] = header;
  return { identifierField, featureCount: fields.length, fields };
}

function formatFields(fields) {
  return fields.length ? fields.join('、') : '无';
}

function validateWeightCsv(weightCsv, schema) {
  const expected = Array.isArray(schema?.fields) ? schema.fields : [];
  if (!expected.length) throw invalid('当前资产没有可配置的权重字段');
  let rows = nonEmptyRows(weightCsv);
  if (!rows.length) throw invalid('weight.csv 不能为空', 'INVALID_WEIGHT_CSV');
  const firstName = String(rows[0]?.[0] || '').trim().toLowerCase();
  const firstValue = String(rows[0]?.[1] || '').trim().toLowerCase();
  if (firstValue === 'weight') {
    if (firstName !== 'metric') {
      throw invalid(`weight.csv 表头必须为 metric,weight；当前资产需要字段：${formatFields(expected)}`, 'INVALID_WEIGHT_CSV');
    }
    rows = rows.slice(1);
    if (!rows.length) throw invalid('weight.csv 表头后至少需要一条权重记录', 'INVALID_WEIGHT_CSV');
  }

  const fields = [];
  const weights = [];
  for (const row of rows) {
    if (row.length !== 2) throw invalid('weight.csv 每行必须为“字段名,权重值”两列', 'INVALID_WEIGHT_CSV');
    const field = row[0];
    const rawWeight = row[1];
    if (!field) throw invalid('weight.csv 字段名称不能为空', 'INVALID_WEIGHT_CSV');
    if (fields.includes(field)) throw invalid(`weight.csv 字段不能重复：${field}`, 'INVALID_WEIGHT_CSV');
    if (rawWeight === '' || !Number.isFinite(Number(rawWeight))) {
      throw invalid(`字段 ${field} 的权重必须是有效数字`, 'INVALID_WEIGHT_CSV');
    }
    fields.push(field);
    weights.push(Number(rawWeight));
  }

  if (fields.length !== expected.length || fields.some((field, index) => field !== expected[index])) {
    throw invalid(
      `权重字段不匹配：当前资产需要 ${formatFields(expected)}；上传文件提供的是 ${formatFields(fields)}`,
      'WEIGHT_FIELDS_MISMATCH'
    );
  }
  return { fields, weights };
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildWeightTemplate(schema) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  return `metric,weight\n${fields.map((field) => `${escapeCsv(field)},0`).join('\n')}\n`;
}

function buildDataFormatTemplate(schema) {
  const identifierField = String(schema?.identifierField || '').trim();
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const header = [identifierField, ...fields].filter(Boolean);
  if (!header.length) throw invalid('当前资产没有可用的数据字段');
  return `${header.map(escapeCsv).join(',')}\n`;
}

module.exports = { extractWeightSchema, validateWeightCsv, buildWeightTemplate, buildDataFormatTemplate };
