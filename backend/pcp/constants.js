const DELIVERY_METHOD_HE = 'he';

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

module.exports = {
  DELIVERY_METHOD_HE,
  HE_ENC_TYPES,
  HE_OPERATIONS,
  PCP_HE_STATUSES
};
