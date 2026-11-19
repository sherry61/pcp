'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// PAM Hub 审计中台客户端。
//
// 认证使用 Hub 的 PCC 服务凭据（Header: X-PCC-Token）。凭据来源优先级：
//   1. process.env.PCC_AUDIT_TOKEN
//   2. process.env.PCC_AUDIT_TOKEN_FILE
//   3. backend/.pcc-audit-token（本地文件，已 gitignore）
function readTokenFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch (error) {
    return '';
  }
}

function getHubBaseUrl() {
  return String(
    process.env.PCC_HUB_BASE_URL ||
    process.env.HUB_API_BASE_URL ||
    'http://127.0.0.1:18140'
  ).replace(/\/+$/, '');
}

function getHubToken() {
  const envToken = String(process.env.PCC_AUDIT_TOKEN || '').trim();
  if (envToken) {
    return envToken;
  }

  const tokenFile = String(
    process.env.PCC_AUDIT_TOKEN_FILE ||
    path.join(__dirname, '..', '.pcc-audit-token')
  ).trim();
  const fileToken = readTokenFile(tokenFile);
  if (fileToken) {
    return fileToken;
  }

  const error = new Error(
    'PCC_AUDIT_TOKEN 未配置：请设置环境变量，或写入 backend/.pcc-audit-token'
  );
  error.statusCode = 503;
  throw error;
}

function createHubClient(options = {}) {
  const baseURL = String(options.baseUrl || getHubBaseUrl()).replace(/\/+$/, '');
  const token = options.token || getHubToken();
  return axios.create({
    baseURL,
    timeout: options.timeout || 60000,
    headers: {
      'X-PCC-Token': token,
      'Content-Type': 'application/json'
    }
  });
}

// Hub 只接受 ^[a-zA-Z0-9\-_]+$ 且长度 ≤ 64 的合同/交付编号。
function sanitizeHubId(value, fallbackPrefix) {
  const raw = String(value == null ? '' : value).trim();
  const normalized = raw.replace(/[^a-zA-Z0-9\-_]/g, '_');
  if (normalized && normalized.length <= 64) {
    return normalized;
  }
  const crypto = require('crypto');
  const digest = crypto.createHash('sha256').update(raw || fallbackPrefix).digest('hex').slice(0, 16);
  return `${fallbackPrefix}_${digest}`.slice(0, 64);
}

function buildHubIds({ transactionId, businessContractId, suffix }) {
  // suffix 用证据摘要：同一份证据重试保持幂等，证据变化（例如抽样后）
  // 会得到新的 delivery_id，避免 Hub 因同键换证据返回 409。
  const deliveryBase = suffix ? `ATT_${transactionId}_${suffix}` : `ATT_${transactionId}`;
  return {
    pccContractId: sanitizeHubId(businessContractId || transactionId, 'MPC'),
    deliveryId: sanitizeHubId(deliveryBase, 'ATT')
  };
}

async function submitAudit(client, { pccContractId, deliveryId, evidence }) {
  const response = await client.post('/hub/audit/submit', {
    pcc_contract_id: pccContractId,
    delivery_id: deliveryId,
    method: 'MPC',
    evidence
  });
  return response.data;
}

async function getAuditStatus(client, eventId) {
  const response = await client.get(`/hub/audit/${encodeURIComponent(eventId)}/status`);
  return response.data;
}

module.exports = {
  getHubBaseUrl,
  getHubToken,
  createHubClient,
  sanitizeHubId,
  buildHubIds,
  submitAudit,
  getAuditStatus
};
