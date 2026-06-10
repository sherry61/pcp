const DELIVERY_METHOD_MPC = 'mpc';
const MPC_TASK_TYPE_GC = 'gc';

const MPC_ALLOWED_PC_TYPES = ['MPC', 'GC'];

const MPC_TASK_STATUSES = [
  'pending',
  'waiting_buyer_data',
  'waiting_seller_data',
  'ready',
  'computing',
  'done',
  'failed'
];

const MPC_TERMINAL_STATUSES = ['done', 'failed'];

module.exports = {
  DELIVERY_METHOD_MPC,
  MPC_TASK_TYPE_GC,
  MPC_ALLOWED_PC_TYPES,
  MPC_TASK_STATUSES,
  MPC_TERMINAL_STATUSES
};
