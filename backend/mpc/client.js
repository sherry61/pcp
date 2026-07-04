const axios = require('axios');
const FormData = require('form-data');

function getMpcTaskBaseUrl() {
  return (
    process.env.MPC_TASK_BASE_URL ||
    process.env.MPC_BASE_URL ||
    'http://127.0.0.1:28090/api/v1'
  ).replace(/\/+$/, '');
}

function createMpcClient(options = {}) {
  const baseURL = (options.baseUrl || getMpcTaskBaseUrl()).replace(/\/+$/, '');
  const defaultTimeout = Number(process.env.MPC_TASK_TIMEOUT_MS || 120000);
  return axios.create({
    baseURL,
    timeout: options.timeout || defaultTimeout
  });
}

function ensureSuccess(body, action) {
  if (body && typeof body === 'object' && body.code != null && body.code !== 0) {
    const error = new Error(`${action}业务失败: ${body.message || JSON.stringify(body)}`);
    error.statusCode = 502;
    throw error;
  }

  return body;
}

async function createRemoteTask(client, payload) {
  const response = await client.post('/task/create', payload);
  return ensureSuccess(response.data, '创建远端任务');
}

async function uploadRemoteTaskSellerData(client, remoteTaskId, { sellerId, payload, filename, contentType }) {
  const form = new FormData();
  form.append('role', 'seller');
  form.append('party_id', String(sellerId || ''));
  form.append('file', payload, {
    filename: filename || 'seller-input.json',
    contentType: contentType || 'application/json'
  });

  const response = await client.post(`/task/${encodeURIComponent(remoteTaskId)}/data`, form, {
    headers: form.getHeaders()
  });
  return ensureSuccess(response.data, '上传远端卖方数据');
}

async function startRemoteTask(client, remoteTaskId, payload) {
  const response = await client.post(`/task/${encodeURIComponent(remoteTaskId)}/start`, payload);
  return ensureSuccess(response.data, '启动远端任务');
}

async function getRemoteTaskStatus(client, remoteTaskId) {
  const response = await client.get(`/task/${encodeURIComponent(remoteTaskId)}/status`);
  return ensureSuccess(response.data, '查询远端任务状态');
}

async function getRemoteTaskResult(client, remoteTaskId) {
  const response = await client.get(`/task/${encodeURIComponent(remoteTaskId)}/result`);
  return ensureSuccess(response.data, '查询远端任务结果');
}

module.exports = {
  createMpcClient,
  createRemoteTask,
  uploadRemoteTaskSellerData,
  startRemoteTask,
  getRemoteTaskStatus,
  getRemoteTaskResult,
  getMpcTaskBaseUrl
};
