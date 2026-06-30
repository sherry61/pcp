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


// ====== 基础实例与常量（确保在后面使用之前就定义好）======
const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
const secretKey = process.env.JWT_SECRET || '123456'; // 你原来用到的 JWT 密钥，别漏了

// multer（下面很多路由会用到）
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 远端地址与证书路径（尽量都集中在上面）
const REMOTE_EXPORT_URL = 'http://10.112.14.6:8083/api/export-result'
const REMOTE_JSON_URL  = process.env.REMOTE_JSON_URL  || 'http://10.112.14.6:8081/api/recv-json';
const REMOTE_FILE_URL  = process.env.REMOTE_FILE_URL  || 'http://10.112.14.6:8082/api/recv-file';
const REMOTE_KEY_URL   = process.env.REMOTE_KEY_URL   || 'http://10.112.14.6:8080/api/receive-key';
const KEY_FILE_PATH    = process.env.PUBLIC_KEY_PATH  || '/home/super/r/cert/client3/client3.pem';
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH || '/home/super/r/cert/client3/client3.sign.key';
const EXPORT_DIR = process.env.EXPORT_DIR || '/home/super/r/20251028test';
const REMOTE_PRE_BASE_URL = process.env.REMOTE_PRE_BASE_URL || 'http://10.112.47.214:8123/pre';
const PRE_PYTHON_BIN = process.env.PRE_PYTHON_BIN || 'python3';
const PRE_HELPER_DIR = process.env.PRE_HELPER_DIR || '/home/super/r/localdata/pre_helpers';
const REMOTE_FL_BASE_URL =
  process.env.REMOTE_FL_BASE_URL || 'http://10.112.47.214:8000/federate/task';

const FL_MODEL_DIR =
  process.env.FL_MODEL_DIR || '/home/super/r/localdata/fl_models';
const ASSET_ANALYSIS_BASE_URL =
  process.env.ASSET_ANALYSIS_BASE_URL || 'http://10.112.47.214:8003';
const PRE_UPLOAD_DIR = process.env.PRE_UPLOAD_DIR || '/home/super/r/localdata/pre_uploads';
const DIGITAL_CONTRACT_BASE_URL =
  process.env.DIGITAL_CONTRACT_BASE_URL || 'http://10.112.14.6:18080/api';
const SUMMARY_API_BASE = 'http://10.112.47.214:8020';

 
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


// MySQL连接配置
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'r01'
});

db.connect(err => {
    if (err) {
        console.error('MySQL r01 连接失败:', err);
        return;
    }
    console.log('MySQL r01 连接成功');
    
});

// MySQL连接配置 - User Management Database
const userDb = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'user_management'
});
userDb.connect(err => {
    if (err) {
        console.error('MySQL user_management 连接失败:', err);
        return;
    }
    console.log('MySQL user_management 连接成功');
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

    userDb.query(query, (err, results) => {
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

app.post('/api/update-asset', (req, res) => {
    const { assetName, assetType, description, fileHash, email, address, userId , txperm, can_sell_asset, can_sell_view, can_sell_process} = req.body;
     console.log('Received data:', req.body); // 打印请求数据
     
    const sql = `
        UPDATE asset_registrations 
        SET asset_name = ?, asset_type = ?, description = ?, email = ?, address = ?, user_id = ? , txperm = ?, can_sell_asset = ?, can_sell_view = ?, can_sell_process = ?
        WHERE file_hash = ?
    `;

    db.query(sql, [assetName, assetType, description, email, address, userId, txperm, can_sell_asset, can_sell_view, can_sell_process, fileHash], (err, result) => {
        if (err) {
            console.error('更新资产信息失败:', err);
            res.status(500).json({ message: '更新失败，请稍后再试' });
        } else if (result.affectedRows > 0) {
            res.status(200).json({ message: '资产信息更新成功' });  // 确保返回成功的状态码
        } else {
            res.status(404).json({ message: '未找到对应的资产' });
        }
    });
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
 
    userDb.query(sql, values, (err, result) => {
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
    userDb.query(query, [username], (err, results) => {
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
    console.log(`Node.js 后端服务正在运行在 http://10.112.47.214:${port}`);
});



// 用户注册的 API 端点
app.post('/api/register', async (req, res) => {
    const { username, password, email, phoneNumber, address } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码是必填项' });
    }

    // 检查是否已经存在同名用户
    const checkUserQuery = 'SELECT * FROM users WHERE username = ?';
    userDb.query(checkUserQuery, [username], async (err, results) => {
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
        userDb.query(insertUserQuery, [username, hashedPassword, email || null, phoneNumber || null, address || null], (err, results) => {
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

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码是必填项' });
    }

    // 查找用户
    const findUserQuery = 'SELECT * FROM users WHERE username = ?';
    userDb.query(findUserQuery, [username], async (err, results) => {
        if (err) {
            console.error('数据库查询错误:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        if (results.length === 0) {
            return res.status(400).json({ error: '用户名或密码错误' });
        }

        const user = results[0];

        // 验证密码
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: '用户名或密码错误' });
        }

        // 生成 JWT 令牌
        const token = jwt.sign({ id: user.id, username: user.username }, secretKey, { expiresIn: '1h' });

        res.json({ message: '登录成功', token });
    });
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
    
    userDb.query(query, [user_id], (err, results) => {
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
    userDb.query(sql, values, (err, result) => {
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
        is_proxied, number,
        can_sell_asset, can_sell_view, can_sell_process, allow_resale,
        trade_location, trade_start_ts, trade_end_ts,
        allow_authorize, allow_supervision, model_selection
    } = req.body;

    const picture = req.file;

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
                picture, is_proxied, number,
                can_sell_asset, can_sell_view, can_sell_process, allow_resale,
                trade_location, trade_start_ts, trade_end_ts,
                allow_authorize, allow_supervision, model_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            assetName,
            assetType,
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
            asset_category || null,
            predicted_domain || null,
            picture.buffer,
            is_proxied || 0,
            number || 0,
            can_sell_asset || 0,
            can_sell_view || 0,
            can_sell_process || 0,
            allow_resale || 0,
            trade_location || null,
            trade_start_ts || null,
            trade_end_ts || null,
            allow_authorize || 0,
            allow_supervision || 0,
            model_selection || null
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
        number || 0,
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
  
    // 基础查询语句，从 resalable_assets 表中选择所有字段
    // 注意：resalable_assets 表的字段结构和 asset_registrations 一样
    let query = `
      SELECT 
        asset_name, asset_type, asset_category, email, address, description, algorithm, 
        custom_algorithm, file_hash, industry, picture, user_id, 
        owner_address, current_owner_address, agent_addr, is_proxied 
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
// 获取可交易的资产，根据传递的 industry 参数来进行过滤
app.get('/api/available-assets', (req, res) => {
  const { industry_raw_name, asset_category, asset_type } = req.query;

  let query = `
    SELECT
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
      picture,
      user_id,
      owner_address,
      current_owner_address,
      agent_addr,
      is_proxied,
      price
    FROM asset_registrations
    WHERE txperm = 3
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

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error('查询可交易资产失败:', err);
      return res.status(500).json({ error: '服务器内部错误' });
    }

    const assets = results.map(asset => {
      if (asset.picture && Buffer.isBuffer(asset.picture)) {
        asset.picture = asset.picture.toString('base64');
      } else {
        asset.picture = null;
      }
      return asset;
    });

    res.status(200).json(assets);
  });
});
  

  app.get('/api/get-asset2', (req, res) => {
    // 查询最新的一条数据，按id排序
    const query = 'SELECT asset_name, asset_type, email, address, description, algorithm, custom_algorithm, file_hash, industry, txperm, user_id, owner_address, is_proxied, number, can_sell_asset, can_sell_view, can_sell_process FROM asset_registrations';
    
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
      model_type
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



app.post('/api/add-certificate', (req, res) => {
    const { userId, certificateName, org } = req.body;

    // 检查必须参数
    if (!userId || !certificateName || !org) {
        return res.status(400).json({ message: '缺少 userId、certificateName 或 org 参数' });
    }

    // 根据 org 参数确定要操作的列名
    let certColumn;
    if (org === 'wx-org1') {
        certColumn = 'certificates';
    } else if (org === 'wx-org2') {
        certColumn = 'certificates2';
    } else {
        return res.status(400).json({ message: '未知的 org 参数' });
    }

    // 根据确定的列名查询当前证书列表
    const selectQuery = `SELECT ${certColumn} FROM users WHERE id = ?`;

    userDb.query(selectQuery, [userId], (err, results) => {
        if (err) {
            console.error('查询证书失败:', err);
            return res.status(500).json({ message: '服务器内部错误' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: '用户未找到' });
        }

        // 如果数据库中存在数据则将其转换为 JSON 数组，否则初始化为空数组
        const currentCertificates = results[0][certColumn] ? JSON.parse(results[0][certColumn]) : [];

        // 检查证书是否已存在，避免重复添加
        if (currentCertificates.includes(certificateName)) {
            return res.status(400).json({ message: '证书已存在，不能重复添加' });
        }

        // 追加新的 certificateName 到数组中
        currentCertificates.push(certificateName);

        // 动态生成 UPDATE 语句，更新对应的列
        const updateQuery = `UPDATE users SET ${certColumn} = ? WHERE id = ?`;
        userDb.query(updateQuery, [JSON.stringify(currentCertificates), userId], (err, result) => {
            if (err) {
                console.error('更新证书失败:', err);
                return res.status(500).json({ message: '服务器内部错误' });
            }

            const chainmakerDbName = CERT_DB_NAME_BY_ORG[org] || null;
            insertCertificateRegistry({
                userId,
                certificateName,
                org,
                expiresAt: null
            }).catch((registryErr) => {
                console.error('写入 certificate_registry 失败:', registryErr);
            });

            res.status(200).json({ message: '证书添加成功' });
        });
    });
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


app.post('/api/save-transaction', (req, res) => {
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
        model_file_hash
    } = req.body;

    console.log("后端接收到的 quality 值是：", quality);
    console.log("后端接收到的 expiration_time 值是：", expiration_time);

    const ownerId = owner_id || null;
    const sellerId = seller_id || null;
    const safeQuality = (typeof quality === 'string' && quality.trim() !== '') ? quality : null;

    // 检查请求体是否缺少必要参数
    if (!asset_id || !buyer_address || !seller_address) {
        return res.status(400).json({ message: '缺少必要的参数' });
    }

    // 转换 expiration_time 为 MySQL DATETIME 格式
    const formattedExpirationTime = (expiration_time && typeof expiration_time === 'string')
        ? expiration_time.replace('T', ' ') + ':00'
        : null;

    const query = `
        INSERT INTO transactions (
            asset_id,
            owner_id,
            buyer_address,
            seller_id,
            seller_address,
            status,
            quantity,
            quality,
            processing_type,
            expiration_time,
            model_file_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
        asset_id,
        ownerId,
        buyer_address,
        sellerId,
        seller_address,
        '待确认',
        quantity,
        safeQuality,
        processing_type,
        formattedExpirationTime,
        model_file_hash
    ];

    db.query(query, values, (err, results) => {
        if (err) {
            console.error('插入交易数据失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }
        res.status(201).json({ message: '交易已成功创建', transactionId: results.insertId });
    });
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
    pc_type
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
    });
  });
});


app.get('/api/seller-pending-transactions/:seller_address', (req, res) => {
    const seller_address = req.params.seller_address;

    // 查询卖方待确认的交易
    const query = `
        SELECT * FROM transactions
        WHERE seller_address = ? AND status = '待确认'`;

    db.query(query, [seller_address], (err, results) => {
        if (err) {
            console.error('查询卖方待确认交易失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        res.status(200).json({ pendingTransactions: results });
    });
});

app.post('/api/seller-confirm-transaction', (req, res) => {
    const { seller_address, transaction_id, isAgree } = req.body;

    // 检查请求体是否缺少必要参数
    if (!transaction_id || typeof isAgree !== 'boolean' || !seller_address) {
        return res.status(400).json({ message: '缺少必要的参数' });
    }

    // 获取当前交易的状态，如果卖方是正确的地址并且交易是待确认状态，才允许更新
    const getTransactionQuery = `
        SELECT * FROM transactions
        WHERE transaction_id = ? AND seller_address = ? AND status = '待确认'`;

    db.query(getTransactionQuery, [transaction_id, seller_address], (err, results) => {
        if (err) {
            console.error('查询交易失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: '未找到待确认交易' });
        }

        // 更新交易状态
        const newStatus = isAgree ? '已确认' : '已拒绝';
        const updateQuery = `
            UPDATE transactions
            SET status = ?
            WHERE transaction_id = ?`;

        db.query(updateQuery, [newStatus, transaction_id], (updateErr, updateResults) => {
            if (updateErr) {
                console.error('更新交易状态失败:', updateErr);
                return res.status(500).json({ error: '服务器内部错误' });
            }
            res.status(200).json({ message: '交易状态已更新', status: newStatus });
        });
    });
});

app.get('/api/buyer-transaction-status/:buyer_address', (req, res) => {
    const buyer_address = req.params.buyer_address;

    const query = `
        SELECT
          t.*,
          dc.pc_type,
          dc.contract_id AS digital_contract_id
        FROM transactions t
        LEFT JOIN digital_contracts dc
          ON dc.transaction_id = t.transaction_id
        WHERE t.buyer_address = ?`;

    db.query(query, [buyer_address], (err, results) => {
        if (err) {
            console.error('查询买方交易状态失败:', err);
            return res.status(500).json({ error: '服务器内部错误' });
        }

        res.status(200).json({ transactions: results });
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
  `;

  db.query(txSql, [seller_address], (err, txRows) => {
    if (err) {
      console.error('查询卖方交易状态失败:', err);
      return res.status(500).json({ error: '服务器内部错误（查询交易）' });
    }

    // 没有交易，直接返回空数组
    if (txRows.length === 0) {
      return res.status(200).json({ transactions: [] });
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

      return res.status(200).json({ transactions: formattedTxs });
    });
  });
});


app.post('/api/update-agent', async (req, res) => {
    const { file_hash, agent_addr, agent_count } = req.body;

    // 参数校验
    if (!file_hash) {
        return res.status(400).json({ message: '缺少 file_hash 参数' });
    }

    const updateSql = `
        UPDATE asset_registrations
        SET agent_addr = ?, agent_count = ?
        WHERE file_hash = ?
    `;

    const values = [
        agent_addr || null,
        agent_count || 0,
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
            agent_count: agent_count
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
app.get('/api/delivery/seller/request-status/:transaction_id', (req, res) => {
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
});


app.post('/api/classify-asset', async (req, res) => {
    const { text, asset_id, mode } = req.body;

    if (!text || !String(text).trim()) {
        return res.status(400).json({ message: '缺少 text 参数或内容为空' });
    }

    try {
        const response = await axios.post('http://10.112.47.214:5000/classify', {
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

app.post('/api/digital-contract/verify', async (req, res) => {
  try {
    const {
      transactionId,
      vmId,
      fileHash,
      deliveredCnt = '0',
      deliveryCnt = '2000',
      expireTime
    } = req.body || {};

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


const OMNIPRINT_BASE = {
  text: 'http://10.112.47.214:8110',
  image: 'http://10.112.47.214:8111',
  audio: 'http://10.112.47.214:8112',
  video: 'http://10.112.47.214:8113'
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
    UPDATE user_management.users
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
    FROM user_management.users
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

  userDb.query(userSql, [userId], (err, userRows) => {
    if (err) {
      console.error('查询默认上链证书失败:', err);
      return res.status(500).json({
        success: false,
        message: '查询默认上链证书失败',
        error: err.message
      });
    }

    const certName = userRows?.[0]?.default_register_cert;

    if (!certName) {
      return res.status(400).json({
        success: false,
        message: '未设置上链默认证书，请先到个人中心设置'
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
        console.error('查询上链证书详情失败:', certErr);
        return res.status(500).json({
          success: false,
          message: '查询上链证书详情失败',
          error: certErr.message
        });
      }

      if (!certRows || certRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: '上链默认证书不存在或不属于当前用户'
        });
      }

      return res.json({
        success: true,
        cert: certRows[0]
      });
    });
  });
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

  userDb.query(userSql, [userId], (err, userRows) => {
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
    const response = await axios.post('http://10.112.47.214:8848/pre/BurnToken', params);
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
