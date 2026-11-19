import axios from 'axios'

const endpoint = 'http://10.112.191.163:3000/api/privacy/tee/notifications'
export const getDeliveryNotifications = (context, signal) => axios.get(endpoint, {
  params: { role: context.role }, headers: { Authorization: `Bearer ${context.token}` }, signal, timeout: 15000
}).then(response => response.data.notifications)

export const getDeliveryNotificationTarget = (transactionId, role) => axios.get(`${endpoint}/${encodeURIComponent(transactionId)}`, {
  params: { role }, timeout: 15000
}).then(response => response.data.transaction)
