'use strict';

/**
 * 轻量结构化日志（零依赖）
 *
 * 输出：
 *   - 文件：/home/super/fqh/logs/backend-YYYY-MM-DD.log，每行一条 JSON（便于检索/采集）
 *   - 控制台：彩色可读格式（非 TTY 自动降级为单行文本）
 *
 * 环境变量：
 *   LOG_DIR       日志目录，默认 <项目根>/logs
 *   LOG_SERVICE   文件名前缀/服务名，默认 backend
 *   LOG_LEVEL     debug|info|warn|error|fatal，默认 info
 *   LOG_KEEP_DAYS 保留天数，默认 14
 *   LOG_SILENT=1  只写文件，不输出控制台
 *   LOG_COLOR=0   关闭控制台颜色
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');

const ROOT = process.env.LOG_DIR || path.resolve(__dirname, '..', 'logs');
const SERVICE = process.env.LOG_SERVICE || 'backend';
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const LEVEL_NAMES = Object.keys(LEVELS);
const ACTIVE = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
const KEEP_DAYS = Math.max(1, Number(process.env.LOG_KEEP_DAYS) || 14);
const SILENT = process.env.LOG_SILENT === '1';
const COLOR = process.env.LOG_COLOR !== '0' && process.stdout.isTTY;

const COLOR_CODE = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', fatal: '\x1b[95m' };
const RESET = '\x1b[0m';

const FILE_MODE = Number(process.env.LOG_FILE_MODE) || 0o644; // 默认所有人可读
const DIR_MODE = 0o755;

fs.mkdirSync(ROOT, { recursive: true, mode: DIR_MODE });

function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fileFor(day) {
  return path.join(ROOT, `${SERVICE}-${day}.log`);
}

let currentDay = localDay();
let currentFile = fileFor(currentDay);
let currentReady = false;

// 建文件/放开权限：所有人可读（对 root 启动的服务尤其有用）
function openCurrentFile() {
  try {
    if (!fs.existsSync(currentFile)) {
      fs.writeFileSync(currentFile, '', { mode: FILE_MODE });
    }
    fs.chmodSync(currentFile, FILE_MODE);
    fs.chmodSync(ROOT, DIR_MODE);
  } catch (_) { /* 权限调整失败不影响写日志 */ }
}

function cleanup() {
  try {
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    for (const name of fs.readdirSync(ROOT)) {
      if (!name.startsWith(`${SERVICE}-`) || !name.endsWith('.log')) continue;
      const full = path.join(ROOT, name);
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    }
  } catch (_) { /* 清理失败不影响主流程 */ }
}

function rotateIfNeeded() {
  const day = localDay();
  if (day === currentDay) return;
  currentDay = day;
  currentFile = fileFor(day);
  currentReady = false;
  cleanup();
}

function serialize(value, seen = new WeakSet()) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code, stack: value.stack };
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => serialize(item, seen));
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return `<Buffer ${value.length} bytes>`;
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = serialize(item, seen);
    return out;
  }
  return value;
}

function normalizeFields(fields) {
  const out = {};
  if (fields == null) return out;
  if (fields instanceof Error) return { err: serialize(fields) };
  if (typeof fields !== 'object') return { detail: serialize(fields) };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = serialize(value);
  }
  return out;
}

function toText(msg) {
  if (typeof msg === 'string') return msg;
  if (msg instanceof Error) return msg.message;
  try {
    return typeof msg === 'object' ? JSON.stringify(msg) : String(msg);
  } catch (_) {
    return util.inspect(msg, { depth: 3, breakLength: Infinity });
  }
}

function writeConsole(level, record, bindings) {
  const time = record.ts;
  const tag = (COLOR ? COLOR_CODE[level] : '') + level.toUpperCase().padEnd(5) + (COLOR ? RESET : '');
  const mod = bindings && bindings.module ? ` [${bindings.module}]` : '';
  const skip = new Set(['ts', 'level', 'service', 'msg', ...Object.keys(bindings || {})]);
  const extras = Object.entries(record)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  const line = `${time} ${tag}${mod} ${record.msg}${extras ? ' ' + extras : ''}`;
  (level === 'error' || level === 'fatal' ? process.stderr : process.stdout).write(line + '\n');
}

function emit(level, msg, fields, bindings) {
  if (LEVELS[level] < ACTIVE) return;
  try {
    rotateIfNeeded();
    if (!currentReady) {
      openCurrentFile();
      currentReady = true;
    }
    const record = { ts: new Date().toISOString(), level, service: SERVICE, ...bindings, msg: toText(msg), ...normalizeFields(fields) };
    fs.appendFileSync(currentFile, JSON.stringify(record) + '\n');
    if (!SILENT) writeConsole(level, record, bindings);
  } catch (_) { /* 日志失败绝不影响业务 */ }
}

function createLogger(bindings = {}) {
  const api = {};
  for (const level of LEVEL_NAMES) {
    api[level] = (msg, fields) => emit(level, msg, fields, bindings);
  }
  api.child = (extra = {}) => createLogger({ ...bindings, ...extra });
  return api;
}

/** Express 请求日志中间件：记录方法/路径/状态/耗时/IP，并把 req.log 注入路由 */
function requestLogger() {
  return (req, res, next) => {
    if (req.path === '/favicon.ico' || req.path === '/health') return next();

    const rid = crypto.randomUUID();
    const started = process.hrtime.bigint();
    req.rid = rid;
    req.log = createLogger({ module: 'http', rid });

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      emit(level, 'request', {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms: Number(ms.toFixed(1)),
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        ua: req.headers['user-agent'],
      }, { module: 'http', rid });
    });

    next();
  };
}

/** 让现有 console.* 也进入日志文件（保持控制台输出） */
function patchConsole() {
  const map = { log: 'info', info: 'info', warn: 'warn', error: 'error', debug: 'debug' };
  for (const [method, level] of Object.entries(map)) {
    console[method] = (...args) => {
      const msg = args.length && typeof args[0] === 'string' ? args.shift() : '';
      const fields = args.length ? { detail: args.length === 1 ? args[0] : args } : undefined;
      emit(level, msg || (fields ? fields.detail : ''), fields, {});
    };
  }
}

/** 进程级异常兜底 */
function installProcessHandlers() {
  process.on('unhandledRejection', (reason) => {
    emit('fatal', 'unhandledRejection', { err: reason }, {});
  });
  process.on('uncaughtException', (err) => {
    emit('fatal', 'uncaughtException', { err }, {});
    process.exit(1); // 与 Node 默认行为一致：快速失败，但保证先落盘
  });
}

module.exports = {
  createLogger,
  requestLogger,
  patchConsole,
  installProcessHandlers,
  dir: ROOT,
  currentFile: () => currentFile,
};
