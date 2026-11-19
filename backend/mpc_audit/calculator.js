'use strict';

const {
  USER_FIELD,
  A_FIELDS,
  B_FIELDS,
  C_FIELDS
} = require('./constants');

// 所有参与电路的值必须是非负整数（电路只做无符号 limb 运算）。
const NON_NEGATIVE_INTEGER = /^[0-9]+$/;

function parseInteger(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!NON_NEGATIVE_INTEGER.test(text)) {
    const error = new Error(`${fieldName} 必须是非负整数，收到: ${text || '(空)'}`);
    error.statusCode = 400;
    throw error;
  }
  return BigInt(text);
}

function parseCoefficient(value, fieldName = 'coefficient') {
  const parsed = parseInteger(value, fieldName);
  return parsed;
}

function parseCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    const error = new Error('CSV 至少需要表头和一行数据');
    error.statusCode = 400;
    throw error;
  }

  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const columns = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = columns[index] == null ? '' : String(columns[index]).trim();
    });
    rows.push({ line: i + 1, row });
  }
  return { headers, rows };
}

function splitCsvLine(line) {
  // 支持简单的双引号包裹字段（例如 "u,1"），不处理跨行引号。
  const result = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

function pickField(headers, candidates) {
  return candidates.find((field) => headers.includes(field)) || null;
}

// 单文件模式：user_id, a, b[, c]
function parseCompositeCsv(text, { defaultCoefficient } = {}) {
  const { headers, rows } = parseCsv(text);
  if (!headers.includes(USER_FIELD)) {
    const error = new Error(`CSV 缺少 ${USER_FIELD} 列`);
    error.statusCode = 400;
    throw error;
  }
  const aField = pickField(headers, A_FIELDS);
  const bField = pickField(headers, B_FIELDS);
  const cField = pickField(headers, C_FIELDS);

  if (!aField && !bField) {
    const error = new Error(`CSV 至少需要 ${A_FIELDS[0]} 或 ${B_FIELDS[0]} 列`);
    error.statusCode = 400;
    throw error;
  }

  const byUser = new Map();
  for (const { line, row } of rows) {
    const userId = String(row[USER_FIELD] || '').trim();
    if (!userId) {
      const error = new Error(`第 ${line} 行缺少 ${USER_FIELD}`);
      error.statusCode = 400;
      throw error;
    }
    const a = aField ? parseInteger(row[aField], `${userId}.${aField}`) : 0n;
    const b = bField ? parseInteger(row[bField], `${userId}.${bField}`) : 0n;
    const c = cField
      ? parseInteger(row[cField], `${userId}.${cField}`)
      : defaultCoefficient;

    if (c == null) {
      const error = new Error('CSV 未提供 coefficient 列，且创建任务时没有设置系数');
      error.statusCode = 400;
      throw error;
    }

    const existing = byUser.get(userId) || { a: 0n, b: 0n, c: null };
    existing.a += a;
    existing.b += b;
    existing.c = c;
    byUser.set(userId, existing);
  }

  return byUser;
}

// 分组文件模式：a_files 与 b_files 各自按 user 求和。
function accumulateGroupCsv(byUser, text, group) {
  const { headers, rows } = parseCsv(text);
  if (!headers.includes(USER_FIELD)) {
    const error = new Error(`CSV 缺少 ${USER_FIELD} 列`);
    error.statusCode = 400;
    throw error;
  }
  const candidates = group === 'a' ? A_FIELDS : B_FIELDS;
  const valueField = pickField(headers, candidates) ||
    pickField(headers, ['value', 'amount', 'total_assets', 'balance']);
  if (!valueField) {
    const error = new Error(
      `CSV 缺少数值列，支持: ${candidates.concat(['value', 'amount', 'total_assets', 'balance']).join('/')}`
    );
    error.statusCode = 400;
    throw error;
  }

  for (const { line, row } of rows) {
    const userId = String(row[USER_FIELD] || '').trim();
    if (!userId) {
      const error = new Error(`第 ${line} 行缺少 ${USER_FIELD}`);
      error.statusCode = 400;
      throw error;
    }
    const value = parseInteger(row[valueField], `${userId}.${valueField}`);
    const existing = byUser.get(userId) || { a: 0n, b: 0n, c: null };
    existing[group] += value;
    byUser.set(userId, existing);
  }
}

function mergeGroupedCsv({ aFiles = [], bFiles = [], coefficient } = {}) {
  const byUser = new Map();
  for (const file of aFiles) {
    accumulateGroupCsv(byUser, file.content, 'a');
  }
  for (const file of bFiles) {
    accumulateGroupCsv(byUser, file.content, 'b');
  }
  if (coefficient == null) {
    const error = new Error('分组文件模式必须提供折算系数 coefficient');
    error.statusCode = 400;
    throw error;
  }
  for (const entry of byUser.values()) {
    entry.c = coefficient;
  }
  return byUser;
}

// 默认多文件约定：前 N-1 个文件进 A 组，最后 1 个文件进 B 组。
// N=1 时全部进 A，B 为空（即 y = a）。
function splitFilesIntoSlots(files = []) {
  if (!Array.isArray(files) || files.length === 0) {
    return { aFiles: [], bFiles: [] };
  }
  if (files.length === 1) {
    return { aFiles: files.slice(), bFiles: [] };
  }
  return {
    aFiles: files.slice(0, -1),
    bFiles: files.slice(-1)
  };
}

// N 方模式：每个参与方上传若干 CSV（字段名 party_<id>），
// 由 parties 清单把每个参与方映射到审计电路的两个槽位 A/B，
// 同一槽位内按 user 汇总后再进入证据。
function normalizeParties(parties) {
  const normalized = [];
  const seen = new Set();
  for (const party of parties || []) {
    const id = String(party?.id || '').trim();
    const slot = String(party?.slot || '').trim().toUpperCase();
    if (!id) {
      const error = new Error('parties 中存在缺少 id 的参与方');
      error.statusCode = 400;
      throw error;
    }
    if (slot !== 'A' && slot !== 'B') {
      const error = new Error(`参与方 ${id} 的 slot 必须是 A 或 B`);
      error.statusCode = 400;
      throw error;
    }
    if (seen.has(id)) {
      const error = new Error(`参与方 ${id} 重复`);
      error.statusCode = 400;
      throw error;
    }
    seen.add(id);
    normalized.push({
      id,
      name: String(party?.name || id).trim(),
      slot
    });
  }
  return normalized;
}

function mergePartyCsvFiles({ files = [], parties = [], coefficient } = {}) {
  const normalizedParties = normalizeParties(parties);
  const slotById = new Map(
    normalizedParties.map((party) => [party.id, party.slot.toLowerCase()])
  );

  if (!slotById.size) {
    const error = new Error('N 方模式必须提供 parties 清单');
    error.statusCode = 400;
    throw error;
  }
  if (coefficient == null) {
    const error = new Error('N 方模式必须提供折算系数 coefficient');
    error.statusCode = 400;
    throw error;
  }

  const byUser = new Map();
  for (const file of files) {
    const fieldname = String(file.fieldname || '');
    const partyId = fieldname.replace(/^party_/, '');
    const slot = slotById.get(partyId);
    if (!slot) {
      const error = new Error(`文件字段 ${fieldname} 未在 parties 中登记`);
      error.statusCode = 400;
      throw error;
    }
    accumulateGroupCsv(byUser, file.content, slot);
  }

  for (const entry of byUser.values()) {
    entry.c = coefficient;
  }
  return byUser;
}

function computeSamples(byUser, { threshold } = {}) {
  const users = Array.from(byUser.keys()).sort();
  if (!users.length) {
    const error = new Error('没有可计算的用户数据');
    error.statusCode = 400;
    throw error;
  }

  return users.map((userId, index) => {
    const { a, b, c } = byUser.get(userId);
    if (c == null) {
      const error = new Error(`用户 ${userId} 缺少折算系数 c`);
      error.statusCode = 400;
      throw error;
    }
    const y = (a + b) * c;
    return {
      row_index: index + 1,
      user_id: userId,
      a: a.toString(),
      b: b.toString(),
      c: c.toString(),
      y: y.toString(),
      qualified: threshold == null ? null : y >= threshold
    };
  });
}

module.exports = {
  parseInteger,
  parseCoefficient,
  parseCsv,
  parseCompositeCsv,
  mergeGroupedCsv,
  splitFilesIntoSlots,
  normalizeParties,
  mergePartyCsvFiles,
  computeSamples
};
