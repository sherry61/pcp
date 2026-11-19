// MPC 审计链路（/api/privacy/mpc-audit/*）的状态适配。
// 新后端的 job 状态映射到旧页面使用的 task_status，避免大改模板逻辑。

const TASK_STATUS_MAP = {
  CREATED: 'pending',
  DATA_READY: 'ready',
  SUBMITTING: 'computing',
  AUDIT_PENDING: 'computing',
  AUDIT_PASSED: 'done',
  AUDIT_FAILED: 'failed',
  AUDIT_TIMEOUT: 'failed',
  FAILED: 'failed'
}

function mapTaskStatus(status) {
  return TASK_STATUS_MAP[String(status || '').toUpperCase()] || 'pending'
}

function normalizeUserResults(result) {
  if (!result || !Array.isArray(result.user_results)) return result
  return {
    ...result,
    user_results: result.user_results.map((item) => ({
      ...item,
      is_qualified: item.is_qualified == null ? item.qualified : item.is_qualified
    }))
  }
}

function normalizeRecord(job) {
  if (!job) return null
  return {
    ...job,
    // 旧模板用 remote_task_id 判断“任务是否已创建/可交付”。
    remote_task_id: job.pam_event_id || job.transaction_id || '',
    task_status: mapTaskStatus(job.status),
    compute_params: { threshold: job.threshold },
    result: normalizeUserResults(job.result),
    audit_status: job.status,
    audit_event_id: job.pam_event_id,
    consensus_status: job.consensus_status,
    consensus_result: job.consensus_result,
    passed_nodes: job.passed_nodes,
    target_nodes: job.target_nodes || [],
    audit_sample_count: Array.isArray(job.evidence?.samples) ? job.evidence.samples.length : null,
    total_sample_count: Array.isArray(job.samples) ? job.samples.length : null
  }
}

function formatAuditLabel(job) {
  if (!job) return '待审计'
  const status = String(job.status || '').toUpperCase()
  const total = Array.isArray(job.target_nodes) ? job.target_nodes.length : 0
  const passed = Number(job.passed_nodes || 0)
  const sampled = job.audit_sample_count
  const all = job.total_sample_count
  const sampleSuffix = sampled && all && sampled < all ? `，抽样 ${sampled}/${all}` : ''

  if (status === 'AUDIT_PASSED') {
    return `审计通过（${passed}/${total} 节点${sampleSuffix}）`
  }
  if (status === 'AUDIT_FAILED') {
    return `审计未通过（${passed}/${total} 节点${sampleSuffix}）`
  }
  if (status === 'AUDIT_TIMEOUT') {
    return `审计超时${sampleSuffix}`
  }
  if (status === 'AUDIT_PENDING' || status === 'SUBMITTING') {
    return `审计中（${passed}/${total} 节点已投票${sampleSuffix}）`
  }
  if (status === 'DATA_READY') {
    return '待提交审计'
  }
  return '待审计'
}

export default {
  mapTaskStatus,
  normalizeRecord,
  formatAuditLabel
}
