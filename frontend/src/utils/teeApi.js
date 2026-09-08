import axios from 'axios'

// Keep this aligned with the other privacy-delivery clients. The Vue dev server
// does not proxy /api to the backend, so a relative URL would return its 404.
const API_BASE = process.env.VUE_APP_API_BASE || 'http://10.112.47.214:3000'
const api = axios.create({ baseURL: API_BASE, timeout: 180000 })
export const teeApi = {
  uploadAssetMaterials(assetId, sellerAddress, dataFile, weightFile) {
    const form = new FormData(); form.append('assetId', String(assetId)); if (sellerAddress) form.append('sellerAddress', sellerAddress); if (dataFile) form.append('dataFile', dataFile, dataFile.name || 'data.csv'); if (weightFile) form.append('weightFile', weightFile, weightFile.name || 'weight.csv');
    return api.post('/api/privacy/tee/assets/materials', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 }).then(r => r.data)
  },
  assetMaterials(assetId) { return api.get(`/api/privacy/tee/assets/${encodeURIComponent(assetId)}/materials`).then(r => r.data) },
  keyFile(transactionId) { return api.get('/api/privacy/tee/key-file', { params: { transactionId } }).then(r => r.data) },
  request(payload) { return api.post('/api/privacy/tee/request', payload).then(r => r.data) },
  confirm(transactionId) { return api.post('/api/privacy/tee/confirm', { transactionId }, { timeout: 420000 }).then(r => r.data) },
  status(transactionId, signal) { return api.get('/api/privacy/tee/status', { params: { transactionId }, signal }).then(r => r.data) },
  receiveKey(payload) { return api.post('/api/privacy/tee/receive-key', payload, { timeout: 30000 }).then(r => r.data) },
  verifyContract(payload) { return api.post('/api/privacy/tee/verify-contract', payload).then(r => r.data) },
  receiveFile(payload) { return api.post('/api/privacy/tee/receive-file', payload, { timeout: 300000, maxContentLength: Infinity, maxBodyLength: Infinity }).then(r => r.data) },
  getResult(transactionId) { return api.post('/api/privacy/tee/get-result', { transactionId }).then(r => r.data) }
}

export default teeApi
