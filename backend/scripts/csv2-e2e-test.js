#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const args = { baseUrl: 'http://127.0.0.1:3001', pollMs: 5000, timeoutMs: 9000000, cleanupTimeoutMs: 420000 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base-url') args.baseUrl = argv[++i];
    else if (argv[i] === '--poll-ms') args.pollMs = Number(argv[++i]);
    else if (argv[i] === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else if (argv[i] === '--cleanup-timeout-ms') args.cleanupTimeoutMs = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  args.baseUrl = String(args.baseUrl).replace(/\/$/, '');
  return args;
}

async function callJson(baseUrl, method, pathname, body, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: body == null ? undefined : { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({ message: 'non-JSON response' }));
    if (!response.ok || payload.success === false) {
      throw new Error(`${method} ${pathname} failed: HTTP ${response.status}, ${payload.message || payload.error || 'unknown error'}`);
    }
    return payload;
  } finally { clearTimeout(timer); }
}

async function uploadFixtures(baseUrl, assetId, dataPath, weightPath) {
  const form = new FormData();
  form.set('assetId', assetId);
  form.set('sellerAddress', 'did:test:csv2-seller');
  form.set('dataFile', new Blob([fs.readFileSync(dataPath)], { type: 'text/csv' }), 'data.csv');
  form.set('weightFile', new Blob([fs.readFileSync(weightPath)], { type: 'text/csv' }), 'weight.csv');
  const response = await fetch(`${baseUrl}/api/privacy/tee/assets/materials`, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({ message: 'non-JSON response' }));
  if (!response.ok || payload.success === false || payload.status !== 'READY') {
    throw new Error(`fixture upload failed: HTTP ${response.status}, ${payload.message || payload.status || 'unknown error'}`);
  }
  return payload;
}

async function createTeeTransaction(baseUrl, assetId, deliveryLimit = 1) {
  const modelSource = Buffer.from(
    '#include <stddef.h>\ndouble weighted_sum(const double *v,const double *w,size_t n){double r=0;for(size_t i=0;i<n;i++){r+=v[i]*w[i];}return r;}\n',
    'utf8'
  );
  const form = new FormData();
  form.set('asset_id', assetId);
  form.set('buyer_address', 'did:test:csv2-buyer');
  form.set('seller_address', 'did:test:csv2-seller');
  form.set('quantity', '1');
  form.set('quality', '使用权');
  form.set('expiration_time', '2099-12-31T23:59');
  form.set('pc_type', 'TEE');
  form.set('delivery_limit', String(deliveryLimit));
  form.set('modelFile', new Blob([modelSource], { type: 'text/x-c' }), 'model.c');
  const response = await fetch(`${baseUrl}/api/save-transaction`, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({ message: 'non-JSON response' }));
  if (!response.ok || !payload.transactionId) {
    throw new Error(`transaction creation failed: HTTP ${response.status}, ${payload.message || 'unknown error'}`);
  }
  return {
    transactionId: payload.transactionId,
    modelHash: crypto.createHash('sha256').update(modelSource).digest('hex'),
    modelSource,
    deliveryLimit
  };
}

async function uploadDeliveryModel(baseUrl, transactionId, modelSource) {
  const form = new FormData();
  form.set('transactionId', String(transactionId));
  form.set('modelFile', new Blob([modelSource], { type: 'text/x-c' }), 'model.c');
  const response = await fetch(`${baseUrl}/api/privacy/tee/model`, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({ message: 'non-JSON response' }));
  if (!response.ok || payload.success === false || payload.contractVerified !== true) {
    throw new Error(`model/contract submission failed: HTTP ${response.status}, ${payload.message || 'unknown error'}`);
  }
  return payload;
}

async function expectDeliveryLimitReached(baseUrl, transactionId, assetId) {
  const response = await fetch(`${baseUrl}/api/privacy/tee/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transactionId: String(transactionId), assetId,
      buyerAddress: 'did:test:csv2-buyer', sellerAddress: 'did:test:csv2-seller',
      vmCpu: 8, vmMemoryMb: 4096, useDefaultWeight: '1'
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status !== 409 || payload.code !== 'DELIVERY_LIMIT_REACHED') {
    throw new Error(`expected DELIVERY_LIMIT_REACHED, got HTTP ${response.status} ${payload.code || payload.message || ''}`);
  }
  return { status: response.status, code: payload.code };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitFor(baseUrl, transactionId, predicate, timeoutMs, pollMs, stages) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await callJson(baseUrl, 'GET', `/api/privacy/tee/status?transactionId=${encodeURIComponent(transactionId)}`);
    const marker = `${status.status}:${status.step}:${status.cleanupStatus || '-'}`;
    if (stages.at(-1) !== marker) stages.push(marker);
    if (String(status.status).toUpperCase() === 'FAILED' || String(status.step).toUpperCase() === 'FAILED') {
      throw new Error(`delivery failed at ${status.step}: ${status.lastError || 'unknown error'}`);
    }
    if (status.cleanupStatus === 'FAILED') throw new Error(`cleanup failed: ${status.cleanupError || 'unknown error'}`);
    if (predicate(status)) return status;
    await sleep(pollMs);
  }
  throw new Error(`timed out waiting for transaction ${transactionId}`);
}

function unwrapWeightKey(keyFile) {
  const envelope = keyFile.weightKeyEnvelope;
  const privateKey = crypto.createPrivateKey(keyFile.privateKeyPem);
  const peer = crypto.createPublicKey({ key: Buffer.from(envelope.ephPub || envelope.ephemeralPublicKey, 'base64'), format: 'der', type: 'spki' });
  const secret = crypto.diffieHellman({ privateKey, publicKey: peer });
  const material = Buffer.concat([secret, Buffer.from(envelope.salt, 'base64'), Buffer.from('HENC2-P256-AES256GCM')]);
  const aesKey = crypto.createHash('sha256').update(material).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(envelope.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
}

function decryptResult(result, key) {
  const decipher = crypto.createDecipheriv('sm4-cbc', key, Buffer.from(result.iv, 'base64'));
  decipher.setAutoPadding(false);
  const raw = Buffer.concat([decipher.update(Buffer.from(result.ciphertext, 'base64')), decipher.final()]);
  let end = raw.length;
  while (end > 0 && raw[end - 1] === 0) end -= 1;
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw.subarray(0, end)));
}

function assertScores(decoded, vmId) {
  if (decoded.code !== 200 || decoded.vmId !== vmId || !Array.isArray(decoded.results)) {
    throw new Error('decrypted result failed code, VM binding, or results validation');
  }
  const actual = Object.fromEntries(decoded.results.map((row) => [String(row.id), Number(row.score)]));
  const expected = { alice: 17.5, bob: 37.5 };
  for (const [id, score] of Object.entries(expected)) {
    if (!Number.isFinite(actual[id]) || Math.abs(actual[id] - score) > 1e-9) {
      throw new Error(`unexpected score for ${id}: ${actual[id]}`);
    }
  }
  return { expected, actual };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const assetId = `csv2-asset-${suffix}`;
  const fixtureRoot = path.resolve(__dirname, '../tests/fixtures');
  const stages = [];

  const transaction = await createTeeTransaction(args.baseUrl, assetId, 1);
  const transactionId = transaction.transactionId;
  const confirmation = await callJson(args.baseUrl, 'POST', '/api/seller-confirm-transaction', {
    transaction_id: transactionId,
    seller_address: 'did:test:csv2-seller',
    isAgree: true
  });
  if (!confirmation.contractCreated || confirmation.contractId !== `CONTRACT-${transactionId}`) {
    throw new Error('seller confirmation did not atomically create the TEE contract');
  }
  await uploadFixtures(args.baseUrl, assetId, path.join(fixtureRoot, 'csv2-data.csv'), path.join(fixtureRoot, 'csv2-weight.csv'));
  await callJson(args.baseUrl, 'POST', '/api/privacy/tee/request', {
    transactionId, assetId, buyerAddress: 'did:test:csv2-buyer', sellerAddress: 'did:test:csv2-seller',
    vmCpu: 8, vmMemoryMb: 4096, useDefaultWeight: '1'
  });
  await callJson(args.baseUrl, 'POST', '/api/privacy/tee/deliver', { transactionId, sellerAddress: 'did:test:csv2-seller' }, 300000);

  await waitFor(
    args.baseUrl, transactionId,
    (status) => status.status === 'VM_RUNNING' && status.step === 'WAITING_MODEL',
    args.timeoutMs, args.pollMs, stages
  );
  await uploadDeliveryModel(args.baseUrl, transactionId, transaction.modelSource);

  const ready = await waitFor(
    args.baseUrl, transactionId,
    (status) => status.status === 'SUCCESS' && status.step === 'RESULT_READY' && status.resultStatus === 'READY',
    args.timeoutMs, args.pollMs, stages
  );
  if (!/^[0-9a-f]{16}$/.test(String(ready.vmId || ''))) throw new Error(`invalid real VM ID: ${ready.vmId}`);
  if (ready.remoteAttestation?.passed !== true) throw new Error('remote attestation was not persisted as passed');
  if (Number(ready.deliveryLimit) !== 1 || Number(ready.successfulDeliveries) !== 1 || Number(ready.remainingDeliveries) !== 0) {
    throw new Error('TEE quota summary did not reflect the successful delivery');
  }

  const keyFile = await callJson(args.baseUrl, 'GET', `/api/privacy/tee/key-file?transactionId=${encodeURIComponent(transactionId)}`);
  const firstExport = await callJson(args.baseUrl, 'POST', '/api/privacy/tee/get-result', { transactionId });
  const decoded = decryptResult(firstExport.result, unwrapWeightKey(keyFile));
  const scores = assertScores(decoded, ready.vmId);
  const secondExport = await callJson(args.baseUrl, 'POST', '/api/privacy/tee/get-result', { transactionId });
  if (String(firstExport.cleanupScheduledAt) !== String(secondExport.cleanupScheduledAt)) {
    throw new Error('repeated export extended the cleanup deadline');
  }

  const cleaned = await waitFor(
    args.baseUrl, transactionId,
    (status) => status.cleanupStatus === 'SUCCESS' && status.vmStatus === 'DELETED',
    args.cleanupTimeoutMs, args.pollMs, stages
  );
  const exhausted = await expectDeliveryLimitReached(args.baseUrl, transactionId, assetId);

  const events = await callJson(args.baseUrl, 'GET', `/api/privacy/tee/events?transactionId=${encodeURIComponent(transactionId)}`);
  const safeReport = {
    success: true,
    transactionId,
    assetId,
    contract: {
      contractId: confirmation.contractId,
      modelHash: transaction.modelHash,
      deliveryLimit: transaction.deliveryLimit
    },
    vmId: ready.vmId,
    remoteAttestation: ready.remoteAttestation,
    stages,
    remoteStages: events.events.map((event) => ({ stage: event.stage, outcome: event.outcome, remoteCode: event.remote_code, durationMs: event.duration_ms })),
    scores,
    firstExport: { source: firstExport.source || 'remote', cleanupStatus: firstExport.cleanupStatus, cleanupScheduledAt: firstExport.cleanupScheduledAt },
    repeatedExportKeptDeadline: true,
    quotaExhausted: exhausted,
    cleanup: { status: cleaned.cleanupStatus, vmStatus: cleaned.vmStatus, scheduledAt: cleaned.cleanupScheduledAt, startedAt: cleaned.cleanupStartedAt, finishedAt: cleaned.cleanupFinishedAt }
  };
  process.stdout.write(`${JSON.stringify(safeReport, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`CSV2 E2E FAILED: ${error.message}\n`);
  process.exitCode = 1;
});
