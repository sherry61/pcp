const TEE_NOTICE_STAGES = Object.freeze({
  PREPARE_PARAMETERS: 'PREPARE_PARAMETERS',
  REQUEST_STARTED: 'REQUEST_STARTED',
  MODEL_UPLOAD_REQUIRED: 'MODEL_UPLOAD_REQUIRED',
  SELLER_ACTION_REQUIRED: 'SELLER_ACTION_REQUIRED',
  RESULT_READY: 'RESULT_READY',
  CLEANUP_SCHEDULED: 'CLEANUP_SCHEDULED'
});

function canOpenDeliveryDetail(method, row = {}) {
  const normalized = String(method || '').trim().toUpperCase();
  if (normalized === 'TEE') return Boolean(row.teeRequested);
  if (normalized === 'HE') {
    const record = row.heRecord || {};
    return Boolean(record.has_record || record.pcp_contract_id || record.current_attempt_id || record.public_keys_ready);
  }
  if (normalized === 'FL') {
    const record = row.flRecord || {};
    return Boolean(record.has_record || record.pcp_contract_id || record.current_attempt_id);
  }
  if (normalized === 'PRE') {
    const record = row.preRecord || {};
    return Boolean(record.has_record || record.pcp_contract_id || record.current_attempt_id || record.buyer_public_key_ready);
  }
  if (normalized === 'MPC') return Boolean(row.mpcRecord?.remote_task_id);
  return false;
}

function teeNoticeStorageKey({ role, identity, transactionId, attemptId, stage } = {}) {
  const safeRole = String(role || '').trim().toLowerCase();
  const safeIdentity = String(identity || '').trim();
  const safeTransactionId = String(transactionId || '').trim();
  const safeAttemptId = String(attemptId ?? '').trim();
  const safeStage = String(stage || '').trim().toUpperCase();
  if (!safeRole || !safeTransactionId || !safeStage) return '';
  const identityPart = safeIdentity ? `:${safeIdentity}` : '';
  const attemptPart = safeAttemptId ? `:attempt-${safeAttemptId}` : '';
  return `tee-delivery-notice:${safeRole}${identityPart}:${safeTransactionId}${attemptPart}:${safeStage}`;
}

function claimTeeNotice(storage, input) {
  const key = teeNoticeStorageKey(input);
  if (!key || !storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, '1');
    return true;
  } catch (_) {
    return false;
  }
}

function teeResultNoticeInput(row, context = {}) {
  return {
    role: context.role || 'buyer',
    identity: context.identity,
    transactionId: row?.transaction_id,
    attemptId: row?.teeCurrentAttemptId,
    stage: TEE_NOTICE_STAGES.RESULT_READY
  };
}

function teeResultNoticeRank(row) {
  const attemptId = Number(row?.teeCurrentAttemptId);
  if (Number.isSafeInteger(attemptId) && attemptId >= 0) return attemptId;
  const transactionId = Number(row?.transaction_id);
  return Number.isSafeInteger(transactionId) ? transactionId : -1;
}

// 初次同步只允许最新完成的结果继续触发提示，其余历史结果静默记为已提示。
function prepareInitialTeeResultNotice(storage, rows, context = {}) {
  const completedRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.teeResultReady && row?.transaction_id)
    .sort((left, right) => {
      const rankDiff = teeResultNoticeRank(right) - teeResultNoticeRank(left);
      if (rankDiff) return rankDiff;
      return String(right.transaction_id).localeCompare(String(left.transaction_id), 'zh-CN', { numeric: true });
    });

  const latest = completedRows[0] || null;
  completedRows.slice(1).forEach((row) => {
    claimTeeNotice(storage, teeResultNoticeInput(row, context));
  });
  return latest;
}

function getTeeNotice(stage, transactionId) {
  const transaction = String(transactionId || '').trim();
  const prefix = transaction ? `交易 ${transaction}：` : '';
  const notices = {
    [TEE_NOTICE_STAGES.PREPARE_PARAMETERS]: {
      title: '准备计算参数',
      message: `${prefix}如需覆盖本次计算参数，请上传 CSV；也可以继续使用资产预设参数。`,
      type: 'info'
    },
    [TEE_NOTICE_STAGES.REQUEST_STARTED]: {
      title: '交付已开始',
      message: `${prefix}交付请求已提交，请等待卖方执行交付。`,
      type: 'success'
    },
    [TEE_NOTICE_STAGES.MODEL_UPLOAD_REQUIRED]: {
      title: '需要上传计算模型',
      message: `${prefix}可信计算服务已就绪，请点击“上传模型”。文件会提交至平台后端，由平台调用 TEE 密钥和模型接收接口完成加密传输。`,
      type: 'warning'
    },
    [TEE_NOTICE_STAGES.SELLER_ACTION_REQUIRED]: {
      title: '需要执行交付',
      message: `${prefix}买方已提交请求，请完成本次可信计算交付操作。`,
      type: 'warning'
    },
    [TEE_NOTICE_STAGES.RESULT_READY]: {
      title: '计算已完成',
      message: `${prefix}加密计算结果已准备完成，现在可以下载结果。`,
      type: 'success'
    },
    [TEE_NOTICE_STAGES.CLEANUP_SCHEDULED]: {
      title: '首次下载成功',
      message: `${prefix}首次成功下载结果，将开始 2 分钟安全清理 VM 倒计时。`,
      type: 'success'
    }
  };
  const notice = notices[String(stage || '').toUpperCase()];
  return notice ? { ...notice, duration: 0, showClose: true, position: 'top-right' } : null;
}

module.exports = {
  TEE_NOTICE_STAGES,
  canOpenDeliveryDetail,
  teeNoticeStorageKey,
  claimTeeNotice,
  prepareInitialTeeResultNotice,
  getTeeNotice
};

module.exports.default = module.exports;
