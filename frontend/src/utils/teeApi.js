import axios from 'axios'

// Keep this aligned with the other privacy-delivery clients. The Vue dev server
// does not proxy /api to the backend, so a relative URL would return its 404.
const API_BASE = process.env.VUE_APP_API_BASE || 'http://10.112.47.214:3000'
const api = axios.create({ baseURL: API_BASE, timeout: 180000 })
export const teeApi = {
  request(payload) { return api.post('/api/privacy/tee/request', payload).then(r => r.data) },
  confirm(transactionId) { return api.post('/api/privacy/tee/confirm', { transactionId }, { timeout: 420000 }).then(r => r.data) },
  status(transactionId) { return api.get('/api/privacy/tee/status', { params: { transactionId } }).then(r => r.data) },
  receiveKey(payload) { return api.post('/api/privacy/tee/receive-key', payload).then(r => r.data) },
  verifyContract(payload) { return api.post('/api/privacy/tee/verify-contract', payload).then(r => r.data) },
  receiveFile(payload) { return api.post('/api/privacy/tee/receive-file', payload, { timeout: 300000, maxContentLength: Infinity, maxBodyLength: Infinity }).then(r => r.data) },
  getResult(transactionId) { return api.post('/api/privacy/tee/get-result', { transactionId }).then(r => r.data) }
}

export default teeApi
