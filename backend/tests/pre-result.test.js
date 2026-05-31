const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectResultNotificationRole,
  extractPreResultNotificationPayload
} = require('../pcp/result');

test('extractPreResultNotificationPayload reads PRE download token metadata from PCP callback payload', () => {
  const payload = extractPreResultNotificationPayload({
    data: {
      contract_id: 'PRE-001',
      status: 'COMPLETED',
      result_role: 'pre_result',
      result: {
        download_token: 'token-1',
        filename: 'pre_result.tar',
        result_uri: 's3://bucket/pre_result.tar'
      }
    }
  }, (...values) => values.find((value) => value !== undefined && value !== null && value !== ''));

  assert.deepEqual(payload, {
    transactionId: undefined,
    pcpContractId: 'PRE-001',
    pcpStatus: 'COMPLETED',
    downloadToken: 'token-1',
    resultFilename: 'pre_result.tar',
    resultStoragePath: 's3://bucket/pre_result.tar',
    lastError: undefined,
    resultRole: 'pre_result',
    receiverId: undefined
  });
});

test('detectResultNotificationRole reads unified callback role from body or nested data', () => {
  const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

  assert.equal(
    detectResultNotificationRole({
      data: {
        result_role: 'pre_result'
      }
    }, firstDefined),
    'pre_result'
  );

  assert.equal(
    detectResultNotificationRole({
      result_role: 'he_result'
    }, firstDefined),
    'he_result'
  );

  assert.equal(detectResultNotificationRole({}, firstDefined), null);
});
