import axios from 'axios'

const api = axios.create({ timeout: 180000 })
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
