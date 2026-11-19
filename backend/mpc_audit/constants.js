'use strict';

// MPC 审计链路（对齐 PAM/Multiprover 的 MPC_COMPOSITE 电路）。
//
// 业务语句：每个用户 y = (a + b) * c
//   - a：卖方 A 组数据按 user 求和
//   - b：卖方 B 组数据按 user 求和
//   - c：折算系数（整单固定，或 CSV 中逐行指定）
//   - y：折算结果；可选再与阈值比较得到是否达标
//
// 电路要求 a/b/c/y 必须是非负整数；因此系数也用整数表示（例如 70 表示 70%）。

const MPC_AUDIT_METHOD = 'MPC';
const MPC_AUDIT_MODE = 'MPC_COMPOSITE';
const MPC_AUDIT_EVIDENCE_SCHEMA = 'he-evidence-v1';

const JOB_STATUS = {
  CREATED: 'CREATED',
  DATA_READY: 'DATA_READY',
  SUBMITTING: 'SUBMITTING',
  AUDIT_PENDING: 'AUDIT_PENDING',
  AUDIT_PASSED: 'AUDIT_PASSED',
  AUDIT_FAILED: 'AUDIT_FAILED',
  AUDIT_TIMEOUT: 'AUDIT_TIMEOUT',
  FAILED: 'FAILED'
};

const TERMINAL_STATUSES = [
  JOB_STATUS.AUDIT_PASSED,
  JOB_STATUS.AUDIT_FAILED,
  JOB_STATUS.AUDIT_TIMEOUT,
  JOB_STATUS.FAILED
];

const USER_FIELD = 'user_id';
const A_FIELDS = ['a', 'a_value', 'value_a', 'asset_a', 'total_assets_a'];
const B_FIELDS = ['b', 'b_value', 'value_b', 'asset_b', 'total_assets_b'];
const C_FIELDS = ['c', 'coefficient', 'factor', 'rate'];

module.exports = {
  MPC_AUDIT_METHOD,
  MPC_AUDIT_MODE,
  MPC_AUDIT_EVIDENCE_SCHEMA,
  JOB_STATUS,
  TERMINAL_STATUSES,
  USER_FIELD,
  A_FIELDS,
  B_FIELDS,
  C_FIELDS
};
