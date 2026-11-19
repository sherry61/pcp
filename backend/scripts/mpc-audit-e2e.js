'use strict';

// MPC 审计端到端自检：
//   1. 建表（如不存在）
//   2. 在本进程内起一个临时 Express，注册 mpc_audit 路由
//   3. create → data（真实 multipart） → submit → 轮询 Hub 共识
//
// 运行：
//   PCC_AUDIT_TOKEN=... node backend/scripts/mpc-audit-e2e.js
//
// 该脚本会向真实 PAM Hub 提交一条 MPC 审计事件，可在
//   节点：http://10.112.191.163:19241/auditor/web/login
//   中台：http://10.112.191.163:15140
// 看到该交易。

const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const express = require('express');
const multer = require('multer');

const { registerMpcAuditRoutes } = require('../mpc_audit');
const { TERMINAL_STATUSES } = require('../mpc_audit/constants');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.MAIN_DB_NAME || 'r01_prod'
};

const pool = mysql.createPool(DB_CONFIG);
const dbQuery = (sql, params = []) => new Promise((resolve, reject) => {
  pool.query(sql, params, (error, results) => (error ? reject(error) : resolve(results)));
});

async function ensureTable() {
  const sqlPath = path.join(__dirname, '..', 'sql', '2026-11-16-mpc-audit-jobs.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const statements = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await dbQuery(statement);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(base, pathname, body) {
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data;
}

async function getJson(base, pathname) {
  const response = await fetch(`${base}${pathname}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }
  return data;
}

async function main() {
  await ensureTable();

  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
  });
  app.use(express.json({ limit: '10mb' }));
  registerMpcAuditRoutes({ app, upload, dbQuery });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const transactionId = process.env.MPC_E2E_TX || `MPC_E2E_${Date.now()}`;
  const businessContractId = `CONTRACT_${transactionId}`;
  const buyerId = 'buyer_e2e';
  const sellerId = 'seller_e2e';
  // 三个参与方合并进两个审计槽位：bank/bureau -> A，insurer -> B；c 默认 1。
  const parties = [
    { id: 'bank', name: '银行', slot: 'A' },
    { id: 'insurer', name: '保险', slot: 'B' },
    { id: 'bureau', name: '征信机构', slot: 'A' }
  ];
  const threshold = process.env.MPC_E2E_T || '230';
  const mode = process.env.MPC_E2E_MODE || 'party';
  const partyCsv = {
    bank: 'user_id,value\nu1,100\nu2,200\n',
    insurer: 'user_id,value\nu1,23\nu2,40\n',
    bureau: 'user_id,value\nu1,77\n'
  };
  // files 模式按顺序切分：前 N-1 个 -> A，最后 1 个 -> B。
  const fileOrder = ['bank', 'bureau', 'insurer'];

  try {
    console.log('== 1. create ==');
    const created = await postJson(base, '/api/privacy/mpc-audit/create', {
      transactionId,
      businessContractId,
      buyerId,
      sellerId,
      threshold,
      parties
    });
    console.log('   status:', created.data.status);

    console.log('== 2. upload data (multipart) ==');
    const form = new FormData();
    form.append('transactionId', transactionId);
    if (mode === 'files') {
      for (const partyId of fileOrder) {
        form.append('files', new Blob([partyCsv[partyId]], { type: 'text/csv' }), `${partyId}.csv`);
      }
    } else {
      form.append('parties', JSON.stringify(parties));
      for (const [partyId, csv] of Object.entries(partyCsv)) {
        form.append(`party_${partyId}`, new Blob([csv], { type: 'text/csv' }), `${partyId}.csv`);
      }
    }
    const uploadResp = await fetch(`${base}/api/privacy/mpc-audit/data`, {
      method: 'POST',
      body: form
    });
    const uploaded = await uploadResp.json();
    if (!uploadResp.ok) {
      throw new Error(uploaded.message || `data HTTP ${uploadResp.status}`);
    }
    console.log('   status:', uploaded.data.status, 'users:', uploaded.data.result?.user_count);

    console.log('== 3. submit to Hub ==');
    const submitted = await postJson(base, '/api/privacy/mpc-audit/submit', { transactionId });
    const eventId = submitted.data.pam_event_id;
    console.log('   event_id:', eventId, 'status:', submitted.data.status);

    console.log('== 4. wait for consensus ==');
    let job = submitted.data;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      await sleep(3000);
      const status = await getJson(
        base,
        `/api/privacy/mpc-audit/status?transactionId=${encodeURIComponent(transactionId)}&refresh=1`
      );
      job = status.data;
      console.log(
        `   ${job.status} consensus=${job.consensus_status || '-'}/${job.consensus_result || '-'}` +
        ` nodes=${job.passed_nodes}/${job.responded_nodes}/${job.target_nodes?.length || 0}`
      );
      if (TERMINAL_STATUSES.includes(job.status)) break;
    }

    console.log('\n== 结果 ==');
    console.log(JSON.stringify({
      transaction_id: transactionId,
      event_id: eventId,
      status: job.status,
      consensus: {
        status: job.consensus_status,
        result: job.consensus_result,
        passed_nodes: job.passed_nodes,
        responded_nodes: job.responded_nodes,
        target_nodes: job.target_nodes
      },
      result: job.result
    }, null, 2));

    console.log('\n节点: http://10.112.191.163:19241/auditor/web/login');
    console.log('中台: http://10.112.191.163:15140');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => pool.end(resolve));
  }
}

main().catch((error) => {
  console.error('MPC 审计 e2e 失败:', error.message);
  if (error.response?.data) {
    console.error(JSON.stringify(error.response.data));
  }
  process.exitCode = 1;
});
