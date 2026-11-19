'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const routesSource = fs.readFileSync(path.join(__dirname, '../tee/routes.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');

test('VM readiness pauses at WAITING_MODEL instead of sending data immediately', () => {
  const start = routesSource.indexOf('const startVmInBackground');
  const end = routesSource.indexOf('const processModelAndContract', start);
  const section = routesSource.slice(start, end);
  assert.match(section, /step:\s*'WAITING_MODEL'/);
  assert.doesNotMatch(section, /await autoDeliverMaterials/);
});

test('platform exposes the buyer model endpoint and uses the strict stage order', () => {
  assert.match(routesSource, /app\.post\('\/api\/privacy\/tee\/model'/);
  assert.match(routesSource, /fileType:\s*'model'/);
  assert.match(routesSource, /encryptModelPayload\(\{/);
  assert.match(routesSource, /fileType:\s*'contract'/);
  assert.match(routesSource, /teeClient\.verifyContract\(contractPayload\)/);
});

test('delivery model upload uses an in-memory size-limited multer instance', () => {
  assert.match(mainSource, /teeDeliveryModelUpload\s*=\s*multer\(\{[\s\S]*memoryStorage\(\)/);
  assert.match(mainSource, /limits:\s*\{\s*fileSize:\s*TEE_MODEL_MAX_BYTES\s*\}/);
  assert.match(mainSource, /modelUpload:\s*acceptTeeDeliveryModelUpload/);
});

test('model and contract failure closes the attempt and requests VM cleanup', () => {
  assert.match(routesSource, /finishAttempt\([^\n]*'FAILED'/);
  assert.match(routesSource, /cleanupRemoteVm\(vmId\)/);
  assert.match(routesSource, /modelBuffer\.fill\(0\)/);
  assert.match(routesSource, /modelSm4Key\.fill\(0\)/);
  assert.match(routesSource, /contractSm4Key\.fill\(0\)/);
});
