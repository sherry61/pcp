'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  saveAttemptResultArchive,
  loadAttemptResultArchive,
  hasAttemptResultArchive
} = require('../tee/attemptResultArchive');

const RESULT = { iv: 'aXY=', ciphertext: 'Y2lwaGVydGV4dA==' };
const KEY_INFO = {
  algorithm: 'ECDH-P256 + SM4-CBC',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----',
  weightKeyEnvelope: { ephPub: 'test-public-key', iv: 'aXY=', ciphertext: 'a2V5' }
};

test('persists and reloads a result bundle for one exact delivery attempt', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-attempt-result-'));
  const savedPath = saveAttemptResultArchive({
    rootDir,
    transactionId: '530',
    attemptNo: 2,
    result: RESULT,
    keyInfo: KEY_INFO
  });

  assert.equal(fs.statSync(savedPath).mode & 0o777, 0o600);
  assert.equal(hasAttemptResultArchive({ rootDir, transactionId: '530', attemptNo: 2 }), true);
  assert.deepEqual(loadAttemptResultArchive({ rootDir, transactionId: '530', attemptNo: 2 }), {
    transactionId: '530',
    attemptNo: 2,
    result: RESULT,
    keyInfo: KEY_INFO
  });
});

test('does not substitute another transaction or attempt when an archive is absent', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-attempt-result-'));
  saveAttemptResultArchive({ rootDir, transactionId: '530', attemptNo: 2, result: RESULT, keyInfo: KEY_INFO });

  assert.equal(loadAttemptResultArchive({ rootDir, transactionId: '530', attemptNo: 1 }), null);
  assert.equal(loadAttemptResultArchive({ rootDir, transactionId: '531', attemptNo: 2 }), null);
  assert.equal(hasAttemptResultArchive({ rootDir, transactionId: '../530', attemptNo: 2 }), false);
});

test('rejects incomplete result or key material instead of creating a false download record', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tee-attempt-result-'));

  assert.throws(
    () => saveAttemptResultArchive({ rootDir, transactionId: '530', attemptNo: 2, result: {}, keyInfo: KEY_INFO }),
    /结果密文不完整/
  );
  assert.throws(
    () => saveAttemptResultArchive({ rootDir, transactionId: '530', attemptNo: 2, result: RESULT, keyInfo: {} }),
    /解密材料不完整/
  );
});
