const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let modelUpload = {};
try { modelUpload = require('./teeModelUpload'); } catch (_) { /* RED: module not added yet. */ }

test('TEE model upload accepts only a non-empty C source within the size limit', () => {
  assert.equal(typeof modelUpload.validateTeeModelFile, 'function');
  assert.deepEqual(modelUpload.validateTeeModelFile({ name: 'risk.c', size: 128 }), { valid: true, message: '' });
  assert.match(modelUpload.validateTeeModelFile({ name: 'risk.cpp', size: 128 }).message, /\.c/);
  assert.match(modelUpload.validateTeeModelFile({ name: 'risk.c', size: 0 }).message, /不能为空/);
  assert.match(modelUpload.validateTeeModelFile({ name: 'risk.c', size: 10 * 1024 * 1024 + 1 }).message, /10 MB/);
});

test('TEE model upload is available only while the secure service is waiting for a model', () => {
  assert.equal(modelUpload.isTeeModelUploadStep('WAITING_MODEL'), true);
  assert.equal(modelUpload.isTeeModelUploadStep('MODEL_KEY_FAILED'), false);
  assert.equal(modelUpload.isTeeModelUploadStep('MODEL_UPLOAD_FAILED'), false);
  assert.equal(modelUpload.isTeeModelUploadStep('MODEL_UPLOADING'), false);
  assert.equal(modelUpload.isTeeModelUploadStep('CONTRACT_VERIFYING'), false);
});

test('buyer page submits the model to the platform backend and never handles TEE crypto or the digital contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '../views/DeliveryBuyer2.vue'), 'utf8');
  const apiSource = fs.readFileSync(path.join(__dirname, 'teeApi.js'), 'utf8');
  assert.match(source, /teeApi\.uploadModel/);
  assert.match(apiSource, /uploadModel\s*\(transactionId,\s*modelFile\)/);
  assert.match(apiSource, /form\.append\(['"]modelFile['"]/);
  assert.match(apiSource, /\/api\/privacy\/tee\/model/);
  assert.doesNotMatch(source, /fileType:\s*['"]model['"]/);
  assert.doesNotMatch(source, /async verifyTeeContract\s*\(/);
  assert.doesNotMatch(source, /row\.file_hash\s*\|\|\s*row\.asset_id/);
});

test('seller list presents running stages as delivery in progress', () => {
  const source = fs.readFileSync(path.join(__dirname, '../views/DeliverySeller2.vue'), 'utf8');
  assert.match(source, /WAITING_MODEL/);
  assert.doesNotMatch(source, /return '等待买方上传模型'|return '正在校验计算授权'/);
  assert.match(source, /if \(this\.isTeeRunning\(row\)\) return '交付中'/);
});
