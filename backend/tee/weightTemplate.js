'use strict';

function buildWeightTemplate(schema) {
  // schema.fields contains only the computable columns; identifierField is
  // deliberately excluded. Buyers fill the second column, one weight per row.
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  if (!fields.length) throw Object.assign(new Error('当前资产没有可配置的权重字段'), { statusCode: 400 });
  const escape = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
  return fields.map(field => `${escape(field)},`).join('\n') + '\n';
}

// Keep older download links compatible with the buyer's weight template.
module.exports = { buildWeightTemplate, buildDataFormatTemplate: buildWeightTemplate };
