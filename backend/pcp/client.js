const axios = require('axios');
const crypto = require('crypto');

function getClientId() {
  return String(process.env.PCC_CLIENT_ID || 'trading-system').trim();
}

function getClientSecret() {
  return String(
    process.env.PCC_CLIENT_SECRET ||
    process.env.PCP_CLIENT_SECRET ||
    'replace-with-trading-system-signing-secret'
  ).trim();
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256Digest(input) {
  return `sha256:${crypto.createHash('sha256').update(input).digest('hex')}`;
}

function buildCanonicalRequest(method, pathWithQuery, timestampMs, nonce, rawBodyBuffer) {
  return [
    String(method || 'GET').toUpperCase(),
    pathWithQuery,
    String(timestampMs),
    String(nonce),
    sha256Digest(rawBodyBuffer || Buffer.alloc(0))
  ].join('\n');
}

function signCanonicalRequest(canonicalRequest, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalRequest)
    .digest('hex');
}

function normalizeJsonPayload(data) {
  if (data == null) {
    return '';
  }

  if (typeof data === 'string') {
    return data;
  }

  return stableStringify(data);
}

function resolveRawBodyBuffer(data, headers = {}) {
  if (data == null) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === 'string') {
    return Buffer.from(data, 'utf8');
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (typeof data.getBuffer === 'function') {
    return data.getBuffer();
  }

  const contentType = String(headers['Content-Type'] || headers['content-type'] || '').toLowerCase();
  if (!contentType || contentType.includes('application/json')) {
    return Buffer.from(normalizeJsonPayload(data), 'utf8');
  }

  return Buffer.from(String(data), 'utf8');
}

function buildSignedHeaders({
  method,
  pathWithQuery,
  data,
  headers = {}
}) {
  const timestampMs = Date.now();
  const nonce = crypto.randomBytes(18).toString('base64url');
  const rawBodyBuffer = resolveRawBodyBuffer(data, headers);
  const canonicalRequest = buildCanonicalRequest(
    method,
    pathWithQuery,
    timestampMs,
    nonce,
    rawBodyBuffer
  );

  return {
    ...headers,
    'x-client-id': getClientId(),
    'x-timestamp': String(timestampMs),
    'x-nonce': nonce,
    'x-signature': signCanonicalRequest(canonicalRequest, getClientSecret())
  };
}

function buildPcpHeaders({ headers = {} } = {}) {
  return {
    ...headers,
    'x-client-id': getClientId()
  };
}

function createPcpClient(options = {}) {
  const {
    baseUrl,
    timeout = 30000,
    headers = {}
  } = options;

  const client = axios.create({
    baseURL: baseUrl,
    timeout,
    headers: buildPcpHeaders({ headers })
  });

  client.interceptors.request.use((config) => {
    const mergedHeaders = {
      ...(client.defaults.headers?.common || {}),
      ...(config.headers || {})
    };
    const normalizedBaseUrl = String(config.baseURL || baseUrl || '').trim();
    const resolvedUrl = new URL(String(config.url || ''), normalizedBaseUrl || 'http://127.0.0.1');
    const pathWithQuery = `${resolvedUrl.pathname}${resolvedUrl.search}`;
    const nextConfig = { ...config };

    if (
      nextConfig.data &&
      typeof nextConfig.data === 'object' &&
      !Buffer.isBuffer(nextConfig.data) &&
      !ArrayBuffer.isView(nextConfig.data) &&
      !(nextConfig.data instanceof ArrayBuffer) &&
      typeof nextConfig.data.getBuffer !== 'function'
    ) {
      const contentType = String(
        mergedHeaders['Content-Type'] || mergedHeaders['content-type'] || ''
      ).toLowerCase();
      if (!contentType || contentType.includes('application/json')) {
        nextConfig.data = normalizeJsonPayload(nextConfig.data);
        if (!mergedHeaders['Content-Type'] && !mergedHeaders['content-type']) {
          mergedHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    if (nextConfig.data && typeof nextConfig.data.getHeaders === 'function') {
      Object.assign(mergedHeaders, nextConfig.data.getHeaders());
    }

    nextConfig.headers = buildSignedHeaders({
      method: nextConfig.method || 'GET',
      pathWithQuery,
      data: nextConfig.data,
      headers: mergedHeaders
    });

    return nextConfig;
  });

  return client;
}

module.exports = {
  buildPcpHeaders,
  createPcpClient
};
