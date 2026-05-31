const DELIVERY_METHOD_HE = 'he';
const DELIVERY_METHOD_PRE = 'pre';

const ENABLED_DELIVERY_METHODS = Object.freeze([DELIVERY_METHOD_HE, DELIVERY_METHOD_PRE]);
const HE_METHOD_LABEL = 'HE';
const PRE_METHOD_LABEL = 'PRE';
const HE_ENC_TYPE_OPTIONS = Object.freeze(['Paillier', 'ElGamal']);
const HE_OPERATION_OPTIONS = Object.freeze(['ADD']);
const PCP_STATUS_TEXT_MAP = Object.freeze({
  NOT_EXIST: '合同不存在',
  CREATED: '已创建',
  WAITING_INPUT: '等待输入',
  QUEUED: '排队中',
  RUNNING: '计算中',
  COMPLETED: '已完成',
  FAILED: '失败',
  AUDIT_FAILED: '审计失败',
});

function isHeDeliveryMethod(method) {
  return String(method || '').trim().toLowerCase() === DELIVERY_METHOD_HE;
}

function isPreDeliveryMethod(method) {
  return String(method || '').trim().toLowerCase() === DELIVERY_METHOD_PRE;
}

function getDeliveryMethodLabel(method) {
  if (isHeDeliveryMethod(method)) {
    return HE_METHOD_LABEL;
  }

  if (isPreDeliveryMethod(method)) {
    return PRE_METHOD_LABEL;
  }

  return String(method || '').trim();
}

function getPcpStatusText(status) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  return PCP_STATUS_TEXT_MAP[normalizedStatus] || normalizedStatus || '未知状态';
}

function getHeStatusText(status) {
  return getPcpStatusText(status);
}

module.exports = {
  DELIVERY_METHOD_HE,
  DELIVERY_METHOD_PRE,
  ENABLED_DELIVERY_METHODS,
  HE_METHOD_LABEL,
  PRE_METHOD_LABEL,
  HE_ENC_TYPE_OPTIONS,
  HE_OPERATION_OPTIONS,
  PCP_STATUS_TEXT_MAP,
  isHeDeliveryMethod,
  isPreDeliveryMethod,
  getDeliveryMethodLabel,
  getPcpStatusText,
  getHeStatusText,
};

module.exports.default = module.exports;
