// ====== 顶部：所有 require 放一起（确保在任何使用 cron.schedule 之前）======
const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');
const path = require('path');
const cron = require('node-cron');        // 确保只 require 一次
const { sm4 } = require('sm-crypto');

const { spawn,exec } = require('child_process');
const FormData = require('form-data');
const { registerFlRoutes, registerHeRoutes, registerPreRoutes } = require('./pcp');
const { registerMpcRoutes } = require('./mpc');
const { registerTeeRoutes, createTeeClient } = require('./tee');
const { createModelHashStorage } = require('./tee/modelHashStorage');
const { validateTeeTransactionProposal, buildTeeDigitalContract } = require('./tee/contractFinalization');
const alipay = require('./config/alipay');
const logger = require('./logger');

logger.patchConsole();
logger.installProcessHandlers();
const log = logger.createLogger({ module: 'main' });


// ====== 基础实例与常量（确保在后面使用之前就定义好）======
const app = express();
app.use(logger.requestLogger());
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const secretKey = process.env.JWT_SECRET || '123456'; // 你原来用到的 JWT 密钥，别漏了

// multer（下面很多路由会用到）
const storage = multer.memoryStorage();
const upload = multer({ storage });

const TEE_MODEL_MAX_BYTES = Math.max(1, Number(process.env.TEE_MODEL_MAX_BYTES || 10 * 1024 * 1024));
const teeModelUpload = multer({ storage: createModelHashStorage({ maxBytes: TEE_MODEL_MAX_BYTES }) });
const acceptTeeModelUpload = (req, res, next) => {
    teeModelUpload.single('modelFile')(req, res, (error) => {
        if (!error) return next();
        return res.status(400).json({ message: error.message || 'TEE 计算模型上传失败' });
    });
};
// 交付阶段的模型必须只在当前请求内存中短暂存在；购买申请阶段的
// createModelHashStorage 只保留哈希，不能用于这里的加密转发。
const teeDeliveryModelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: TEE_MODEL_MAX_BYTES },
    fileFilter: (req, file, callback) => {
        if (/\.c$/i.test(String(file?.originalname || ''))) return callback(null, true);
        const error = new Error('计算模型必须为 .c 文件');
        error.code = 'INVALID_MODEL_FILE';
        error.statusCode = 400;
        return callback(error);
    }
});
const acceptTeeDeliveryModelUpload = (req, res, next) => {
    teeDeliveryModelUpload.single('modelFile')(req, res, (error) => {
        if (!error) return next();
        const tooLarge = error.code === 'LIMIT_FILE_SIZE';
        return res.status(400).json({
            success: false,
            code: tooLarge ? 'MODEL_TOO_LARGE' : (error.code || 'INVALID_MODEL_FILE'),
            message: tooLarge ? `计算模型不能超过 ${TEE_MODEL_MAX_BYTES} 字节` : (error.message || '计算模型上传失败')
        });
    });
};

// 远端地址与证书路径（尽量都集中在上面）
const REMOTE_EXPORT_URL = 'http://10.112.14.6:8083/api/export-result'
const REMOTE_JSON_URL  = process.env.REMOTE_JSON_URL  || 'http://10.112.14.6:8081/api/recv-json';
const REMOTE_FILE_URL  = process.env.REMOTE_FILE_URL  || 'http://10.112.14.6:8082/api/recv-file';
const REMOTE_KEY_URL   = process.env.REMOTE_KEY_URL   || 'http://10.112.14.6:8080/api/receive-key';
const KEY_FILE_PATH    = process.env.PUBLIC_KEY_PATH  || '/home/super/r/cert/client3/client3.pem';
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH || '/home/super/r/cert/client3/client3.sign.key';
const EXPORT_DIR = process.env.EXPORT_DIR || '/home/super/r/20251028test';
const REMOTE_PRE_BASE_URL = process.env.REMOTE_PRE_BASE_URL || 'http://10.112.191.163:8123/pre';
const PRE_PYTHON_BIN = process.env.PRE_PYTHON_BIN || 'python3';
const PRE_HELPER_DIR = process.env.PRE_HELPER_DIR || '/home/super/r/localdata/pre_helpers';
const REMOTE_FL_BASE_URL =
  process.env.REMOTE_FL_BASE_URL || 'http://10.112.191.163:8000/federate/task';

const FL_MODEL_DIR =
  process.env.FL_MODEL_DIR || '/home/super/r/localdata/fl_models';
const ASSET_ANALYSIS_BASE_URL =
  process.env.ASSET_ANALYSIS_BASE_URL || 'http://10.112.191.163:8003';
const PRE_UPLOAD_DIR = process.env.PRE_UPLOAD_DIR || '/home/super/r/localdata/pre_uploads';
const DIGITAL_CONTRACT_BASE_URL =
  process.env.DIGITAL_CONTRACT_BASE_URL || 'http://10.112.14.6:18080/api';
const SUMMARY_API_BASE = 'http://10.112.191.163:8022';
const DATA_CATALOG_BASE_URL =
  process.env.DATA_CATALOG_BASE_URL || 'http://127.0.0.1:8008';
// 数据目录发布开关：8008 服务维护期间默认关闭，优先保证上链登记主流程
// 需要恢复目录发布时，启动时加 DATA_CATALOG_ENABLED=1 即可
const DATA_CATALOG_ENABLED = process.env.DATA_CATALOG_ENABLED === '1';
const DATA_CATALOG_ORG_DID =
  process.env.DATA_CATALOG_ORG_DID || 'did:web:data.web';
const DATA_CATALOG_PLATFORM_NAME =
  process.env.DATA_CATALOG_PLATFORM_NAME || '数字资产交易平台';
const DATA_CATALOG_PLATFORM_DID =
  process.env.DATA_CATALOG_PLATFORM_DID || 'did:web:data.web';
const DATA_CATALOG_PLATFORM_URL =
  process.env.DATA_CATALOG_PLATFORM_URL || 'http://10.112.191.163';
const HUB_WEB_ORIGIN =
  process.env.HUB_WEB_ORIGIN || 'http://10.112.191.163:15140';
const HUB_API_BASE_URL =
  process.env.HUB_API_BASE_URL || 'http://127.0.0.1:18140';
const HUB_TRADING_TOKEN =
  process.env.HUB_TRADING_TOKEN || '';
const PAM_TRADING_AUTHORIZE_PATH =
  process.env.PAM_TRADING_AUTHORIZE_PATH || '/api/pam/authorize';
const PAM_ENTRY_COOKIE = 'pam_trade_entry';
const PAM_ENTRY_COOKIE_TTL_SECONDS = 300;

const VM_HOST_BASE_URL = 'http://10.112.14.6:8000';
const VM_TOKEN =
'a3051629280e66304271b04abb28e9e3b45cb887c67a6030a01cb4b4c2f48f93';
const VM_SERVICE_BASE_URL = 'http://虚机服务IP:18080/api';

const SUMMARY_RECORDS_DIR =
  process.env.SUMMARY_RECORDS_DIR || '/home/super/zym';

const CSV_ENGINE_BASE_URL =
  process.env.CSV_ENGINE_BASE_URL ||
  'http://10.112.14.6:18080';

const CSV_API_PATHS = {
  receiveKey:
    process.env.CSV_RECEIVE_KEY_PATH ||
    '/api/receive-key',

  receiveFile:
    process.env.CSV_RECEIVE_FILE_PATH ||
    '/api/receive-file',

  verifyContract:
    process.env.CSV_VERIFY_CONTRACT_PATH ||
    '/apiJSON/receive-json',

  getResult:
    process.env.CSV_GET_RESULT_PATH ||
    '/api/get-result'
};
 
// 缓存 TTL
const KEY_CACHE_TTL_MIN = parseInt(process.env.KEY_CACHE_TTL_MIN || '30', 10);

// ====== 缓存：vmId+purpose 维度 ======
const keyResponseCache = new Map(); // key: `${vmId}::${purpose}`
const cacheKey = (vmId, purpose = 'default') => `${vmId}::${purpose}`;
const getCache = (vmId, purpose = 'default') => keyResponseCache.get(cacheKey(vmId, purpose));

const CT_MAP = {
  zip:  'application/zip',
  csv:  'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt:  'text/plain; charset=utf-8',
  pdf:  'application/pdf',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg'
};

function buildDataCatalogKey(identifier) {
  const source = String(identifier || '').trim();
  const digest = crypto
    .createHash('sha256')
    .update(source)
    .digest('hex');

  // ChainMaker 目录合约用 id 作为 state key。
  // 原始数字指纹包含 "=" 等字符且长度过长，直接写入会触发合约调用失败。
  return `DC_${digest.slice(0, 32)}`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (error) {
      cookies[key] = value;
    }
  });
  return cookies;
}

async function hubApiFetch(pathname, options = {}) {
  if (!HUB_TRADING_TOKEN) {
    throw new Error('HUB_TRADING_TOKEN 未配置，无法访问审计平台');
  }
  const url = new URL(pathname, `${HUB_API_BASE_URL.replace(/\/$/, '')}/`);
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'x-trading-token': HUB_TRADING_TOKEN,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    body: options.body
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.detail || `审计平台请求失败: HTTP ${response.status}`);
  }
  return result;
}

function buildPamEntryUrl(pccContractId = '') {
  const base = `${HUB_WEB_ORIGIN.replace(/\/$/, '')}/entry/start`;
  const query = new URLSearchParams();
  if (pccContractId) {
    query.set('pcc_contract_id', pccContractId);
  }
  const suffix = query.toString();
  return suffix ? `${base}?${suffix}` : base;
}

// 把 db.query 封装成 Promise，方便用 async/await
function dbQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return null;
}

async function getDefaultRegisterCertInfoByUserId(userId) {
  const userRows = await dbQuery(
    `
      SELECT default_register_cert
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  const certName = userRows?.[0]?.default_register_cert;
  if (!certName) {
    throw new Error('未设置上链默认证书，请先到个人中心设置');
  }

  const certRows = await dbQuery(
    `
      SELECT
        certificate_name,
        org,
        address,
        sign_cert_path,
        tls_cert_path,
        pem_path,
        expires_at
      FROM certificate_registry
      WHERE user_id = ?
        AND certificate_name = ?
      LIMIT 1
    `,
    [userId, certName]
  );

  if (!certRows || certRows.length === 0) {
    throw new Error('上链默认证书不存在或不属于当前用户');
  }

  return certRows[0];
}

// ====== 新增：工具函数 ======
async function findLatestFile(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries.filter(e => e.isFile()).map(e => e.name);
  if (!files.length) return null;

  // 取 mtime 最大的文件
  let latest = null, latestStat = null;
  for (const name of files) {
    const full = path.join(dir, name);
    const st = await fs.stat(full);
    if (!latest || st.mtimeMs > latestStat.mtimeMs) {
      latest = full; latestStat = st;
    }
  }
  return { fullPath: latest, stat: latestStat };
}

function safeBaseName(name) {
  // 去掉奇怪字符&末尾扩展名，避免 header 注入
  const base = String(name || 'result').replace(/[^\w.\-]+/g, '_');
  return base.replace(/\.[^.]+$/,''); // 去掉用户传入的扩展名
}

function pickContentType(reqExt, fileExt) {
  // 优先用用户请求的 format 映射；没有就用源文件扩展；最后 octet-stream
  return CT_MAP[reqExt] || CT_MAP[fileExt] || 'application/octet-stream';
}
// ====== 定时清理（每 10 分钟）—— 只保留这一份 ======
cron.schedule('*/10 * * * *', () => {
  const now = Date.now();
  const before = keyResponseCache.size;
  let removed = 0;

  for (const [k, rec] of keyResponseCache.entries()) {
    if (rec?.expiresAt && rec.expiresAt <= now) {
      keyResponseCache.delete(k);
      removed++;
    }
  }

  console.log(
    `[cron] ${new Date().toISOString()} 清理完成 | 删除=${removed} | 剩余=${keyResponseCache.size} | 之前=${before} | TTL(min)=${KEY_CACHE_TTL_MIN}`
  );
});

function opensslSm4CbcRaw(dataBuf, args) {
  return new Promise((resolve, reject) => {
    const p = spawn('openssl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => err.push(d));
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`openssl exit ${code}: ${Buffer.concat(err).toString()}`));
    });
    p.stdin.end(dataBuf);
  });
}

// const crypto = require('crypto');
// const { spawn } = require('child_process');
// const sm4 = require('sm-crypto').sm4;

/**
 * SM4-CBC encryption (OpenSSL preferred)
 * opts:
 *  - ivB64: fixed iv base64
 *  - padding: 'pkcs7' | 'nopad'
 *  - canonicalizeJson: true
 *  - appendLF: true
 *  - useOpenSSL: true/false
 */
async function sm4CbcEncryptCompat(sm4Key, bufOrStr, opts = {}) {
  const useOpenSSL = opts.useOpenSSL !== false;

  // ===== IV =====
  const iv = opts.ivB64 ? Buffer.from(opts.ivB64, 'base64') : crypto.randomBytes(16);
  if (iv.length !== 16) throw new Error('IV 必须 16B');

  // ===== Plaintext =====
  let input;
  if (Buffer.isBuffer(bufOrStr)) {
    input = bufOrStr;
  } else {
    let s = String(bufOrStr);
    if (opts.canonicalizeJson) {
      try { s = JSON.stringify(JSON.parse(s)); } catch (_) {}
    }
    if (opts.appendLF) s += '\n';
    input = Buffer.from(s, 'utf8');
  }

  const keyHex = sm4Key.toString('hex');
  const ivHex  = iv.toString('hex');
  const paddingMode = (opts.padding || 'pkcs7').toLowerCase();

  // ================= OpenSSL path =================
  if (useOpenSSL) {
    const args = ['enc', '-sm4-cbc', '-K', keyHex, '-iv', ivHex, '-in', '-', '-out', '-'];
    if (paddingMode === 'nopad') args.push('-nopad');

    const ct = await opensslSm4CbcRaw(input, args);

    return {
      iv: iv.toString('base64'),
      ciphertext: ct.toString('base64'),
      meta: {
        alg: 'SM4-CBC',
        padding: paddingMode,
        ivLen: 16,
        keyLen: 16
      }
    };
  }

  // ================= sm-crypto fallback (PKCS7 only) =================
  if (paddingMode === 'nopad') {
    throw new Error('sm-crypto 不支持 nopad，必须使用 OpenSSL');
  }

  const dataHex   = input.toString('hex');
  const cipherHex = sm4.encrypt(dataHex, keyHex, {
    mode: 'cbc',
    iv: ivHex,
    padding: 'pkcs7'
  });

  const ctRaw = Buffer.from(cipherHex, 'hex');

  return {
    iv: iv.toString('base64'),
    ciphertext: ctRaw.toString('base64'),
    meta: {
      alg: 'SM4-CBC',
      padding: 'pkcs7',
      ivLen: 16,
      keyLen: 16,
      impl: 'sm-crypto'
    }
  };
}

/**
 * Run OpenSSL SM4-CBC raw binary mode (no Salted__ header)
 */
function opensslSm4CbcRaw(dataBuf, args) {
  return new Promise((resolve, reject) => {
    const p = spawn('openssl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];

    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => err.push(d));
    p.on('error', reject);

    p.on('close', code => {
      if (code === 0) {
        resolve(Buffer.concat(out));
      } else {
        reject(new Error(`openssl exit ${code}: ${Buffer.concat(err).toString()}`));
      }
    });

    p.stdin.end(dataBuf);
  });
}

module.exports = { sm4CbcEncryptCompat };

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

const CLASSIFICATION_METHOD_PATHS = {
  type: '/api/methods/classification/type',
  income: '/api/methods/classification/income',
  liquidity: '/api/methods/classification/liquidity',
  'value-stability': '/api/methods/classification/value-stability'
};

const GRADING_METHOD_PATHS = {
  harm: '/api/methods/grading/harm',
  security: '/api/methods/grading/security',
  sensitivity: '/api/methods/grading/sensitivity',
  vulnerability: '/api/methods/grading/vulnerability'
};


function flHeaders(entityId, needNonce = false) {
  const headers = {
    'x-entity-id': String(entityId || '')
  };

  if (needNonce) {
    headers['x-timestamp'] = String(Math.floor(Date.now() / 1000));
    headers['x-nonce'] = crypto.randomUUID();
  }

  return headers;
}




async function proxyAssetAnalysis(req, res, methodMap, modeName) {
  try {
    const method = String(req.body.method || '').trim();

    if (!method || !methodMap[method]) {
      return res.status(400).json({
        success: false,
        message: `${modeName}方法无效`
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '缺少 input_file 文件'
      });
    }

    const targetUrl = `${ASSET_ANALYSIS_BASE_URL}${methodMap[method]}`;

    const fd = new FormData();
    fd.append('input_file', req.file.buffer, {
      filename: req.file.originalname || 'input_file',
      contentType: req.file.mimetype || 'application/octet-stream'
    });

    // FastAPI 这些字段都是可选参数；这里可以不传，也可以传默认值。
    // 为了稳定，建议显式传默认值。
    fd.append('model', req.body.model || 'qwen3:8b');
    fd.append('embedding_model', req.body.embedding_model || 'bge-m3');
    fd.append('rag_top_k', String(req.body.rag_top_k || 3));
    fd.append('rag_recall_k', String(req.body.rag_recall_k || 20));
    fd.append('record_limit', String(req.body.record_limit || 100));
     fd.append('base_url', req.body.base_url || 'http://127.0.0.1:11434');

    console.log(`[${modeName}] method=${method}, targetUrl=${targetUrl}, file=${req.file.originalname}`);

    const remoteResp = await axios.post(targetUrl, fd, {
      headers: fd.getHeaders(),
      timeout: 180000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true
    });

    if (remoteResp.status < 200 || remoteResp.status >= 300) {
      return res.status(remoteResp.status).json({
        success: false,
        message: `${modeName}服务调用失败`,
        remote: remoteResp.data
      });
    }

    return res.json({
      success: true,
      ...remoteResp.data
    });
  } catch (err) {
    console.error(`[${modeName}] 代理异常:`, err);
    return res.status(500).json({
      success: false,
      message: `${modeName}服务异常`,
      error: err.message
    });
  }
}


async function decryptReceiveKeyResp(jsonResp, ecPrivateKeyPath) {
  const ephDER = Buffer.from(jsonResp.ephPub, 'base64');
  const salt = Buffer.from(jsonResp.salt, 'base64');
  const nonce = Buffer.from(jsonResp.nonce, 'base64');
  const tag = Buffer.from(jsonResp.tag, 'base64');
  const cipher = Buffer.from(jsonResp.ciphertext, 'base64');

  const privPem = await fs.readFile(ecPrivateKeyPath, 'utf8');
  const myPriv = crypto.createPrivateKey(privPem);
  const ephPub = crypto.createPublicKey({
    key: ephDER,
    format: 'der',
    type: 'spki'
  });

  const secret = crypto.diffieHellman({
    privateKey: myPriv,
    publicKey: ephPub
  });

  const info = Buffer.from('HENC2-P256-AES256GCM', 'ascii');
  const hash = crypto.createHash('sha256');
  hash.update(secret);
  hash.update(salt);
  hash.update(info);

  const aesKey = hash.digest();

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(cipher),
    decipher.final()
  ]);
}

function extractSm4Key(plain) {
  if (!Buffer.isBuffer(plain)) return null;

  if (plain.length === 16) {
    return plain;
  }

  if (plain.length >= 24) {
    const ver = plain.readUInt32LE(0);
    const keyLen = plain.readUInt32LE(4);

    if ((ver === 1 || ver === 2) && keyLen === 16) {
      return plain.slice(8, 24);
    }
  }

  return null;
}

app.post('/api/asset-analysis/classify', upload.single('input_file'), async (req, res) => {
  return proxyAssetAnalysis(req, res, CLASSIFICATION_METHOD_PATHS, '分类');
});

app.post('/api/asset-analysis/grade', upload.single('input_file'), async (req, res) => {
  return proxyAssetAnalysis(req, res, GRADING_METHOD_PATHS, '分级');
});


// ====== 公共：SM4-CBC/PKCS7 加密 ======
// function sm4CbcEncryptWithKey(sm4Key, bufOrStr) {
//   const iv = crypto.randomBytes(16);
//   const keyHex  = sm4Key.toString('hex');
//   const ivHex   = iv.toString('hex');
//   const dataHex = Buffer.isBuffer(bufOrStr) ? bufOrStr.toString('hex') : Buffer.from(bufOrStr, 'utf8').toString('hex');
//   const cipherHex = sm4.encrypt(dataHex, keyHex, { mode: 'cbc', iv: ivHex, padding: 'pkcs7' });
//   return {
//     iv: iv.toString('base64'),
//     ciphertext: Buffer.from(cipherHex, 'hex').toString('base64'),
//     _ivRaw: iv,
//     _ctRaw: Buffer.from(cipherHex, 'hex')
//   };
// }

// ====== 将返回值落盘 & 写入“vmId+purpose”缓存（只保留这一份）======
async function persistTemp(vmId, payload, purpose = 'default') {
  const now = Date.now();
  const expiresAt = now + KEY_CACHE_TTL_MIN * 60 * 1000;
  const filePath = path.join(os.tmpdir(), `key_resp_${vmId}_${purpose}_${now}.json`);

  await fs.writeFile(
    filePath,
    JSON.stringify({ vmId, purpose, payload, savedAt: now, expiresAt }, null, 2),
    'utf8'
  );

  const rec = { payload, savedAt: now, expiresAt, filePath, vmId, purpose };
  keyResponseCache.set(cacheKey(vmId, purpose), rec);

  return { filePath, expiresAt, cacheKey: cacheKey(vmId, purpose) };
}

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use(express.json({ limit: '50mb' }));               // 解析 application/json
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // 解析 application/x-www-form-urlencoded


// MySQL连接配置；通过 MAIN_DB_NAME 切换测试库/正式库。
const MAIN_DB_NAME = process.env.MAIN_DB_NAME || 'r01_prod';
const MAIN_DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: MAIN_DB_NAME
};
const db = mysql.createConnection(MAIN_DB_CONFIG);

function withMainDbTransaction(work) {
  const connection = mysql.createConnection(MAIN_DB_CONFIG);
  const query = (sql, params = []) => new Promise((resolve, reject) => {
    connection.query(sql, params, (error, results) => error ? reject(error) : resolve(results));
  });
  const begin = () => new Promise((resolve, reject) => connection.beginTransaction((error) => error ? reject(error) : resolve()));
  const commit = () => new Promise((resolve, reject) => connection.commit((error) => error ? reject(error) : resolve()));
  const rollback = () => new Promise((resolve) => connection.rollback(() => resolve()));
  const end = () => new Promise((resolve) => connection.end(() => resolve()));

  return begin()
    .then(() => work({ query, connection }))
    .then(async (result) => { await commit(); return result; })
    .catch(async (error) => { await rollback(); throw error; })
    .finally(end);
}

db.connect(err => {
    if (err) {
        console.error(`MySQL ${MAIN_DB_NAME} 连接失败:`, err);
        return;
    }
    console.log(`MySQL ${MAIN_DB_NAME} 连接成功`);
    
});

// MySQL连接配置 - Active Chainmaker CA org1 Database
const chainmakerCaDb = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'chainmaker_ca8'
});

chainmakerCaDb.connect(err => {
    if (err) {
        console.error('MySQL chainmaker_ca8 连接失败:', err);
        return;
    }
    console.log('MySQL chainmaker_ca8 连接成功');
});

// MySQL连接配置 - Active Chainmaker CA org2 Database
const chainmakerCa2Db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'chainmaker_ca04'
});

chainmakerCa2Db.connect(err => {
    if (err) {
        console.error('MySQL chainmaker_ca04 连接失败:', err);
        return;
    }
    console.log('MySQL chainmaker_ca04 连接成功');
});

const CERT_DB_NAME_BY_ORG = {
    'wx-org1': 'chainmaker_ca8',
    'wx-org2': 'chainmaker_ca04'
};

function insertCertificateRegistry({
    userId,
    certificateName,
    org,
    signCertPath = null,
    tlsCertPath = null,
    pemPath = null,
    address = null,
    expiresAt = null
}) {
    const sql = `
        INSERT INTO certificate_registry
            (user_id, certificate_name, org, sign_cert_path, tls_cert_path, pem_path, address, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            user_id = COALESCE(VALUES(user_id), user_id),
            sign_cert_path = COALESCE(VALUES(sign_cert_path), sign_cert_path),
            tls_cert_path = COALESCE(VALUES(tls_cert_path), tls_cert_path),
            pem_path = COALESCE(VALUES(pem_path), pem_path),
            address = COALESCE(VALUES(address), address),
            expires_at = COALESCE(VALUES(expires_at), expires_at)
    `;

    const values = [
        userId,
        certificateName,
        org,
        signCertPath || null,
        tlsCertPath || null,
        pemPath || null,
        address || null,
        expiresAt || null
    ];

    return new Promise((resolve, reject) => {
        db.query(sql, values, (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result);
        });
    });
}

async function getLatestSummaryJsonFile() {
  const entries = await fs.readdir(SUMMARY_RECORDS_DIR, {
    withFileTypes: true
  });

  const jsonFiles = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.json')) continue;

    const fullPath = path.join(SUMMARY_RECORDS_DIR, entry.name);
    const stat = await fs.stat(fullPath);

    jsonFiles.push({
      name: entry.name,
      fullPath,
      mtimeMs: stat.mtimeMs
    });
  }

  if (jsonFiles.length === 0) {
    throw new Error(`目录下没有 json 摘要文件：${SUMMARY_RECORDS_DIR}`);
  }

  jsonFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

  return jsonFiles[0];
}

async function readLatestSummaryRecords() {
  const latestFile = await getLatestSummaryJsonFile();
  const text = await fs.readFile(latestFile.fullPath, 'utf8');
  const json = JSON.parse(text);

  if (!Array.isArray(json.records) || json.records.length === 0) {
    throw new Error(`最新摘要文件 records 为空：${latestFile.name}`);
  }

  return {
    latestFile,
    records: json.records
  };
}

app.post('/api/certificate-registry/upsert', async (req, res) => {
    const {
        userId = null,
        certificateName,
        org,
        signCertPath = null,
        tlsCertPath = null,
        pemPath = null,
        address = null,
        expiresAt = null
    } = req.body || {};

    if (!certificateName || !org) {
        return res.status(400).json({ message: '缺少 certificateName 或 org 参数' });
    }

    try {
        await insertCertificateRegistry({
            userId,
            certificateName,
            org,
            signCertPath,
            tlsCertPath,
            pemPath,
            address,
            expiresAt
        });

        return res.status(200).json({ message: '证书登记成功' });
    } catch (error) {
        console.error('写入 certificate_registry 失败:', error);
        return res.status(500).json({ message: '证书登记失败' });
    }
});

registerHeRoutes({
  app,
  upload,
  dbQuery,
  firstDefined,
  parseJsonField(value) {
    if (value == null || value === '') {
      return null;
    }

    if (typeof value === 'object') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  },
  safeBaseName,
  pickContentType
});

registerPreRoutes({
  app,
  upload,
  dbQuery,
  firstDefined,
  parseJsonField(value) {
    if (value == null || value === '') {
      return null;
    }

    if (typeof value === 'object') {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  },
  safeBaseName,
  pickContentType
});

registerFlRoutes({
  app,
  upload,
  dbQuery,
  firstDefined,
  safeBaseName,
  pickContentType
});

registerMpcRoutes({
  app,
  upload,
  dbQuery
});

registerTeeRoutes({
  app,
  upload,
  modelUpload: acceptTeeDeliveryModelUpload,
  dbQuery,
  withDbTransaction: withMainDbTransaction,
  // The existing VM integration already has the service credential. Prefer an
  // explicitly configured TEE token, but reuse it so TEE create/start works
  // in current deployments without a second manual secret configuration.
  teeClient: createTeeClient({ token: process.env.TEE_VM_API_TOKEN || VM_TOKEN })
});


const COMBINED_CLASSIFICATION_METHODS = new Set([
  'type',
  'income',
  'liquidity',
  'value-stability'
]);

const COMBINED_GRADING_METHODS = new Set([
  'harm',
  'security',
  'sensitivity',
  'vulnerability'
]);

app.post('/api/summary-records/combined/latest/:kind/:method', async (req, res) => {
  try {
    const { kind, method } = req.params;

    if (!['classification', 'grading'].includes(kind)) {
      return res.status(400).json({
        success: false,
        message: 'kind 参数无效'
      });
    }

    if (
      kind === 'classification' &&
      !COMBINED_CLASSIFICATION_METHODS.has(method)
    ) {
      return res.status(400).json({
        success: false,
        message: '分类方法无效'
      });
    }

    if (
      kind === 'grading' &&
      !COMBINED_GRADING_METHODS.has(method)
    ) {
      return res.status(400).json({
        success: false,
        message: '分级方法无效'
      });
    }

    const { latestFile, records } = await readLatestSummaryRecords();

    const targetUrl =
      `${SUMMARY_API_BASE}/api/summary-records/combined/${kind}/${method}`;

    const payload = {
      source_file: latestFile.name,
      records,
      model: req.body.model || 'qwen3:8b',
      embedding_model: req.body.embedding_model || 'bge-m3',
      rag_top_k: req.body.rag_top_k || 3,
      rag_recall_k: req.body.rag_recall_k || 20,
      record_limit: req.body.record_limit || 100,
      base_url: req.body.base_url || 'http://127.0.0.1:11434'
    };

    console.log(
      `[summary latest] kind=${kind}, method=${method}, file=${latestFile.fullPath}, records=${records.length}`
    );

    const remoteResp = await axios.post(
      targetUrl,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000,
        validateStatus: () => true
      }
    );

    if (remoteResp.status < 200 || remoteResp.status >= 300) {
      return res.status(remoteResp.status).json({
        success: false,
        message: 'summary-records 服务调用失败',
        latest_file: latestFile.name,
        remote: remoteResp.data
      });
    }

    return res.json({
      success: true,
      latest_file: latestFile.name,
      latest_file_path: latestFile.fullPath,
      ...remoteResp.data
    });
  } catch (err) {
    console.error('[summary-records latest] error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '读取最新摘要文件失败'
    });
  }
});

app.post('/api/asset-analysis/combined', upload.single('input_file'), async (req, res) => {
  try {
    const method = String(req.body.method || '').trim();

    if (!method) {
      return res.status(400).json({
        success: false,
        message: '缺少分类分级方法'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '缺少 input_file 文件'
      });
    }

    let classificationMethod = '';
    let gradingMethod = '';

    // 如果用户选的是分类方法：分级默认 harm
    if (COMBINED_CLASSIFICATION_METHODS.has(method)) {
      classificationMethod = method;
      gradingMethod = 'harm';
    }
    // 如果用户选的是分级方法：分类默认 type
    else if (COMBINED_GRADING_METHODS.has(method)) {
      classificationMethod = 'type';
      gradingMethod = method;
    } else {
      return res.status(400).json({
        success: false,
        message: '分类分级方法无效'
      });
    }

    async function callAssetAnalysis(methodMap, selectedMethod, modeName) {
      const targetUrl = `${ASSET_ANALYSIS_BASE_URL}${methodMap[selectedMethod]}`;

      const fd = new FormData();
      fd.append('input_file', req.file.buffer, {
        filename: req.file.originalname || 'input_file',
        contentType: req.file.mimetype || 'application/octet-stream'
      });

      fd.append('model', req.body.model || 'qwen3:8b');
      fd.append('embedding_model', req.body.embedding_model || 'bge-m3');
      fd.append('rag_top_k', String(req.body.rag_top_k || 3));
      fd.append('rag_recall_k', String(req.body.rag_recall_k || 20));
      fd.append('record_limit', String(req.body.record_limit || 100));
      fd.append('base_url', req.body.base_url || 'http://127.0.0.1:11434');

      console.log(`[combined:${modeName}] method=${selectedMethod}, targetUrl=${targetUrl}`);

      const remoteResp = await axios.post(targetUrl, fd, {
        headers: fd.getHeaders(),
        timeout: 300000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true
      });

      if (remoteResp.status < 200 || remoteResp.status >= 300) {
        const err = new Error(`${modeName}服务调用失败`);
        err.status = remoteResp.status;
        err.remote = remoteResp.data;
        throw err;
      }

      return remoteResp.data;
    }

    const [classificationResp, gradingResp] = await Promise.all([
      callAssetAnalysis(CLASSIFICATION_METHOD_PATHS, classificationMethod, '分类'),
      callAssetAnalysis(GRADING_METHOD_PATHS, gradingMethod, '分级')
    ]);

    const classificationFirst = classificationResp.entries?.[0] || {};
    const gradingFirst = gradingResp.entries?.[0] || {};

    const classification =
      classificationFirst.classification ||
      classificationResp.classification ||
      '';

    const grade =
      gradingFirst.grade ||
      gradingResp.grade ||
      '';

    if (!classification || !grade) {
      return res.status(500).json({
        success: false,
        message: '分类分级结果为空',
        classificationResp,
        gradingResp
      });
    }

    return res.json({
      success: true,
      mode: 'combined-by-node',
      selected_method: method,
      classification_method: classificationMethod,
      grading_method: gradingMethod,
      entries: [
        {
          classification,
          grade,
          classification_rationale: classificationFirst.classification_rationale || '',
          grade_rationale: gradingFirst.grade_rationale || ''
        }
      ],
      classification_raw: classificationResp,
      grading_raw: gradingResp
    });
  } catch (err) {
    console.error('[asset-analysis/combined] error:', err);
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || '分类分级服务异常',
      remote: err.remote || null
    });
  }
});

// 接收前端数据的API端点
app.post('/api/save-asset', (req, res) => {
    const { assetName, assetType, email, address, description, algorithm, customAlgorithm, fileHash, user_id } = req.body;

    // 确保fileHash存在
    if (!fileHash) {
        return res.status(400).json({ message: '缺少 fileHash' });
    }

    const checkSql = `SELECT COUNT(*) AS count FROM asset_registrations WHERE file_hash = ?`;

    db.query(checkSql, [fileHash], (checkErr, checkResult) => {
        if (checkErr) {
            console.error('检查资产文件哈希失败:', checkErr);
            return res.status(500).json({ message: '检查失败，请稍后再试' });
        }

        if (checkResult[0].count > 0) {
            return res.status(400).json({ message: '资产已存在，file_hash 重复' });
        }

        const query = `INSERT INTO asset_registrations (asset_name, asset_type, email, address, description, algorithm, custom_algorithm, file_hash, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const values = [assetName, assetType, email, address, description, algorithm, customAlgorithm || null, fileHash, user_id];

        db.query(query, values, (err, results) => {
            if (err) {
                console.error('插入数据失败:', err);
                return res.status(500).json({ error: '服务器内部错误' });
            }
            res.status(201).json({ message: '数据已成功保存' });
        });
    });
});



// 提供数据给前端的API端点（返回所有资产）
app.get('/api/get-assets', (req, res) => {
    const query = 'SELECT * FROM asset_registrations';
    db.query(query, (err, results) => {
        if (err) {
            console.error('获取数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }
        res.json(results);
    });
});

// 提供数据给前端的API端点（返回所有资产）
app.get('/api/get-user', (req, res) => {
    const query = 'SELECT * FROM users';

    db.query(query, (err, results) => {
        if (err) {
            console.error('获取数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        res.json({
            total_users: results.length,
            users: results
        });
    });
});

// 获取最新一条资产数据的API端点
app.get('/api/get-asset', (req, res) => {
    // 查询最新的一条数据，按id排序
    const query = 'SELECT * FROM asset_registrations ORDER BY id DESC LIMIT 1';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('获取数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }
        res.json(results);
    });
});

// 查询资产的API端点
app.get('/api/query-asset', (req, res) => {
    let assetName = req.query.assetName;

    console.log('Received assetName:', assetName); // 调试日志

    if (!assetName) {
        return res.status(400).json({ error: '缺少 assetName 参数' });
    }

    // 确保 assetName 是字符串，并去除前后空格
    if (typeof assetName !== 'string') {
        assetName = String(assetName);
    }
    assetName = assetName.trim();

    console.log(`Processed assetName: "${assetName}"`); // 调试日志

    // 使用 TRIM 确保匹配不受空格影响
    const query = `SELECT * FROM asset_registrations WHERE TRIM(asset_name) = ? ORDER BY id DESC`;
    
    db.query(query, [assetName], (err, results) => {
        if (err) {
            console.error('查询数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        const count = results.length;
        if (count > 0) {
            // 返回重名个数和最新（最大 id）的记录
            const latestRecord = results[0]; 
            res.json({
                count, // 重名的个数
                latestRecord // 最新的记录
            });
        } else {
            // 如果没有匹配的记录，返回一个空的响应
            res.json({
                count: 0,
                message: '未找到匹配的资产'
            });
        }
    });
});

// 查询同一个 assetName 的所有资产数据及其计数的 API 端点
app.get('/api/query-assets', (req, res) => {
    let assetName = req.query.assetName;

    console.log('Received assetName:', assetName); // 调试日志

    if (!assetName) {
        return res.status(400).json({ error: '缺少 assetName 参数' });
    }

    // 确保 assetName 是字符串，并去除前后空格
    if (typeof assetName !== 'string') {
        assetName = String(assetName);
    }
    assetName = assetName.trim();

    console.log(`Processed assetName: "${assetName}"`); // 调试日志

    // 使用 TRIM 确保匹配不受空格影响
    const query = `SELECT * FROM asset_registrations WHERE TRIM(asset_name) = ?`;
    
    db.query(query, [assetName], (err, results) => {
        if (err) {
            console.error('查询数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        const count = results.length;
        if (count > 0) {
            res.json({
                count, // 返回重名个数
                records: results // 返回所有记录
            });
        } else {
            // 如果没有匹配的记录，返回一个空的响应
            res.json({
                count: 0,
                message: '未找到匹配的资产'
            });
        }
    });
});

app.post('/api/update-asset', async (req, res) => {
    const { assetName, assetType, description, fileHash, email, address, userId , txperm, can_sell_asset, can_sell_view, can_sell_process, number } = req.body;
     console.log('Received data:', req.body); // 打印请求数据

    let nextNumber = null;
    if (number !== undefined && number !== null && String(number).trim() !== '') {
        const parsed = Number(number);
        if (!Number.isInteger(parsed) || parsed < 0) {
            return res.status(400).json({ message: '可售数量必须为非负整数' });
        }
        nextNumber = parsed;
    }

    try {
        // 代理期间资产的可售数量由代理关系管理，不能直接改大或改小。
        if (nextNumber !== null) {
            const delegations = await dbQuery(
                `SELECT id FROM asset_delegations
                 WHERE asset_id = ? AND status IN ('ACTIVE', 'SOLD_OUT')
                 LIMIT 1`,
                [fileHash]
            );
            if (delegations.length) {
                const currentRows = await dbQuery(
                    'SELECT number FROM asset_registrations WHERE file_hash = ? LIMIT 1',
                    [fileHash]
                );
                if (currentRows.length && nextNumber !== Number(currentRows[0].number)) {
                    return res.status(409).json({
                        message: '代理期间不能直接修改可售数量，请先撤销代理关系'
                    });
                }
            }
        }

        const sql = `
            UPDATE asset_registrations 
            SET asset_name = ?, asset_type = ?, description = ?, email = ?, address = ?, user_id = ? , txperm = ?, can_sell_asset = ?, can_sell_view = ?, can_sell_process = ?,
                number = CASE WHEN industry = 'WH' THEN LEAST(number, 1) ELSE COALESCE(?, number) END
            WHERE file_hash = ?
        `;

        const result = await dbQuery(sql, [
            assetName, assetType, description, email, address, userId, txperm,
            can_sell_asset, can_sell_view, can_sell_process, nextNumber, fileHash
        ]);

        if (result.affectedRows > 0) {
            return res.status(200).json({ message: '资产信息更新成功' });
        }
        return res.status(404).json({ message: '未找到对应的资产' });
    } catch (error) {
        console.error('更新资产信息失败:', error);
        return res.status(500).json({ message: '更新失败，请稍后再试' });
    }
});

// ================= 代理库存 / 代销 =================

const DELEGATION_RIGHTS = [
    { name: '持有权', field: 'can_sell_asset' },
    { name: '经营权', field: 'can_sell_view' },
    { name: '使用权', field: 'can_sell_process' }
];

function normalizeDelegationRights(input, asset) {
    const available = DELEGATION_RIGHTS
        .filter((item) => Number(asset[item.field]) === 1)
        .map((item) => item.name);
    const raw = Array.isArray(input) ? input : String(input || '').split(',');
    const requested = raw.map((item) => String(item || '').trim()).filter(Boolean);
    const finalRights = requested.length ? [...new Set(requested)] : available;

    if (!available.length) {
        const error = new Error('该资产当前没有可代理出售的权益');
        error.statusCode = 400;
        throw error;
    }
    const invalid = finalRights.filter((item) => !available.includes(item));
    if (invalid.length) {
        const error = new Error(`代理权益超出可售范围：${invalid.join('、')}`);
        error.statusCode = 400;
        throw error;
    }
    return finalRights;
}

async function resolveUserIdByAddress(address) {
    if (!address) return null;
    const rows = await dbQuery(
        'SELECT user_id FROM certificate_registry WHERE address = ? AND user_id IS NOT NULL LIMIT 1',
        [address]
    );
    return rows.length ? Number(rows[0].user_id) : null;
}

app.post('/api/delegate-asset', async (req, res) => {
    const assetId = String(req.body?.asset_id || '').trim();
    const agentAddress = String(req.body?.agent_address || '').trim();
    const requestedQuantity = Number(req.body?.quantity);
    const allowedRightsInput = req.body?.allowed_rights;
    const actorUserId = Number(req.body?.actor_user_id || req.body?.owner_user_id);

    if (!assetId || !agentAddress) {
        return res.status(400).json({ message: '缺少 asset_id 或 agent_address' });
    }
    if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
        return res.status(400).json({ message: '代理数量必须为正整数' });
    }

    try {
        const assetRows = await dbQuery(
            'SELECT * FROM asset_registrations WHERE file_hash = ? LIMIT 1',
            [assetId]
        );
        if (!assetRows.length) {
            return res.status(404).json({ message: '资产不存在' });
        }

        const asset = assetRows[0];
        const ownerAddress = String(asset.current_owner_address || asset.owner_address || '').trim();
        if (!ownerAddress) {
            return res.status(400).json({ message: '资产缺少所有者地址，无法代理' });
        }

        let ownerUserId = Number(asset.user_id);
        if (ownerAddress && ownerAddress !== asset.owner_address) {
            const resolvedOwner = await resolveUserIdByAddress(ownerAddress);
            if (resolvedOwner) ownerUserId = resolvedOwner;
        }
        if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
            return res.status(400).json({ message: '缺少操作人 actor_user_id' });
        }
        if (actorUserId !== ownerUserId) {
            return res.status(403).json({ message: '只有资产所有者可以发起代理托管' });
        }

        const agentUserId = await resolveUserIdByAddress(agentAddress);
        if (!agentUserId) {
            return res.status(400).json({ message: '托管码未绑定系统用户，请填写本站证书地址' });
        }
        if (agentUserId === ownerUserId) {
            return res.status(400).json({ message: '不能把资产代理给自己' });
        }
        if (String(asset.trade_mode || 'fixed') === 'auction') {
            return res.status(400).json({ message: '拍卖资产暂不支持代理托管' });
        }
        if (Number(asset.txperm) !== 3) {
            return res.status(400).json({ message: '当前资产尚未开放交易' });
        }

        const rights = normalizeDelegationRights(allowedRightsInput, asset);
        const quantity = String(asset.industry) === 'WH' ? 1 : requestedQuantity;

        const delegation = await withMainDbTransaction(async ({ query }) => {
            const lockedAssets = await query(
                'SELECT * FROM asset_registrations WHERE file_hash = ? LIMIT 1 FOR UPDATE',
                [assetId]
            );
            if (!lockedAssets.length) {
                const error = new Error('资产不存在');
                error.statusCode = 404;
                throw error;
            }
            const lockedAsset = lockedAssets[0];

            const existing = await query(
                `SELECT id, status FROM asset_delegations
                 WHERE asset_id = ? AND status IN ('ACTIVE', 'SOLD_OUT')
                 LIMIT 1 FOR UPDATE`,
                [assetId]
            );
            if (existing.length) {
                const error = new Error('该资产已有代理关系，请先撤销或退回后再重新授权');
                error.statusCode = 409;
                throw error;
            }

            const available = Number(lockedAsset.number);
            if (!Number.isFinite(available) || available < quantity) {
                const error = new Error('可售数量不足，无法预扣代理库存');
                error.statusCode = 409;
                error.code = 'OUT_OF_STOCK';
                throw error;
            }

            const updateResult = await query(
                'UPDATE asset_registrations SET number = number - ? WHERE file_hash = ? AND number >= ?',
                [quantity, assetId, quantity]
            );
            if (!updateResult || updateResult.affectedRows === 0) {
                const error = new Error('可售数量不足，无法预扣代理库存');
                error.statusCode = 409;
                error.code = 'OUT_OF_STOCK';
                throw error;
            }

            const insertResult = await query(
                `INSERT INTO asset_delegations
                    (asset_id, owner_id, owner_address, agent_user_id, agent_address,
                     quantity_total, quantity_remaining, allowed_rights, price, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
                [
                    assetId,
                    ownerUserId,
                    ownerAddress,
                    agentUserId,
                    agentAddress,
                    quantity,
                    quantity,
                    rights.join(','),
                    lockedAsset.price != null ? lockedAsset.price : null
                ]
            );

            await query(
                'UPDATE asset_registrations SET agent_addr = ?, agent_count = ?, is_proxied = 1 WHERE file_hash = ?',
                [agentAddress, quantity, assetId]
            );

            return {
                id: insertResult.insertId,
                asset_id: assetId,
                owner_id: ownerUserId,
                owner_address: ownerAddress,
                agent_user_id: agentUserId,
                agent_address: agentAddress,
                quantity_total: quantity,
                quantity_remaining: quantity,
                allowed_rights: rights.join(','),
                price: lockedAsset.price,
                status: 'ACTIVE'
            };
        });

        return res.status(200).json({ success: true, message: '代理托管成功', delegation });
    } catch (error) {
        console.error('代理托管失败:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.message || '代理托管失败',
            code: error.code
        });
    }
});

app.post('/api/revoke-delegation', async (req, res) => {
    const delegationId = Number(req.body?.delegation_id);
    const assetId = String(req.body?.asset_id || '').trim();
    const actorUserId = Number(req.body?.actor_user_id || req.body?.user_id);

    if (!Number.isInteger(actorUserId) || actorUserId <= 0) {
        return res.status(400).json({ message: '缺少 actor_user_id' });
    }
    if ((!Number.isInteger(delegationId) || delegationId <= 0) && !assetId) {
        return res.status(400).json({ message: '缺少 delegation_id 或 asset_id' });
    }

    try {
        const result = await withMainDbTransaction(async ({ query }) => {
            const rows = Number.isInteger(delegationId) && delegationId > 0
                ? await query('SELECT * FROM asset_delegations WHERE id = ? LIMIT 1 FOR UPDATE', [delegationId])
                : await query(
                    `SELECT * FROM asset_delegations
                     WHERE asset_id = ? AND status IN ('ACTIVE', 'SOLD_OUT')
                     ORDER BY id DESC LIMIT 1 FOR UPDATE`,
                    [assetId]
                );

            if (!rows.length) {
                // 兼容旧数据：只有 agent_addr/is_proxied、没有 asset_delegations 记录的历史托管。
                if (!assetId) {
                    const error = new Error('未找到可撤销的代理关系');
                    error.statusCode = 404;
                    throw error;
                }

                const legacyAssets = await query(
                    'SELECT * FROM asset_registrations WHERE file_hash = ? LIMIT 1 FOR UPDATE',
                    [assetId]
                );
                if (!legacyAssets.length || !legacyAssets[0].agent_addr) {
                    const error = new Error('未找到可撤销的代理关系');
                    error.statusCode = 404;
                    throw error;
                }

                const legacyAsset = legacyAssets[0];
                const legacyAgentUsers = await query(
                    'SELECT user_id FROM certificate_registry WHERE address = ? AND user_id IS NOT NULL LIMIT 1',
                    [legacyAsset.agent_addr]
                );
                const legacyAgentUserId = legacyAgentUsers.length ? Number(legacyAgentUsers[0].user_id) : null;
                const legacyOwnerUserId = Number(legacyAsset.user_id);

                if (actorUserId !== legacyOwnerUserId && actorUserId !== legacyAgentUserId) {
                    const error = new Error('只有所有者或代理人可以撤销该代理关系');
                    error.statusCode = 403;
                    throw error;
                }

                await query(
                    'UPDATE asset_registrations SET agent_addr = NULL, agent_count = 0, is_proxied = 0 WHERE file_hash = ?',
                    [assetId]
                );
                return {
                    legacy: true,
                    alreadyRevoked: false,
                    delegationId: null,
                    assetId,
                    returned: 0
                };
            }

            const delegation = rows[0];
            if (actorUserId !== Number(delegation.owner_id) && actorUserId !== Number(delegation.agent_user_id)) {
                const error = new Error('只有所有者或代理人可以撤销该代理关系');
                error.statusCode = 403;
                throw error;
            }
            if (delegation.status === 'REVOKED') {
                return { alreadyRevoked: true, delegationId: delegation.id, returned: 0 };
            }

            const pending = await query(
                `SELECT COUNT(*) AS total FROM transactions
                 WHERE delegation_id = ? AND status = '待确认' AND is_deleted = 0`,
                [delegation.id]
            );
            if (Number(pending[0]?.total || 0) > 0) {
                const error = new Error('该代理还有未完成订单，请先处理订单再撤销');
                error.statusCode = 409;
                throw error;
            }

            const remaining = Number(delegation.quantity_remaining) || 0;
            if (remaining > 0) {
                await query(
                    'UPDATE asset_registrations SET number = number + ? WHERE file_hash = ?',
                    [remaining, delegation.asset_id]
                );
            }

            await query(
                `UPDATE asset_delegations
                 SET status = 'REVOKED', quantity_remaining = 0, revoked_at = NOW()
                 WHERE id = ?`,
                [delegation.id]
            );
            await query(
                'UPDATE asset_registrations SET agent_addr = NULL, agent_count = 0, is_proxied = 0 WHERE file_hash = ?',
                [delegation.asset_id]
            );

            return {
                alreadyRevoked: false,
                delegationId: delegation.id,
                returned: remaining,
                assetId: delegation.asset_id
            };
        });

        return res.status(200).json({ success: true, message: '代理关系已撤销', ...result });
    } catch (error) {
        console.error('撤销代理失败:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.message || '撤销代理失败'
        });
    }
});

// 代理订单确认后，由平台使用所有者证书完成链上过户。
// 代理关系是业务层代销，链上仍然从所有者地址转出。
app.post('/api/proxy-transfer', async (req, res) => {
    const transactionId = Number(req.body?.transaction_id);
    const sellerAddress = String(req.body?.seller_address || '').trim();

    if (!Number.isInteger(transactionId) || transactionId <= 0 || !sellerAddress) {
        return res.status(400).json({ message: '缺少 transaction_id 或 seller_address' });
    }

    try {
        const transactionRows = await dbQuery(
            `SELECT * FROM transactions
             WHERE transaction_id = ? AND seller_address = ? LIMIT 1`,
            [transactionId, sellerAddress]
        );
        if (!transactionRows.length) {
            return res.status(404).json({ message: '交易不存在或不属于当前代理人' });
        }

        const transaction = transactionRows[0];
        if (transaction.seller_type !== 'AGENT' || !Number(transaction.delegation_id)) {
            return res.status(400).json({ message: '该交易不是代理订单' });
        }
        if (transaction.status !== '已确认') {
            return res.status(409).json({ message: '交易尚未确认，不能过户' });
        }
        if (transaction.chain_transfer_status === 'SUCCESS') {
            return res.json({ success: true, message: '该交易已完成链上过户', alreadyTransferred: true });
        }

        const assetRows = await dbQuery(
            'SELECT * FROM asset_registrations WHERE file_hash = ? LIMIT 1',
            [transaction.asset_id]
        );
        if (!assetRows.length) {
            return res.status(404).json({ message: '资产不存在' });
        }
        const asset = assetRows[0];

        const ownerAddress = String(transaction.owner_address || asset.current_owner_address || asset.owner_address || '').trim();
        if (!ownerAddress) {
            return res.status(400).json({ message: '交易缺少所有者地址' });
        }

        const certRows = await dbQuery(
            `SELECT certificate_name, org, address
             FROM certificate_registry
             WHERE address = ? AND user_id IS NOT NULL
             ORDER BY id DESC LIMIT 1`,
            [ownerAddress]
        );
        if (!certRows.length) {
            return res.status(400).json({ message: '未找到所有者证书，无法完成链上过户' });
        }
        const ownerCert = certRows[0];
        const orgName = String(ownerCert.org || '').includes('.chainmaker.org')
            ? ownerCert.org
            : `${ownerCert.org}.chainmaker.org`;

        const configResponse = await axios.post(
            'http://127.0.0.1:8848/pre/DynamicCertConfig',
            { clientName: ownerCert.certificate_name, orgName }
        );
        if (configResponse.status !== 200) {
            return res.status(502).json({ message: '配置所有者证书失败' });
        }

        const isIndivisible = String(asset.industry) === 'WH';
        const transferPayload = isIndivisible
            ? {
                from: ownerAddress,
                to: transaction.buyer_address,
                tokenId: asset.file_hash
            }
            : {
                to: transaction.buyer_address,
                amount: String(Number(transaction.quantity) || 1)
            };
        const transferUrl = isIndivisible
            ? 'http://127.0.0.1:8848/pre/TransferFrom'
            : 'http://127.0.0.1:8848/pre/En-Transfer';

        const transferResponse = await axios.post(transferUrl, transferPayload);
        const transferCode = transferResponse.data?.code;
        if (!(transferResponse.status === 200 && (transferCode === 0 || transferCode === '0'))) {
            await dbQuery(
                "UPDATE transactions SET chain_transfer_status = 'FAILED' WHERE transaction_id = ?",
                [transactionId]
            );
            return res.status(502).json({
                message: '链上过户失败',
                detail: transferResponse.data?.message || transferResponse.data?.msg || '未知错误'
            });
        }

        await dbQuery(
            'UPDATE asset_registrations SET current_owner_address = ? WHERE file_hash = ?',
            [transaction.buyer_address, transaction.asset_id]
        );
        await dbQuery(
            `UPDATE transactions
             SET chain_transfer_status = 'SUCCESS', chain_transferred_at = NOW()
             WHERE transaction_id = ?`,
            [transactionId]
        );

        return res.json({ success: true, message: '链上过户成功', transaction_id: transactionId });
    } catch (error) {
        console.error('代理订单过户失败:', error.message);
        return res.status(500).json({
            message: '代理订单过户失败',
            detail: error.response?.data?.message || error.message
        });
    }
});

app.get('/api/agent-delegations', async (req, res) => {
    const agentUserId = Number(req.query.agentUserId || req.query.agent_user_id);
    if (!Number.isInteger(agentUserId) || agentUserId <= 0) {
        return res.status(400).json({ success: false, message: '缺少 agentUserId' });
    }

    try {
        const rows = await dbQuery(
            `SELECT d.id AS delegation_id,
                    d.asset_id,
                    d.owner_id,
                    d.owner_address,
                    d.agent_user_id,
                    d.agent_address,
                    d.quantity_total,
                    d.quantity_remaining,
                    d.allowed_rights,
                    d.price,
                    d.status,
                    d.created_at,
                    ar.asset_name,
                    ar.asset_type,
                    ar.asset_category,
                    ar.description,
                    ar.industry,
                    ar.industry_raw,
                    ar.industry_raw_name,
                    ar.can_sell_asset,
                    ar.can_sell_view,
                    ar.can_sell_process,
                    owner.username AS owner_username
             FROM asset_delegations d
             JOIN asset_registrations ar ON ar.file_hash = d.asset_id
             LEFT JOIN users owner ON owner.id = d.owner_id
             WHERE d.agent_user_id = ?
               AND d.status = 'ACTIVE'
               AND d.quantity_remaining > 0
             ORDER BY d.id DESC`,
            [agentUserId]
        );
        return res.json({ success: true, delegations: rows });
    } catch (error) {
        console.error('查询代理资产失败:', error.message);
        return res.status(500).json({ success: false, message: '查询代理资产失败' });
    }
});

app.get('/api/delegation/:id', async (req, res) => {
    const delegationId = Number(req.params.id);
    if (!Number.isInteger(delegationId) || delegationId <= 0) {
        return res.status(400).json({ success: false, message: '无效的代理 ID' });
    }

    try {
        const rows = await dbQuery(
            `SELECT d.*,
                    ar.asset_name, ar.asset_type, ar.asset_category, ar.description,
                    ar.industry, ar.industry_raw, ar.industry_raw_name,
                    ar.can_sell_asset, ar.can_sell_view, ar.can_sell_process,
                    ar.pc_type, ar.price AS asset_price,
                    owner.username AS owner_username,
                    agent.username AS agent_username
             FROM asset_delegations d
             JOIN asset_registrations ar ON ar.file_hash = d.asset_id
             LEFT JOIN users owner ON owner.id = d.owner_id
             LEFT JOIN users agent ON agent.id = d.agent_user_id
             WHERE d.id = ?
             LIMIT 1`,
            [delegationId]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, message: '代理关系不存在' });
        }
        return res.json({ success: true, delegation: rows[0] });
    } catch (error) {
        console.error('查询代理详情失败:', error.message);
        return res.status(500).json({ success: false, message: '查询代理详情失败' });
    }
});

app.post('/api/authorize', (req, res) => {
    const { fileHash, agent_addr } = req.body;

    // 检查必填字段
    if (!fileHash || !agent_addr) {
        return res.status(400).json({ message: '文件哈希和目标地址是必填的' });
    }

      const sql = `
        UPDATE asset_registrations
        SET agent_addr = ?, is_proxied = 1
        WHERE file_hash = ?
    `;

    // 执行 SQL 查询更新数据库
    db.query(sql, [agent_addr, fileHash], (err, result) => {
        if (err) {
            console.error('授权失败:', err);
            return res.status(500).json({ message: '授权失败，请稍后再试' });
        }

        // 如果更新成功
        if (result.affectedRows > 0) {
            res.status(200).json({ message: '授权成功' });
        } else {
            // 如果没有找到对应的资产
            res.status(404).json({ message: '未找到对应的资产' });
        }
    });
});



app.post('/api/update-user', (req, res) => {
    const { id, username, usertype, email, address } = req.body;

 
    const sql = `UPDATE users SET username = ?, usertype = ?,email = ?, address = ?  WHERE id = ?`;
    const values = [username, usertype, email, address, id];
 
    db.query(sql, values, (err, result) => {
        if (err) {
            return res.status(500).json({ message: '数据库更新错误', error: err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '用户未找到' });
        }
        return res.status(200).json({ message: '用户信息更新成功' });
    });
});

// 查询用户ID的API端点
app.post('/api/get-user-id', (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: '缺少 username 参数' });
    }

    const query = 'SELECT id FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) {
            console.error('查询数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        if (results.length > 0) {
            const userId = results[0].id;
            res.json({ id: userId });
        } else {
            res.status(404).json({ error: '用户未找到' });
        }
    });
});

app.get('/api/get-tps', (req, res) => {
  const requestId = `tps-${Date.now()}`;
  const cwd = '/home/super/r/ssd2/chainmaker/chainmaker-go/tools/cmc';
  const cmd = 'bash -lc "ulimit -n 65535 && bash ./run_tps.sh"';

  console.log(`\n========== [${requestId}] TPS 请求开始 ==========`);
  console.log(`[${requestId}] cwd:`, cwd);
  console.log(`[${requestId}] cmd:`, cmd);

  exec(cmd, {
    cwd,
    timeout: 900000,
    maxBuffer: 100 * 1024 * 1024
  }, (error, stdout, stderr) => {
    console.log(`\n========== [${requestId}] TPS 脚本回调 ==========`);

    const tail = stdout ? stdout.slice(-5000) : '';
    console.log(`[${requestId}] stdout后5000字符:\n`, tail);

    if (stderr) {
      console.error(`[${requestId}] stderr后3000字符:\n`, stderr.slice(-3000));
    }

    const match = stdout.match(/Average\s+TPS\s*:\s*([0-9.]+)/i);
    const tps = match ? Number(match[1]) : null;

    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message,
        tps,
        stdoutTail: tail,
        stderrTail: stderr ? stderr.slice(-3000) : ''
      });
    }

    return res.json({
      success: true,
      tps,
      rawTail: tail
    });
  });
});

app.listen(port, () => {
    log.info('server listening', {
        port,
        pid: process.pid,
        logFile: logger.currentFile(),
        logLevel: process.env.LOG_LEVEL || 'info'
    });
});



// 用户注册的 API 端点
app.post('/api/register', async (req, res) => {
    const { username, password, email, phoneNumber, address } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码是必填项' });
    }

    // 检查是否已经存在同名用户
    const checkUserQuery = 'SELECT * FROM users WHERE username = ?';
    db.query(checkUserQuery, [username], async (err, results) => {
        if (err) {
            console.error('数据库查询错误:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        if (results.length > 0) {
            return res.status(400).json({ error: '用户名已存在' });
        }

        // 对密码进行加密
        const hashedPassword = await bcrypt.hash(password, 10);

        // 插入新用户数据
        const insertUserQuery = 'INSERT INTO users (username, password, email, phone_number, address) VALUES (?, ?, ?, ?, ?)';
        db.query(insertUserQuery, [username, hashedPassword, email || null, phoneNumber || null, address || null], (err, results) => {
            if (err) {
                console.error('插入数据失败:', err);
                return res.status(500).json({ error: '服务器内部错误' });
            }

            res.status(201).json({ message: '用户注册成功' });
        });
    });
});



// 用户登录的 API 端点
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const rlog = req.log || log; // requestLogger 注入，失败时回退到模块 logger

    if (!username || !password) {
        rlog.warn('登录失败: 缺少用户名或密码', { username: username || null });
        return res.status(400).json({ error: '用户名和密码是必填项' });
    }

    // 查找用户
    const findUserQuery = 'SELECT * FROM users WHERE username = ?';
    db.query(findUserQuery, [username], async (err, results) => {
        if (err) {
            rlog.error('登录失败: 数据库查询错误', { username, err });
            return res.status(500).json({ error: '服务器内部错误' });
        }

        if (results.length === 0) {
            rlog.warn('登录失败: 用户不存在', { username });
            return res.status(400).json({ error: '用户名或密码错误' });
        }

        const user = results[0];

        // 验证密码
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            rlog.warn('登录失败: 密码错误', { username, userId: user.id });
            return res.status(400).json({ error: '用户名或密码错误' });
        }

        // 生成 JWT 令牌
        const token = jwt.sign({ id: user.id, username: user.username }, secretKey, { expiresIn: '1h' });

        rlog.info('登录成功', { username, userId: user.id });
        res.json({ message: '登录成功', token });
    });
});

app.all('/api/pam/entry-start', (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.body?.token || req.query.token;

    if (!token) {
        return res.status(401).json({ error: '缺少登录令牌' });
    }

    try {
        jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).json({ error: '登录已过期，请重新登录' });
    }

    if (!HUB_WEB_ORIGIN || !HUB_TRADING_TOKEN) {
        return res.status(503).json({ error: '审计平台跳转未配置，请联系管理员' });
    }

    const pccContractId = String(req.body?.pcc_contract_id || req.query.pcc_contract_id || '').trim();

    res.cookie(PAM_ENTRY_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: PAM_ENTRY_COOKIE_TTL_SECONDS * 1000
    });

    const entryUrl = buildPamEntryUrl(pccContractId);

    if (req.method === 'GET') {
        return res.redirect(303, entryUrl);
    }

    res.json({ message: '审计平台跳转地址已生成', entry_url: entryUrl });
});

app.get(PAM_TRADING_AUTHORIZE_PATH, async (req, res) => {
    const requestId = String(req.query.request_id || '').trim();
    if (!requestId) {
        return res.status(400).send('缺少 request_id');
    }

    const token = parseCookies(req)[PAM_ENTRY_COOKIE];
    if (!token) {
        return res.status(401).send('缺少交易交接凭据，请重新从交易系统进入');
    }

    let claims;
    try {
        claims = jwt.verify(token, secretKey);
    } catch (error) {
        return res.status(401).send('交易登录已过期，请重新登录');
    }

    try {
        const entry = await hubApiFetch(`/hub/web/requests/${encodeURIComponent(requestId)}`);
        if (entry.mode !== 'reader') {
            return res.status(403).send('本次交接的角色不被允许');
        }

        const subject = `trade:${claims.username || claims.id}`;
        const launch = await hubApiFetch('/hub/web/launches', {
            method: 'POST',
            body: JSON.stringify({ request_id: requestId, subject })
        });

        if (!launch.launch_url) {
            throw new Error('审计平台未返回跳转地址');
        }

        res.clearCookie(PAM_ENTRY_COOKIE, { path: '/' });
        return res.redirect(303, launch.launch_url);
    } catch (error) {
        console.error('PAM 授权回调失败:', error);
        return res.status(502).send(error.message || '审计平台授权失败');
    }
});


// 查询资产的API端点
app.get('/api/query-asset-hash', (req, res) => {
    let fileHash = req.query.fileHash;

    console.log('Received fileHash:', fileHash); // 调试日志

    if (!fileHash) {
        return res.status(400).json({ error: '缺少 fileHash 参数' });
    }

    // 确保 assetName 是字符串，并去除前后空格
    if (typeof fileHash !== 'string') {
        fileHash = String(fileHash);
    }
    fileHash = fileHash.trim();

    console.log(`Processed fileHash: "${fileHash}"`); // 调试日志

    // 使用 TRIM 确保匹配不受空格影响
    const query = `SELECT * FROM asset_registrations WHERE TRIM(file_hash) = ? ORDER BY id DESC`;
    
    db.query(query, [fileHash], (err, results) => {
        if (err) {
            console.error('查询数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        const count = results.length;
        if (count > 0) {
            // 返回重名个数和最新（最大 id）的记录
            const latestRecord = results[0]; 
            res.json({
                count, // 重名的个数
                latestRecord // 最新的记录
            });
        } else {
            // 如果没有匹配的记录，返回一个空的响应
            res.json({
                count: 0,
                message: '未找到匹配的资产'
            });
        }
    });
});

// 查询同一个 assetName 的所有资产数据及其计数的 API 端点
app.get('/api/query-assets-hash', (req, res) => {
    let fileHash = req.query.fileHash;

    console.log('Received fileHash:', fileHash); // 调试日志

    if (!fileHash) {
        return res.status(400).json({ error: '缺少 fileHash 参数' });
    }

    // 确保 assetName 是字符串，并去除前后空格
    if (typeof fileHash !== 'string') {
        fileHash = String(fileHash);
    }
    fileHash = fileHash.trim();

    console.log(`Processed fileHash: "${fileHash}"`); // 调试日志

    // 使用 TRIM 确保匹配不受空格影响
    const query = `SELECT * FROM asset_registrations WHERE TRIM(file_hash) = ?`;
    
    db.query(query, [fileHash], (err, results) => {
        if (err) {
            console.error('查询数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        const count = results.length;
        if (count > 0) {
            res.json({
                count, // 返回重名个数
                records: results // 返回所有记录
            });
        } else {
            // 如果没有匹配的记录，返回一个空的响应
            res.json({
                count: 0,
                message: '未找到匹配的资产'
            });
        }
    });
});

// 获取用户自己的所有资产的 API 端点
app.post('/api/get-user-assets', (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: '缺少 user_id 参数' });
    }

    const query = `SELECT * FROM asset_registrations WHERE user_id = ? ORDER BY id DESC`;
    
    db.query(query, [user_id], (err, results) => {
        if (err) {
            console.error('查询数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        const count = results.length;
        if (count > 0) {
            res.json({
                count, // 返回资产数量
                records: results // 返回该用户的所有资产
            });
        } else {
            res.json({
                count: 0,
                message: '未找到该用户的资产'
            });
        }
    });
});

// 获取用户自己的所有资产的 API 端点
app.post('/api/get-user-user', (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: '缺少 user_id 参数' });
    }

    const query = `SELECT * FROM users WHERE id = ? ORDER BY id DESC`;
    
    db.query(query, [user_id], (err, results) => {
        if (err) {
            console.error('查询数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        const count = results.length;
        if (count > 0) {
            res.json({
                count, // 返回资产数量
                records: results // 返回该用户的所有资产
            });
        } else {
            res.json({
                count: 0,
                message: '未找到该用户的资产'
            });
        }
    });
});

// 修改用户信息的 API 端点
app.post('/api/update-user-user', async (req, res) => {
    const { id, username, email, address, password, phone_number } = req.body;

    if (!id || !username || !email || !address || !phone_number) {
        return res.status(400).json({ message: '所有字段均为必填项' });
    }

    // 初始化SQL语句和参数数组
    let sql = `UPDATE users SET username = ?, email = ?, address = ?, phone_number = ?`;
    const values = [username, email, address, phone_number];

    // 如果用户提交了新的密码，对密码进行加密
    if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        sql += `, password = ?`;
        values.push(hashedPassword);
    }

    sql += ` WHERE id = ?`;
    values.push(id);

    // 执行数据库更新
    db.query(sql, values, (err, result) => {
        if (err) {
            return res.status(500).json({ message: '数据库更新错误', error: err });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '用户未找到' });
        }
        return res.status(200).json({ message: '用户信息更新成功' });
    });
});
 
// 接收前端数据的API端点
app.post('/api/save-asset2l', (req, res) => {
    const { assetName, assetType, email, address, description, algorithm, customAlgorithm, fileHash, user_id, industry, picture } = req.body;

    // 确保fileHash存在
    if (!fileHash) {
        return res.status(400).json({ message: '缺少 fileHash' });
    }

    // 确保industry的值合法
    const validIndustries = ['NY', 'DL', 'TZ', 'JT', 'YL', 'ZX', 'JR', 'SZ', 'ZD', 'CL', 'WH', 'FL'];
    if (!validIndustries.includes(industry)) {
        return res.status(400).json({ message: '无效的 industry 值' });
    }

    const checkSql = `SELECT COUNT(*) AS count FROM asset_registrations WHERE file_hash = ?`;

    db.query(checkSql, [fileHash], (checkErr, checkResult) => {
        if (checkErr) {
            console.error('检查资产文件哈希失败:', checkErr);
            return res.status(500).json({ message: '检查失败，请稍后再试' });
        }

        if (checkResult[0].count > 0) {
            return res.status(400).json({ message: '资产已存在，file_hash 重复' });
        }

        const query = `
            INSERT INTO asset_registrations (asset_name, asset_type, email, address, description, algorithm, custom_algorithm, file_hash, user_id, industry, picture)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        // 插入的数据包括 picture 列
        const values = [assetName, assetType, email, address, description, algorithm, customAlgorithm || null, fileHash, user_id, industry, picture || null];

        db.query(query, values, (err, results) => {
            if (err) {
                console.error('插入数据失败:', err);
                return res.status(500).json({ error: '服务器内部错误' });
            }
            res.status(201).json({ message: '数据已成功保存' });
        });
    });
});

app.post('/api/save-asset2', upload.single('picture'), async (req, res) => {
    const {
        assetName, assetType, email, address, owner_address, description,
        algorithm, customAlgorithm, fileHash, user_id,
        industry, industry_raw, industry_raw_name,
        asset_category, predicted_domain,
        is_proxied, number, price,
        can_sell_asset, can_sell_view, can_sell_process, allow_resale,
        trade_location, trade_start_ts, trade_end_ts,
        trade_mode, auction_start_price, auction_end_time,
        allow_authorize, allow_supervision, model_selection, pc_type,
        omniprint_fingerprint, omniprint_fingerprint_bits, omniprint_modality, omniprint_source
    } = req.body;

    const picture = req.file;
    const resolvedAssetType = assetType || '一般数据';
    const resolvedAssetCategory = asset_category || '其他数据';

    const normalizedTradeMode = trade_mode === 'auction' ? 'auction' : 'fixed';
    const rawOmniPrintFingerprint = String(omniprint_fingerprint || '').trim() || null;
    const omniPrintBits = Number(omniprint_fingerprint_bits);
    const omniPrintFingerprintBits = Number.isInteger(omniPrintBits) && omniPrintBits > 0 ? omniPrintBits : null;
    const omniPrintModality = ['text', 'image', 'audio', 'video'].includes(String(omniprint_modality || '').trim())
        ? String(omniprint_modality).trim()
        : null;
    const omniPrintSource = rawOmniPrintFingerprint && String(omniprint_source || '').trim() === 'file' ? 'file' : null;
    if (normalizedTradeMode === 'auction') {
        const startPrice = Number(auction_start_price || price);
        const endTime = new Date(String(auction_end_time || '').replace(' ', 'T'));
        if (!Number.isInteger(startPrice) || startPrice <= 0 || Number.isNaN(endTime.getTime()) || endTime.getTime() <= Date.now() + 60 * 1000) {
            return res.status(400).json({ message: '拍卖起拍价必须为正整数，截止时间至少晚于当前时间1分钟' });
        }
    }

    console.log('接收到的请求体:', req.body);
    console.log('上传的图片:', picture);

    if (!picture) {
        return res.status(400).json({ message: '图片上传失败' });
    }

    if (!fileHash) {
        return res.status(400).json({ message: '缺少 fileHash' });
    }

    const validIndustries = ['WH', 'NY', 'DL'];
    if (!validIndustries.includes(industry)) {
        return res.status(400).json({ message: '无效的 industry 值' });
    }

    const validRawIndustries = [
        'NY','DL','TZ','JT','YL','ZX','JR','SZ','ZD','CL','WH','FL',
        'A01','B02','C03','D04','E05','F06','G07','H08','I09','J10',
        'K11','L12','M13','N14','O15','P16','Q17','R18','S19','T20'
    ];

    if (!validRawIndustries.includes(industry_raw)) {
        return res.status(400).json({ message: '无效的 industry_raw 值' });
    }

    const checkSql = `SELECT COUNT(*) AS count FROM asset_registrations WHERE file_hash = ?`;
    db.query(checkSql, [fileHash], (checkErr, checkResult) => {
        if (checkErr) {
            console.error('检查资产文件哈希失败:', checkErr);
            return res.status(500).json({ message: '检查失败，请稍后再试' });
        }

        if (checkResult[0].count > 0) {
            return res.status(409).json({ message: '资产已存在，file_hash 重复' });
        }

        const query = `
            INSERT INTO asset_registrations (
                asset_name, asset_type, email, address, owner_address,
                description, algorithm, custom_algorithm, file_hash, user_id,
                industry, industry_raw, industry_raw_name,
                asset_category, predicted_domain,
                picture, is_proxied, number, price,
                can_sell_asset, can_sell_view, can_sell_process, allow_resale,
                trade_location, trade_start_ts, trade_end_ts,
                trade_mode, auction_start_price, auction_end_time,
                allow_authorize, allow_supervision, model_type, pc_type,
                omniprint_fingerprint, omniprint_fingerprint_bits, omniprint_modality, omniprint_source, omniprint_generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const values = [
            assetName,
            resolvedAssetType,
            email,
            address,
            owner_address,
            description,
            algorithm,
            customAlgorithm || null,
            fileHash,
            user_id || null,
            industry,
            industry_raw || '',
            industry_raw_name || '',
            resolvedAssetCategory,
            predicted_domain || null,
            picture.buffer,
            is_proxied || 0,
            Number(number) > 0 ? Number(number) : 1,
            price || null,
            can_sell_asset || 0,
            can_sell_view || 0,
            can_sell_process || 0,
            allow_resale || 0,
            trade_location || null,
            trade_start_ts || null,
            trade_end_ts || null,
            normalizedTradeMode,
            normalizedTradeMode === 'auction' ? Number(auction_start_price || price || 0) : null,
            normalizedTradeMode === 'auction' ? auction_end_time : null,
            allow_authorize || 0,
            allow_supervision || 0,
            model_selection || null,
            pc_type || null,
            rawOmniPrintFingerprint,
            omniPrintFingerprintBits,
            omniPrintModality,
            omniPrintSource
        ];

        console.log('准备插入的数据:', values);

        db.query(query, values, (err, results) => {
            if (err) {
                console.error('插入数据失败:', err);
                return res.status(500).json({ error: '服务器内部错误' });
            }

            return res.status(201).json({
                message: '数据已成功保存',
                assetId: results.insertId,
                fileHash: fileHash,
                assetName: assetName,
                ownerAddress: owner_address
            });
        });
    });
});


// [新接口] 保存可二次交易的资产信息到 resalable_assets 表
app.post('/api/save-resalable-asset', upload.single('picture'), async (req, res) => {
    // 1. 获取前端发来的数据 (与原接口完全相同)
    const {
        asset_name, asset_type, email, address, owner_address, current_owner_address, // 新增了 current_owner_address
        description, algorithm, customAlgorithm, file_hash, user_id, // user_id 在这里应该是新所有者(买家)的ID
        industry, is_proxied, number,
        can_sell_asset, can_sell_view, can_sell_process, allow_resale,
        trade_location, trade_start_ts, trade_end_ts,
        allow_authorize, allow_supervision
    } = req.body;

    // 注意：这里的 picture 可能是可选的，因为二次交易不一定需要重新上传图片
    const picture = req.file; 

    console.log('接收到的可二次交易资产请求:', req.body);

    // 2. 基本验证 (与原接口大部分相同)
    if (!file_hash) {
        return res.status(400).json({ message: '缺少 file_hash' });
    }

    const validIndustries = ['NY', 'DL', 'TZ', 'JT', 'YL', 'ZX', 'JR', 'SZ', 'ZD', 'CL', 'WH', 'FL'];
    if (!validIndustries.includes(industry)) {
        return res.status(400).json({ message: '无效的 industry 值' });
    }

    // 3. 构建插入语句 (核心修改)
    // - 将表名从 asset_registrations 改为 resalable_assets
    // - 移除了检查 file_hash 是否存在的逻辑
    const query = `
        INSERT INTO resalable_assets (
            asset_name, asset_type, email, address, owner_address, current_owner_address,
            description, algorithm, custom_algorithm, file_hash, user_id,
            industry, picture, is_proxied, number,
            can_sell_asset, can_sell_view, can_sell_process, allow_resale,
            trade_location, trade_start_ts, trade_end_ts,
            allow_authorize, allow_supervision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // 准备要插入的值
    const values = [
        asset_name,
        asset_type,
        email,
        address,
        owner_address, // 原始所有者地址
        current_owner_address, // 当前所有者(买家)地址
        description,
        algorithm,
        customAlgorithm || null,
        file_hash, // 注意这里是 file_hash 变量名
        user_id || null, // 当前所有者(买家)的用户ID
        industry,
        picture ? picture.buffer : null, // 如果没有上传新图片，则为 NULL
        is_proxied || 0,
        Number(number) > 0 ? Number(number) : 1,
        can_sell_asset || 0,
        can_sell_view || 0,
        can_sell_process || 0,
        allow_resale || 0,
        trade_location || null,
        trade_start_ts || null,
        trade_end_ts || null,
        allow_authorize || 0,
        allow_supervision || 0
    ];

    console.log('准备插入到 resalable_assets 的数据:', values);

    // 4. 执行数据库插入操作
    db.query(query, values, (err, results) => {
        if (err) {
            console.error('插入数据到 resalable_assets 表失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        console.log('成功插入到 resalable_assets，ID:', results.insertId);

        // 5. 返回成功响应
        return res.status(201).json({
            message: '可二次交易的资产已成功保存',
            resalableAssetId: results.insertId,
            fileHash: file_hash
        });
    });
});


// [新接口] 根据 file_hash 获取单个资产的详细信息
app.get('/api/get-asset-details/:file_hash', async (req, res) => {
    // 从 URL 参数中获取 file_hash
    const { file_hash } = req.params;

    if (!file_hash) {
        return res.status(400).json({ message: '缺少 file_hash 参数' });
    }

    // 查询数据库
    const query = `SELECT * FROM asset_registrations WHERE file_hash = ? ORDER BY id DESC LIMIT 1`;

    db.query(query, [file_hash], (err, results) => {
        if (err) {
            console.error('查询资产详情失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        // 检查是否找到了资产
        if (results.length === 0) {
            return res.status(404).json({ message: '未找到指定的资产' });
        }

        // 返回找到的第一个（也是最新的）资产信息
        const assetDetails = results[0];
        console.log(`成功获取资产详情 for file_hash: ${file_hash}`);
        return res.status(200).json(assetDetails);
    });
});


// [新接口] 获取所有可二次交易的资产 (从 resalable_assets 表)
app.get('/api/resalable-assets', (req, res) => {
    // 获取前端可能传递的 industry 筛选参数
    const { industry } = req.query;
    // 列表默认内嵌图片 base64 保持向后兼容；前端传 include_pictures=0 时跳过
    // picture 列，改走 /api/asset-picture/:fileHash 懒加载，避免一次传 MB 级数据。
    const includePictures = req.query.include_pictures !== '0' && req.query.include_pictures !== 'false';

    const selectColumns = `
        asset_name, asset_type, asset_category, email, address, description, algorithm,
        custom_algorithm, file_hash, industry, user_id,
        owner_address, current_owner_address, agent_addr, is_proxied
        ${includePictures ? ', picture' : ''}
      `;
    let query = `
      SELECT ${selectColumns}
      FROM resalable_assets
    `;
  
    const queryParams = [];

    // 如果前端传递了有效的行业参数，则添加到查询中
    if (industry && industry !== 'ALL') {
      query += ` WHERE industry = ?`;
      queryParams.push(industry);
    }
  
    // 执行数据库查询
    db.query(query, queryParams, (err, results) => {
      if (err) {
        console.error('查询可二次交易资产信息失败:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
  
      // 处理结果，将 Buffer 格式的图片转换为 Base64 字符串
      const assets = results.map(asset => {
        if (asset.picture && Buffer.isBuffer(asset.picture)) {
          // 确保 picture 存在且是 Buffer 类型
          asset.picture = asset.picture.toString('base64');
        } else {
          // 如果没有图片或图片数据格式不正确，则设为 null
          asset.picture = null; 
        }
        return asset;
      });
  
      // 返回处理后的资产信息数组
      res.status(200).json(assets); 
    });
});

// 获取所有资产以及可用的领域列表
// ===== 拍卖（mock）接口 =====
app.get('/api/auction/:assetId', (req, res) => {
  db.query(`SELECT file_hash, user_id, owner_address, trade_mode, auction_start_price, auction_end_time,
                   auction_current_price, auction_bid_count, auction_status
            FROM asset_registrations WHERE file_hash = ? LIMIT 1`, [req.params.assetId], (err, rows) => {
    if (err) return res.status(500).json({ error: '查询拍卖失败' });
    if (!rows.length || rows[0].trade_mode !== 'auction') return res.status(404).json({ error: '拍卖不存在' });
    res.json(rows[0]);
  });
});

app.post('/api/auction/:assetId/bid', (req, res) => {
  const assetId = String(req.params.assetId || '');
  const bidderId = String(req.body?.bidder_user_id || req.body?.user_id || '');
  const bidPrice = Number(req.body?.bid_price);
  if (!bidderId || !Number.isInteger(bidPrice) || bidPrice <= 0) return res.status(400).json({ error: '出价必须为正整数' });
  db.query(`SELECT file_hash, user_id, trade_mode, auction_start_price, auction_end_time,
                   auction_current_price, auction_bid_count, auction_status
            FROM asset_registrations WHERE file_hash = ? LIMIT 1`, [assetId], (err, rows) => {
    if (err) return res.status(500).json({ error: '查询资产失败' });
    const a = rows[0];
    if (!a || a.trade_mode !== 'auction') return res.status(404).json({ error: '拍卖不存在' });
    if (String(a.user_id) === bidderId) return res.status(403).json({ error: '不能竞拍自己的资产' });
    if (a.auction_status && a.auction_status !== 'OPEN') return res.status(409).json({ error: '拍卖已结束' });
    if (!a.auction_end_time || new Date(a.auction_end_time).getTime() <= Date.now()) return res.status(409).json({ error: '拍卖已截止' });
    const current = Number(a.auction_current_price || a.auction_start_price || 0);
    if (bidPrice < current + 1) return res.status(409).json({ error: `出价必须至少为 ${current + 1} 元` });
    db.query('INSERT INTO auction_bids (asset_file_hash, bidder_user_id, bid_price) VALUES (?, ?, ?)', [assetId, bidderId, bidPrice], (insertErr) => {
      if (insertErr) return res.status(500).json({ error: '记录出价失败' });
      db.query(`UPDATE asset_registrations SET auction_current_price = ?, auction_bid_count = auction_bid_count + 1, auction_status = 'OPEN' WHERE file_hash = ? AND (auction_current_price IS NULL OR auction_current_price < ?)`, [bidPrice, assetId, bidPrice], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: '更新最高价失败' });
        res.status(201).json({ message: '出价成功', current_price: bidPrice });
      });
    });
  });
});

app.get('/api/auction/:assetId/bids', (req, res) => {
  db.query('SELECT bidder_user_id, bid_price, bid_time FROM auction_bids WHERE asset_file_hash = ? ORDER BY bid_time ASC', [req.params.assetId], (err, rows) => {
    if (err) return res.status(500).json({ error: '查询出价记录失败' });
    res.json(rows || []);
  });
});

app.post('/api/auction/:assetId/settle', (req, res) => {
  const assetId = String(req.params.assetId || '');
  db.query(`SELECT file_hash, trade_mode, auction_end_time, auction_status
            FROM asset_registrations WHERE file_hash = ? LIMIT 1`, [assetId], (err, rows) => {
    if (err) return res.status(500).json({ error: '查询拍卖失败' });
    const auction = rows[0];
    if (!auction || auction.trade_mode !== 'auction') return res.status(404).json({ error: '拍卖不存在' });
    if (auction.auction_status && auction.auction_status !== 'OPEN') return res.json({ status: auction.auction_status });
    if (auction.auction_end_time && new Date(auction.auction_end_time).getTime() > Date.now()) {
      return res.status(409).json({ error: '拍卖尚未截止' });
    }
    db.query(`SELECT bidder_user_id, bid_price, bid_time FROM auction_bids
              WHERE asset_file_hash = ? ORDER BY bid_price DESC, bid_time ASC LIMIT 1`, [assetId], (bidErr, bids) => {
      if (bidErr) return res.status(500).json({ error: '查询最高出价失败' });
      const winner = bids[0] || null;
      const status = winner ? 'CLOSED' : 'UNSOLD';
      // 结束后立即从交易市场下架；获拍人后续通过交易处理页提交权益申请。
      db.query('UPDATE asset_registrations SET auction_status = ?, txperm = 0 WHERE file_hash = ?', [status, assetId], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: '更新拍卖状态失败' });
        res.json({ status, winner });
      });
    });
  });
});

// 买方的获拍清单：只返回已结束且该买方为最高出价者的资产。
app.get('/api/auction/won/:bidderUserId', (req, res) => {
  const bidderUserId = String(req.params.bidderUserId || '');
  // 页面打开时自动结算所有已到期拍卖，不再要求先点击资产详情。
  db.query(`UPDATE asset_registrations a
            LEFT JOIN (SELECT DISTINCT asset_file_hash FROM auction_bids) b
              ON CAST(b.asset_file_hash AS BINARY) = CAST(a.file_hash AS BINARY)
            SET a.auction_status = CASE WHEN b.asset_file_hash IS NULL THEN 'UNSOLD' ELSE 'CLOSED' END,
                a.txperm = 0
            WHERE a.trade_mode = 'auction' AND (a.auction_status IS NULL OR a.auction_status = 'OPEN')
              AND a.auction_end_time IS NOT NULL AND a.auction_end_time <= NOW()`, (settleErr) => {
    if (settleErr) console.error('自动结算到期拍卖失败:', settleErr);
    const query = `
    SELECT a.file_hash, a.asset_name, a.description, a.picture, a.owner_address,
           a.auction_current_price, a.auction_end_time, b.bid_price, b.bid_time
           ,b.bidder_user_id
    FROM asset_registrations a
    INNER JOIN auction_bids b ON CAST(b.asset_file_hash AS BINARY) = CAST(a.file_hash AS BINARY)
    WHERE a.trade_mode = 'auction' AND a.auction_status = 'CLOSED'
    ORDER BY a.auction_end_time DESC`;
    db.query(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: '查询获拍资产失败' });
    // 同一资产按全体买方的金额最高、时间最早选出唯一赢家。
    const winners = new Map();
    (rows || []).forEach(asset => {
      const previous = winners.get(asset.file_hash);
      if (!previous || Number(asset.bid_price) > Number(previous.bid_price) ||
          (Number(asset.bid_price) === Number(previous.bid_price) && new Date(asset.bid_time) < new Date(previous.bid_time))) {
        winners.set(asset.file_hash, asset);
      }
    });
    const assets = Array.from(winners.values()).filter(asset => String(asset.bidder_user_id) === bidderUserId).map(asset => ({
      ...asset,
      picture: asset.picture && Buffer.isBuffer(asset.picture) ? asset.picture.toString('base64') : null
    }));
    res.json(assets);
  });
  });
});

// 获取可交易的资产，根据传递的 industry 参数来进行过滤
// 按 file_hash 返回资产图片原始字节（懒加载用），带缓存头。
// asset_registrations 优先，找不到再查 resalable_assets。
app.get('/api/asset-picture/:fileHash', (req, res) => {
  const fileHash = String(req.params.fileHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fileHash)) {
    return res.status(400).json({ error: 'file_hash 格式非法' });
  }

  const lookup = (table, callback) => {
    db.query(
      `SELECT picture FROM ${table} WHERE file_hash = ? LIMIT 1`,
      [fileHash],
      (err, rows) => {
        if (err) return callback(err);
        const picture = rows && rows[0] && rows[0].picture;
        return callback(null, picture && Buffer.isBuffer(picture) ? picture : null);
      }
    );
  };

  const respond = (buffer) => {
    if (!buffer) {
      return res.status(404).json({ error: '图片不存在' });
    }
    let type = 'application/octet-stream';
    if (buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      type = 'image/jpeg';
    } else if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      type = 'image/png';
    } else if (buffer.length > 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      type = 'image/gif';
    }
    res.set('Content-Type', type);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.end(buffer);
  };

  lookup('asset_registrations', (err, buffer) => {
    if (err) {
      console.error('查询资产图片失败:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    if (buffer) {
      return respond(buffer);
    }
    lookup('resalable_assets', (err2, buffer2) => {
      if (err2) {
        console.error('查询二次交易资产图片失败:', err2);
        return res.status(500).json({ error: '服务器内部错误' });
      }
      return respond(buffer2);
    });
  });
});

app.get('/api/available-assets', (req, res) => {
  const { industry_raw_name, asset_category, asset_type } = req.query;

  const includePictures = req.query.include_pictures !== '0' && req.query.include_pictures !== 'false';

  const selectColumns = `
      asset_name,
      asset_type,
      asset_category,
      email,
      address,
      description,
      algorithm,
      custom_algorithm,
      file_hash,
      industry,
      industry_raw,
      industry_raw_name,
      user_id,
      owner_address,
      current_owner_address,
      agent_addr,
      is_proxied,
      price,
      number,
      trade_mode, auction_start_price, auction_end_time,
      auction_current_price, auction_bid_count, auction_status
      ${includePictures ? ', picture' : ''}
    `;
  let query = `
    SELECT ${selectColumns}
    FROM asset_registrations
    WHERE txperm = 3
      AND COALESCE(number, 0) > 0
      AND (trade_mode <> 'auction' OR ((auction_status IS NULL OR auction_status = 'OPEN') AND auction_end_time > NOW()))
  `;

  const queryParams = [];

  if (industry_raw_name && industry_raw_name !== 'ALL') {
    query += ` AND industry_raw_name = ?`;
    queryParams.push(industry_raw_name);
  }

  if (asset_category && asset_category !== 'ALL') {
    query += ` AND asset_category = ?`;
    queryParams.push(asset_category);
  }

  if (asset_type && asset_type !== 'ALL') {
    query += ` AND asset_type = ?`;
    queryParams.push(asset_type);
  }

  let proxyQuery = `
    SELECT ar.asset_name,
           ar.asset_type,
           ar.asset_category,
           ar.email,
           ar.address,
           ar.description,
           ar.algorithm,
           ar.custom_algorithm,
           ar.file_hash,
           ar.industry,
           ar.industry_raw,
           ar.industry_raw_name,
           d.agent_user_id AS user_id,
           d.owner_id AS owner_user_id,
           d.owner_address,
           ar.current_owner_address,
           d.agent_address AS seller_address,
           d.agent_address AS agent_addr,
           1 AS is_proxied,
           COALESCE(d.price, ar.price) AS price,
           d.quantity_remaining AS number,
           ar.trade_mode, ar.auction_start_price, ar.auction_end_time,
           ar.auction_current_price, ar.auction_bid_count, ar.auction_status,
           d.id AS delegation_id,
           'AGENT' AS seller_type,
           d.allowed_rights
           ${includePictures ? ', ar.picture' : ''}
    FROM asset_delegations d
    JOIN asset_registrations ar ON ar.file_hash = d.asset_id
    WHERE d.status = 'ACTIVE'
      AND d.quantity_remaining > 0
      AND ar.txperm = 3
      AND (ar.trade_mode <> 'auction' OR ((ar.auction_status IS NULL OR ar.auction_status = 'OPEN') AND ar.auction_end_time > NOW()))
  `;

  const proxyParams = [];
  if (industry_raw_name && industry_raw_name !== 'ALL') {
    proxyQuery += ` AND ar.industry_raw_name = ?`;
    proxyParams.push(industry_raw_name);
  }
  if (asset_category && asset_category !== 'ALL') {
    proxyQuery += ` AND ar.asset_category = ?`;
    proxyParams.push(asset_category);
  }
  if (asset_type && asset_type !== 'ALL') {
    proxyQuery += ` AND ar.asset_type = ?`;
    proxyParams.push(asset_type);
  }

  const normalizeAssetRow = (asset, extra = {}) => {
    if (asset.picture && Buffer.isBuffer(asset.picture)) {
      asset.picture = asset.picture.toString('base64');
    } else {
      asset.picture = null;
    }
    return Object.assign(asset, extra);
  };

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('查询可交易资产失败:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }

    db.query(proxyQuery, proxyParams, (proxyErr, proxyResults) => {
      if (proxyErr) {
        console.error('查询代理资产失败:', proxyErr);
        return res.status(500).json({ error: '服务器内部错误' });
      }

      const ownerAssets = results.map((asset) => normalizeAssetRow(asset, {
        seller_type: 'OWNER',
        delegation_id: null,
        owner_user_id: asset.user_id,
        seller_address: asset.current_owner_address || asset.owner_address
      }));
      const agentAssets = proxyResults.map((asset) => normalizeAssetRow(asset));

      res.status(200).json([...ownerAssets, ...agentAssets]);
    });
  });
});
  

  app.get('/api/get-asset2', (req, res) => {
    // 查询最新的一条数据，按id排序
    const query = 'SELECT asset_name, asset_type, email, address, description, algorithm, custom_algorithm, file_hash, industry, txperm, user_id, owner_address, current_owner_address, agent_addr, is_proxied, number, can_sell_asset, can_sell_view, can_sell_process FROM asset_registrations';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('获取数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }
        res.json(results);
    });
});



app.post('/api/get-purchased-assets', (req, res) => {
  const { addresses } = req.body;

  console.log('📥 收到前端地址数组:', addresses);

  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    console.warn('⚠️ 请求体中地址数组缺失或无效');
    return res.status(400).json({ error: '请求体必须包含地址数组 addresses' });
  }

  const placeholders = addresses.map(() => '?').join(',');
  const transactionQuery = `
    SELECT asset_id, quality
    FROM transactions 
    WHERE buyer_address IN (${placeholders}) AND status = '已确认'
  `;

  db.query(transactionQuery, addresses, (err, transactionResults) => {
    if (err) {
      console.error('❌ 查询 transactions 表失败:', err);
      return res.status(500).json({ error: '数据库查询失败（交易记录）' });
    }

    if (transactionResults.length === 0) {
      console.log('📭 未找到任何 "已购买" 状态的交易记录');
      return res.status(200).json({ assets: [] });
    }

    // 构建 asset_id => quality 的映射
    const qualityMap = {};
    const assetIds = transactionResults.map(row => {
      qualityMap[row.asset_id] = row.quality;
      return row.asset_id;
    });

    const assetPlaceholders = assetIds.map(() => '?').join(',');

    const assetQuery = `
      SELECT 
        asset_name, asset_type, email, address, description,
        algorithm, custom_algorithm, file_hash, industry, txperm, user_id,
        owner_address, is_proxied, number,
        can_sell_asset, can_sell_view, can_sell_process, allow_resale
      FROM asset_registrations 
      WHERE file_hash IN (${assetPlaceholders})
    `;

    db.query(assetQuery, assetIds, (err2, assetResults) => {
      if (err2) {
        console.error('❌ 查询 asset_registrations 表失败:', err2);
        return res.status(500).json({ error: '资产信息查询失败' });
      }

      // 将每个资产附带对应的 quality 权限
      const mergedResults = assetResults.map(asset => ({
        ...asset,
        quality: qualityMap[asset.file_hash] || null
      }));

      res.status(200).json({ assets: mergedResults });
      console.log('🧾 返回前端的 mergedResults:', mergedResults);

    });
  });
});



/*app.get('/api/asset/:id', (req, res) => { 
    const { id } = req.params; // 获取资产 ID
  
    // SQL 查询，获取资产详情和权限信息
    let query = `
      SELECT asset_name, asset_type, email, address, description, algorithm, custom_algorithm, file_hash, 
             industry, industry_raw_name, picture, user_id, price, owner_address, current_owner_address,
             can_sell_asset, can_sell_view, can_sell_process 
      FROM asset_registrations 
      WHERE file_hash = ?
    `;
  
    // 执行查询
    db.query(query, [id], (err, results) => {
      if (err) {
        console.error('查询资产详情失败:', err);
        return res.status(500).json({ error: '服务器内部错误' });
      }
  
      if (results.length === 0) {
        return res.status(404).json({ error: '资产未找到' });
      }
  
      const asset = results[0];

      // 将图片转换为 Base64 格式
      if (asset.picture) {
        asset.picture = asset.picture.toString('base64');
      } else {
        asset.picture = null; // 如果没有图片，返回 null
      }
  
      // 添加权限信息到响应中
      asset.permissions = {
        canSellAsset: asset.can_sell_asset,
        canSellView: asset.can_sell_view,
        canSellProcess: asset.can_sell_process
      };
  
      res.json(asset); // 返回资产详情和权限信息
    });
});*/

app.get('/api/asset/:id', (req, res) => {
  const { id } = req.params; // 获取资产 file_hash

  const query = `
    SELECT 
      asset_name,
      asset_type,
      asset_category,
      predicted_domain,
      email,
      address,
      owner_address,
      current_owner_address,
      description,
      algorithm,
      custom_algorithm,
      file_hash,
      user_id,
      industry,
      industry_raw,
      industry_raw_name,
      picture,
      txperm,
      price,
      created_at,
      updated_at,
      agent_addr,
      is_proxied,
      number,
      can_sell_asset,
      can_sell_view,
      can_sell_process,
      allow_resale,
      trade_location,
      trade_start_ts,
      trade_end_ts,
      allow_authorize,
      allow_supervision,
      agent_count,
      view_right_owner,
      process_right_owner,
      model_type,
      pc_type,
      trade_mode,
      auction_start_price,
      auction_end_time,
      auction_current_price,
      auction_bid_count,
      auction_status
    FROM asset_registrations
    WHERE file_hash = ?
    LIMIT 1
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error('查询资产详情失败:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({ error: '资产未找到' });
    }

    const asset = results[0];

    // 图片转 base64
    if (asset.picture && Buffer.isBuffer(asset.picture)) {
      asset.picture = asset.picture.toString('base64');
    } else {
      asset.picture = null;
    }

    // 兼容前端旧逻辑：保留 permissions 对象
    asset.permissions = {
      canSellAsset: !!asset.can_sell_asset,
      canSellView: !!asset.can_sell_view,
      canSellProcess: !!asset.can_sell_process
    };

    // 如果当前拥有者为空，则兜底为创建者地址
    if (!asset.current_owner_address) {
      asset.current_owner_address = asset.owner_address;
    }

    // 电话字段当前数据库里没有，这里先给一个占位，避免前端报错
    asset.contact_phone = null;

    res.json(asset);
  });
});

  
  app.post('/api/check-hash', async (req, res) => {
    const { hash } = req.body;

    if (!hash) {
        return res.status(400).json({ message: '缺少 hash 参数' });
    }

    const checkSql = 'SELECT COUNT(*) AS count FROM asset_registrations WHERE file_hash = ?';
    db.query(checkSql, [hash], (checkErr, checkResult) => {
        if (checkErr) {
            console.error('检查资产文件哈希失败:', checkErr);
            return res.status(500).json({ message: '检查失败，请稍后再试' });
        }

        const exists = checkResult[0].count > 0;
        if (exists) {
            return res.status(409).json({ message: '资产已存在，file_hash 重复', exists: true });
        } else {
            return res.status(200).json({ message: '文件哈希不存在，可继续上传', exists: false });
        }
    });
});


// [新接口] 获取可选模型列表：model_type 不为空的资产
app.get('/api/model-options', (req, res) => {
 
  let query = `
    SELECT asset_name, file_hash, model_type
    FROM asset_registrations
    WHERE model_type IS NOT NULL
      AND model_type <> ''
  `;

  const params = [];

  query += ` ORDER BY id DESC`;

  db.query(query, params, (err, results) => {
    if (err) {
      console.error('查询模型列表失败:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    return res.status(200).json({ models: results });
  });
});



app.get('/api/certificate-name-available', (req, res) => {
    const certificateName = String(req.query.certificateName || '').trim();
    if (!certificateName) {
        return res.status(400).json({ success: false, message: '缺少 certificateName 参数' });
    }

    db.query(
        'SELECT user_id FROM certificate_registry WHERE certificate_name = ? AND user_id IS NOT NULL LIMIT 1',
        [certificateName],
        (err, rows) => {
            if (err) {
                console.error('查询证书名称失败:', err);
                return res.status(500).json({ success: false, message: '查询证书名称失败' });
            }
            return res.json({ success: true, available: rows.length === 0 });
        }
    );
});

app.post('/api/add-certificate', async (req, res) => {
    const { userId, certificateName, org } = req.body || {};
    const name = String(certificateName || '').trim();

    if (!userId || !name || !org) {
        return res.status(400).json({ message: '缺少 userId、certificateName 或 org 参数' });
    }

    let certColumn;
    if (org === 'wx-org1') {
        certColumn = 'certificates';
    } else if (org === 'wx-org2') {
        certColumn = 'certificates2';
    } else {
        return res.status(400).json({ message: '未知的 org 参数' });
    }

    try {
        const certificate = await withMainDbTransaction(async ({ query }) => {
            const registryRows = await query(
                'SELECT id, user_id, address FROM certificate_registry WHERE certificate_name = ? LIMIT 1 FOR UPDATE',
                [name]
            );
            if (!registryRows.length || !registryRows[0].address) {
                const error = new Error('证书信息未登记，请重新生成');
                error.statusCode = 400;
                throw error;
            }
            if (registryRows[0].user_id != null && String(registryRows[0].user_id) !== String(userId)) {
                const error = new Error('证书名称已被其他用户使用');
                error.statusCode = 409;
                throw error;
            }

            const userRows = await query(
                `SELECT ${certColumn} AS certs FROM users WHERE id = ? FOR UPDATE`,
                [userId]
            );
            if (!userRows.length) {
                const error = new Error('用户未找到');
                error.statusCode = 404;
                throw error;
            }

            let certs = [];
            try {
                certs = userRows[0].certs ? JSON.parse(userRows[0].certs) : [];
            } catch (_) {
                certs = [];
            }
            if (!Array.isArray(certs)) certs = [];
            if (certs.includes(name)) {
                const error = new Error('证书已存在，不能重复添加');
                error.statusCode = 400;
                throw error;
            }

            certs.push(name);
            await query(
                `UPDATE users
                 SET ${certColumn} = ?,
                     default_register_cert = ?,
                     default_trade_cert = ?
                 WHERE id = ?`,
                [JSON.stringify(certs), name, name, userId]
            );

            // autocert 已经登记了证书文件/地址/有效期，这里只补齐所属用户。
            await query(
                `INSERT INTO certificate_registry (user_id, certificate_name, org)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
                [userId, name, org]
            );

            const rows = await query(
                `SELECT certificate_name AS cert, org AS organization, address, expires_at
                 FROM certificate_registry WHERE certificate_name = ? LIMIT 1`,
                [name]
            );
            return rows[0];
        });

        return res.status(200).json({ message: '证书添加成功', certificate });
    } catch (error) {
        console.error('添加证书失败:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.message || '服务器内部错误'
        });
    }
});

app.post('/api/renew-certificate', async (req, res) => {
    const { userId, certificateName, org } = req.body || {};
    const name = String(certificateName || '').trim();
    const orgValue = String(org || '').trim();
    if (!userId || !name || !orgValue) {
        return res.status(400).json({ message: '缺少 userId、certificateName 或 org 参数' });
    }

    const orgDir = orgValue.endsWith('.chainmaker.org') ? orgValue : `${orgValue}.chainmaker.org`;
    const orgShort = orgDir.replace('.chainmaker.org', '');
    const caPort = orgShort === 'wx-org2' ? 8091 : 8090;
    const caBase = `http://127.0.0.1:${caPort}`;

    // certSn 是 int64（约 2.4e18），超出 JS Number 精度，
    // 必须先按原始文本取出，再用字符串拼进请求体，避免尾数被改写。
    const queryCertSn = async (usage) => {
        const response = await axios.post(`${caBase}/api/ca/querycerts`, {
            orgId: orgDir,
            userId: `${name}.${usage}`,
            userType: 'client',
            certUsage: usage
        }, {
            timeout: 15000,
            responseType: 'text',
            transformResponse: [(data) => data]
        });
        const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        const blocks = raw.split('{"userId"').slice(1);
        let latest = null;
        for (const block of blocks) {
            if (!block.includes('"certContent"')) continue;
            const snMatch = block.match(/"certSn"\s*:\s*(\d+)/);
            if (!snMatch) continue;
            const expMatch = block.match(/"expirationDate"\s*:\s*(\d+)/);
            const exp = expMatch ? Number(expMatch[1]) : 0;
            if (!latest || exp > latest.exp) {
                latest = { sn: snMatch[1], exp };
            }
        }
        if (!latest) throw new Error(`${usage} 证书不存在`);
        return latest.sn;
    };

    const renewCert = async (certSn) => {
        // CA 的续期是在原到期时间上叠加有效期。
        // 如果证书已过期较久，一次续期可能仍落在过去，这里继续叠加直到重新生效。
        for (let attempt = 0; attempt < 24; attempt += 1) {
            const response = await axios.post(
                `${caBase}/api/ca/renewcert`,
                `{"certSn":${certSn}}`,
                {
                    timeout: 30000,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
            const cert = response.data?.data?.cert;
            if (!cert) {
                throw new Error(response.data?.msg || '证书续期返回为空');
            }
            const renewed = new crypto.X509Certificate(cert);
            if (new Date(renewed.validTo).getTime() > Date.now()) {
                return cert;
            }
        }
        throw new Error('证书已过期过久，续期后仍未生效，请联系管理员');
    };

    try {
        const rows = await dbQuery(
            `SELECT certificate_name, org, sign_cert_path, tls_cert_path, address
             FROM certificate_registry
             WHERE certificate_name = ? AND user_id = ?
             LIMIT 1`,
            [name, userId]
        );
        if (!rows.length) {
            return res.status(404).json({ message: '证书不存在或不属于当前用户' });
        }
        const record = rows[0];

        const [signSn, tlsSn] = await Promise.all([queryCertSn('sign'), queryCertSn('tls')]);
        const [newSignCert, newTlsCert] = await Promise.all([
            renewCert(signSn),
            renewCert(tlsSn)
        ]);

        const baseDir = `/home/super/fqh/cert-store/${orgDir}/${name}`;
        const signPath = record.sign_cert_path || `${baseDir}/${name}.sign.crt`;
        const tlsPath = record.tls_cert_path || `${baseDir}/${name}.tls.crt`;
        await fs.mkdir(path.dirname(signPath), { recursive: true, mode: 0o755 });
        await fs.writeFile(signPath, newSignCert, { mode: 0o644 });
        await fs.writeFile(tlsPath, newTlsCert, { mode: 0o644 });

        // 同步到 GoSDK 使用的 crypto-config，名称和地址保持不变。
        const gosdkDirs = [
            `/home/super/r/GoSDK/crypto-config/${orgDir}/user/${name}`,
            `/home/super/lihuihao/otherwork/mint_service/GoSDK/crypto-config/${orgDir}/user/${name}`
        ];
        for (const dir of gosdkDirs) {
            try {
                await fs.mkdir(dir, { recursive: true, mode: 0o755 });
                await fs.writeFile(path.join(dir, `${name}.sign.crt`), newSignCert, { mode: 0o644 });
                await fs.writeFile(path.join(dir, `${name}.tls.crt`), newTlsCert, { mode: 0o644 });
            } catch (error) {
                console.warn('同步续期证书到 GoSDK 失败:', dir, error.message);
            }
        }

        const x509 = new crypto.X509Certificate(newSignCert);
        const expires = new Date(x509.validTo);
        const pad = (value) => String(value).padStart(2, '0');
        const expiresAt = `${expires.getFullYear()}-${pad(expires.getMonth() + 1)}-${pad(expires.getDate())} ${pad(expires.getHours())}:${pad(expires.getMinutes())}:${pad(expires.getSeconds())}`;

        await dbQuery(
            `UPDATE certificate_registry
             SET expires_at = ?, sign_cert_path = ?, tls_cert_path = ?
             WHERE certificate_name = ? AND user_id = ?`,
            [expiresAt, signPath, tlsPath, name, userId]
        );

        return res.json({
            success: true,
            message: '证书续期成功',
            certificate: {
                cert: name,
                organization: record.org,
                address: record.address,
                expiresAt
            }
        });
    } catch (error) {
        console.error('证书续期失败:', error.message);
        return res.status(500).json({
            message: error.response?.data?.msg || error.message || '证书续期失败'
        });
    }
});

app.post('/api/get-certificates', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: '缺少 userId 参数' });
    }

    const sql = `
        SELECT
            certificate_name AS cert,
            org AS organization,
            sign_cert_path,
            tls_cert_path,
            pem_path,
            address,
            created_at,
            expires_at
        FROM certificate_registry
        WHERE user_id = ? AND org = 'wx-org1'
        ORDER BY created_at DESC, id DESC
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('查询证书失败:', err);
            return res.status(500).json({ message: '服务器内部错误' });
        }

        return res.status(200).json({
            userId,
            certificates: (results || []).map((row) => ({
                cert: row.cert,
                organization: row.organization,
                address: row.address || null,
                sign_cert_path: row.sign_cert_path || null,
                tls_cert_path: row.tls_cert_path || null,
                pem_path: row.pem_path || null,
                registry_created_at: row.created_at || null,
                expires_at: row.expires_at || null
            }))
        });
    });
});

app.post('/api/get-certificates2', (req, res) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ message: '缺少 userId 参数' });
    }

    const sql = `
        SELECT
            certificate_name AS cert,
            org AS organization,
            sign_cert_path,
            tls_cert_path,
            pem_path,
            address,
            created_at,
            expires_at
        FROM certificate_registry
        WHERE user_id = ? AND org = 'wx-org2'
        ORDER BY created_at DESC, id DESC
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('查询证书失败:', err);
            return res.status(500).json({ message: '服务器内部错误' });
        }

        return res.status(200).json({
            userId,
            certificates: (results || []).map((row) => ({
                cert: row.cert,
                organization: row.organization,
                address: row.address || null,
                sign_cert_path: row.sign_cert_path || null,
                tls_cert_path: row.tls_cert_path || null,
                pem_path: row.pem_path || null,
                registry_created_at: row.created_at || null,
                expires_at: row.expires_at || null
            }))
        });
    });
});

function mapUserTypeToRole(userType) {
    const type = Number(userType);
    if (type === 1) return 'admin';
    if (type === 4) return 'client';
    return '未知角色';
}

function resolveCertificateRecord(connection, cert) {
    return new Promise((resolve, reject) => {
        const signCommonName = `${cert}.sign`;
        const tlsCommonName = `${cert}.tls`;
        const certContentQuery = `
            SELECT organization, organizational_unit, common_name, issue_date, expiration_date, updated_at
            FROM cert_content
            WHERE common_name IN (?, ?)
            ORDER BY
                CASE
                    WHEN organization IS NULL OR organization = '' OR organization LIKE '.%' THEN 1
                    ELSE 0
                END,
                FIELD(common_name, ?, ?),
                updated_at DESC
            LIMIT 1
        `;

        connection.query(certContentQuery, [signCommonName, tlsCommonName, signCommonName, tlsCommonName], (contentErr, contentResults) => {
            if (contentErr) {
                console.error('查询证书内容失败:', contentErr);
                return reject(contentErr);
            }

            const certInfoQuery = `
                SELECT *
                FROM cert_info
                WHERE user_id IN (?, ?)
                ORDER BY
                    CASE
                        WHEN org_id IS NULL OR org_id = '' OR org_id LIKE '.%' THEN 1
                        ELSE 0
                    END,
                    FIELD(user_id, ?, ?),
                    updated_at DESC
                LIMIT 1
            `;
            connection.query(certInfoQuery, [signCommonName, tlsCommonName, signCommonName, tlsCommonName], (infoErr, infoResults) => {
                if (infoErr) {
                    console.error('查询证书参数失败:', infoErr);
                    return reject(infoErr);
                }

                if (contentResults.length === 0 && infoResults.length === 0) {
                    return resolve({ cert, message: '证书参数未找到' });
                }

                const content = contentResults[0] || null;
                const info = infoResults[0] || null;

                resolve({
                    cert,
                    organization: content?.organization || info?.org_id || '未知组织',
                    role: content?.organizational_unit || mapUserTypeToRole(info?.user_type),
                    data: {
                        ...info,
                        org_id: content?.organization || info?.org_id || null,
                        user_role: content?.organizational_unit || mapUserTypeToRole(info?.user_type),
                        common_name: content?.common_name || null,
                        issue_date: content?.issue_date || null,
                        expiration_date: content?.expiration_date || null,
                    }
                });
            });
        });
    });
}

// 根据 file_hash 提供图片的 API 端点
app.get('/api/image/:hash', (req, res) => {
    const fileHash = req.params.hash;

    // 从数据库中查询图片
    const query = 'SELECT picture FROM asset_registrations WHERE file_hash = ?';
    db.query(query, [fileHash], (err, results) => {
        if (err) {
            console.error('查询图片失败:', err);
            return res.status(500).send('服务器内部错误');
        }

        if (results.length === 0) {
            return res.status(404).send('图片未找到');
        }

        // 设置 Content-Type 响应头（根据实际图片格式设置正确的 MIME 类型）
        res.setHeader('Content-Type', 'image/jpeg'); // 默认 JPEG，可根据实际格式调整
        res.send(results[0].picture);
    });
});

app.post('/api/update-owner', (req, res) => {
    const { assetId, newOwner } = req.body;

    if (!assetId || !newOwner) {
        return res.status(400).json({ message: '缺少 assetId 或 newOwner 参数' });
    }

    // 更新数据库中的 current_owner_address
    const query = 'UPDATE asset_registrations SET current_owner_address = ? WHERE file_hash = ?';

    db.query(query, [newOwner, assetId], (err, result) => {
        if (err) {
            console.error('更新当前拥有者失败:', err);
            return res.status(500).json({ message: '服务器内部错误' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '资产未找到' });
        }

        res.status(200).json({ message: '当前拥有者更新成功' });
    });
});


// 统一的交易写入逻辑：/api/save-transaction 与支付成功回调共用
function insertTransaction(payload, cb) {
    const {
        asset_id,
        owner_id,
        buyer_address,
        seller_id,
        seller_address,
        quantity,
        quality,
        processing_type,
        expiration_time,
        model_file_hash,
        delivery_limit,
        pc_type,
        price,
        delegation_id,
        seller_type,
        owner_address
    } = payload || {};

    const ownerId = owner_id || null;
    const sellerId = seller_id || null;
    const safeQuality = (typeof quality === 'string' && quality.trim() !== '') ? quality : null;
    const safeDeliveryLimit = delivery_limit ?? 10;
    const parsedQuantity = Number(quantity);
    const purchaseQuantity = Number.isSafeInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1;
    const formattedExpirationTime = (expiration_time && typeof expiration_time === 'string')
        ? expiration_time.replace('T', ' ') + ':00'
        : null;

    const outOfStock = () => {
        const error = new Error('库存不足或已售罄');
        error.code = 'OUT_OF_STOCK';
        error.statusCode = 409;
        return error;
    };

    const delegationId = Number(delegation_id) > 0 ? Number(delegation_id) : null;
    const safeSellerType = delegationId ? 'AGENT' : (seller_type === 'AGENT' ? 'AGENT' : 'OWNER');
    const chainOwnerAddress = owner_address || null;

    const syncAgentCount = (done) => {
        if (!delegationId) return done();
        db.query(
            `UPDATE asset_registrations ar
             JOIN asset_delegations d ON d.asset_id = ar.file_hash
             SET ar.agent_count = d.quantity_remaining
             WHERE d.id = ?`,
            [delegationId],
            () => done()
        );
    };

    const insertRow = (stockReserved) => {
        const query = `
            INSERT INTO transactions (
                asset_id,
                owner_id,
                buyer_address,
                seller_id,
                seller_address,
                status,
                price,
                quantity,
                quality,
                processing_type,
                expiration_time,
                model_file_hash,
                delivery_limit,
                pc_type,
                stock_reserved,
                delegation_id,
                seller_type,
                owner_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const values = [
            asset_id,
            ownerId,
            buyer_address,
            sellerId,
            seller_address,
            '待确认',
            (price !== undefined && price !== null && price !== '') ? String(price) : null,
            purchaseQuantity,
            safeQuality,
            processing_type,
            formattedExpirationTime,
            model_file_hash,
            safeDeliveryLimit,
            pc_type || null,
            stockReserved,
            delegationId,
            safeSellerType,
            chainOwnerAddress
        ];

        db.query(query, values, (err, results) => {
            if (err) {
                console.error('插入交易数据失败:', err);
                if (!stockReserved) return cb(err);
                // 插入失败时把刚占用的库存退回去：代理库存退回代理关系，普通库存退回资产。
                if (delegationId) {
                    return db.query(
                        `UPDATE asset_delegations
                         SET quantity_remaining = quantity_remaining + ?, status = 'ACTIVE'
                         WHERE id = ?`,
                        [purchaseQuantity, delegationId],
                        () => syncAgentCount(() => cb(err))
                    );
                }
                return db.query(
                    'UPDATE asset_registrations SET number = number + ? WHERE file_hash = ?',
                    [purchaseQuantity, asset_id],
                    () => cb(err)
                );
            }
            const transactionId = results.insertId;
            // 拍卖获胜者提交权益申请后，移出“待处理获拍”列表，但保留交易历史。
            db.query(`UPDATE asset_registrations
                      SET auction_status = 'APPLIED', txperm = 0
                      WHERE file_hash = ? AND trade_mode = 'auction' AND auction_status = 'CLOSED'`,
              [asset_id], (auctionErr) => {
                if (auctionErr) console.error('更新拍卖申请状态失败:', auctionErr);
                cb(null, transactionId);
              });
        });
    };

    // 代理订单扣代理库存，普通订单扣资产自身的可售数量。
    if (delegationId) {
        db.query(
            `UPDATE asset_delegations
             SET status = IF(quantity_remaining = ?, 'SOLD_OUT', status),
                 quantity_remaining = quantity_remaining - ?
             WHERE id = ?
               AND asset_id = ?
               AND status = 'ACTIVE'
               AND quantity_remaining >= ?`,
            [purchaseQuantity, purchaseQuantity, delegationId, asset_id, purchaseQuantity],
            (updateErr, updateResult) => {
                if (updateErr) return cb(updateErr);
                if (!updateResult || updateResult.affectedRows === 0) return cb(outOfStock());
                syncAgentCount(() => insertRow(1));
            }
        );
        return;
    }

    // 库存以 asset_registrations.number 为准：下单即占用，拒绝/软删除时回补。
    db.query('SELECT number FROM asset_registrations WHERE file_hash = ? LIMIT 1', [asset_id], (stockErr, rows) => {
        if (stockErr) return cb(stockErr);
        // 非主资产（例如二次交易）不在 asset_registrations 时，不做库存扣减。
        if (!rows || rows.length === 0) return insertRow(0);

        const available = Number(rows[0].number);
        if (!Number.isFinite(available) || available < purchaseQuantity) {
            return cb(outOfStock());
        }

        db.query(
            'UPDATE asset_registrations SET number = number - ? WHERE file_hash = ? AND number >= ?',
            [purchaseQuantity, asset_id, purchaseQuantity],
            (updateErr, updateResult) => {
                if (updateErr) return cb(updateErr);
                if (!updateResult || updateResult.affectedRows === 0) return cb(outOfStock());
                insertRow(1);
            }
        );
    });
}

app.post('/api/save-transaction', acceptTeeModelUpload, (req, res) => {
    const {
        asset_id,
        owner_id,
        buyer_address,
        seller_id,
        seller_address,
        quantity,
        quality,
        processing_type,
        expiration_time,
        pc_type
    } = req.body;

    console.log("后端接收到的 quality 值是：", quality);
    console.log("后端接收到的 expiration_time 值是：", expiration_time);

    let proposal;
    try {
        proposal = validateTeeTransactionProposal({
            pcType: pc_type,
            modelFileHash: req.file?.modelHash,
            purchaseQuantity: quantity
        });
        if (req.file && proposal.pcType !== 'TEE') {
            return res.status(400).json({ message: '只有 TEE 交易可以上传计算模型' });
        }
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }

    // 检查请求体是否缺少必要参数
    if (!asset_id || !buyer_address || !seller_address) {
        return res.status(400).json({ message: '缺少必要的参数' });
    }

    insertTransaction({
        asset_id,
        owner_id,
        buyer_address,
        seller_id,
        seller_address,
        quantity,
        quality,
        processing_type,
        expiration_time,
        model_file_hash: proposal.modelFileHash,
        delivery_limit: proposal.pcType === 'TEE' ? proposal.deliveryLimit : 10,
        pc_type: proposal.pcType
    }, (err, transactionId) => {
        if (err) {
            if (err.code === 'OUT_OF_STOCK') {
                return res.status(409).json({ message: '库存不足或已售罄', code: err.code });
            }
            return res.status(500).json({ error: '服务器内部错误' });
        }
        res.status(201).json({ message: '交易已成功创建', transactionId });
    });
});


// ================= 支付宝沙箱支付（当面付扫码） =================

// 解析资产价格：优先用库里的价格，查不到则回退到前端传入的 amount
function resolveAssetPrice(assetId, fallback, cb) {
    db.query('SELECT price FROM asset_registrations WHERE file_hash = ? LIMIT 1', [assetId], (err, rows) => {
        if (!err && rows && rows[0] && rows[0].price !== null && Number(rows[0].price) > 0) {
            return cb(null, Number(rows[0].price));
        }
        const f = Number(fallback);
        cb(null, Number.isFinite(f) && f > 0 ? f : null);
    });
}

// 支付确认成功后：写入交易表，并把订单置为 PAID（幂等，防止重复入账）
function finalizeOrderPaid(outTradeNo, alipayResult, cb) {
    db.query("UPDATE alipay_orders SET status='PROCESSING' WHERE out_trade_no=? AND status='PENDING'",
        [outTradeNo], (cerr, cres) => {
            if (cerr) return cb(cerr);
            if (!cres || cres.affectedRows === 0) {
                return db.query('SELECT status, transaction_id FROM alipay_orders WHERE out_trade_no=? LIMIT 1',
                    [outTradeNo], (e2, r2) => {
                        if (e2 || !r2 || !r2.length) return cb(e2 || new Error('订单不存在'));
                        cb(null, r2[0].transaction_id);
                    });
            }
            db.query('SELECT * FROM alipay_orders WHERE out_trade_no=? LIMIT 1', [outTradeNo], (err, rows) => {
                if (err || !rows || !rows.length) return cb(err || new Error('订单不存在'));
                const order = rows[0];
                let payload = {};
                try {
                    payload = typeof order.payload === 'string' ? JSON.parse(order.payload) : (order.payload || {});
                } catch (e) {
                    payload = {};
                }
                payload.price = order.amount;
                insertTransaction(payload, (ierr, txId) => {
                    if (ierr) {
                        // 回滚认领状态，允许后续重试
                        db.query("UPDATE alipay_orders SET status='PENDING' WHERE out_trade_no=?", [outTradeNo], () => {});
                        return cb(ierr);
                    }
                    const tradeNo = alipayResult && (alipayResult.tradeNo || alipayResult.trade_no) || null;
                    db.query(`UPDATE alipay_orders
                              SET status='PAID', trade_no=?, transaction_id=?, paid_at=NOW(), raw_notify=?
                              WHERE out_trade_no=?`,
                        [tradeNo, txId, alipayResult ? JSON.stringify(alipayResult) : null, outTradeNo],
                        (uerr) => {
                            if (uerr) console.error('更新订单状态失败:', uerr);
                            cb(null, txId);
                        });
                });
            });
        });
}

// ================= 账户余额 =================

// 在事务内给余额加钱，并写一条流水。
async function creditBalance(query, userId, amount, type, refNo, remark) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error('余额变动金额无效');
    }
    const result = await query(
        'UPDATE users SET balance = balance + ? WHERE id = ?',
        [value.toFixed(2), userId]
    );
    if (!result || result.affectedRows === 0) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
    }
    const rows = await query('SELECT balance FROM users WHERE id = ? LIMIT 1', [userId]);
    const balanceAfter = rows[0] ? rows[0].balance : null;
    await query(
        `INSERT INTO balance_ledger (user_id, type, amount, balance_after, ref_no, remark)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, type, value.toFixed(2), balanceAfter, refNo || null, remark || null]
    );
    return balanceAfter;
}

// 卖家拒绝/关闭交易时，把余额支付的金额退回买家（只退一次）。
async function refundBalanceForTransaction(query, transactionId, remark) {
    const rows = await query(
        `SELECT *
         FROM alipay_orders
         WHERE transaction_id = ?
           AND payment_method = 'BALANCE'
           AND status = 'PAID'
           AND balance_refunded = 0
         LIMIT 1
         FOR UPDATE`,
        [transactionId]
    );
    if (!rows.length || !rows[0].buyer_id) return null;

    const order = rows[0];
    const balanceAfter = await creditBalance(
        query,
        order.buyer_id,
        order.amount,
        'REFUND',
        order.out_trade_no,
        remark || '交易关闭退款'
    );
    await query('UPDATE alipay_orders SET balance_refunded = 1 WHERE id = ?', [order.id]);
    return { userId: order.buyer_id, amount: order.amount, balanceAfter };
}

// 拒绝/关闭交易时，把下单占用的库存退回去。
// 代理订单退回代理库存，普通订单退回资产自身的可售数量。
async function restoreTransactionStock(query, transaction) {
    if (Number(transaction.stock_reserved) !== 1) return;

    const quantity = Number(transaction.quantity) || 0;
    if (Number(transaction.delegation_id) > 0) {
        await query(
            `UPDATE asset_delegations
             SET quantity_remaining = quantity_remaining + ?, status = 'ACTIVE'
             WHERE id = ?`,
            [quantity, transaction.delegation_id]
        );
        await query(
            `UPDATE asset_registrations ar
             JOIN asset_delegations d ON d.asset_id = ar.file_hash
             SET ar.agent_count = d.quantity_remaining
             WHERE d.id = ?`,
            [transaction.delegation_id]
        );
    } else {
        await query(
            'UPDATE asset_registrations SET number = number + ? WHERE file_hash = ?',
            [quantity, transaction.asset_id]
        );
    }

    await query(
        'UPDATE transactions SET stock_reserved = 0 WHERE transaction_id = ?',
        [transaction.transaction_id]
    );
}

// 充值订单支付成功后入账（幂等）。
async function finalizeRechargePaid(outTradeNo, alipayResult) {
    return withMainDbTransaction(async ({ query }) => {
        const rows = await query(
            'SELECT * FROM recharge_orders WHERE out_trade_no = ? LIMIT 1 FOR UPDATE',
            [outTradeNo]
        );
        if (!rows.length) {
            const error = new Error('充值订单不存在');
            error.statusCode = 404;
            throw error;
        }

        const order = rows[0];
        if (order.status === 'PAID') {
            const balanceRows = await query('SELECT balance FROM users WHERE id = ? LIMIT 1', [order.user_id]);
            return {
                status: 'PAID',
                amount: order.amount,
                balance: balanceRows[0] ? balanceRows[0].balance : null
            };
        }
        if (order.status !== 'PENDING') {
            const error = new Error('充值订单状态不可用');
            error.statusCode = 409;
            throw error;
        }

        const tradeNo = alipayResult && (alipayResult.tradeNo || alipayResult.trade_no) || null;
        const balanceAfter = await creditBalance(
            query,
            order.user_id,
            order.amount,
            'RECHARGE',
            outTradeNo,
            '账户余额充值'
        );
        await query(
            `UPDATE recharge_orders
             SET status = 'PAID', trade_no = ?, paid_at = NOW(), raw_notify = ?
             WHERE out_trade_no = ?`,
            [tradeNo, alipayResult ? JSON.stringify(alipayResult) : null, outTradeNo]
        );

        return { status: 'PAID', amount: order.amount, balance: balanceAfter };
    });
}

app.get('/api/balance', async (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ success: false, message: '缺少 userId' });
    }

    try {
        const rows = await dbQuery('SELECT balance FROM users WHERE id = ? LIMIT 1', [userId]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: '用户不存在' });
        }
        const records = await dbQuery(
            `SELECT id, type, amount, balance_after, ref_no, remark, created_at
             FROM balance_ledger
             WHERE user_id = ?
             ORDER BY id DESC
             LIMIT 20`,
            [userId]
        );
        return res.json({ success: true, balance: rows[0].balance, records });
    } catch (error) {
        console.error('查询余额失败:', error.message);
        return res.status(500).json({ success: false, message: '查询余额失败' });
    }
});

// 创建余额充值订单，返回支付宝二维码
app.post('/api/balance/recharge', async (req, res) => {
    if (!alipay.enabled) {
        return res.status(503).json({ message: '支付宝支付未配置' });
    }

    const userId = Number(req.body?.userId);
    const amount = Math.round(Number(req.body?.amount) * 100) / 100;
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: '缺少 userId' });
    }
    if (!Number.isFinite(amount) || amount < 0.01 || amount >= 100000000) {
        return res.status(400).json({ message: '充值金额需在 0.01 ~ 99999999.99 元之间' });
    }

    try {
        const users = await dbQuery('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
        if (!users.length) {
            return res.status(404).json({ message: '用户不存在' });
        }

        const outTradeNo = 'RC' + Date.now() + Math.floor(Math.random() * 1000);
        const subject = '账户余额充值';
        await dbQuery(
            `INSERT INTO recharge_orders (out_trade_no, user_id, amount, status)
             VALUES (?, ?, ?, 'PENDING')`,
            [outTradeNo, userId, amount.toFixed(2)]
        );

        const bizContent = {
            out_trade_no: outTradeNo,
            total_amount: amount.toFixed(2),
            subject,
            timeout_express: '10m'
        };
        if (alipay.notifyUrl) bizContent.notify_url = alipay.notifyUrl;

        const result = await alipay.sdk.exec('alipay.trade.precreate', { bizContent });
        if (!result || result.code !== '10000' || !result.qrCode) {
            console.error('充值下单失败:', result);
            await dbQuery("UPDATE recharge_orders SET status = 'FAILED' WHERE out_trade_no = ?", [outTradeNo]);
            return res.status(502).json({
                message: '支付宝下单失败',
                detail: result && (result.subMsg || result.msg)
            });
        }

        return res.status(201).json({
            message: '充值订单已创建',
            out_trade_no: outTradeNo,
            qr_code: result.qrCode,
            amount: amount.toFixed(2)
        });
    } catch (error) {
        console.error('创建充值订单失败:', error.message);
        return res.status(500).json({ message: '创建充值订单失败' });
    }
});

app.get('/api/balance/recharge-status/:outTradeNo', async (req, res) => {
    const outTradeNo = String(req.params.outTradeNo || '').trim();
    if (!outTradeNo) {
        return res.status(400).json({ message: '缺少订单号' });
    }

    try {
        const rows = await dbQuery(
            'SELECT * FROM recharge_orders WHERE out_trade_no = ? LIMIT 1',
            [outTradeNo]
        );
        if (!rows.length) {
            return res.status(404).json({ message: '充值订单不存在' });
        }
        const order = rows[0];
        if (order.status === 'PAID') {
            const balanceRows = await dbQuery('SELECT balance FROM users WHERE id = ? LIMIT 1', [order.user_id]);
            return res.json({
                status: 'PAID',
                amount: order.amount,
                balance: balanceRows[0] ? balanceRows[0].balance : null
            });
        }
        if (!alipay.enabled) {
            return res.json({ status: order.status });
        }

        const result = await alipay.sdk.exec('alipay.trade.query', {
            bizContent: { out_trade_no: outTradeNo }
        });
        const tradeStatus = result && (result.tradeStatus || result.trade_status);
        if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
            const paid = await finalizeRechargePaid(outTradeNo, result);
            return res.json(paid);
        }
        return res.json({ status: order.status, trade_status: tradeStatus || null });
    } catch (error) {
        console.error('查询充值状态失败:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.message || '查询充值状态失败'
        });
    }
});

// 开发/测试：跳过支付宝扫码，直接把充值订单置为已支付
app.post('/api/dev/balance-recharge-success/:outTradeNo', async (req, res) => {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_PAYMENT !== '1') {
        return res.status(403).json({ message: 'dev endpoint disabled' });
    }
    const outTradeNo = String(req.params.outTradeNo || '').trim();
    if (!outTradeNo) {
        return res.status(400).json({ message: '缺少订单号' });
    }

    try {
        const paid = await finalizeRechargePaid(outTradeNo, {
            tradeNo: `DEVRC${Date.now()}`,
            dev_skip: true
        });
        return res.json(paid);
    } catch (error) {
        console.error('充值跳过支付失败:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.message || '充值入账失败'
        });
    }
});

// 用余额支付一笔待支付的资产订单
app.post('/api/balance/pay', async (req, res) => {
    const outTradeNo = String(req.body?.out_trade_no || '').trim();
    const userId = Number(req.body?.userId);
    if (!outTradeNo || !Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ message: '缺少 out_trade_no 或 userId' });
    }

    let claimed;
    try {
        claimed = await withMainDbTransaction(async ({ query }) => {
            const rows = await query(
                'SELECT * FROM alipay_orders WHERE out_trade_no = ? LIMIT 1 FOR UPDATE',
                [outTradeNo]
            );
            if (!rows.length) {
                const error = new Error('订单不存在');
                error.statusCode = 404;
                throw error;
            }

            const order = rows[0];
            if (order.status === 'PAID') {
                return { alreadyPaid: true, transactionId: order.transaction_id, order };
            }
            if (order.status !== 'PENDING') {
                const error = new Error('订单状态不可支付');
                error.statusCode = 409;
                throw error;
            }

            let buyerId = order.buyer_id != null ? Number(order.buyer_id) : null;
            if (!buyerId) {
                const ownerRows = await query(
                    'SELECT user_id FROM certificate_registry WHERE address = ? AND user_id IS NOT NULL LIMIT 1',
                    [order.buyer_address]
                );
                buyerId = ownerRows.length ? Number(ownerRows[0].user_id) : null;
            }
            if (!buyerId || buyerId !== userId) {
                const error = new Error('订单不属于当前用户');
                error.statusCode = 403;
                throw error;
            }

            const amount = Number(order.amount);
            if (!Number.isFinite(amount) || amount <= 0) {
                const error = new Error('订单金额无效');
                error.statusCode = 400;
                throw error;
            }

            const balanceRows = await query('SELECT balance FROM users WHERE id = ? FOR UPDATE', [buyerId]);
            if (!balanceRows.length) {
                const error = new Error('用户不存在');
                error.statusCode = 404;
                throw error;
            }
            if (Number(balanceRows[0].balance) < amount) {
                const error = new Error('余额不足，请先充值');
                error.statusCode = 402;
                error.code = 'INSUFFICIENT_BALANCE';
                throw error;
            }

            await query(
                'UPDATE users SET balance = balance - ? WHERE id = ?',
                [amount.toFixed(2), buyerId]
            );
            await query(
                `UPDATE alipay_orders
                 SET status = 'PROCESSING', payment_method = 'BALANCE', buyer_id = ?
                 WHERE out_trade_no = ?`,
                [buyerId, outTradeNo]
            );

            const afterRows = await query('SELECT balance FROM users WHERE id = ? LIMIT 1', [buyerId]);
            const balanceAfter = afterRows[0] ? afterRows[0].balance : null;
            await query(
                `INSERT INTO balance_ledger (user_id, type, amount, balance_after, ref_no, remark)
                 VALUES (?, 'PAYMENT', ?, ?, ?, ?)`,
                [buyerId, (-amount).toFixed(2), balanceAfter, outTradeNo, `余额支付-${order.subject}`]
            );

            order.buyer_id = buyerId;
            return { alreadyPaid: false, order, balanceAfter };
        });
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.message || '余额支付失败',
            code: error.code
        });
    }

    if (claimed.alreadyPaid) {
        return res.json({
            status: 'PAID',
            transaction_id: claimed.transactionId,
            message: '订单已支付'
        });
    }

    const order = claimed.order;
    let payload = {};
    try {
        payload = typeof order.payload === 'string' ? JSON.parse(order.payload) : (order.payload || {});
    } catch (error) {
        payload = {};
    }
    payload.price = order.amount;

    try {
        const transactionId = await new Promise((resolve, reject) => {
            insertTransaction(payload, (error, id) => error ? reject(error) : resolve(id));
        });

        const tradeNo = 'BAL' + Date.now();
        await dbQuery(
            `UPDATE alipay_orders
             SET status = 'PAID', trade_no = ?, transaction_id = ?, paid_at = NOW(), raw_notify = ?
             WHERE out_trade_no = ?`,
            [tradeNo, transactionId, JSON.stringify({ method: 'BALANCE', userId, dev_skip: false }), outTradeNo]
        );

        return res.json({
            status: 'PAID',
            transaction_id: transactionId,
            balance: claimed.balanceAfter
        });
    } catch (error) {
        // 下单失败（例如并发下库存被抢完）时，把刚扣的余额退回，订单恢复为待支付。
        try {
            await withMainDbTransaction(async ({ query }) => {
                await creditBalance(
                    query,
                    order.buyer_id,
                    order.amount,
                    'REFUND',
                    outTradeNo,
                    '余额支付失败退回'
                );
                await query(
                    `UPDATE alipay_orders
                     SET status = 'PENDING', payment_method = 'ALIPAY'
                     WHERE out_trade_no = ? AND status = 'PROCESSING'`,
                    [outTradeNo]
                );
            });
        } catch (refundError) {
            console.error('余额支付失败退款异常:', refundError.message);
        }
        return res.status(error.statusCode || 500).json({
            message: error.message || '余额支付失败',
            code: error.code
        });
    }
});

// 创建支付订单并返回二维码
app.post('/api/create-payment', acceptTeeModelUpload, async (req, res) => {
    if (!alipay.enabled) {
        return res.status(503).json({ message: '支付宝支付未配置' });
    }
    const b = req.body || {};
    const { asset_id, buyer_address, subject } = b;
    let { seller_address } = b;
    if (!asset_id || !buyer_address || !seller_address) {
        return res.status(400).json({ message: '缺少必要的参数' });
    }

    let proposal;
    try {
        proposal = validateTeeTransactionProposal({
            pcType: b.pc_type,
            modelFileHash: req.file?.modelHash,
            purchaseQuantity: b.quantity
        });
        if (req.file && proposal.pcType !== 'TEE') {
            return res.status(400).json({ message: '只有 TEE 交易可以上传计算模型' });
        }
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }

    const requestedQuantity = Math.max(1, Math.floor(Number(b.quantity) || 1));
    const delegationId = Number(b.delegation_id) > 0 ? Number(b.delegation_id) : null;

    try {
        let amount = null;

        if (delegationId) {
            const delegationRows = await dbQuery(
                'SELECT * FROM asset_delegations WHERE id = ? AND asset_id = ? LIMIT 1',
                [delegationId, asset_id]
            );
            if (!delegationRows.length) {
                return res.status(404).json({ message: '代理关系不存在' });
            }
            const delegation = delegationRows[0];
            if (delegation.status !== 'ACTIVE') {
                return res.status(409).json({ message: '代理库存已售罄或已撤销', code: 'OUT_OF_STOCK' });
            }
            if (Number(delegation.quantity_remaining) < requestedQuantity) {
                return res.status(409).json({ message: '代理库存不足', code: 'OUT_OF_STOCK' });
            }
            if (seller_address && seller_address !== delegation.agent_address) {
                return res.status(403).json({ message: '代理订单的卖家地址不匹配' });
            }
            if (b.owner_address && String(b.owner_address) !== String(delegation.owner_address)) {
                return res.status(403).json({ message: '代理订单的所有者地址不匹配' });
            }

            const allowedRights = String(delegation.allowed_rights || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
            const requestedRights = String(b.quality || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
            if (allowedRights.length && requestedRights.some((item) => !allowedRights.includes(item))) {
                return res.status(400).json({ message: '购买权益超出代理授权范围' });
            }

            b.owner_id = delegation.owner_id;
            b.owner_address = delegation.owner_address;
            b.seller_id = delegation.agent_user_id;
            b.seller_address = delegation.agent_address;
            b.seller_type = 'AGENT';
            seller_address = delegation.agent_address;

            amount = delegation.price != null
                ? Number(delegation.price)
                : await new Promise((resolve, reject) => {
                    resolveAssetPrice(asset_id, b.amount, (err, value) => err ? reject(err) : resolve(value));
                });
        } else {
            const stockRows = await dbQuery(
                'SELECT number FROM asset_registrations WHERE file_hash = ? LIMIT 1',
                [asset_id]
            );
            if (stockRows.length && Number(stockRows[0].number) < requestedQuantity) {
                return res.status(409).json({ message: '库存不足或已售罄', code: 'OUT_OF_STOCK' });
            }
            amount = await new Promise((resolve, reject) => {
                resolveAssetPrice(asset_id, b.amount, (err, value) => err ? reject(err) : resolve(value));
            });
        }

        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({ message: '无法确定支付金额' });
        }
        amount = Number(amount);

        const outTradeNo = 'ALI' + Date.now() + Math.floor(Math.random() * 1000);
        const parsedBuyerId = Number(b.buyer_id);
        const payload = {
            asset_id,
            owner_id: b.owner_id,
            buyer_id: Number.isInteger(parsedBuyerId) && parsedBuyerId > 0 ? parsedBuyerId : null,
            buyer_address,
            seller_id: b.seller_id,
            seller_address,
            owner_address: b.owner_address || null,
            delegation_id: delegationId,
            seller_type: delegationId ? 'AGENT' : 'OWNER',
            quantity: requestedQuantity,
            quality: b.quality,
            processing_type: b.processing_type,
            expiration_time: b.expiration_time,
            model_file_hash: proposal.modelFileHash,
            delivery_limit: proposal.pcType === 'TEE' ? proposal.deliveryLimit : 10,
            pc_type: proposal.pcType
        };
        const finalSubject = (subject && String(subject).trim()) || ('数字资产购买-' + asset_id);

        await dbQuery(
            `INSERT INTO alipay_orders
             (out_trade_no, asset_id, owner_id, buyer_id, buyer_address, seller_id, seller_address, amount, subject, status, payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
            [outTradeNo, asset_id, payload.owner_id || null, payload.buyer_id || null, buyer_address,
             payload.seller_id || null, seller_address, amount.toFixed(2), finalSubject, JSON.stringify(payload)]
        );

        const bizContent = {
            out_trade_no: outTradeNo,
            total_amount: amount.toFixed(2),
            subject: finalSubject,
            timeout_express: '10m'
        };
        if (alipay.notifyUrl) bizContent.notify_url = alipay.notifyUrl;

        const result = await alipay.sdk.exec('alipay.trade.precreate', { bizContent });
        if (result && result.code === '10000' && result.qrCode) {
            return res.status(201).json({
                message: '订单已创建',
                out_trade_no: outTradeNo,
                qr_code: result.qrCode,
                amount: amount.toFixed(2)
            });
        }

        console.error('支付宝下单失败:', result);
        return res.status(502).json({ message: '支付宝下单失败', detail: result && (result.subMsg || result.msg) });
    } catch (error) {
        console.error('创建支付订单失败:', error);
        return res.status(500).json({ message: '创建订单失败' });
    }
});

// 查询支付状态：本地未支付的会主动向支付宝查单
app.get('/api/payment-status/:outTradeNo', (req, res) => {
    const outTradeNo = req.params.outTradeNo;
    db.query('SELECT * FROM alipay_orders WHERE out_trade_no=? LIMIT 1', [outTradeNo], (err, rows) => {
        if (err) return res.status(500).json({ message: '查询订单失败' });
        if (!rows || !rows.length) return res.status(404).json({ message: '订单不存在' });
        const order = rows[0];
        if (order.status === 'PAID') {
            return res.json({ status: 'PAID', transaction_id: order.transaction_id });
        }
        if (!alipay.enabled) {
            return res.json({ status: order.status });
        }
        alipay.sdk.exec('alipay.trade.query', { bizContent: { out_trade_no: outTradeNo } }).then((result) => {
            const tradeStatus = result && (result.tradeStatus || result.trade_status);
            if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
                finalizeOrderPaid(outTradeNo, result, (ferr, txId) => {
                    if (ferr) {
                        console.error('确认支付失败:', ferr);
                        return res.status(500).json({ message: '确认支付失败' });
                    }
                    res.json({ status: 'PAID', transaction_id: txId });
                });
            } else {
                res.json({ status: order.status, trade_status: tradeStatus || null });
            }
        }).catch((e) => {
            console.error('查单异常:', e);
            res.status(502).json({ message: '查单异常', detail: e.message });
        });
    });
});

// 开发/测试环境：跳过支付宝扫码，直接把订单置为已支付并写入交易
app.post('/api/dev/payment-success/:outTradeNo', (req, res) => {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_PAYMENT !== '1') {
        return res.status(403).json({ message: 'dev endpoint disabled' });
    }
    const outTradeNo = String(req.params.outTradeNo || '').trim();
    if (!outTradeNo) {
        return res.status(400).json({ message: '缺少订单号' });
    }
    finalizeOrderPaid(outTradeNo, { tradeNo: `DEV${Date.now()}`, dev_skip: true }, (err, txId) => {
        if (err) {
            return res.status(500).json({ message: '跳过支付失败', error: err.message });
        }
        res.json({ status: 'PAID', transaction_id: txId });
    });
});

// 支付宝异步回调（正式上线需要公网地址；沙箱内网演示可不启用）
app.post('/api/payment-notify', (req, res) => {
    if (!alipay.enabled) return res.status(503).send('fail');
    const params = req.body || {};
    try {
        const ok = typeof alipay.sdk.checkNotifySign === 'function' ? alipay.sdk.checkNotifySign(params) : false;
        if (!ok) {
            console.warn('支付回调验签失败');
            return res.send('fail');
        }
        const tradeStatus = params.trade_status;
        if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
            return res.send('success');
        }

        db.query(
            'SELECT id FROM recharge_orders WHERE out_trade_no = ? LIMIT 1',
            [params.out_trade_no],
            (lookupError, lookupRows) => {
                if (lookupError) {
                    console.error('回调查询充值订单失败:', lookupError);
                    return res.send('fail');
                }
                if (lookupRows && lookupRows.length) {
                    finalizeRechargePaid(params.out_trade_no, params)
                        .then(() => res.send('success'))
                        .catch((e) => {
                            console.error('充值回调处理失败:', e);
                            res.send('fail');
                        });
                    return;
                }
                finalizeOrderPaid(params.out_trade_no, params, (e) => {
                    if (e) {
                        console.error('回调处理失败:', e);
                        return res.send('fail');
                    }
                    res.send('success');
                });
            }
        );
    } catch (e) {
        console.error('回调异常:', e);
        res.send('fail');
    }
});




app.post('/api/save-digital-contract', (req, res) => {
  const {
    transaction_id,      // 必填：对应哪一条交易
    contract_id,         // 必填：例如 CONTRACT-120
    contract_name,       // 必填：例如 test8-数字合约
    product_name,        // 产品名称
    token_id,            // 资产ID / file_hash
    contract_description,
    seller_address,
    buyer_address,
    operations,          // 字符串，比如 "所有,查阅权,加工权"
    expiration_time,     // ISO 或 "2025-07-21T21:10:00"
    quantity_limit,
    processing_type,      // 资产类型
    model_file_hash,
    pc_type,
    verify_payload
    // 🚫 不再有 contract_content
  } = req.body;

  if (!transaction_id || !contract_id || !contract_name) {
    return res.status(400).json({ message: '缺少必要的参数' });
  }

  // 统一转成 MySQL DATETIME
  let formattedExpiration = null;
  if (expiration_time && typeof expiration_time === 'string') {
    // 兼容 "2025-07-21T21:10:00" / "2025-07-21 21:10:00"
    formattedExpiration = expiration_time.replace('T', ' ').slice(0, 19);
  }

  const verifyPayload = {
    delivery_cnt: String(
      verify_payload?.delivery_cnt ??
      verify_payload?.deliveryCnt ??
      quantity_limit ??
      1
    ),
    fileHash: String(
      verify_payload?.fileHash ??
      token_id ??
      ''
    ),
    timestamp:
      verify_payload?.timestamp ??
      verify_payload?.expireTime ??
      expiration_time ??
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };

  const allowedVerifyPolicyKeys = [
    'actions',
    'control_time',
    'control_time_window',
    'control_count',
    'control_frequency',
    'control_region',
    'control_network_address',
    'control_provider_node_id',
    'control_consumer_node_id',
    'control_data_status',
    'control_data_size',
    'control_distribution_data_size',
    'control_data_field',
    'control_execution_env',
    'control_algorithm',
    'control_machine_learning_models',
    'control_application',
    'action_transform',
    'action_anonymize',
    'action_desensitize',
    'action_encrypt',
    'action_access',
    'action_read',
    'action_reproduce',
    'action_download',
    'action_compute',
    'action_process',
    'action_joint_develop',
    'action_distribute',
    'action_policy_transmit',
    'action_sell',
    'action_delete',
    'action_result_download',
    'action_log_record_send',
    'action_use_notify',
    'action_expansion_item'
  ];

  if (verify_payload && typeof verify_payload === 'object') {
    allowedVerifyPolicyKeys.forEach((key) => {
      const value = verify_payload[key];
      if (value !== undefined && value !== null && value !== '') {
        verifyPayload[key] = value;
      }
    });
  }

  const query = `
    INSERT INTO digital_contracts (
      contract_id,
      transaction_id,
      contract_name,
      product_name,
      token_id,
      contract_description,
      seller_address,
      buyer_address,
      operations,
      expiration_time,
      quantity_limit,
      processing_type,
      pc_type,
      model_file_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    contract_id,
    transaction_id,
    contract_name,
    product_name || null,
    token_id || null,
    contract_description || null,
    seller_address || null,
    buyer_address || null,
    operations || null,
    formattedExpiration,
    quantity_limit || null,
    processing_type || null,
    pc_type || null,
    model_file_hash || null
  ];

  db.query(query, values, (err, results) => {
    if (err) {
      console.error('插入数字合约失败:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }
    res.status(201).json({
      message: '数字合约已成功保存',
      contractDbId: results.insertId,
      verifyPayload
    });
  });
});


app.get('/api/seller-pending-transactions/:seller_address', (req, res) => {
    const seller_address = req.params.seller_address;

    // 查询卖方待确认的交易（排除卖家已软删除的过期交易）
    const query = `
        SELECT * FROM transactions
        WHERE seller_address = ? AND status = '待确认' AND is_deleted = 0`;

    db.query(query, [seller_address], (err, results) => {
        if (err) {
            console.error('查询卖方待确认交易失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        res.status(200).json({ pendingTransactions: results });
    });
});

// 软删除：卖家移除已过期的待确认交易（仅标记，保留记录，前端不再显示）
app.post('/api/seller-delete-transaction', async (req, res) => {
    const { transaction_id, seller_address } = req.body || {};

    if (!transaction_id || !seller_address) {
        return res.status(400).json({ message: '缺少必要的参数' });
    }

    try {
        await withMainDbTransaction(async ({ query }) => {
            const rows = await query(
                `SELECT transaction_id, asset_id, quantity, stock_reserved, status, expiration_time, delegation_id
                 FROM transactions
                 WHERE transaction_id = ? AND seller_address = ? AND status = '待确认' AND is_deleted = 0
                 FOR UPDATE`,
                [transaction_id, seller_address]
            );
            if (!rows.length) {
                const error = new Error('未找到可删除的待确认交易');
                error.statusCode = 404;
                throw error;
            }

            const transaction = rows[0];
            const expirationTime = transaction.expiration_time;
            const expired = expirationTime && new Date(expirationTime).getTime() <= Date.now();
            if (!expired) {
                const error = new Error('仅可删除已过期的交易');
                error.statusCode = 400;
                throw error;
            }

            // 软删除待确认交易时，把下单时占用的库存退回去。
            await restoreTransactionStock(query, transaction);

            // 余额支付的订单关闭时，同步把钱退回买家。
            await refundBalanceForTransaction(query, transaction_id, '交易已过期关闭退款');

            await query(
                'UPDATE transactions SET is_deleted = 1, deleted_at = NOW(), stock_reserved = 0 WHERE transaction_id = ?',
                [transaction_id]
            );
        });

        return res.status(200).json({ message: '过期交易已移除' });
    } catch (error) {
        console.error('软删除交易失败:', error.message);
        return res.status(error.statusCode || 500).json({ message: error.message || '服务器内部错误' });
    }
});

app.post('/api/seller-confirm-transaction', async (req, res) => {
    const { seller_address, transaction_id, isAgree } = req.body || {};
    if (!transaction_id || typeof isAgree !== 'boolean' || !seller_address) {
        return res.status(400).json({ message: '缺少必要的参数' });
    }

    try {
        const result = await withMainDbTransaction(async ({ query }) => {
            const rows = await query(
              `SELECT t.*, ar.asset_name, ar.description
               FROM transactions t
               LEFT JOIN asset_registrations ar ON ar.file_hash = t.asset_id
               WHERE t.transaction_id = ? AND t.seller_address = ? AND t.status = '待确认'
               FOR UPDATE`,
              [transaction_id, seller_address]
            );
            if (!rows.length) {
                const error = new Error('未找到待确认交易');
                error.statusCode = 404;
                throw error;
            }

            const transaction = rows[0];
            const newStatus = isAgree ? '已确认' : '已拒绝';
            let contract = null;

            // 卖家拒绝时，把下单时占用的库存退回去，余额支付的金额也退回买家。
            if (!isAgree) {
                await restoreTransactionStock(query, transaction);
                await refundBalanceForTransaction(query, transaction_id, '卖家拒绝交易退款');
            }

            if (isAgree && String(transaction.pc_type || '').trim().toUpperCase() === 'TEE') {
                const expirationValue = transaction.expiration_time;
                const expirationMs = expirationValue instanceof Date
                  ? expirationValue.getTime()
                  : (expirationValue ? new Date(String(expirationValue).replace(' ', 'T')).getTime() : null);
                if (Number.isFinite(expirationMs) && expirationMs <= Date.now()) {
                    const error = new Error('数字合约已过期，不能确认交易');
                    error.statusCode = 409;
                    error.code = 'CONTRACT_EXPIRED';
                    throw error;
                }

                contract = buildTeeDigitalContract({
                    transaction,
                    asset: { asset_name: transaction.asset_name, description: transaction.description }
                });
                const existing = await query(
                  'SELECT id FROM digital_contracts WHERE transaction_id = ? LIMIT 1 FOR UPDATE',
                  [transaction_id]
                );
                if (existing.length) {
                    const error = new Error('该交易的数字合约已经存在');
                    error.statusCode = 409;
                    throw error;
                }

                await query(
                  `INSERT INTO digital_contracts
                   (contract_id, transaction_id, contract_name, product_name, token_id,
                    contract_description, seller_address, buyer_address, operations,
                    expiration_time, quantity_limit, processing_type, pc_type,
                    model_file_hash, delivery_limit)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                  [
                    contract.contract_id, contract.transaction_id, contract.contract_name,
                    contract.product_name, contract.token_id, contract.contract_description,
                    contract.seller_address, contract.buyer_address, contract.operations,
                    contract.expiration_time, contract.quantity_limit, contract.processing_type,
                    contract.pc_type, contract.model_file_hash, contract.delivery_limit
                  ]
                );
            }

            await query('UPDATE transactions SET status = ? WHERE transaction_id = ?', [newStatus, transaction_id]);
            return { status: newStatus, contractCreated: Boolean(contract), contractId: contract?.contract_id || null };
        });

        return res.status(200).json({ message: '交易状态已更新', ...result });
    } catch (error) {
        console.error('确认交易失败:', error.message);
        return res.status(error.statusCode || 500).json({
            message: error.message || '服务器内部错误',
            ...(error.code && { code: error.code })
        });
    }
});

app.get('/api/buyer-transaction-status/:buyer_address', (req, res) => {
    const buyer_address = req.params.buyer_address;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
    const offset = (page - 1) * pageSize;

    const query = `
        SELECT
          t.*,
          dc.pc_type,
          dc.contract_id AS digital_contract_id
        FROM transactions t
        LEFT JOIN digital_contracts dc
          ON dc.transaction_id = t.transaction_id
        WHERE t.buyer_address = ? AND t.status = '已确认' AND dc.pc_type IS NOT NULL`;

    const countQuery = `SELECT COUNT(*) AS total FROM transactions t LEFT JOIN digital_contracts dc ON dc.transaction_id=t.transaction_id WHERE t.buyer_address = ? AND t.status = '已确认' AND dc.pc_type IS NOT NULL`;
    db.query(countQuery, [buyer_address], (countErr, countRows) => {
      if (countErr) return res.status(500).json({ error: '服务器内部错误' });
      db.query(`${query} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`, [buyer_address, pageSize, offset], (err, results) => {
        if (err) {
            console.error('查询买方交易状态失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        res.status(200).json({ transactions: results, pagination: { page, pageSize, total: Number(countRows[0]?.total || 0) } });
      });
    });
});

// 添加这个接口到你的后端
/*app.get('/api/seller-transaction-status/:seller_address', (req, res) => {
    const seller_address = req.params.seller_address;

    // 查询卖方发起的交易状态（只返回已确认的交易）
    const query = `
        SELECT * FROM transactions
        WHERE seller_address = ? AND status = '已确认'`;

    db.query(query, [seller_address], (err, results) => {
        if (err) {
            console.error('查询卖方交易状态失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        res.status(200).json({ transactions: results });
    });
});*/

// 卖方查看自己发起的已确认交易 + 每笔交易的交付历史
app.get('/api/seller-transaction-status/:seller_address', (req, res) => {
  const seller_address = req.params.seller_address;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10));
  const offset = (page - 1) * pageSize;

  const txSql = `
    SELECT
      t.*,
      dc.pc_type,
      dc.contract_id AS digital_contract_id
    FROM transactions t
    LEFT JOIN digital_contracts dc
      ON dc.transaction_id = t.transaction_id
    WHERE t.seller_address = ? AND t.status = '已确认'
    ORDER BY t.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `SELECT COUNT(*) AS total FROM transactions WHERE seller_address = ? AND status = '已确认'`;
  db.query(countSql, [seller_address], (countErr, countRows) => {
   if (countErr) return res.status(500).json({ error: '服务器内部错误（查询总数）' });
   db.query(txSql, [seller_address, pageSize, offset], (err, txRows) => {
    if (err) {
      console.error('查询卖方交易状态失败:', err);
      return res.status(500).json({ error: '服务器内部错误（查询交易）' });
    }

    // 没有交易，直接返回空数组
    if (txRows.length === 0) {
      return res.status(200).json({ transactions: [], pagination: { page, pageSize, total: 0 } });
    }

    // ② 收集所有 transaction_id，用来一次性查询交付记录
    const txIds = txRows.map(row => row.transaction_id);

    // 构造 IN (?, ?, ?) 的占位符
    const placeholders = txIds.map(() => '?').join(',');

    const historySql = `
      SELECT
        id,
        transaction_id,
        delivery_index,
        delivered_at,
        buyer_address,
        seller_address
      FROM delivery_records
      WHERE transaction_id IN (${placeholders})
      ORDER BY transaction_id ASC, delivery_index ASC
    `;

    db.query(historySql, txIds, (err2, historyRows) => {
      if (err2) {
        console.error('查询交付历史失败:', err2);
        // 这里可以选择不中断，返回没有 history 的交易；为了安全，这里先直接报错
        return res.status(500).json({ error: '服务器内部错误（查询交付历史）' });
      }

      // ③ 在 Node 里按 transaction_id 把交付记录分组
      const historyMap = {};
      historyRows.forEach(rec => {
        const tid = rec.transaction_id;
        if (!historyMap[tid]) {
          historyMap[tid] = [];
        }
        historyMap[tid].push(rec);
      });

      // ④ 把分组好的历史挂到对应的交易上，字段名叫 delivery_history
      const formattedTxs = txRows.map(tx => {
        const tid = tx.transaction_id;
        const history = historyMap[tid] || [];

        return {
          ...tx,
          // 如果你表里已经有 delivery_count / delivery_limit，就直接用；
          // 没有的话也可以用 history.length 做个兜底
          delivery_count: tx.delivery_count != null
            ? tx.delivery_count
            : history.length,
          delivery_limit: tx.delivery_limit != null
            ? tx.delivery_limit
            : tx.delivery_limit, // 没有就保持为 null
          delivery_history: history
        };
      });

      return res.status(200).json({ transactions: formattedTxs, pagination: { page, pageSize, total: Number(countRows[0]?.total || 0) } });
    });
  });
  });
});


app.post('/api/update-agent', async (req, res) => {
    const { file_hash, agent_addr, agent_count } = req.body;

    // 参数校验
    if (!file_hash) {
        return res.status(400).json({ message: '缺少 file_hash 参数' });
    }

    // 有托管地址视为已授权(is_proxied=1)，传空则视为未托管(is_proxied=0)
    const updateSql = `
        UPDATE asset_registrations
        SET agent_addr = ?, agent_count = ?, is_proxied = ?
        WHERE file_hash = ?
    `;

    const values = [
        agent_addr || null,
        agent_count || 0,
        agent_addr ? 1 : 0,
        file_hash
    ];

    console.log('准备根据 file_hash 更新代理信息:', values);

    db.query(updateSql, values, (err, result) => {
        if (err) {
            console.error('更新代理信息失败:', err);
            return res.status(500).json({ message: '服务器内部错误' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '未找到匹配的资产记录，file_hash 不存在' });
        }

        return res.status(200).json({
            message: '代理信息更新成功',
            file_hash: file_hash,
            agent_addr: agent_addr,
            agent_count: agent_count,
            is_proxied: agent_addr ? 1 : 0
        });
    });
});

// 取消代理托管：清空托管地址/数量并把 is_proxied 置 0
app.post('/api/revoke-agent', async (req, res) => {
    const { file_hash } = req.body || {};

    if (!file_hash) {
        return res.status(400).json({ message: '缺少 file_hash 参数' });
    }

    const sql = `
        UPDATE asset_registrations
        SET agent_addr = NULL, agent_count = 0, is_proxied = 0
        WHERE file_hash = ?
    `;

    db.query(sql, [file_hash], (err, result) => {
        if (err) {
            console.error('取消代理托管失败:', err);
            return res.status(500).json({ message: '服务器内部错误' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: '未找到匹配的资产记录，file_hash 不存在' });
        }

        return res.status(200).json({
            message: '已取消代理托管',
            file_hash: file_hash,
            agent_addr: null,
            is_proxied: 0
        });
    });
});


// 用于获取特定交易的详细信息，包括 quality 字段
app.get('/api/get-transaction-detail/:transaction_id', (req, res) => {
  const transaction_id = req.params.transaction_id;
  const query = `SELECT * FROM transactions WHERE transaction_id = ?`;

  db.query(query, [transaction_id], (err, results) => {
    if (err) {
      console.error('获取交易详情失败:', err);
      return res.status(500).json({ error: '数据库错误' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: '交易不存在' });
    }

    res.status(200).json({ transaction: results[0] });
  });
});

app.get('/api/get-today-transaction-stats', (req, res) => {
    const query = `
      SELECT
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today_count,
        SUM(CASE WHEN DATE(created_at) = CURDATE() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS yesterday_count
      FROM transactions
    `;
  
    db.query(query, (err, results) => {
      if (err) {
        console.error('获取交易统计失败:', err);
        return res.status(500).json({ error: '数据库错误' });
      }
  
      const today = results[0].today_count;
      const yesterday = results[0].yesterday_count;
  
      let change = today - yesterday;
      let percent_change = 0;
  
      if (yesterday > 0) {
        percent_change = ((change / yesterday) * 100).toFixed(2);
      } else if (today > 0) {
        percent_change = 100.0; // 避免除以 0，昨天为 0 今天有增长
      }
  
      res.status(200).json({
        today_transaction_count: today,
        yesterday_transaction_count: yesterday,
        change: change,
        percent_change: percent_change + '%',
        trend: change > 0 ? '上升' : (change < 0 ? '下降' : '持平')
      });
    });
  });


  app.get('/api/get-transaction-history', (req, res) => {
    const query = `
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS transaction_count,
        AVG(CAST(price AS DECIMAL(10,2))) AS avg_price,
        SUM(CAST(price AS DECIMAL(10,2))) AS sum_price
      FROM transactions
      WHERE created_at >= CURDATE() - INTERVAL 30 DAY
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;
  
    db.query(query, (err, results) => {
      if (err) {
        console.error('获取交易历史失败:', err);
        return res.status(500).json({ error: '数据库错误' });
      }
  
      res.status(200).json({
        transaction_history: results
      });
    });
  });


// ============ [买方] 提交交付申请（精简版）============
app.post('/api/delivery/request-vm', (req, res) => {
  const {
    transaction_id,
    buyer_address,
    seller_address,
    vm_name,
    vm_cpu,
    vm_memory_mb,
    note
  } = req.body;

  if (!transaction_id || !buyer_address || !seller_address || !vm_name) {
    return res.status(400).json({
      message: '缺少必填字段 transaction_id / buyer_address / seller_address / vm_name'
    });
  }

  // 查重：同一交易只允许一条申请
  const checkSql = `SELECT id, status FROM delivery_requests WHERE transaction_id = ? LIMIT 1`;
  db.query(checkSql, [String(transaction_id)], (checkErr, rows) => {
    if (checkErr) {
      console.error('查询 delivery_requests 失败:', checkErr);
      return res.status(500).json({ message: '数据库查询失败', error: checkErr });
    }

    if (rows && rows.length > 0) {
      return res.status(409).json({
        message: '该交易已提交过交付申请，请勿重复提交',
        existing: { id: rows[0].id, status: rows[0].status }
      });
    }

    const insertSql = `
      INSERT INTO delivery_requests
        (transaction_id, buyer_address, seller_address, vm_name, vm_cpu, vm_memory_mb, note, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `;

    const values = [
      String(transaction_id),
      String(buyer_address),
      String(seller_address),
      String(vm_name),
      Number(vm_cpu || 2),
      Number(vm_memory_mb || 2048),
      note ? String(note) : null
    ];

    db.query(insertSql, values, (insErr, insResult) => {
      if (insErr) {
        console.error('插入 delivery_requests 失败:', insErr);
        return res.status(500).json({ message: '数据库插入失败', error: insErr });
      }

      return res.status(201).json({
        message: '交付申请已提交（待卖方审批）',
        requestId: insResult.insertId,
        transaction_id
      });
    });
  });
});

// ============ [卖方] 查询某笔交易是否存在交付申请（用于按钮是否可点）============
/*app.get('/api/delivery/seller/request-status/:transaction_id', (req, res) => {
  const transaction_id = req.params.transaction_id;

  if (!transaction_id) {
    return res.status(400).json({ message: '缺少 transaction_id 参数' });
  }

  // 取最新一条（理论上你做了查重，同一交易只有一条）
  const sql = `
    SELECT
      id,
      transaction_id,
      buyer_address,
      seller_address,
      vm_name,
      vm_cpu,
      vm_memory_mb,
      note,
      status,
      created_at,
      updated_at
    FROM delivery_requests
    WHERE transaction_id = ?
    ORDER BY id DESC
    LIMIT 1
  `;

  db.query(sql, [String(transaction_id)], (err, results) => {
    if (err) {
      console.error('查询 delivery_requests 失败:', err);
      return res.status(500).json({ message: '服务器内部错误（查询交付申请）' });
    }

    if (!results || results.length === 0) {
      return res.status(200).json({
        message: '该交易暂无交付申请',
        requested: false,
        status: 'NONE'
      });
    }

    const r = results[0];

    return res.status(200).json({
      message: '查询成功',
      requested: true,
      status: r.status,          // 'PENDING' / 'APPROVED' / 'REJECTED' / ...
      request: r
    });
  });
});*/
app.get('/api/delivery/seller/request-status/:transaction_id', (req,res)=>{

  const transaction_id=req.params.transaction_id;


  if(!transaction_id){
    return res.status(400).json({
      message:'缺少 transaction_id 参数'
    });
  }


  const sql=`

  SELECT
    id,
    transaction_id,
    buyer_address,
    seller_address,
    asset_id,
    vm_cpu,
    vm_memory_mb,
    status,
    step,
    created_at,
    updated_at

  FROM delivery_secure_jobs

  WHERE transaction_id=?

  ORDER BY id DESC

  LIMIT 1

  `;


  db.query(sql,[String(transaction_id)],(err,results)=>{


    if(err){

      console.error(
        '查询 delivery_secure_jobs失败:',
        err
      );

      return res.status(500).json({
        message:'数据库查询失败'
      });

    }



    if(!results || results.length===0){

      return res.json({

        message:'暂无申请',

        requested:false,

        status:'NONE'

      });

    }



    const r=results[0];


    return res.json({

      message:'查询成功',

      requested:true,

      status:r.status,

      request:r

    });


  });


});


app.post('/api/classify-asset', async (req, res) => {
    const { text, asset_id, mode } = req.body;

    if (!text || !String(text).trim()) {
        return res.status(400).json({ message: '缺少 text 参数或内容为空' });
    }

    try {
        const response = await axios.post('http://10.112.191.163:5000/classify', {
            text: String(text).trim(),
            asset_id: asset_id || `asset-${Date.now()}`,
            run_judge: true
        }, {
            timeout: 30000
        });

        const entries = response?.data?.entries;
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(500).json({ message: '分类服务未返回有效结果' });
        }

        const first = entries[0];
        const grade = first?.grade || '';
        const category = Array.isArray(first?.category) ? first.category : [];
        const domain = category[0] || '';
        const assetCategory = category[1] || '';

        if (mode === 'grade') {
            if (!grade) {
                return res.status(500).json({ message: '分类服务未返回 grade' });
            }

            return res.status(200).json({
                message: '分级成功',
                grade
            });
        }

        if (mode === 'category') {
            if (!domain && !assetCategory) {
                return res.status(500).json({ message: '分类服务未返回资产类别和所属领域' });
            }

            return res.status(200).json({
                message: '分类成功',
                domain,
                assetCategory
            });
        }

        return res.status(200).json({
            message: '分类分级成功',
            grade,
            domain,
            assetCategory
        });
    } catch (error) {
        console.error('调用 Python classify 失败:', error.response?.data || error.message);
        return res.status(500).json({
            message: '分类分级失败',
            error: error.response?.data || error.message
        });
    }
});

app.get('/api/get-total-transaction-stats', (req, res) => {
  const sql = `
    SELECT COUNT(*) AS total_transaction_count
    FROM transactions
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('获取总交易量失败:', err);
      return res.status(500).json({
        success: false,
        message: '获取总交易量失败'
      });
    }

    return res.json({
      success: true,
      total_transaction_count: results[0].total_transaction_count || 0
    });
  });
});

async function getDeliveryJob(transactionId) {
  const results = await dbQuery(
    `
    SELECT *
    FROM delivery_secure_jobs
    WHERE transaction_id = ?
    LIMIT 1
    `,
    [String(transactionId)]
  );

  return results[0] || null;
}

app.get('/api/delivery/status/:transactionId',async(req,res)=>{
const {transactionId}=req.params;
try{
const job=await getDeliveryJob(transactionId);
if(!job){
return res.json({
success:true,
exists:false,
transactionId
});
}
return res.json({
success:true,
exists:true,
transactionId,
job:{
status:job.status,
step:job.step,
vmId:job.vm_id,
vmStatus:job.vm_status,
key1Status:job.key1_status,
contractStatus:job.contract_status,
sellerKeyStatus:job.seller_key_status,
buyerKeyStatus:job.buyer_key_status,
dataFileStatus:job.data_file_status,
weightFileStatus:job.weight_file_status,
resultStatus:job.result_status
}
});
}catch(err){
console.error('[delivery-status] error:',err);
return res.status(500).json({
success:false,
message:err.message||'查询交付状态失败'
});
}
});

function assertCsvResponse(response, actionName) {
  const data = response?.data;

  if (!response) {
    throw new Error(`${actionName}失败：没有收到远程响应`);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `${actionName}失败，HTTP ${response.status}：${JSON.stringify(data)}`
    );
  }

  if (Number(data?.code) !== 200) {
    throw new Error(
      `${actionName}失败：${JSON.stringify(data)}`
    );
  }

  return data;
}

function generateEcEcKeyPairPem() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });

  return {
    publicKeyPem: publicKey.export({
      type: 'spki',
      format: 'pem'
    }),

    privateKeyPem: privateKey.export({
      type: 'pkcs8',
      format: 'pem'
    })
  };
}

/*async function requestEncryptedSm4Key({
  vmId,
  ecPublicKeyPem
}) {
  const response = await axios.post(
    `${CSV_ENGINE_BASE_URL}${CSV_API_PATHS.receiveKey}`,
    {
      vmId: String(vmId),

      // 文档中疑似使用 ecPublickKey，存在拼写问题
      ecPublicKey: ecPublicKeyPem
    },
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 120000,
      validateStatus: () => true
    }
  );

  const data = assertCsvResponse(
    response,
    '获取并封装SM4密钥'
  );

  const envelope = data.data || data;

  if (
    !envelope.ephPub &&
    !envelope.ephPubdata
  ) {
    throw new Error(
      `密钥接口返回中缺少 ephPub：${JSON.stringify(data)}`
    );
  }

  return envelope;
}*/

async function requestEncryptedSm4Key({
  vmId,
  fileType,
  ecPublicKeyPem
}) {
  const payload={
    vmId:String(vmId),
    fileType:fileType || 'data',
    ecPublicKey:ecPublicKeyPem
  };
  console.log('[receiveKey请求参数]');
  console.log(JSON.stringify(payload,null,2));
  const response = await axios.post(
    `${CSV_ENGINE_BASE_URL}${CSV_API_PATHS.receiveKey}`,
    payload,
    {
      headers:{
        'Content-Type':'application/json'
      },
      timeout:120000,
      validateStatus:()=>true
    }
  );
  console.log('[receiveKey响应]');
  console.log('status:',response.status);
  console.log(JSON.stringify(response.data,null,2));
  const data = assertCsvResponse(
    response,
    '获取并封装SM4密钥'
  );2
}

app.post('/api/delivery/key/contract', async (req, res) => {
  const {
    transactionId,
    fileTypes,
    sellerEcPublicKey
  } = req.body;

  if (!transactionId) {
    return res.status(400).json({
      success: false,
      message: '缺少 transactionId'
    });
  }

  if (!sellerEcPublicKey) {
    return res.status(400).json({
      success: false,
      message: '缺少卖方 EC 公钥'
    });
  }

  try {
    const job = await getDeliveryJob(transactionId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: '未找到交付任务'
      });
    }

    if (!job.vm_id) {
      return res.status(409).json({
        success: false,
        message: '虚机尚未创建'
      });
    }

    if (
      String(job.vm_status).toLowerCase() !== 'running'
    ) {
      return res.status(409).json({
        success: false,
        message: '虚机尚未启动'
      });
    }

    await updateJob(transactionId, {
      status: 'RUNNING',
      step: 'CONTRACT_KEY_NEGOTIATING',
      key1_status: 'NEGOTIATING',
      last_error: null
    });

    const envelope = await requestEncryptedSm4Key({
      vmId: job.vm_id,
      fileType:fileTypes,
      ecPublicKeyPem: sellerEcPublicKey
    });

    await updateJob(transactionId, {
      key1_status: 'READY',
      contract_key_envelope: JSON.stringify(envelope),
      step: 'WAITING_ENCRYPTED_CONTRACT'
    });

    return res.json({
 success:true,
 message:'合约密钥获取成功',
 transactionId,
 keyType:'contract',
 envelope
});
  } catch (err) {
    console.error('[contract-key] error:', err);

    await updateJob(transactionId, {
      key1_status: 'FAILED',
      status: 'FAILED',
      step: 'CONTRACT_KEY_FAILED',
      last_error: err.message
    }).catch(() => {});

    return res.status(500).json({
      success: false,
      message: err.message || '合约密钥获取失败'
    });
  }
});


app.post('/api/delivery/key/result', async (req, res) => {

  const {
    transactionId,
    buyerEcPublicKey
  } = req.body;

  if (
    !transactionId ||
    !buyerEcPublicKey
  ) {
    return res.status(400).json({
      success:false,
      message:'缺少 transactionId 或 buyerEcPublicKey'
    });
  }

  try {

    const job = await getDeliveryJob(transactionId);

    if (!job || !job.vm_id) {
      return res.status(404).json({
        success:false,
        message:'未找到有效虚机任务'
      });
    }


    await updateJob(transactionId,{
      key3_status:'NEGOTIATING',
      step:'RESULT_KEY_NEGOTIATING',
      last_error:null
    });


    const resultEnvelope =
      await requestEncryptedSm4Key({

        vmId:job.vm_id,

        fileType:'result',

        ecPublicKeyPem:
          buyerEcPublicKey

      });


    await updateJob(transactionId,{

      key3_status:'READY',

      result_key_envelope:
        JSON.stringify(resultEnvelope),

      step:'WAITING_RESULT'

    });


    return res.json({
 success:true,
 message:'结果密钥生成成功',
 transactionId,
 keyType:'result',
 envelope
});


  } catch(err){

    console.error(
      '[result-key] error:',
      err
    );


    await updateJob(transactionId,{
      key3_status:'FAILED',
      step:'RESULT_KEY_FAILED',
      last_error:err.message
    }).catch(()=>{});


    return res.status(500).json({

      success:false,

      message:
        err.message ||
        '结果密钥获取失败'

    });

  }

});

async function verifyEncryptedContractRemote({
  vmId,
  iv,
  ciphertext,
  fileHash,
  expirationTime,
  deliveredCount
}) {
  const payload = {
    vmId: String(vmId),
    iv,
    ciphertext,
    fileHash,
    expirationTime
  };

  if (deliveredCount !== undefined) {
    payload.deliveried_cnt = String(deliveredCount);
  }

  const response = await axios.post(
    `${CSV_ENGINE_BASE_URL}${CSV_API_PATHS.verifyContract}`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 120000,
      validateStatus: () => true
    }
  );

  return assertCsvResponse(
    response,
    '数字合约校验'
  );
}
app.post('/api/delivery/contract/verify', async (req, res) => {
  const {
    transactionId,
    iv,
    ciphertext,
    fileHash,
    expirationTime,
    deliveredCount
  } = req.body;

  if (!transactionId || !iv || !ciphertext || !fileHash) {
    return res.status(400).json({
      success: false,
      message:
        '缺少 transactionId、iv、ciphertext 或 fileHash'
    });
  }

  try {
    const job = await getDeliveryJob(transactionId);

    if (!job || !job.vm_id) {
      return res.status(404).json({
        success: false,
        message: '未找到有效虚机任务'
      });
    }

    if (job.key1_status !== 'READY') {
      return res.status(409).json({
        success: false,
        message: '合约密钥尚未准备完成'
      });
    }

    await updateJob(transactionId, {
      contract_status: 'VERIFYING',
      step: 'CONTRACT_VERIFYING',
      last_error: null
    });

    const remoteResult =
      await verifyEncryptedContractRemote({
        vmId: job.vm_id,
        iv,
        ciphertext,
        fileHash,
        expirationTime,
        deliveredCount
      });

    const verifyData =
      remoteResult.data || remoteResult;

    const verified =
      verifyData.verified === true;

    await updateJob(transactionId, {
      contract_status:
        verified ? 'PASSED' : 'REJECTED',

      contract_verify_result:
        JSON.stringify(remoteResult),

      step:
        verified
          ? 'CONTRACT_VERIFIED'
          : 'CONTRACT_REJECTED'
    });

    return res.json({
      success: verified,
      message:
        verified
          ? '数字合约校验通过'
          : '数字合约校验未通过',
      transactionId,
      vmId: job.vm_id,
      verifyResult: remoteResult
    });
  } catch (err) {
    console.error('[contract-verify] error:', err);

    await updateJob(transactionId, {
      contract_status: 'FAILED',
      step: 'CONTRACT_VERIFY_FAILED',
      last_error: err.message
    }).catch(() => {});

    return res.status(500).json({
      success: false,
      message: err.message || '数字合约校验失败'
    });
  }
});


app.post('/api/delivery/key/data', async (req,res)=>{
  const {
    transactionId,
    ownerType,
    ecPublicKey
  }=req.body;
  if(
    !transactionId ||
    !ownerType ||
    !ecPublicKey
  ){
    return res.status(400).json({
      success:false,
      message:'缺少必要参数'
    });
  }
  try{
    const job=await getDeliveryJob(transactionId);
    if(!job || !job.vm_id){
      return res.status(404).json({
        success:false,
        message:'未找到有效虚机任务'
      });
    }
    const envelope =
      await requestEncryptedSm4Key({
        vmId:job.vm_id,
        fileType:'data',
        ecPublicKeyPem:ecPublicKey
      });
    if(ownerType==='seller'){
      await updateJob(transactionId,{
        seller_data_key_envelope:
          JSON.stringify(envelope),
        seller_key_status:'READY',
        key2_status:'READY'
      });
    }
    if(ownerType==='buyer'){
      await updateJob(transactionId,{
        buyer_data_key_envelope:
          JSON.stringify(envelope),
        buyer_key_status:'READY',
        key2_status:'READY'
      });
    }
    return res.json({
 success:true,
 message:'数据密钥生成成功',
 transactionId,
 keyType:'data',
 ownerType,
 envelope
});
  }catch(err){
    console.error('[data-key] error:',err);
    return res.status(500).json({
      success:false,
      message:err.message
    });
  }
});



app.get('/api/delivery/key/download/:transactionId/:keyType', async(req,res)=>{
  const {
    transactionId,
    keyType
  }=req.params;
  try{
    const job=await getDeliveryJob(transactionId);
    if(!job){
      return res.status(404).json({
        success:false,
        message:'未找到交付任务'
      });
    }
    let envelope=null;
    if(keyType==='contract'){
      envelope=job.contract_key_envelope;
    }else if(keyType==='seller_data'){
      envelope=job.seller_data_key_envelope;
    }else if(keyType==='buyer_data'){
      envelope=job.buyer_data_key_envelope;
    }else{
      return res.status(400).json({
        success:false,
        message:'未知密钥类型'
      });
    }
    if(!envelope){
      return res.status(404).json({
        success:false,
        message:'密钥尚未生成'
      });
    }
    return res.json({
      success:true,
      transactionId,
      keyType,
      envelope:JSON.parse(envelope)
    });
  }catch(err){
    console.error('[download-key] error:',err);
    return res.status(500).json({
      success:false,
      message:err.message||'密钥下载失败'
    });
  }
});


async function uploadEncryptedFileRemote({
  vmId,
  fileName,
  fileType,
  iv,
  ciphertext
}) {
  const response = await axios.post(
    `${CSV_ENGINE_BASE_URL}${CSV_API_PATHS.receiveFile}`,
    {
      vmId: String(vmId),
      fileName,
      name: fileName,
      fileType,
      mimeType: 'text/csv',
      iv,
      ciphertext
    },
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 300000,
      validateStatus: () => true
    }
  );

  return assertCsvResponse(
    response,
    `上传${fileType}加密文件`
  );
}
app.post('/api/delivery/file/upload', async (req, res) => {
  const {
    transactionId,
    fileName,
    fileType,
    iv,
    ciphertext
  } = req.body;

  if (
    !transactionId ||
    !fileName ||
    !fileType ||
    !iv ||
    !ciphertext
  ) {
    return res.status(400).json({
      success: false,
      message:
        '缺少 transactionId、fileName、fileType、iv 或 ciphertext'
    });
  }

  if (!['data', 'weight'].includes(fileType)) {
    return res.status(400).json({
      success: false,
      message: 'fileType 只能是 data 或 weight'
    });
  }

  try {
    const job = await getDeliveryJob(transactionId);

    if (!job || !job.vm_id) {
      return res.status(404).json({
        success: false,
        message: '未找到有效虚机任务'
      });
    }

    if (job.key2_status !== 'READY') {
      return res.status(409).json({
        success: false,
        message: '数据计算密钥尚未准备完成'
      });
    }

    await updateJob(transactionId, {
      data_status: 'UPLOADING',
      step:
        fileType === 'data'
          ? 'DATA_FILE_UPLOADING'
          : 'WEIGHT_FILE_UPLOADING',
      last_error: null
    });

    const remoteResult =
      await uploadEncryptedFileRemote({
        vmId: job.vm_id,
        fileName,
        fileType,
        iv,
        ciphertext
      });

    const remoteData =
      remoteResult.data || remoteResult;

    const updateFields = {
      data_status:
        remoteData.computed === true
          ? 'COMPUTED'
          : 'WAITING_COUNTERPART',

      step:
        remoteData.computed === true
          ? 'RESULT_READY'
          : fileType === 'data'
            ? 'WAITING_WEIGHT_FILE'
            : 'WAITING_DATA_FILE'
    };

    if (fileType === 'data') {
      updateFields.data_file_status = 'RECEIVED';
    } else {
      updateFields.weight_file_status = 'RECEIVED';
    }

    if (remoteData.computed === true) {
      updateFields.result_status = 'READY';
    }

    await updateJob(
      transactionId,
      updateFields
    );

    return res.json({
      success: true,
      message:
        remoteData.message ||
        `${fileType}文件接收成功`,
      transactionId,
      vmId: job.vm_id,
      fileType,
      remoteResult
    });
  } catch (err) {
    console.error('[file-upload] error:', err);

    await updateJob(transactionId, {
      data_status: 'FAILED',
      step: 'FILE_UPLOAD_FAILED',
      last_error: err.message
    }).catch(() => {});

    return res.status(500).json({
      success: false,
      message: err.message || '加密文件上传失败'
    });
  }
});


app.post('/api/delivery/file/upload', async (req, res) => {
  const {
    transactionId,
    fileName,
    fileType,
    iv,
    ciphertext
  } = req.body;

  if (
    !transactionId ||
    !fileName ||
    !fileType ||
    !iv ||
    !ciphertext
  ) {
    return res.status(400).json({
      success: false,
      message:
        '缺少 transactionId、fileName、fileType、iv 或 ciphertext'
    });
  }

  if (!['data', 'weight'].includes(fileType)) {
    return res.status(400).json({
      success: false,
      message: 'fileType 只能是 data 或 weight'
    });
  }

  try {
    const job = await getDeliveryJob(transactionId);

    if (!job || !job.vm_id) {
      return res.status(404).json({
        success: false,
        message: '未找到有效虚机任务'
      });
    }

    if (job.key2_status !== 'READY') {
      return res.status(409).json({
        success: false,
        message: '数据计算密钥尚未准备完成'
      });
    }

    await updateJob(transactionId, {
      data_status: 'UPLOADING',
      step:
        fileType === 'data'
          ? 'DATA_FILE_UPLOADING'
          : 'WEIGHT_FILE_UPLOADING',
      last_error: null
    });

    const remoteResult =
      await uploadEncryptedFileRemote({
        vmId: job.vm_id,
        fileName,
        fileType,
        iv,
        ciphertext
      });

    const remoteData =
      remoteResult.data || remoteResult;

    const updateFields = {
      data_status:
        remoteData.computed === true
          ? 'COMPUTED'
          : 'WAITING_COUNTERPART',

      step:
        remoteData.computed === true
          ? 'RESULT_READY'
          : fileType === 'data'
            ? 'WAITING_WEIGHT_FILE'
            : 'WAITING_DATA_FILE'
    };

    if (fileType === 'data') {
      updateFields.data_file_status = 'RECEIVED';
    } else {
      updateFields.weight_file_status = 'RECEIVED';
    }

    if (remoteData.computed === true) {
      updateFields.result_status = 'READY';
    }

    await updateJob(
      transactionId,
      updateFields
    );

    return res.json({
      success: true,
      message:
        remoteData.message ||
        `${fileType}文件接收成功`,
      transactionId,
      vmId: job.vm_id,
      fileType,
      remoteResult
    });
  } catch (err) {
    console.error('[file-upload] error:', err);

    await updateJob(transactionId, {
      data_status: 'FAILED',
      step: 'FILE_UPLOAD_FAILED',
      last_error: err.message
    }).catch(() => {});

    return res.status(500).json({
      success: false,
      message: err.message || '加密文件上传失败'
    });
  }
});
async function getEncryptedResultRemote(vmId){
  const response = await axios.post(
    `${CSV_ENGINE_BASE_URL}/api/get-result`,
    {
      vmId:String(vmId)
    },
    {
      headers:{
        'Content-Type':'application/json'
      },
      timeout:120000,
      validateStatus:()=>true
    }
  );
  const data=response.data;
  console.log('[get-result响应]');
  console.log(data);
  if(
    !data ||
    data.code !== 200
  ){
    throw new Error(
      `获取加密结果失败:${JSON.stringify(data)}`
    );
  }
  return data;
}

app.post('/api/delivery/result', async (req,res)=>{
  const {
    transactionId
  }=req.body;
  if(!transactionId){
    return res.status(400).json({
      success:false,
      message:'缺少 transactionId'
    });
  }
  try{
    const job=await getDeliveryJob(transactionId);
    if(!job || !job.vm_id){
      return res.status(404).json({
        success:false,
        message:'未找到有效虚机任务'
      });
    }
    await updateJob(transactionId,{
      result_status:'FETCHING',
      step:'RESULT_FETCHING',
      last_error:null
    });
    const remoteResult =
      await getEncryptedResultRemote(
        job.vm_id
      );
    const encryptedResult={
      iv:remoteResult.iv,
      ciphertext:remoteResult.ciphertext,
      seq:remoteResult.seq
    };
    if(
      !encryptedResult.iv ||
      !encryptedResult.ciphertext
    ){
      throw new Error(
        `结果接口缺少iv或ciphertext:${JSON.stringify(remoteResult)}`
      );
    }
    await updateJob(transactionId,{
      result_status:'ENCRYPTED_RESULT_READY',
      encrypted_result:
        JSON.stringify(encryptedResult),
      step:'WAITING_BUYER_RESULT_DECRYPT'
    });
    return res.json({
      success:true,
      message:'加密计算结果获取成功',
      transactionId,
      vmId:job.vm_id,
      encryptedResult
    });
  }catch(err){
    console.error(
      '[get-result] error:',
      err
    );
    await updateJob(transactionId,{
      result_status:'FAILED',
      step:'RESULT_FETCH_FAILED',
      last_error:err.message
    }).catch(()=>{});
    return res.status(500).json({
      success:false,
      message:
        err.message ||
        '获取计算结果失败'
    });
  }
});

app.post('/api/digital-contract/verify', async (req, res) => {
  try {
    const {
      transactionId,
      vmId,
      fileHash,
      deliveredCnt = '0',
      deliveryCnt = '2000',
      expireTime,
      verify_payload,
      verifyPayload
    } = req.body || {};

    const policyPayload = verify_payload || verifyPayload || {};
    const finalFileHash = fileHash || policyPayload.fileHash;
    const finalDeliveryCnt =
      deliveryCnt || policyPayload.delivery_cnt || policyPayload.deliveryCnt || '2000';
    const finalExpireTime =
      expireTime || policyPayload.timestamp || policyPayload.expireTime;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: '缺少 transactionId'
      });
    }

    if (!fileHash) {
      return res.status(400).json({
        success: false,
        message: '缺少 fileHash'
      });
    }

    const finalVmId = vmId || `vm-tx-${transactionId}`;

    const pubKey = (await fs.readFile(KEY_FILE_PATH, 'utf8')).trim();

    const keyResp = await axios.post(
      `${DIGITAL_CONTRACT_BASE_URL}/receive-key`,
      {
        vmId: finalVmId,

        // 两个都传，兼容文档里的 key 和示例里的 ecPublicKey
        key: pubKey,
        ecPublicKey: pubKey
      },
      {
        timeout: 60000,
        validateStatus: () => true
      }
    );

    if (
      keyResp.status !== 200 ||
      !(keyResp.data?.code === 200 || keyResp.data?.status === 'ok')
    ) {
      return res.status(502).json({
        success: false,
        message: 'receive-key 调用失败',
        remoteStatus: keyResp.status,
        remote: keyResp.data
      });
    }

    const plain = await decryptReceiveKeyResp(
      keyResp.data,
      PRIVATE_KEY_PATH
    );

    const sm4Key = extractSm4Key(plain);

    if (!sm4Key || sm4Key.length !== 16) {
      return res.status(500).json({
        success: false,
        message: 'SM4 密钥解析失败',
        plainLength: plain.length
      });
    }

    const plainContract = {
      delivery_cnt: String(deliveryCnt),
      fileHash: String(fileHash),
      timestamp:
        expireTime ||
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    const allowedVerifyPolicyKeys = [
      'actions',
      'control_time',
      'control_time_window',
      'control_count',
      'control_frequency',
      'control_region',
      'control_network_address',
      'control_provider_node_id',
      'control_consumer_node_id',
      'control_data_status',
      'control_data_size',
      'control_distribution_data_size',
      'control_data_field',
      'control_execution_env',
      'control_algorithm',
      'control_machine_learning_models',
      'control_application',
      'action_transform',
      'action_anonymize',
      'action_desensitize',
      'action_encrypt',
      'action_access',
      'action_read',
      'action_reproduce',
      'action_download',
      'action_compute',
      'action_process',
      'action_joint_develop',
      'action_distribute',
      'action_policy_transmit',
      'action_sell',
      'action_delete',
      'action_result_download',
      'action_log_record_send',
      'action_use_notify',
      'action_expansion_item'
    ];

    if (policyPayload && typeof policyPayload === 'object') {
      allowedVerifyPolicyKeys.forEach((key) => {
        const value = policyPayload[key];
        if (value !== undefined && value !== null && value !== '') {
          plainContract[key] = value;
        }
      });
    }
    
    const sharedIv = crypto.randomBytes(16).toString('base64');

    const encContract = await sm4CbcEncryptCompat(
      sm4Key,
      JSON.stringify(plainContract),
      {
        ivB64: sharedIv,
        padding: 'pkcs7',
        useOpenSSL: true,
        canonicalizeJson: true,
        appendLF: false
      }
    );

    const encDeliveredCnt = await sm4CbcEncryptCompat(
      sm4Key,
      String(deliveredCnt),
      {
        ivB64: sharedIv,
        padding: 'pkcs7',
        useOpenSSL: true,
        appendLF: false
      }
    );

    const jsonResp = await axios.post(
      `${DIGITAL_CONTRACT_BASE_URL}/receive-json`,
      {
        vmId: finalVmId,
        iv: sharedIv,
        deliveried_cnt: encDeliveredCnt.ciphertext,
        ciphertext: encContract.ciphertext
      },
      {
        timeout: 60000,
        validateStatus: () => true
      }
    );

    if (jsonResp.status === 200 && jsonResp.data?.code === 200) {
      return res.json({
        success: true,
        message: '数字合约校验通过',
        vmId: finalVmId,
        transactionId,
        plainContract,
        remote: jsonResp.data
      });
    }

    return res.status(400).json({
      success: false,
      message: '数字合约校验失败',
      vmId: finalVmId,
      transactionId,
      plainContract,
      remoteStatus: jsonResp.status,
      remote: jsonResp.data
    });

  } catch (err) {
    console.error('[digital-contract/verify] error:', err);

    return res.status(500).json({
      success: false,
      message: '数字合约校验异常',
      error: err.message
    });
  }
});


function vmHeaders() {
  return {
    Authorization: `Bearer ${VM_TOKEN}`,
    'Content-Type': 'application/json',
    'X-Request-Id': `req-${Date.now()}`,
    timestamp: String(Date.now())
  };
}

async function updateJob(transactionId, fields) {
  const keys = Object.keys(fields);

  const sql = `
    UPDATE delivery_secure_jobs
    SET ${keys.map(k => `${k} = ?`).join(', ')}
    WHERE transaction_id = ?
  `;

  await dbQuery(sql, [
    ...keys.map(k => fields[k]),
    transactionId
  ]);
}

function generateEcKeyPairPem() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });

  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
}

async function negotiateKey(vmId, purpose) {
  const { publicKeyPem, privateKeyPem } = generateEcKeyPairPem();

  const response = await axios.post(
    `${VM_SERVICE_BASE_URL}/receive-key`,
    {
      vmId,
      ecPublicKey: publicKeyPem
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
      validateStatus: () => true
    }
  );

  if (response.status !== 200 || response.data?.code !== 200) {
    throw new Error(`${purpose} 密钥协商失败：${JSON.stringify(response.data)}`);
  }

  return {
    purpose,
    publicKeyPem,
    privateKeyPem,
    encryptedKeyMaterial: response.data
  };
}

async function createVm({
  cpu = 4,
  memoryMb = 4096
}) {
  const response = await axios.post(
    `${VM_HOST_BASE_URL}/api/v2/vms`,
    {
      cpu: String(cpu),
      memoryMb: String(memoryMb)
    },
    {
      headers: vmHeaders(),
      timeout:10 * 60 * 1000,
      validateStatus:()=>true
    }
  );
  if(
    !response.data?.success ||
    !response.data?.vmId
  ){

    throw new Error(
      `虚机创建失败:${JSON.stringify(response.data)}`
    );
  }
  return response.data;
}

async function startVm(vmId) {
  const response = await axios.post(
    `${VM_HOST_BASE_URL}/api/v2/vms/${vmId}/start`,
    {},
    {
      headers: vmHeaders(),
      timeout: 5 * 60 * 1000,
      validateStatus: () => true
    }
  );

  if (!response.data?.success) {
    throw new Error(`虚机启动失败：${JSON.stringify(response.data)}`);
  }

  return response.data;
}

app.post('/api/delivery/request-secure', async (req, res) => {
  const {
    transactionId,
    buyerAddress,
    sellerAddress,
    assetId,
    vmCpu,
    vmMemoryMb
  } = req.body;

  if (!transactionId) {
    return res.status(400).json({
      success: false,
      message: '缺少 transactionId'
    });
  }

  try {
    await dbQuery(
      `
      INSERT INTO delivery_secure_jobs (
        transaction_id,
        buyer_address,
        seller_address,
        asset_id,
        vm_cpu,
        vm_memory_mb,
        status,
        step
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'BUYER_REQUESTED')
      ON DUPLICATE KEY UPDATE
        buyer_address = VALUES(buyer_address),
        seller_address = VALUES(seller_address),
        asset_id = VALUES(asset_id),
        vm_cpu = VALUES(vm_cpu),
        vm_memory_mb = VALUES(vm_memory_mb),
        status = 'PENDING',
        step = 'BUYER_REQUESTED',
        last_error = NULL
      `,
      [
        transactionId,
        buyerAddress || null,
        sellerAddress || null,
        assetId || null,
        vmCpu || 4,
        vmMemoryMb || 4096
      ]
    );
await db.query(
`
UPDATE transactions
SET delivery_request_status='pending'
WHERE transaction_id=?
`,
[
 transactionId
]);
    return res.json({
      success: true,
      message: '交付申请已提交'
    });
  } catch (err) {
    console.error('[request-secure] error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '交付申请失败'
    });
  }
});

/*app.post('/api/delivery/secure-confirm', async (req, res) => {
  const { transactionId } = req.body;

  if (!transactionId) {
    return res.status(400).json({
      success: false,
      message: '缺少 transactionId'
    });
  }

  try {
    const results = await dbQuery(
      `
      SELECT *
      FROM delivery_secure_jobs
      WHERE transaction_id = ?
      LIMIT 1
      `,
      [transactionId]
    );

    const job = results[0];

    if (!job) {
      return res.status(404).json({
        success: false,
        message: '未找到买家交付申请'
      });
    }


    await updateJob(transactionId, {
      key0_status: 'READY',
      step: 'VM_CREATING'
    });

    const createResult = await createVm({
      cpu: job.vm_cpu || 4,
      memoryMb: job.vm_memory_mb || 4096
    });

    const vmId = createResult.vmId;

    await updateJob(transactionId, {
      vm_id: vmId,
      vm_status: createResult.status || 'created',
      step: 'VM_STARTING'
    });

    const startResult = await startVm(vmId);

    await updateJob(transactionId, {
      vm_status: startResult.status || 'running',
      qemu_pid: startResult.qemu_pid || startResult.qemuPid || null,
      step: 'KEY_1_NEGOTIATING'
    });

    const key1 = await negotiateKey(vmId, 'KEY_1_CONTRACT');

    await updateJob(transactionId, {
      key1_status: 'READY',
      step: 'KEY_2_NEGOTIATING'
    });

    const key2 = await negotiateKey(vmId, 'KEY_2_DATA_WEIGHT');

    await updateJob(transactionId, {
      key2_status: 'READY',
      status: 'VM_RUNNING_WAITING_FILES',
      step: 'WAITING_CONTRACT_AND_FILES'
    });

    return res.json({
      success: true,
      message: '虚机已创建并启动，密钥0/1/2已完成协商',
      transactionId,
      vmId,
      status: 'VM_RUNNING_WAITING_FILES',
      createResult,
      startResult,
      key0: key0.encryptedKeyMaterial,
      key1: key1.encryptedKeyMaterial,
      key2: key2.encryptedKeyMaterial
    });
  } catch (err) {
    console.error('[secure-confirm] error:', err);

    await updateJob(transactionId, {
      status: 'FAILED',
      step: 'FAILED',
      last_error: err.message
    }).catch(() => {});

    return res.status(500).json({
      success: false,
      message: err.message || '安全交付流程失败'
    });
  }
});*/
app.post('/api/delivery/secure-confirm', async (req, res) => {

  const { transactionId } = req.body;


  if (!transactionId) {

    return res.status(400).json({
      success:false,
      message:'缺少 transactionId'
    });

  }


  try {


    // 查询交付任务
    const results = await dbQuery(
      `
      SELECT *
      FROM delivery_secure_jobs
      WHERE transaction_id = ?
      LIMIT 1
      `,
      [transactionId]
    );


    const job = results[0];


    if (!job) {

      return res.status(404).json({

        success:false,

        message:'未找到买家交付申请'

      });

    }


/*if(job.vm_id&&String(job.vm_status).toLowerCase()==='running'&&job.status!=='COMPLETED'){
return res.json({
success:true,
message:'虚机已存在，继续当前交付流程',
transactionId,
vmId:job.vm_id,
status:job.status,
step:job.step,
vmStatus:job.vm_status,
resume:true
});
}*/
    /*
     * =====================
     * 1. 创建虚机
     * =====================
     */


    await updateJob(transactionId, {

      status:'RUNNING',

      step:'VM_CREATING',

      last_error:null

    });



    const createResult = await createVm({

      cpu: job.vm_cpu || 4,

      memoryMb: job.vm_memory_mb || 4096

    });



    const vmId = createResult.vmId;



    await updateJob(transactionId, {


      vm_id: vmId,


      vm_status:
        createResult.status || 'created',


      step:'VM_STARTING'


    });




    /*
     * =====================
     * 2. 启动虚机
     * =====================
     */


    const startResult = await startVm(vmId);



    await updateJob(transactionId, {


      vm_status:
        startResult.status || 'running',


      status:
        'VM_RUNNING',


      step:
        'VM_STARTED'


    });




    return res.json({

      success:true,


      message:
      '虚机创建并启动成功',


      transactionId,


      vmId,


      status:
      'VM_RUNNING',


      createResult,


      startResult


    });



  } catch(err) {


    console.error(
      '[secure-confirm error]',
      err
    );



    await updateJob(transactionId, {


      status:'FAILED',


      step:'FAILED',


      last_error:
      err.message


    }).catch(()=>{});




    return res.status(500).json({

      success:false,


      message:
      err.message || '虚机创建启动失败'

    });


  }


});


app.post('/api/delivery/test-start-vm', async (req, res) => {

  const {
    vmId
  } = req.body;


  if (!vmId) {

    return res.status(400).json({

      success:false,

      message:'缺少 vmId'

    });

  }


  try {


    console.log(
      '[test-start-vm] 开始启动虚机:',
      vmId
    );



    /*
     * 调用虚机服务启动接口
     */
    const startResult = await startVm(vmId);



    console.log(
      '[test-start-vm] 启动结果:',
      startResult
    );



    return res.json({

      success:true,

      message:'虚机启动成功',

      vmId,

      status:
        startResult.status || 'running',

      startResult

    });



  } catch(err) {


    console.error(
      '[test-start-vm error]',
      err
    );



    return res.status(500).json({

      success:false,

      message:
        err.message || '虚机启动失败'

    });


  }


});


const OMNIPRINT_BASE = {
  text: 'http://10.112.191.163:8110',
  image: 'http://10.112.191.163:8111',
  audio: 'http://10.112.191.163:8112',
  video: 'http://10.112.191.163:8113'
};

function detectOmniPrintType(file) {
  const mime = file.mimetype || '';
  const name = file.originalname || '';

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';

  if (/\.(png|jpg|jpeg|bmp|webp)$/i.test(name)) return 'image';
  if (/\.(mp3|wav|flac|m4a)$/i.test(name)) return 'audio';
  if (/\.(mp4|avi|mov|mkv)$/i.test(name)) return 'video';

  return 'text';
}

app.post('/api/omniprint/fingerprint', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '缺少文件'
      });
    }

    const assetId = req.body.assetId || `asset-${Date.now()}`;
    const type = detectOmniPrintType(req.file);

    let payload = {
      asset_id: assetId,
      save_output: false
    };

    let tempPath = '';

    if (type === 'text') {
      payload.text = req.file.buffer.toString('utf8');
    } else {
      const uploadDir = '/tmp/omniprint_uploads';
      await fs.mkdir(uploadDir, { recursive: true });

      tempPath = path.join(
        uploadDir,
        `${Date.now()}_${req.file.originalname}`
      );

      await fs.writeFile(tempPath, req.file.buffer);

      if (type === 'image') payload.image_path = tempPath;
      if (type === 'audio') payload.audio_path = tempPath;
      if (type === 'video') payload.video_path = tempPath;
    }

    const remoteResp = await axios.post(
      `${OMNIPRINT_BASE[type]}/fingerprint`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000,
        validateStatus: () => true
      }
    );

    if (tempPath) {
      fs.unlink(tempPath).catch(() => {});
    }

    if (remoteResp.status === 409) {
      return res.status(409).json({
        success: false,
        message: '发现相似资产，未生成新数字指纹',
        similarAssets: remoteResp.data
      });
    }

    if (remoteResp.status < 200 || remoteResp.status >= 300) {
      return res.status(remoteResp.status).json({
        success: false,
        message: 'OmniPrint 指纹生成失败',
        remote: remoteResp.data
      });
    }

    return res.json({
      success: true,
      type,
      fingerprint: remoteResp.data.fingerprint,
      fingerprint_bits: remoteResp.data.fingerprint_bits,
      raw: remoteResp.data
    });

  } catch (err) {
    console.error('[omniprint/fingerprint] error:', err);
    return res.status(500).json({
      success: false,
      message: 'OmniPrint 服务异常',
      error: err.message
    });
  }
});

// Informational only: compare a newly generated raw OmniPrint fingerprint with
// all stored fingerprints of the same modality/bit length.  It never blocks
// asset registration.
app.post('/api/omniprint/similarity-check', async (req, res) => {
  const fingerprint = String(req.body?.fingerprint || '').trim();
  const fingerprintBits = Number(req.body?.fingerprint_bits);
  const modality = String(req.body?.modality || '').trim();
  if (!fingerprint || !Number.isInteger(fingerprintBits) || !['text', 'image', 'audio', 'video'].includes(modality)) {
    return res.status(400).json({ success: false, message: '缺少有效的原始指纹、位数或模态' });
  }
  try {
    const candidates = await new Promise((resolve, reject) => db.query(
      `SELECT file_hash, asset_name, omniprint_fingerprint, omniprint_source
       FROM asset_registrations
       WHERE omniprint_modality = ? AND omniprint_fingerprint_bits = ?
         AND omniprint_fingerprint IS NOT NULL AND omniprint_fingerprint <> ''`,
      [modality, fingerprintBits],
      (error, rows) => error ? reject(error) : resolve(rows)
    ));
    const comparisons = await Promise.all(candidates.map(async (asset) => {
      const response = await axios.post(`${OMNIPRINT_BASE[modality]}/compare`, {
        fingerprint_a: fingerprint, fingerprint_b: asset.omniprint_fingerprint,
        fingerprint_bits: fingerprintBits, asset_id_b: asset.file_hash
      }, { timeout: 15000 });
      return { file_hash: asset.file_hash, asset_name: asset.asset_name, source: asset.omniprint_source, ...response.data };
    }));
    comparisons.sort((a, b) => b.bit_similarity - a.bit_similarity);
    res.json({ success: true, comparedCount: comparisons.length, matches: comparisons });
  } catch (error) {
    res.status(502).json({ success: false, message: 'OmniPrint 相似度检测失败', error: error.message });
  }
});


app.post('/api/summary-records/combined/:kind/:method', async (req, res) => {
  try {
    const { kind, method } = req.params;

    const allowedClassification = [
      'type',
      'income',
      'liquidity',
      'value-stability'
    ];

    const allowedGrading = [
      'harm',
      'security',
      'sensitivity',
      'vulnerability'
    ];

    if (!['classification', 'grading'].includes(kind)) {
      return res.status(400).json({
        success: false,
        message: 'kind 参数无效'
      });
    }

    if (kind === 'classification' && !allowedClassification.includes(method)) {
      return res.status(400).json({
        success: false,
        message: '分类方法无效'
      });
    }

    if (kind === 'grading' && !allowedGrading.includes(method)) {
      return res.status(400).json({
        success: false,
        message: '分级方法无效'
      });
    }

    if (!Array.isArray(req.body.records) || req.body.records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'records 不能为空'
      });
    }

    const targetUrl =
      `${SUMMARY_API_BASE}/api/summary-records/combined/${kind}/${method}`;

    const remoteResp = await axios.post(
      targetUrl,
      req.body,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000,
        validateStatus: () => true
      }
    );

    return res.status(remoteResp.status).json(remoteResp.data);
  } catch (err) {
    console.error('[summary-records/combined] error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'summary-records 服务异常'
    });
  }
});

app.post('/api/save-default-cert', (req, res) => {
  const {
    userId,
    defaultRegisterCert,
    defaultTradeCert
  } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: '缺少 userId'
    });
  }

  const sql = `
    UPDATE users
    SET default_register_cert = ?,
        default_trade_cert = ?
    WHERE id = ?
  `;

  db.query(
    sql,
    [
      defaultRegisterCert || null,
      defaultTradeCert || null,
      userId
    ],
    (err, result) => {
      if (err) {
        console.error('保存默认证书失败:', err);
        return res.status(500).json({
          success: false,
          message: '保存默认证书失败',
          error: err.message
        });
      }

      return res.json({
        success: true,
        message: '默认证书保存成功'
      });
    }
  );
});

app.get('/api/default-cert', (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: '缺少 userId'
    });
  }

  const sql = `
    SELECT default_register_cert,
           default_trade_cert
    FROM users
    WHERE id = ?
    LIMIT 1
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error('查询默认证书失败:', err);
      return res.status(500).json({
        success: false,
        message: '查询默认证书失败',
        error: err.message
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    return res.json({
      success: true,
      default_register_cert: rows[0].default_register_cert || '',
      default_trade_cert: rows[0].default_trade_cert || ''
    });
  });
});

app.get('/api/user-profile', (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ success: false, message: '缺少 userId' });
    }

    db.query(
        `SELECT id, username, email, phone_number, address, balance, usertype, created_at,
                default_register_cert, default_trade_cert
         FROM users WHERE id = ? LIMIT 1`,
        [userId],
        (err, rows) => {
            if (err) {
                console.error('查询个人资料失败:', err);
                return res.status(500).json({ success: false, message: '查询个人资料失败' });
            }
            if (!rows || rows.length === 0) {
                return res.status(404).json({ success: false, message: '用户不存在' });
            }

            const profile = rows[0];
            db.query(
                `SELECT
                    (SELECT COUNT(*) FROM asset_registrations WHERE user_id = ?) AS asset_count,
                    (SELECT COUNT(*) FROM certificate_registry WHERE user_id = ?) AS certificate_count,
                    (SELECT COUNT(*) FROM transactions t
                      WHERE t.status = '待确认' AND t.is_deleted = 0
                        AND t.seller_address IN (
                          SELECT address FROM certificate_registry
                          WHERE user_id = ? AND address IS NOT NULL
                        )) AS pending_seller_count,
                    (SELECT COUNT(*) FROM transactions t
                      WHERE t.status = '已确认'
                        AND (t.seller_address IN (
                          SELECT address FROM certificate_registry
                          WHERE user_id = ? AND address IS NOT NULL
                        ) OR t.buyer_address IN (
                          SELECT address FROM certificate_registry
                          WHERE user_id = ? AND address IS NOT NULL
                        ))) AS order_count`,
                [userId, userId, userId, userId, userId],
                (statErr, statRows) => {
                    if (statErr) {
                        console.error('查询个人统计失败:', statErr);
                        return res.json({ success: true, profile, stats: {} });
                    }
                    return res.json({ success: true, profile, stats: statRows[0] || {} });
                }
            );
        }
    );
});

app.get('/api/user-certificates', (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: '缺少 userId'
    });
  }

  const sql = `
    SELECT
      certificate_name AS cert,
      org AS organization,
      address,
      sign_cert_path,
      tls_cert_path,
      pem_path,
      expires_at,
      created_at
    FROM certificate_registry
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error('查询用户证书失败:', err);
      return res.status(500).json({
        success: false,
        message: '查询用户证书失败',
        error: err.message
      });
    }

    return res.json({
      success: true,
      certificates: rows || []
    });
  });
});

// 查询默认上链证书完整信息
app.get('/api/default-register-cert-info', (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: '缺少 userId'
    });
  }

  const userSql = `
    SELECT default_register_cert
    FROM users
    WHERE id = ?
    LIMIT 1
  `;

  db.query(userSql, [userId], (err, userRows) => {
    if (err) {
      console.error('查询默认上链证书失败:', err);
      return res.status(500).json({
        success: false,
        message: '查询默认上链证书失败',
        error: err.message
      });
    }

    getDefaultRegisterCertInfoByUserId(userId)
      .then((cert) => {
        return res.json({
          success: true,
          cert
        });
      })
      .catch((certErr) => {
        const message = certErr.message || '查询上链证书详情失败';
        const status = message.includes('不存在') ? 404 : 400;

        console.error('查询上链证书详情失败:', certErr);
        return res.status(status).json({
          success: false,
          message,
          error: certErr.message
        });
      });
  });
});

app.post('/api/datacatalog/publish-asset', async (req, res) => {
  const {
    identifier,
    assetName,
    description,
    assetType,
    userId,
    certOrg
  } = req.body || {};

  if (!DATA_CATALOG_ENABLED) {
    log.info('datacatalog publish skipped (disabled)', { identifier, assetName });
    return res.status(200).json({
      success: false,
      disabled: true,
      message: '目录发布已临时停用（优先保证上链登记），如需开启请设置 DATA_CATALOG_ENABLED=1'
    });
  }

  if (!identifier) {
    return res.status(400).json({
      success: false,
      message: '缺少 identifier'
    });
  }

  if (!assetName) {
    return res.status(400).json({
      success: false,
      message: '缺少 assetName'
    });
  }

  try {
    let resolvedOrgId = certOrg || null;
    const catalogKey = buildDataCatalogKey(identifier);

    if (!resolvedOrgId && userId) {
      const certInfo = await getDefaultRegisterCertInfoByUserId(userId);
      resolvedOrgId = certInfo.org || null;
    }

    if (!resolvedOrgId) {
      throw new Error('无法确定目录发布使用的组织信息');
    }

    const payload = {
      id: catalogKey,
      code: catalogKey,
      name: assetName,
      remark: description || assetName,
      orgId: resolvedOrgId,
      orgDID: DATA_CATALOG_ORG_DID,
      version: 1,
      dataVersion: '1',
      status: 1,
      asseType: assetType || '',
      platform_name: DATA_CATALOG_PLATFORM_NAME,
      platform_DID: DATA_CATALOG_PLATFORM_DID,
      platform_url: DATA_CATALOG_PLATFORM_URL,
      chain_type: 'Chainmaker'
    };

    const response = await axios.post(
      `${DATA_CATALOG_BASE_URL}/contract/datacatalog/publish`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
        validateStatus: () => true
      }
    );

    if (response.status < 200 || response.status >= 300 || response.data?.bizCode !== 'SUCCESS') {
      return res.status(response.status >= 400 ? response.status : 502).json({
        success: false,
        message: response.data?.message || '目录发布失败',
        bizCode: response.data?.bizCode || 'CATALOG_PUBLISH_FAILED',
        payload,
        upstream: response.data || null
      });
    }

    return res.json({
      success: true,
      message: '目录发布成功',
      sourceIdentifier: identifier,
      catalogIdentifier: catalogKey,
      payload,
      result: response.data
    });
  } catch (err) {
    console.error('[datacatalog/publish-asset] error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || '目录发布失败'
    });
  }
});


// 查询默认交易证书完整信息
app.get('/api/default-trade-cert-info', (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: '缺少 userId'
    });
  }

  const userSql = `
    SELECT default_trade_cert
    FROM users
    WHERE id = ?
    LIMIT 1
  `;

  db.query(userSql, [userId], (err, userRows) => {
    if (err) {
      console.error('查询默认交易证书失败:', err);
      return res.status(500).json({
        success: false,
        message: '查询默认交易证书失败',
        error: err.message
      });
    }

    const certName = userRows?.[0]?.default_trade_cert;

    if (!certName) {
      return res.status(400).json({
        success: false,
        message: '未设置交易默认证书，请先到个人中心设置'
      });
    }

    const certSql = `
      SELECT
        certificate_name,
        org,
        address,
        sign_cert_path,
        tls_cert_path,
        pem_path,
        expires_at
      FROM certificate_registry
      WHERE user_id = ?
        AND certificate_name = ?
      LIMIT 1
    `;

    db.query(certSql, [userId, certName], (certErr, certRows) => {
      if (certErr) {
        console.error('查询交易证书详情失败:', certErr);
        return res.status(500).json({
          success: false,
          message: '查询交易证书详情失败',
          error: certErr.message
        });
      }

      if (!certRows || certRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '交易默认证书不存在或不属于当前用户'
        });
      }

      return res.json({
        success: true,
        cert: certRows[0]
      });
    });
  });
});

/*app.get('/api/industry-transaction-stats', (req, res) => {
  const sql = `
    SELECT
      COALESCE(NULLIF(industry_raw_name, '')) AS industryName,
      COUNT(*) AS count
    FROM asset_registrations
    GROUP BY COALESCE(NULLIF(industry_raw_name, ''))
    ORDER BY count DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('获取领域交易数量失败:', err);
      return res.status(500).json({
        success: false,
        message: '获取领域交易数量失败'
      });
    }

    return res.json({
      success: true,
      data: results
    });
  });
});*/

app.get('/api/industry-transaction-stats', (req, res) => {
  const sql = `
    SELECT
      CASE
        WHEN industry_raw_name LIKE '文化、体育和娱乐业%' THEN '文化、体育和娱乐业'
        WHEN industry_raw_name LIKE '电力、热力、燃气及水生产和供应业%' THEN '电力、热力、燃气及水生产和供应业'
        WHEN industry_raw_name LIKE '交通运输、仓储和邮政业%' THEN '交通运输、仓储和邮政业'
        WHEN industry_raw_name LIKE '卫生和社会工作%' THEN '卫生和社会工作'
        WHEN industry_raw_name LIKE '金融业%' THEN '金融业'
        WHEN industry_raw_name LIKE '信息传输、软件和信息技术服务业%' THEN '信息传输、软件和信息技术服务业'
        WHEN industry_raw_name LIKE '农、林、牧、渔业%' THEN '农、林、牧、渔业'
        WHEN industry_raw_name LIKE '碳证交易%' THEN '碳证交易'
        WHEN industry_raw_name LIKE '征信%' THEN '征信'
        WHEN industry_raw_name LIKE '数字版权%' THEN '数字版权'
        WHEN industry_raw_name LIKE '自动驾驶%' THEN '自动驾驶'
        WHEN industry_raw_name LIKE '车联网%' THEN '车联网'
        WHEN industry_raw_name LIKE '法律%' THEN '法律'
        ELSE industry_raw_name
      END AS industryName,
      COUNT(*) AS count
    FROM asset_registrations
    WHERE industry_raw_name IS NOT NULL
      AND industry_raw_name <> ''
      AND industry_raw_name <> '未分类'
    GROUP BY industryName
    ORDER BY count DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('获取领域交易数量失败:', err);
      return res.status(500).json({
        success: false,
        message: '获取领域交易数量失败'
      });
    }

    return res.json({
      success: true,
      data: results
    });
  });
});
  // 定义定时任务，每天检查一次过期代币
cron.schedule('0 0 * * *', () => {
  console.log('开始检查过期代币...');
  
  // 查询所有未销毁的代币及其到期时间
  const query = 'SELECT transaction_id, asset_id, expiration_time, buyer_address FROM transactions WHERE status = "已确认"';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('查询过期代币失败:', err);
      return;
    }
    
    const now = new Date();
    
    results.forEach((transaction) => {
      const expirationTime = new Date(transaction.expiration_time);
      
      // 如果代币已经过期
      if (expirationTime < now) {
        // 调用智能合约销毁代币
        burnToken(transaction.buyer_address, transaction.asset_id)
          .then(() => {
            // 更新交易状态为已销毁
            const updateQuery = 'UPDATE transactions SET status = "已销毁" WHERE transaction_id = ?';
            db.query(updateQuery, [transaction.transaction_id], (updateErr) => {
              if (updateErr) {
                console.error('更新交易状态失败:', updateErr);
              } else {
                console.log(`代币 ${transaction.token_id} 已销毁`);
              }
            });
          })
          .catch((error) => {
            console.error(`销毁代币 ${transaction.token_id} 失败:`, error);
          });
      }
    });
  });
});

// 调用智能合约销毁代币
async function burnToken(ownerId, tokenId) {
  const params = {
    owner: ownerId,
    tokenID: tokenId,
  };

  try {
    const response = await axios.post('http://10.112.191.163:8009/pre/BurnToken', params);
    if (response.status === 200) {
      console.log(`代币 ${tokenId} 销毁成功`);
    } else {
      throw new Error(`代币销毁失败，返回: ${response.data}`);
    }
  } catch (error) {
    console.error(`调用智能合约销毁代币失败: ${error.message}`);
    throw error;
  }
}

// ====== 统一错误处理（必须放在所有路由之后）======
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
  log.error('unhandled route error', {
    err,
    method: req.method,
    url: req.originalUrl,
    status: err.status || err.statusCode || 500
  });
  if (res.headersSent) return next(err);
  res.status(err.status || err.statusCode || 500).json({ error: '服务器内部错误' });
});
