const axios = require('axios');
const crypto = require('crypto');

function getDynamicPcpHeaders() {
  return {
    'x-timestamp': String(Math.floor(Date.now() / 1000)),
    'x-nonce': crypto.randomUUID()
  };
}

function buildPcpHeaders({ entityId, headers = {} } = {}) {
  const mergedHeaders = {
    ...headers,
    ...getDynamicPcpHeaders()
  };

  if (entityId != null && entityId !== '') {
    mergedHeaders['x-entity-id'] = String(entityId);
  }

  return mergedHeaders;
}

function createPcpClient(options = {}) {
  const {
    baseUrl,
    timeout = 30000,
    headers = {},
    entityId
  } = options;

  const client = axios.create({
    baseURL: baseUrl,
    timeout,
    headers: buildPcpHeaders({ entityId, headers })
  });

  client.interceptors.request.use((config) => {
    const requestHeaders = {
      ...(config.headers || {}),
      ...getDynamicPcpHeaders()
    };

    if (entityId != null && entityId !== '' && !requestHeaders['x-entity-id']) {
      requestHeaders['x-entity-id'] = String(entityId);
    }

    return {
      ...config,
      headers: requestHeaders
    };
  });

  return client;
}

module.exports = {
  buildPcpHeaders,
  createPcpClient
};
