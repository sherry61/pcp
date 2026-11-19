function buildWeightTemplateText(schema) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const identifier = String(schema?.identifierField || 'id');
  const features = fields.filter(field => field !== identifier);
  if (!features.length) throw new Error('当前资产没有可配置的权重字段');
  const escape = value => /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
  return features.map(field => `${escape(field)},`).join('\n') + '\n';
}

module.exports = { buildWeightTemplateText };
