'use strict';

const VM_ID_RE = /^[0-9a-f]{16}$/;

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function validateCreateResponse(body) {
  const value = requireObject(body, 'TEE VM create response');
  if (value.success !== true) throw new Error('TEE VM create response success must be true');
  if (value.status !== 'created') throw new Error('TEE VM create response status must be created');
  if (!VM_ID_RE.test(String(value.vmId || ''))) throw new Error('TEE VM create response contains an invalid VM ID');
  return value;
}

function validateStartResponse(body, expectedVmId) {
  const value = requireObject(body, 'TEE VM start response');
  if (value.success !== true) throw new Error('TEE VM start response success must be true');
  if (value.status !== 'running') throw new Error('TEE VM start response status must be running');
  if (!VM_ID_RE.test(String(value.vmId || ''))) throw new Error('TEE VM start response contains an invalid VM ID');
  if (String(value.vmId) !== String(expectedVmId)) throw new Error('TEE VM start response VM ID does not match the delivery binding');
  if (value.remoteAttestation?.passed !== true) throw new Error('TEE remote attestation did not pass');
  return value;
}

function validateDecryptedResult(body, expectedVmId) {
  const value = requireObject(body, 'TEE decrypted result');
  if (Number(value.code) !== 200) throw new Error('TEE decrypted result code must be 200');
  if (!VM_ID_RE.test(String(value.vmId || ''))) throw new Error('TEE decrypted result contains an invalid VM ID');
  if (String(value.vmId) !== String(expectedVmId)) {
    throw new Error('TEE decrypted result VM ID does not match the delivery binding');
  }
  if (!Array.isArray(value.results)) throw new Error('TEE decrypted result results must be an array');
  return value;
}

function validateResultStatus(body, expectedVmId) {
  const value = requireObject(body, 'TEE result-status response');
  if (Number(value.code) !== 200) throw new Error('TEE result-status response code must be 200');
  if (!VM_ID_RE.test(String(value.vmId || ''))) throw new Error('TEE result-status response contains an invalid VM ID');
  if (String(value.vmId) !== String(expectedVmId)) {
    throw new Error('TEE result-status response VM ID does not match the delivery binding');
  }
  return value;
}

module.exports = { VM_ID_RE, validateCreateResponse, validateStartResponse, validateDecryptedResult, validateResultStatus };
