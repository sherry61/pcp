'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../tee/routes.js'), 'utf8');

test('attempt listing exposes download availability from the per-attempt archive', () => {
  assert.match(source, /hasAttemptResultArchive/);
  assert.match(source, /resultAvailable/);
  assert.match(source, /attemptNo:\s*attempt\.attemptNo/);
});

test('attempt result endpoint binds the request to both transaction and attempt', () => {
  assert.match(source, /app\.post\('\/api\/privacy\/tee\/attempt-result'/);
  assert.match(source, /transaction_id\s*=\s*\?\s+AND\s+id\s*=\s*\?/i);
  assert.match(source, /交付记录不属于当前交易/);
  assert.match(source, /只有成功的交付记录可以下载结果/);
  assert.match(source, /loadAttemptResultArchive/);
});

test('current-attempt detail download preserves cleanup scheduling without applying it to history', () => {
  assert.match(source, /isCurrentAttempt/);
  assert.match(source, /isCurrentAttempt[\s\S]{0,800}cleanupScheduler\.schedule/);
  assert.match(source, /saveAttemptResultArchive/);
});
