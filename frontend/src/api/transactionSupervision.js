import axios from 'axios'

const API_ROOT = '/api/transaction-supervision'

export function fetchTransactionOverview(params = {}, signal) {
  return axios.get(`${API_ROOT}/overview`, { params, signal, timeout: 15000 })
}

export function fetchTransactions(params = {}, signal) {
  return axios.get(`${API_ROOT}/transactions`, { params, signal, timeout: 20000 })
}

export function fetchTransactionDetail(txHash, signal) {
  return axios.get(`${API_ROOT}/transactions/${encodeURIComponent(txHash)}`, {
    signal,
    timeout: 15000
  })
}

export function updateTransactionStatus(txHash, payload, signal) {
  return axios.patch(
    `${API_ROOT}/transactions/${encodeURIComponent(txHash)}/status`,
    payload,
    { signal, timeout: 15000 }
  )
}

