const DELIVERY_METHOD_HE = 'he';
const DELIVERY_METHOD_FL = 'fl';
const DELIVERY_METHOD_PRE = 'pre';
const DELIVERY_METHOD_MPC = 'mpc';

const ENABLED_DELIVERY_METHODS = Object.freeze([DELIVERY_METHOD_HE, DELIVERY_METHOD_FL, DELIVERY_METHOD_PRE, DELIVERY_METHOD_MPC]);
const HE_METHOD_LABEL = '同态加密';
const FL_METHOD_LABEL = '联邦学习';
const PRE_METHOD_LABEL = '代理重加密';
const MPC_METHOD_LABEL = '安全多方计算';
const HE_ENC_TYPE_OPTIONS = Object.freeze(['Paillier', 'ElGamal']);
const HE_OPERATION_OPTIONS = Object.freeze(['ADD', 'MUL']);
const PCP_STATUS_TEXT_MAP = Object.freeze({
  NOT_EXIST: '合同不存在',
  CREATED: '已创建',
  WAITING_INPUT: '等待输入',
  WAITING_EPOCH_INPUT: '等待轮次输入',
  QUEUED: '排队中',
  RUNNING: '计算中',
  COMPUTED: '已计算完成',
  PAMING: '审计中',
  PAM_PASSED: '审计通过',
  PAM_FAILED: '审计失败',
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

function isFlDeliveryMethod(method) {
  return String(method || '').trim().toLowerCase() === DELIVERY_METHOD_FL;
}

function isMpcDeliveryMethod(method) {
  return String(method || '').trim().toLowerCase() === DELIVERY_METHOD_MPC;
}

function getDeliveryMethodLabel(method) {
  if (isHeDeliveryMethod(method)) {
    return HE_METHOD_LABEL;
  }

  if (isFlDeliveryMethod(method)) {
    return FL_METHOD_LABEL;
  }

  if (isPreDeliveryMethod(method)) {
    return PRE_METHOD_LABEL;
  }

  if (isMpcDeliveryMethod(method)) {
    return MPC_METHOD_LABEL;
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
  DELIVERY_METHOD_FL,
  DELIVERY_METHOD_PRE,
  DELIVERY_METHOD_MPC,
  ENABLED_DELIVERY_METHODS,
  HE_METHOD_LABEL,
  FL_METHOD_LABEL,
  PRE_METHOD_LABEL,
  MPC_METHOD_LABEL,
  HE_ENC_TYPE_OPTIONS,
  HE_OPERATION_OPTIONS,
  PCP_STATUS_TEXT_MAP,
  isHeDeliveryMethod,
  isFlDeliveryMethod,
  isPreDeliveryMethod,
  isMpcDeliveryMethod,
  getDeliveryMethodLabel,
  getPcpStatusText,
  getHeStatusText,
};

module.exports.default = module.exports;
