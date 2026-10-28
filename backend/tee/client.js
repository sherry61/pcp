const axios = require('axios');
const { TEE_DEFAULTS } = require('./constants');
const { validateCreateResponse, validateStartResponse, validateResultStatus } = require('./protocol');

function joinUrl(host, port, pathname) {
  return `${String(host).replace(/\/$/, '')}:${port}${pathname}`;
}

function createTeeClient(options = {}) {
  const cfg = { ...TEE_DEFAULTS, ...options };
  const json = axios.create({ timeout: cfg.timeoutMs, validateStatus: () => true });
  const vmHeaders = { 'Content-Type': 'application/json' };
  if (cfg.token) vmHeaders.Authorization = `Bearer ${cfg.token}`;

  async function expect(response, operation) {
    const body = response && response.data;
    if (!response || response.status < 200 || response.status >= 300 || body?.success === false || (body?.code != null && Number(body.code) !== 200)) {
      const error = new Error(body?.message || body?.error || `${operation} failed`);
      error.statusCode = response?.status || 502;
      if (body?.error) error.code = String(body.error);
      if (body?.code != null && Number.isFinite(Number(body.code))) error.remoteCode = Number(body.code);
      error.response = response;
      throw error;
    }
    return body;
  }

  return {
    config: cfg,
    async createVm({ cpu = 8, memoryMb = 4096 } = {}) {
      const response = await json.post(joinUrl(cfg.host, cfg.vmApiPort, '/api/v2/vms'), { cpu: Number(cpu), memoryMb: Number(memoryMb) }, { headers: vmHeaders, timeout: cfg.createTimeoutMs });
      return validateCreateResponse(await expect(response, 'TEE VM create'));
    },
    async startVm(vmId) {
      const response = await json.post(joinUrl(cfg.host, cfg.vmApiPort, `/api/v2/vms/${encodeURIComponent(vmId)}/start`), {}, { headers: vmHeaders, timeout: cfg.startTimeoutMs });
      return validateStartResponse(await expect(response, 'TEE VM start'), vmId);
    },
    async waitForServices() {
      const deadline = Date.now() + cfg.readyTimeoutMs;
      let lastError;
      while (Date.now() < deadline) {
        try {
          // nginx gateway deliberately returns 404 for '/', which is the
          // readiness signal used by the supplied vm-bootstrap script.
          const response = await json.get(joinUrl(cfg.host, cfg.gatewayPort, '/'), { validateStatus: () => true });
          if (response.status === 404 || (response.status >= 200 && response.status < 300)) return { ready: true, status: response.status };
          lastError = new Error(`gateway returned HTTP ${response.status}`);
        } catch (error) { lastError = error; }
        await new Promise((resolve) => setTimeout(resolve, cfg.readyPollMs));
      }
      const error = new Error(`TEE services did not become ready within ${cfg.readyTimeoutMs}ms`);
      error.cause = lastError;
      error.statusCode = 504;
      throw error;
    },
    async receiveKey(payload) {
      const response = await json.post(joinUrl(cfg.host, cfg.gatewayPort, '/api/receive-key'), payload, { headers: { 'Content-Type': 'application/json' } });
      return expect(response, 'TEE receive-key');
    },
    async receiveHostKey(ecPublicKey) {
      const response = await json.post(joinUrl(cfg.host, cfg.hostKeyPort, '/api/receive-key'), { ecPublicKey }, { headers: { 'Content-Type': 'application/json' } });
      return expect(response, 'TEE host receive-key');
    },
    async verifyContract(payload) {
      const response = await json.post(joinUrl(cfg.host, cfg.gatewayPort, '/api/receive-json'), payload, { headers: { 'Content-Type': 'application/json' } });
      return expect(response, 'TEE receive-json');
    },
    async receiveFile(payload) {
      const response = await json.post(joinUrl(cfg.host, cfg.gatewayPort, '/api/receive-file'), payload, { headers: { 'Content-Type': 'application/json' }, maxContentLength: Infinity, maxBodyLength: Infinity });
      return expect(response, 'TEE receive-file');
    },
    async getResultStatus(vmId) {
      const query = `?vmId=${encodeURIComponent(String(vmId))}`;
      const response = await json.get(joinUrl(cfg.host, cfg.gatewayPort, `/api/result-status${query}`), { headers: { Accept: 'application/json' } });
      return validateResultStatus(await expect(response, 'TEE result-status'), vmId);
    },
    async getResult(vmId) {
      const response = await json.post(joinUrl(cfg.host, cfg.gatewayPort, '/api/get-result'), { vmId: String(vmId) }, { headers: { 'Content-Type': 'application/json' } });
      return expect(response, 'TEE get-result');
    }
  };
}

module.exports = { createTeeClient };
