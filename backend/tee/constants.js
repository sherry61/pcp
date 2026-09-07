const TEE_DELIVERY_METHOD = 'TEE';

const TEE_DEFAULTS = Object.freeze({
  host: process.env.TEE_HOST || 'http://10.112.14.6',
  vmApiPort: Number(process.env.TEE_VM_API_PORT || 8000),
  hostKeyPort: Number(process.env.TEE_HOST_KEY_PORT || 28080),
  keyPort: Number(process.env.TEE_KEY_PORT || 8080),
  jsonPort: Number(process.env.TEE_JSON_PORT || 8081),
  filePort: Number(process.env.TEE_FILE_PORT || 8082),
  resultPort: Number(process.env.TEE_RESULT_PORT || 8083),
  gatewayPort: Number(process.env.TEE_GATEWAY_PORT || 18080),
  token: process.env.TEE_VM_API_TOKEN || '',
  // VM image creation/startup can exceed two minutes on a busy Hygon host.
  timeoutMs: Number(process.env.TEE_REQUEST_TIMEOUT_MS || 600000),
  // VM boot plus in-guest service deployment can take several minutes on
  // the remote Hygon host; keep the HTTP flow asynchronous and allow 10 min.
  readyTimeoutMs: Number(process.env.TEE_READY_TIMEOUT_MS || 600000),
  readyPollMs: Number(process.env.TEE_READY_POLL_MS || 2000)
});

const TEE_STEPS = Object.freeze([
  'REQUESTED', 'VM_CREATING', 'VM_CREATED', 'VM_STARTING', 'SERVICE_DEPLOYING', 'VM_RUNNING',
  'CONTRACT_VERIFYING', 'CONTRACT_VERIFIED', 'WAITING_DATA', 'DATA_KEY_NEGOTIATING', 'DATA_KEY_FAILED', 'DATA_UPLOADING', 'DATA_UPLOAD_FAILED',
  'WAITING_WEIGHT', 'WEIGHT_KEY_NEGOTIATING', 'WEIGHT_KEY_FAILED', 'WEIGHT_UPLOADING', 'WEIGHT_UPLOAD_FAILED', 'COMPUTING', 'RESULT_READY', 'COMPLETED', 'FAILED'
]);

module.exports = { TEE_DELIVERY_METHOD, TEE_DEFAULTS, TEE_STEPS };
