const DELIVERY_METHOD_HE = 'he';

const ENABLED_DELIVERY_METHODS = Object.freeze([DELIVERY_METHOD_HE]);
const HE_METHOD_LABEL = 'HE';
const HE_ENC_TYPE_OPTIONS = Object.freeze(['Paillier', 'ElGamal']);
const HE_OPERATION_OPTIONS = Object.freeze(['ADD']);
const HE_STATUS_TEXT_MAP = Object.freeze({
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

function getDeliveryMethodLabel(method) {
  return isHeDeliveryMethod(method) ? HE_METHOD_LABEL : String(method || '').trim();
}

function getHeStatusText(status) {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  return HE_STATUS_TEXT_MAP[normalizedStatus] || normalizedStatus || '未知状态';
}

module.exports = {
  DELIVERY_METHOD_HE,
  ENABLED_DELIVERY_METHODS,
  HE_METHOD_LABEL,
  HE_ENC_TYPE_OPTIONS,
  HE_OPERATION_OPTIONS,
  HE_STATUS_TEXT_MAP,
  isHeDeliveryMethod,
  getDeliveryMethodLabel,
  getHeStatusText,
};

module.exports.default = module.exports;
