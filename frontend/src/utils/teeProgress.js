const TEE_PROGRESS_STEPS = Object.freeze([
  { label: '确认交付请求' },
  { label: '准备可信环境' },
  { label: '启动计算服务' },
  { label: '验证计算授权' },
  { label: '提交计算材料' },
  { label: '生成计算结果' }
]);

const STEP_PERCENTAGES = Object.freeze([8, 25, 42, 58, 75, 92]);

const STEP_INDEX = Object.freeze({
  REQUESTED: 0,
  VM_CREATING: 1,
  VM_CREATED: 1,
  VM_STARTING: 2,
  SERVICE_DEPLOYING: 2,
  VM_RUNNING: 2,
  WAITING_MODEL: 3,
  MODEL_KEY_NEGOTIATING: 3,
  MODEL_KEY_FAILED: 3,
  MODEL_UPLOADING: 3,
  MODEL_UPLOAD_FAILED: 3,
  MODEL_RECEIVED: 3,
  MODEL_READY: 3,
  CONTRACT_KEY_NEGOTIATING: 3,
  CONTRACT_VERIFYING: 3,
  CONTRACT_VERIFIED: 3,
  WAITING_DATA: 3,
  DATA_KEY_NEGOTIATING: 3,
  DATA_UPLOADING: 3,
  WAITING_WEIGHT: 4,
  WEIGHT_KEY_NEGOTIATING: 4,
  WEIGHT_UPLOADING: 4,
  COMPUTING: 5,
  RESULT_READY: 5,
  COMPLETED: 5
});

const PROCESS_STAGES = Object.freeze({
  VM_CREATE: { label: '创建可信计算环境', endpoint: 'POST /api/v2/vms' },
  VM_START: { label: '启动可信计算环境', endpoint: 'POST /api/v2/vms/{vmId}/start' },
  SERVICE_READY: { label: '确认计算服务就绪', endpoint: 'GET :18080/' },
  MODEL_KEY: { label: '协商计算模型密钥', endpoint: 'POST /api/receive-key' },
  MODEL_UPLOAD: { label: '加密提交计算模型', endpoint: 'POST /api/receive-file' },
  CONTRACT_KEY: { label: '协商数字合约密钥', endpoint: 'POST /api/receive-key' },
  CONTRACT_VERIFY: { label: '核验数字合约与模型指纹', endpoint: 'POST /api/receive-json' },
  DATA_KEY: { label: '协商业务数据密钥', endpoint: 'POST /api/receive-key' },
  DATA_UPLOAD: { label: '提交业务数据', endpoint: 'POST /api/receive-file' },
  WEIGHT_KEY: { label: '协商计算参数密钥', endpoint: 'POST /api/receive-key' },
  WEIGHT_UPLOAD: { label: '配置计算参数', endpoint: 'POST /api/receive-file' },
  RESULT_STATUS_POLL: { label: '确认计算结果状态', endpoint: 'GET /api/result-status?vmId={vmId}' },
  GET_RESULT: { label: '提取加密计算结果', endpoint: 'POST /api/get-result' },
  GET_RESULT_MANUAL: { label: '导出加密计算结果', endpoint: 'POST /api/get-result' },
  RESULT_VALIDATE_AND_PERSIST: { label: '校验并保存计算结果', endpoint: '平台本地处理' }
});

function resolveTeeProgress({ requested, status, step } = {}) {
  const normalizedStatus = String(status || '').toUpperCase();
  const normalizedStep = String(step || '').toUpperCase();
  const hasRequest = Boolean(requested || normalizedStatus || normalizedStep);
  if (!hasRequest) {
    return {
      activeIndex: 0,
      displayActiveIndex: 0,
      percentage: 0,
      label: '等待买方请求',
      state: 'idle'
    };
  }
  const failed = normalizedStatus === 'FAILED' || normalizedStep === 'FAILED' || normalizedStep.endsWith('_FAILED');
  const succeeded = normalizedStatus === 'SUCCESS' || ['RESULT_READY', 'COMPLETED'].includes(normalizedStep);
  const activeIndex = STEP_INDEX[normalizedStep] ?? 0;
  return {
    activeIndex,
    displayActiveIndex: succeeded ? TEE_PROGRESS_STEPS.length : activeIndex,
    percentage: succeeded ? 100 : STEP_PERCENTAGES[activeIndex],
    label: TEE_PROGRESS_STEPS[activeIndex].label,
    state: failed ? 'failed' : (succeeded ? 'success' : 'running')
  };
}

function formatTeeProcessEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map((event) => {
      const descriptor = PROCESS_STAGES[String(event?.stage || '').toUpperCase()];
      return descriptor ? { time: event.created_at || event.createdAt || '', ...descriptor } : null;
    })
    .filter(Boolean);
}

function parseDateMs(value) {
  if (!value) return NaN;
  if (typeof value === 'number') return value < 100000000000 ? value * 1000 : value;
  return new Date(String(value).replace(' ', 'T')).getTime();
}

function countdownText(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function resolveTeeCleanup(value = {}, nowMs = Date.now()) {
  const status = String(value.cleanupStatus || value.teeCleanupStatus || '').toUpperCase();
  if (status === 'SCHEDULED') {
    const scheduledAtMs = parseDateMs(value.cleanupScheduledAt || value.teeCleanupScheduledAt);
    const remainingSeconds = Number.isFinite(scheduledAtMs)
      ? Math.max(0, Math.ceil((scheduledAtMs - nowMs) / 1000))
      : null;
    return {
      state: 'scheduled',
      label: '等待安全清理',
      description: remainingSeconds == null ? '结果已导出，后端已安排本次计算环境清理' : `预计 ${countdownText(remainingSeconds)} 后开始清理本次计算环境`,
      remainingSeconds,
      countdown: remainingSeconds == null ? '' : countdownText(remainingSeconds)
    };
  }
  if (status === 'RUNNING') return { state: 'running', label: '正在安全清理', description: '后端正在销毁本次计算使用的虚拟机', remainingSeconds: 0, countdown: '' };
  if (status === 'SUCCESS') return { state: 'success', label: '计算环境已清理', description: '本次计算使用的虚拟机已安全销毁，结果仍可再次下载', remainingSeconds: 0, countdown: '' };
  if (status === 'FAILED') return { state: 'failed', label: '计算环境清理失败', description: value.cleanupError || value.teeCleanupError || '后端未能完成自动清理，请联系管理员处理', remainingSeconds: 0, countdown: '' };
  if (status === 'DISABLED') return { state: 'disabled', label: '自动清理未启用', description: '当前环境未启用导出后自动清理', remainingSeconds: 0, countdown: '' };
  return { state: 'idle', label: '尚未导出结果', description: '买方首次成功下载结果后，将开始 2 分钟安全清理倒计时', remainingSeconds: null, countdown: '' };
}

function shouldPollTeeStatus({ requested, status, step, cleanupStatus } = {}) {
  if (!requested) return false;
  const cleanup = String(cleanupStatus || '').toUpperCase();
  if (cleanup === 'SCHEDULED' || cleanup === 'RUNNING') return true;
  const normalizedStatus = String(status || '').toUpperCase();
  const normalizedStep = String(step || '').toUpperCase();
  const failed = normalizedStatus === 'FAILED' || normalizedStep === 'FAILED' || normalizedStep.endsWith('_FAILED');
  const succeeded = normalizedStatus === 'SUCCESS' || ['RESULT_READY', 'COMPLETED'].includes(normalizedStep);
  return !failed && !succeeded;
}

function formatAttestation(attestation) {
  if (!attestation || typeof attestation !== 'object') {
    return { state: 'idle', label: '等待远程证明', modeLabel: '尚未验证', verifiedAt: '' };
  }
  const passed = attestation.passed === true || String(attestation.status || '').toLowerCase() === 'passed';
  const mode = String(attestation.verificationMode || attestation.verification_mode || '').toLowerCase();
  const verifiedAtMs = parseDateMs(attestation.verifiedAt || attestation.verified_at);
  return {
    state: passed ? 'success' : 'failed',
    label: passed ? '远程证明已通过' : '远程证明未通过',
    modeLabel: mode === 'online-kds' ? '在线 KDS 验证' : (mode ? mode : '验证方式未知'),
    verifiedAt: Number.isFinite(verifiedAtMs) ? new Date(verifiedAtMs).toISOString() : ''
  };
}

function getAttemptProcessEvents(attempts, events, selectedAttempt) {
  const attemptList = (Array.isArray(attempts) ? attempts : [])
    .map((attempt) => ({ attempt, startedAtMs: parseDateMs(attempt?.startedAt || attempt?.started_at) }))
    .filter((item) => Number.isFinite(item.startedAtMs))
    .sort((left, right) => left.startedAtMs - right.startedAtMs);
  const selectedId = selectedAttempt?.id ?? selectedAttempt?.attemptId ?? null;
  const selectedNo = selectedAttempt?.attemptNo ?? selectedAttempt?.attempt_no ?? null;
  const index = attemptList.findIndex(({ attempt }) => (
    attempt === selectedAttempt ||
    (selectedId != null && (attempt?.id ?? attempt?.attemptId) === selectedId) ||
    (selectedNo != null && (attempt?.attemptNo ?? attempt?.attempt_no) === selectedNo)
  ));
  if (index < 0) return [];
  const startMs = attemptList[index].startedAtMs;
  const endMs = attemptList[index + 1]?.startedAtMs ?? Infinity;
  return (Array.isArray(events) ? events : []).filter((event) => {
    const eventMs = parseDateMs(event?.time || event?.createdAt || event?.created_at);
    return Number.isFinite(eventMs) && eventMs >= startMs && eventMs < endMs;
  });
}

function getAttemptBindingText(attempt) {
  const attemptNo = attempt?.attemptNo ?? attempt?.attempt_no
  const taskLabel = attemptNo == null || String(attemptNo).trim() === ''
    ? '本次交付任务'
    : `序号 ${String(attemptNo).trim()} 交付任务`
  if (attempt?.vmId || attempt?.vm_id) {
    return `VM 已与${taskLabel}完成绑定`;
  }
  return `${taskLabel}尚未完成 VM 绑定`;
}

function formatTeeDeliveryQuota(value = {}) {
  const successful = value.teeSuccessfulDeliveries ?? value.successfulDeliveries;
  const limit = value.teeDeliveryLimit ?? value.deliveryLimit;
  const formatCount = (count) => {
    const number = Number(count);
    return Number.isInteger(number) && number >= 0 ? String(number) : '?';
  };
  return `${formatCount(successful)}/${formatCount(limit)}`;
}

function canDownloadTeeAttemptResult(attempt = {}) {
  return String(attempt.status || '').toUpperCase() === 'SUCCESS' && attempt.resultAvailable === true;
}

module.exports = {
  TEE_PROGRESS_STEPS,
  resolveTeeProgress,
  formatTeeProcessEvents,
  resolveTeeCleanup,
  shouldPollTeeStatus,
  formatAttestation,
  getAttemptProcessEvents,
  getAttemptBindingText,
  formatTeeDeliveryQuota,
  canDownloadTeeAttemptResult
};
