const DELIVERY_METHOD_HE = 'he';
const DELIVERY_METHOD_FL = 'fl';
const DELIVERY_METHOD_PRE = 'pre';

const HE_ENC_TYPES = ['Paillier', 'ElGamal'];

const HE_OPERATIONS = ['ADD', 'MUL'];

const PCP_HE_STATUSES = [
  'NOT_EXIST',
  'CREATED',
  'WAITING_INPUT',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
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
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'AUDIT_FAILED'
];

const PCP_FL_STATUSES = [
  'NOT_EXIST',
  'CREATED',
  'WAITING_INPUT',
  'JOINED',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'AUDIT_FAILED'
];

const PCP_FL_RESULT_ROLES = [
  'fl_bottom_model',
  'fl_gradient',
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
