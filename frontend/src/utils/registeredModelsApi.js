import axios from 'axios'

const endpoint = 'http://10.112.191.163:3000/api/privacy/tee/models'

export default {
  list() { return axios.get(endpoint, { timeout: 30000 }).then(response => response.data.models) }
}
