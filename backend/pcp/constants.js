const DELIVERY_METHOD_HE = 'he';
const DELIVERY_METHOD_FL = 'fl';
const DELIVERY_METHOD_PRE = 'pre';

const HE_ENC_TYPES = ['Paillier', 'ElGamal'];

const HE_OPERATIONS = ['ADD', 'MUL'];

const PCP_HE_STATUSES = [
  'NOT_EXIST',
  'CREATED',
  'WAITING_INPUT',
  'PAMING',
  'COMPUTED',
  'PAM_PASSED',
  'PAM_FAILED',
  'QUEUED',
  'RUNNING',
  'FAILED',
  'COMPLETED',
  'AUDIT_FAILED'
];

const PRE_ALLOWED_SOURCE_EXTENSIONS = [
  '.zip',
  '.tar',
  '.tar.gz',
  '.tgz'
];

const PCP_PRE_STATUSES = [
  'NOT_EXIST',
  'CREATED',
  'WAITING_INPUT',
  'PAMING',
  'COMPUTED',
  'PAM_PASSED',
  'PAM_FAILED',
  'QUEUED',
  'RUNNING',
  'FAILED',
  'COMPLETED',
  'AUDIT_FAILED'
];

const PCP_FL_STATUSES = [
  'NOT_EXIST',
  'CREATED',
  'WAITING_INPUT',
  'WAITING_EPOCH_INPUT',
  'JOINED',
  'PAMING',
  'COMPUTED',
  'PAM_PASSED',
  'PAM_FAILED',
  'QUEUED',
  'RUNNING',
  'FAILED',
  'COMPLETED',
  'AUDIT_FAILED'
];

const PCP_FL_RESULT_ROLES = [
  'fl_bottom_model',
  'fl_gradient',
  'fl_gradient_epoch_bundle',
  'fl_top_model'
];

module.exports = {
  DELIVERY_METHOD_HE,
  DELIVERY_METHOD_FL,
  DELIVERY_METHOD_PRE,
  HE_ENC_TYPES,
  HE_OPERATIONS,
  PCP_HE_STATUSES,
  PRE_ALLOWED_SOURCE_EXTENSIONS,
  PCP_PRE_STATUSES,
  PCP_FL_STATUSES,
  PCP_FL_RESULT_ROLES
};
