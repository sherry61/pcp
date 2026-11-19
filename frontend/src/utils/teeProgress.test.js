const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEE_PROGRESS_STEPS,
  resolveTeeProgress,
  formatTeeProcessEvents,
  resolveTeeCleanup,
  shouldPollTeeStatus,
  formatAttestation,
  getAttemptProcessEvents,
  getAttemptBindingText,
  formatTeeDeliveryQuota
} = require('./teeProgress');

test('uses six business-facing delivery stages without internal file terminology', () => {
  assert.deepEqual(TEE_PROGRESS_STEPS.map((item) => item.label), [
    '确认交付请求',
    '准备可信环境',
    '启动计算服务',
    '验证计算授权',
    '提交计算材料',
    '生成计算结果'
  ]);
  assert.equal(TEE_PROGRESS_STEPS.some((item) => /data|weight|文件/i.test(item.label)), false);
});

test('returns a neutral stable state before the buyer requests TEE delivery', () => {
  const progress = resolveTeeProgress({ requested: false });

  assert.equal(progress.activeIndex, 0);
  assert.equal(progress.displayActiveIndex, 0);
  assert.equal(progress.percentage, 0);
  assert.equal(progress.label, '等待买方请求');
  assert.equal(progress.state, 'idle');
});

test('maps an in-flight parameter upload to the fifth customer-facing progress step', () => {
  const progress = resolveTeeProgress({ requested: true, status: 'RUNNING', step: 'WEIGHT_UPLOADING' });

  assert.equal(progress.activeIndex, 4);
  assert.equal(progress.label, '提交计算材料');
  assert.equal(progress.percentage, 75);
  assert.equal(progress.state, 'running');
});

test('model upload and contract verification precede business data submission', () => {
  assert.equal(resolveTeeProgress({ requested: true, status: 'VM_RUNNING', step: 'WAITING_MODEL' }).activeIndex, 3);
  assert.equal(resolveTeeProgress({ requested: true, status: 'VM_RUNNING', step: 'MODEL_UPLOADING' }).activeIndex, 3);
  assert.equal(resolveTeeProgress({ requested: true, status: 'VM_RUNNING', step: 'CONTRACT_VERIFYING' }).activeIndex, 3);

  const events = formatTeeProcessEvents([
    { stage: 'MODEL_KEY', created_at: '2026-10-07 12:00:00' },
    { stage: 'MODEL_UPLOAD', created_at: '2026-10-07 12:00:01' },
    { stage: 'CONTRACT_KEY', created_at: '2026-10-07 12:00:02' },
    { stage: 'CONTRACT_VERIFY', created_at: '2026-10-07 12:00:03' }
  ]);
  assert.deepEqual(events.map((event) => event.endpoint), [
    'POST /api/receive-key', 'POST /api/receive-file', 'POST /api/receive-key', 'POST /api/receive-json'
  ]);
});

test('marks all six visual steps and 100 percent complete when the TEE result is ready', () => {
  const progress = resolveTeeProgress({ requested: true, status: 'SUCCESS', step: 'RESULT_READY' });

  assert.equal(progress.activeIndex, 5);
  assert.equal(progress.displayActiveIndex, 6);
  assert.equal(progress.percentage, 100);
  assert.equal(progress.state, 'success');
});

test('formats current backend events as process-only service call records', () => {
  const events = formatTeeProcessEvents([
    { stage: 'DATA_KEY', outcome: 'SUCCESS', created_at: '2026-09-21 20:00:01', details: { code: 200 } },
    { stage: 'WEIGHT_UPLOAD', outcome: 'FAILED', created_at: '2026-09-21 20:00:02', details: { error: 'hidden' } },
    { stage: 'RESULT_STATUS_POLL', outcome: 'PENDING', created_at: '2026-09-21 20:00:03', details: { ready: false } }
  ]);

  assert.deepEqual(events, [
    { time: '2026-09-21 20:00:01', label: '协商业务数据密钥', endpoint: 'POST /api/receive-key' },
    { time: '2026-09-21 20:00:02', label: '配置计算参数', endpoint: 'POST /api/receive-file' },
    { time: '2026-09-21 20:00:03', label: '确认计算结果状态', endpoint: 'GET /api/result-status?vmId={vmId}' }
  ]);
});

test('describes the two-minute cleanup countdown without triggering cleanup in the browser', () => {
  const cleanup = resolveTeeCleanup({
    cleanupStatus: 'SCHEDULED',
    cleanupScheduledAt: '2026-10-06T10:02:00.000Z'
  }, Date.parse('2026-10-06T10:00:31.000Z'));

  assert.equal(cleanup.state, 'scheduled');
  assert.equal(cleanup.label, '等待安全清理');
  assert.equal(cleanup.remainingSeconds, 89);
  assert.equal(cleanup.countdown, '01:29');
});

test('keeps completed TEE jobs polling only while cleanup is scheduled or running', () => {
  const base = { requested: true, status: 'SUCCESS', step: 'RESULT_READY' };

  assert.equal(shouldPollTeeStatus({ ...base, cleanupStatus: 'SCHEDULED' }), true);
  assert.equal(shouldPollTeeStatus({ ...base, cleanupStatus: 'RUNNING' }), true);
  assert.equal(shouldPollTeeStatus({ ...base, cleanupStatus: 'SUCCESS' }), false);
  assert.equal(shouldPollTeeStatus(base), false);
  assert.equal(shouldPollTeeStatus({ requested: true, status: 'RUNNING', step: 'COMPUTING' }), true);
});

test('formats passed remote attestation with online verification and unix-second time', () => {
  const result = formatAttestation({
    passed: true,
    verificationMode: 'online-kds',
    verifiedAt: 1791262800
  });

  assert.equal(result.state, 'success');
  assert.equal(result.label, '远程证明已通过');
  assert.equal(result.modeLabel, '在线 KDS 验证');
  assert.equal(result.verifiedAt, '2026-10-06T05:00:00.000Z');
});

test('partitions service calls into delivery attempts using start-time boundaries', () => {
  const attempts = [
    { attemptNo: 1, startedAt: '2026-10-06T10:00:00.000Z' },
    { attemptNo: 2, startedAt: '2026-10-06T10:05:00.000Z' }
  ];
  const events = [
    { time: '2026-10-06T09:59:59.000Z', label: 'too early' },
    { time: '2026-10-06T10:00:00.000Z', label: 'attempt one' },
    { time: '2026-10-06T10:04:59.999Z', label: 'attempt one end' },
    { time: '2026-10-06T10:05:00.000Z', label: 'attempt two' },
    { time: 'invalid', label: 'invalid time' }
  ];

  assert.deepEqual(getAttemptProcessEvents(attempts, events, attempts[0]).map((item) => item.label), ['attempt one', 'attempt one end']);
  assert.deepEqual(getAttemptProcessEvents(attempts, events, attempts[1]).map((item) => item.label), ['attempt two']);
});

test('describes VM binding using the selected delivery attempt number', () => {
  const bound = getAttemptBindingText({ attemptNo: 1, vmId: '9034241197c2e443' });
  const pending = getAttemptBindingText({ attemptNo: 1, vmId: '' });
  const snakeCase = getAttemptBindingText({ attempt_no: 2, vm_id: 'vm-hidden' });
  const fallback = getAttemptBindingText({ vmId: 'another-hidden-vm' });

  assert.equal(bound, 'VM 已与序号 1 交付任务完成绑定');
  assert.equal(pending, '序号 1 交付任务尚未完成 VM 绑定');
  assert.equal(snakeCase, 'VM 已与序号 2 交付任务完成绑定');
  assert.equal(fallback, 'VM 已与本次交付任务完成绑定');
  assert.equal([bound, snakeCase, fallback].some((text) => /9034241197c2e443|vm-hidden|another-hidden-vm/.test(text)), false);
});

test('formats successful and agreed TEE delivery counts for the detail footer', () => {
  assert.equal(formatTeeDeliveryQuota({ teeSuccessfulDeliveries: 2, teeDeliveryLimit: 3 }), '2/3');
  assert.equal(formatTeeDeliveryQuota({ successfulDeliveries: '1', deliveryLimit: '3' }), '1/3');
  assert.equal(formatTeeDeliveryQuota({}), '?/?');
});
