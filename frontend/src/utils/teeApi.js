import axios from 'axios'

// Keep this aligned with the other privacy-delivery clients. The Vue dev server
// does not proxy /api to the backend, so a relative URL would return its 404.
// https 页面下直连 http://10.112.191.163:3000 会被浏览器以混合内容拦截，
// 因此改为同源 /node-api（见 vue.config.js 的 devServer.proxy）。
const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
const API_BASE = process.env.VUE_APP_API_BASE || (isHttps ? '/node-api' : 'http://10.112.191.163:3000')
const api = axios.create({ baseURL: API_BASE, timeout: 180000 })
export const teeApi = {
  uploadAssetMaterials(assetId, sellerAddress, dataFile, weightFile) {
    const form = new FormData(); form.append('assetId', String(assetId)); if (sellerAddress) form.append('sellerAddress', sellerAddress); if (dataFile) form.append('dataFile', dataFile, dataFile.name || 'data.csv'); if (weightFile) form.append('weightFile', weightFile, weightFile.name || 'weight.csv');
    return api.post('/api/privacy/tee/assets/materials', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }).then(r => r.data)
  },
  assetMaterials(assetId) { return api.get(`/api/privacy/tee/assets/${encodeURIComponent(assetId)}/materials`).then(r => r.data) },
  keyFile(transactionId) { return api.get('/api/privacy/tee/key-file', { params: { transactionId } }).then(r => r.data) },
  request(payload) {
    const { transactionId, buyerAddress, sellerAddress, assetId, vmCpu, vmMemoryMb, weightFile, useDefaultWeight } = payload || {}
    const form = new FormData()
    form.append('transactionId', String(transactionId))
    if (buyerAddress) form.append('buyerAddress', buyerAddress)
    if (sellerAddress) form.append('sellerAddress', sellerAddress)
    if (assetId) form.append('assetId', assetId)
    if (vmCpu) form.append('vmCpu', String(vmCpu))
    if (vmMemoryMb) form.append('vmMemoryMb', String(vmMemoryMb))
    if (useDefaultWeight) form.append('useDefaultWeight', '1')
    if (weightFile) form.append('weightFile', weightFile, weightFile.name || 'weight.csv')
    return api.post('/api/privacy/tee/request', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }).then(r => r.data)
  },
  deliver(transactionId) { return api.post('/api/privacy/tee/deliver', { transactionId: String(transactionId) }).then(r => r.data) },
  attempts(transactionId) { return api.get('/api/privacy/tee/attempts', { params: { transactionId: String(transactionId) } }).then(r => r.data) },
  requestInfo(transactionId) { return api.get('/api/privacy/tee/request-info', { params: { transactionId: String(transactionId) } }).then(r => r.data) },
  confirm(transactionId) { return api.post('/api/privacy/tee/confirm', { transactionId }, { timeout: 420000 }).then(r => r.data) },
  status(transactionId, signal) { return api.get('/api/privacy/tee/status', { params: { transactionId }, signal, timeout: 20000 }).then(r => r.data) },
  receiveKey(payload) { return api.post('/api/privacy/tee/receive-key', payload, { timeout: 30000 }).then(r => r.data) },
  verifyContract(payload) { return api.post('/api/privacy/tee/verify-contract', payload).then(r => r.data) },
  receiveFile(payload) { return api.post('/api/privacy/tee/receive-file', payload, { timeout: 300000, maxContentLength: Infinity, maxBodyLength: Infinity }).then(r => r.data) },
  getResult(transactionId) { return api.post('/api/privacy/tee/get-result', { transactionId }).then(r => r.data) }
}

export default teeApi
