'use strict';

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function resolveBoundVmId(job, requestedVmId) {
  const boundVmId = String(job?.vm_id || '').trim();
  if (!boundVmId) throw conflict('Delivery transaction is not bound to a VM');
  if (requestedVmId != null && String(requestedVmId).trim() !== boundVmId) {
    throw conflict(`Requested VM is not the VM bound to this transaction (${boundVmId})`);
  }
  return boundVmId;
}

function assertVmBindingAvailable(rows, transactionId) {
  const tx = String(transactionId);
  const conflictRow = (rows || []).find((row) => String(row.transaction_id) !== tx);
  if (conflictRow) throw conflict('VM ID is already bound to another transaction');
}

function summarizeAttestation(started) {
  const attestation = started?.remoteAttestation || {};
  return {
    status: attestation.status ?? null,
    passed: attestation.passed === true,
    verifiedAt: attestation.verifiedAt ?? null,
    verificationMode: attestation.verificationMode ?? null,
    kdsOnline: attestation.kdsOnline ?? null
  };
}

function isRemoteResultReady(value) {
  return value?.computed === true || value?.ready === true || value?.result?.computed === true || value?.result?.ready === true;
}

async function uploadFilesOnce({ uploadData, uploadWeight }) {
  await uploadData();
  return uploadWeight();
}

async function waitForRemoteResult({
  getStatus,
  getResult,
  isReady = isRemoteResultReady,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
  intervalMs = 5000,
  timeoutMs = 300000,
  onStatus = async () => {}
}) {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() < deadline) {
    const status = await getStatus();
    attempts += 1;
    await onStatus(status, attempts);
    if (isReady(status)) return getResult();
    await sleep(intervalMs);
  }
  const error = new Error(`TEE result status polling timed out after ${attempts} attempts (${timeoutMs}ms)`);
  error.statusCode = 504;
  throw error;
}

module.exports = {
  resolveBoundVmId,
  assertVmBindingAvailable,
  summarizeAttestation,
  isRemoteResultReady,
  uploadFilesOnce,
  waitForRemoteResult
};
