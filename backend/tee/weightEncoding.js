'use strict';

function normalizeTeeWeightCsv(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  // The registered C model compares metric names byte-for-byte and does not
  // recognize a UTF-8 BOM. Preserve the uploaded file; normalize only the bytes
  // encrypted for delivery (Excel may add the BOM again when saving a CSV).
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
    ? bytes.subarray(3) : bytes;
}

function assertTeeWeightResult(result, expected) {
  const fail = message => { throw Object.assign(new Error(message), { code: 'TEE_WEIGHT_RESULT_MISMATCH', statusCode: 502 }); };
  if (!Number.isSafeInteger(result.metrics) || result.metrics !== expected.fields.length) {
    fail(`TEE 实际参与计算的指标数为 ${result.metrics}，预期为 ${expected.fields.length}，计算结果不完整`);
  }
  const sum = expected.weights.reduce((total, value) => total + value, 0);
  if (!Number.isFinite(sum)) fail('提交的权重总和超出可计算范围');
  const magnitude = expected.weights.reduce((total, value) => total + Math.abs(value), 0);
  const tolerance = 1e-9 * Math.max(1, magnitude);
  if (typeof result.weight_sum !== 'number' || !Number.isFinite(result.weight_sum) || Math.abs(result.weight_sum - sum) > tolerance) {
    fail('TEE 返回的权重总和与本次提交的权重不一致');
  }
}

module.exports = { normalizeTeeWeightCsv, assertTeeWeightResult };
