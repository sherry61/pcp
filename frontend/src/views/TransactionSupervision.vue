<template>
  <div class="home">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <main class="content transaction-content">
        <section class="transaction-page">
          <header class="page-header">
            <div>
              <h2>交易监管</h2>
              <p>链上交易状态监管</p>
            </div>
            <el-button :loading="refreshing" @click="refreshAll()">刷新</el-button>
          </header>

          <el-alert
            v-if="!backendAvailable"
            :title="availabilityMessage"
            type="warning"
            show-icon
            :closable="false"
            class="availability-alert"
          />

          <section class="overview-toolbar" aria-label="统计日期设置">
            <div>
              <strong>统计日期</strong>
              <span v-if="overview.stat_date">{{ overview.stat_date }}</span>
              <span v-else>尚无可统计数据</span>
              <small v-if="isHistoricalDate">
                当前数据源无今日数据，展示最新数据日期：{{ overview.stat_date }}
              </small>
            </div>
            <div class="date-actions">
              <el-date-picker
                v-model="overviewDate"
                type="date"
                value-format="YYYY-MM-DD"
                format="YYYY-MM-DD"
                placeholder="选择统计日期"
                :clearable="true"
                @change="loadOverview()"
              />
              <el-button :loading="overviewLoading" @click="loadOverview()">刷新统计</el-button>
            </div>
          </section>

          <section class="kpi-grid" v-loading="overviewLoading">
            <article v-for="card in overviewCards" :key="card.key" class="kpi-card" :class="card.key">
              <span>{{ card.label }}</span>
              <strong>{{ formatInteger(card.value) }}</strong>
              <small>{{ card.note }}</small>
            </article>
          </section>

          <section class="filter-section">
            <div class="section-heading">
              <div>
                <h3>链上交易列表</h3>
              </div>
              <el-button @click="refreshTransactions">刷新列表</el-button>
            </div>

            <el-form class="filter-grid" label-position="top" @submit.prevent="applyFilters">
              <el-form-item label="交易哈希">
                <el-input v-model.trim="draftFilters.tx_hash" clearable placeholder="输入交易哈希" @keyup.enter="applyFilters" />
              </el-form-item>
              <el-form-item label="From 地址">
                <el-input v-model.trim="draftFilters.from_address" clearable placeholder="输入 From 地址" @keyup.enter="applyFilters" />
              </el-form-item>
              <el-form-item label="To 地址">
                <el-input v-model.trim="draftFilters.to_address" clearable placeholder="输入 To 地址" @keyup.enter="applyFilters" />
              </el-form-item>
              <el-form-item label="监管状态">
                <el-select v-model="draftFilters.status">
                  <el-option v-for="item in supervisionOptions" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="链上状态">
                <el-select v-model="draftFilters.chain_status" clearable placeholder="全部">
                  <el-option label="成功" value="success" />
                  <el-option label="失败" value="failed" />
                  <el-option label="待确认" value="pending" />
                </el-select>
              </el-form-item>
              <el-form-item label="风险等级">
                <el-select v-model="draftFilters.risk_level" clearable placeholder="全部">
                  <el-option label="高风险" value="high" />
                  <el-option label="中风险" value="medium" />
                  <el-option label="低风险" value="low" />
                </el-select>
              </el-form-item>
              <el-form-item label="时间范围" class="time-range-field">
                <el-date-picker
                  v-model="draftTimeRange"
                  type="datetimerange"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  format="YYYY-MM-DD HH:mm:ss"
                  start-placeholder="开始时间"
                  end-placeholder="结束时间"
                  range-separator="至"
                />
              </el-form-item>
              <div class="filter-actions">
                <el-button type="primary" @click="applyFilters">查询</el-button>
                <el-button @click="resetFilters">重置</el-button>
              </div>
            </el-form>
          </section>

          <section class="table-section">
            <el-alert
              v-if="tableError"
              :title="tableError"
              type="error"
              show-icon
              :closable="false"
            >
              <template #default>
                <el-button size="small" @click="refreshTransactions">重试</el-button>
              </template>
            </el-alert>

            <el-table
              v-loading="tableLoading"
              :data="transactions"
              stripe
              height="520"
              empty-text="暂无符合条件的交易"
            >
              <el-table-column label="交易时间" width="176">
                <template #default="{ row }">{{ displayValue(row.datetime || formatTimestamp(row.timestamp)) }}</template>
              </el-table-column>
              <el-table-column label="交易哈希" min-width="190">
                <template #default="{ row }">
                  <div class="copy-cell">
                    <el-tooltip :content="row.tx_hash || '该历史记录未包含链上交易哈希'" placement="top">
                      <span>{{ row.tx_hash ? middleEllipsis(row.tx_hash, 18) : '暂无链上哈希' }}</span>
                    </el-tooltip>
                    <el-button v-if="row.tx_hash" link type="primary" @click="copyText(row.tx_hash)">复制</el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="业务记录" min-width="160">
                <template #default="{ row }">
                  <el-tooltip :content="row.business_transaction_id || row.record_key" placement="top">
                    <span>{{ middleEllipsis(row.business_transaction_id || row.record_key, 16) }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column prop="token_id" label="Token ID" min-width="150">
                <template #default="{ row }">{{ displayValue(row.token_id) }}</template>
              </el-table-column>
              <el-table-column prop="block_number" label="区块高度" width="120">
                <template #default="{ row }">{{ displayValue(row.block_number) }}</template>
              </el-table-column>
              <el-table-column label="From" min-width="160">
                <template #default="{ row }">
                  <div class="copy-cell">
                    <el-tooltip :content="displayValue(row.from_address)" placement="top">
                      <span>{{ middleEllipsis(row.from_address, 14) }}</span>
                    </el-tooltip>
                    <el-button v-if="row.from_address" link type="primary" @click="copyText(row.from_address)">复制</el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="To" min-width="160">
                <template #default="{ row }">
                  <div class="copy-cell">
                    <el-tooltip :content="displayValue(row.to_address)" placement="top">
                      <span>{{ middleEllipsis(row.to_address, 14) }}</span>
                    </el-tooltip>
                    <el-button v-if="row.to_address" link type="primary" @click="copyText(row.to_address)">复制</el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="交易金额" width="138">
                <template #default="{ row }">{{ formatAmount(row) }}</template>
              </el-table-column>
              <el-table-column label="手续费" width="124">
                <template #default="{ row }">{{ formatFee(row) }}</template>
              </el-table-column>
              <el-table-column label="链上状态" width="105">
                <template #default="{ row }">
                  <el-tag :type="chainTagType(row.chain_status)" effect="plain">
                    {{ chainStatusText(row.chain_status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="监管状态" width="105">
                <template #default="{ row }">
                  <el-tag :type="supervisionTagType(row.supervision_status)">
                    {{ supervisionStatusText(row.supervision_status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="风险等级" width="100">
                <template #default="{ row }">{{ riskLevelText(row.risk_level) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openDetail(row)">查看详情</el-button>
                </template>
              </el-table-column>
            </el-table>

            <footer class="cursor-pagination">
              <span>第 {{ pageNumber }} 页</span>
              <el-select v-model="pageSize" class="page-size" @change="changePageSize">
                <el-option v-for="size in [20, 50, 100, 200]" :key="size" :label="`${size} 条/页`" :value="size" />
              </el-select>
              <el-button :disabled="tableLoading || cursorHistory.length === 0" @click="previousPage">上一页</el-button>
              <el-button :disabled="tableLoading || !hasMore" @click="nextPage">下一页</el-button>
            </footer>
          </section>
        </section>
      </main>
    </div>

    <el-drawer v-model="detailVisible" size="58%" title="交易详情" :destroy-on-close="true" @closed="closeDetail">
      <div v-loading="detailLoading" class="detail-body">
        <el-alert v-if="detailError" :title="detailError" type="error" show-icon :closable="false">
          <template #default>
            <el-button size="small" @click="retryDetail">重试</el-button>
          </template>
        </el-alert>
        <template v-else>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="交易哈希" :span="2">{{ detail.tx_hash || '暂无链上哈希' }}</el-descriptions-item>
            <el-descriptions-item label="业务交易编号">{{ displayValue(detail.business_transaction_id) }}</el-descriptions-item>
            <el-descriptions-item label="业务记录键">{{ displayValue(detail.record_key) }}</el-descriptions-item>
            <el-descriptions-item label="Token ID">{{ displayValue(detail.token_id) }}</el-descriptions-item>
            <el-descriptions-item label="组织 / 服务端口">{{ organizationText(detail) }}</el-descriptions-item>
            <el-descriptions-item label="区块高度">{{ displayValue(detail.block_number) }}</el-descriptions-item>
            <el-descriptions-item label="交易时间">{{ displayValue(detail.datetime || formatTimestamp(detail.timestamp)) }}</el-descriptions-item>
            <el-descriptions-item label="From" :span="2">{{ displayValue(detail.from_address) }}</el-descriptions-item>
            <el-descriptions-item label="To" :span="2">{{ displayValue(detail.to_address) }}</el-descriptions-item>
            <el-descriptions-item label="原始金额">{{ displayValue(detail.value_raw) }}</el-descriptions-item>
            <el-descriptions-item label="格式化金额">{{ formatAmount(detail) }}</el-descriptions-item>
            <el-descriptions-item label="手续费">{{ formatFee(detail) }}</el-descriptions-item>
            <el-descriptions-item label="链上执行状态">{{ chainStatusText(detail.chain_status) }}</el-descriptions-item>
            <el-descriptions-item label="监管状态">{{ supervisionStatusText(detail.supervision_status) }}</el-descriptions-item>
            <el-descriptions-item label="风险等级">{{ riskLevelText(detail.risk_level) }}</el-descriptions-item>
            <el-descriptions-item label="审计开始时间">{{ displayValue(detail.audit_started_at || detail.audit_state?.audit_started_at) }}</el-descriptions-item>
            <el-descriptions-item label="审计结束时间">{{ displayValue(detail.audit_finished_at || detail.audit_state?.audit_finished_at) }}</el-descriptions-item>
            <el-descriptions-item label="关联异常账户" :span="2">{{ formatRelatedAccounts(detail.related_anomaly_accounts) }}</el-descriptions-item>
            <el-descriptions-item label="风险原因" :span="2">{{ formatReasons(detail.risk_reasons) }}</el-descriptions-item>
          </el-descriptions>

          <section class="detail-events">
            <h3>风险事件记录</h3>
            <el-table :data="detail.risk_events || []" stripe empty-text="暂无风险事件">
              <el-table-column prop="created_at" label="发生时间" width="180" />
              <el-table-column label="风险等级" width="100">
                <template #default="{ row }">{{ riskLevelText(row.risk_level) }}</template>
              </el-table-column>
              <el-table-column label="风险原因" min-width="220">
                <template #default="{ row }">{{ formatReasons(row.risk_reasons) }}</template>
              </el-table-column>
              <el-table-column label="处置状态" width="120">
                <template #default="{ row }">{{ displayValue(row.action_status) }}</template>
              </el-table-column>
            </el-table>
          </section>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import { ElMessage } from 'element-plus'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import {
  fetchTransactionDetail,
  fetchTransactionOverview,
  fetchTransactions
} from '@/api/transactionSupervision'

const REFRESH_INTERVAL_MS = 15000
const EMPTY_COUNTS = { submitted: 0, auditing: 0, risk: 0, finished: 0 }

function emptyFilters() {
  return {
    tx_hash: '',
    from_address: '',
    to_address: '',
    status: 'all',
    chain_status: '',
    risk_level: ''
  }
}

export default {
  name: 'TransactionSupervision',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      overview: { available: false, total: 0, finished_total: 0, status_counts: { ...EMPTY_COUNTS } },
      overviewDate: '',
      overviewLoading: false,
      tableLoading: false,
      refreshing: false,
      tableError: '',
      transactions: [],
      draftFilters: emptyFilters(),
      appliedFilters: emptyFilters(),
      draftTimeRange: [],
      appliedTimeRange: [],
      pageSize: 50,
      currentCursor: null,
      nextCursor: null,
      cursorHistory: [],
      hasMore: false,
      detailVisible: false,
      detailLoading: false,
      detailError: '',
      detailIdentifier: '',
      detail: {},
      refreshTimer: null,
      overviewController: null,
      tableController: null,
      detailController: null,
      overviewRequestId: 0,
      tableRequestId: 0,
      supervisionOptions: [
        { label: '全部', value: 'all' },
        { label: '已提交', value: 'submitted' },
        { label: '审计中', value: 'auditing' },
        { label: '风险交易', value: 'risk' },
        { label: '交易完成', value: 'finished' }
      ]
    }
  },
  computed: {
    backendAvailable() {
      return this.overview.available === true
    },
    availabilityMessage() {
      return this.overview.message || '交易数据源尚未配置，页面已就绪但当前无法读取交易数据。'
    },
    overviewCards() {
      const counts = { ...EMPTY_COUNTS, ...(this.overview.status_counts || {}) }
      return [
        { key: 'finished', label: '交易完成数量', value: this.overview.finished_total || 0, note: '数据库全部交易记录数' },
        { key: 'total', label: '当日交易量', value: this.overview.total || 0, note: this.overview.stat_date || '未接入数据' },
        { key: 'submitted', label: '已提交', value: counts.submitted, note: '等待进入审计流程' },
        { key: 'risk', label: '存在风险', value: counts.risk, note: '存在未处置中高风险' }
      ]
    },
    isHistoricalDate() {
      if (!this.overview.stat_date || this.overviewDate) return false
      return this.overview.stat_date !== this.todayString()
    },
    pageNumber() {
      return this.cursorHistory.length + 1
    }
  },
  mounted() {
    this.refreshAll()
    this.refreshTimer = window.setInterval(() => this.refreshAll(true), REFRESH_INTERVAL_MS)
  },
  beforeUnmount() {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer)
    this.abortRequest('overviewController')
    this.abortRequest('tableController')
    this.abortRequest('detailController')
  },
  methods: {
    async refreshAll(silent = false) {
      if (this.refreshing) return
      this.refreshing = true
      try {
        await Promise.all([this.loadOverview(silent), this.loadTransactions({ silent })])
      } finally {
        this.refreshing = false
      }
    },
    async loadOverview(silent = false) {
      this.abortRequest('overviewController')
      const controller = new AbortController()
      this.overviewController = controller
      const requestId = ++this.overviewRequestId
      if (!silent) this.overviewLoading = true
      try {
        const params = {}
        if (this.overviewDate) params.date = this.overviewDate
        params.timezone = 'Asia/Shanghai'
        const response = await fetchTransactionOverview(params, controller.signal)
        if (requestId === this.overviewRequestId) this.overview = response.data
      } catch (error) {
        if (!this.isCanceled(error) && !silent) {
          ElMessage.error(this.errorMessage(error, '交易统计加载失败'))
        }
      } finally {
        if (requestId === this.overviewRequestId) this.overviewLoading = false
      }
    },
    async loadTransactions({ silent = false } = {}) {
      this.abortRequest('tableController')
      const controller = new AbortController()
      this.tableController = controller
      const requestId = ++this.tableRequestId
      if (!silent) this.tableLoading = true
      this.tableError = ''
      try {
        const params = this.buildTransactionParams()
        const response = await fetchTransactions(params, controller.signal)
        if (requestId !== this.tableRequestId) return
        this.transactions = response.data.items || []
        this.nextCursor = response.data.next_cursor || null
        this.hasMore = Boolean(response.data.has_more)
        if (response.data.available === false) {
          this.tableError = response.data.message || '交易数据源尚未配置。'
        }
      } catch (error) {
        if (this.isCanceled(error)) return
        this.tableError = this.errorMessage(error, '交易列表加载失败')
      } finally {
        if (requestId === this.tableRequestId) this.tableLoading = false
      }
    },
    buildTransactionParams() {
      const params = { page_size: this.pageSize, status: this.appliedFilters.status || 'all' }
      if (this.currentCursor) params.cursor = this.currentCursor
      for (const key of ['tx_hash', 'from_address', 'to_address', 'chain_status', 'risk_level']) {
        if (this.appliedFilters[key]) params[key] = this.appliedFilters[key]
      }
      if (this.appliedTimeRange?.length === 2) {
        params.start_time = this.appliedTimeRange[0]
        params.end_time = this.appliedTimeRange[1]
      }
      return params
    },
    applyFilters() {
      this.appliedFilters = { ...this.draftFilters }
      this.appliedTimeRange = [...(this.draftTimeRange || [])]
      this.resetCursor()
      this.loadTransactions()
    },
    resetFilters() {
      this.draftFilters = emptyFilters()
      this.appliedFilters = emptyFilters()
      this.draftTimeRange = []
      this.appliedTimeRange = []
      this.resetCursor()
      this.loadTransactions()
    },
    refreshTransactions() {
      return this.loadTransactions()
    },
    resetCursor() {
      this.currentCursor = null
      this.nextCursor = null
      this.cursorHistory = []
      this.hasMore = false
    },
    nextPage() {
      if (!this.hasMore || !this.nextCursor) return
      this.cursorHistory.push(this.currentCursor)
      this.currentCursor = this.nextCursor
      this.loadTransactions()
    },
    previousPage() {
      if (!this.cursorHistory.length) return
      this.currentCursor = this.cursorHistory.pop() || null
      this.loadTransactions()
    },
    changePageSize() {
      this.resetCursor()
      this.loadTransactions()
    },
    async openDetail(row) {
      this.detailIdentifier = row.tx_hash || row.record_key
      this.detailVisible = true
      this.detail = {}
      await this.loadDetail()
    },
    async loadDetail() {
      if (!this.detailIdentifier) return
      this.abortRequest('detailController')
      const controller = new AbortController()
      this.detailController = controller
      this.detailLoading = true
      this.detailError = ''
      try {
        const response = await fetchTransactionDetail(this.detailIdentifier, controller.signal)
        this.detail = response.data
      } catch (error) {
        if (!this.isCanceled(error)) this.detailError = this.errorMessage(error, '交易详情加载失败')
      } finally {
        this.detailLoading = false
      }
    },
    retryDetail() {
      this.loadDetail()
    },
    closeDetail() {
      this.abortRequest('detailController')
      this.detail = {}
      this.detailError = ''
      this.detailIdentifier = ''
    },
    abortRequest(key) {
      if (this[key]) this[key].abort()
      this[key] = null
    },
    isCanceled(error) {
      return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError'
    },
    errorMessage(error, fallback) {
      return error?.response?.data?.detail || error?.response?.data?.message || error?.message || fallback
    },
    displayValue(value) {
      return value === null || value === undefined || value === '' ? '—' : String(value)
    },
    formatInteger(value) {
      const number = Number(value)
      return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '0'
    },
    formatTimestamp(value) {
      if (value === null || value === undefined || value === '') return '—'
      const number = Number(value)
      if (!Number.isFinite(number)) return this.displayValue(value)
      const milliseconds = number < 100000000000 ? number * 1000 : number
      const date = new Date(milliseconds)
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
    },
    formatDecimal(value, maximumFractionDigits = 8) {
      if (value === null || value === undefined || value === '') return '—'
      const number = Number(value)
      if (!Number.isFinite(number)) return '—'
      return number.toLocaleString('zh-CN', { maximumFractionDigits })
    },
    formatAmount(row) {
      const value = row.value
      if (value === null || value === undefined || value === '') return '—'
      const formatted = this.formatDecimal(value)
      return row.asset_symbol ? `${formatted} ${row.asset_symbol}` : formatted
    },
    formatFee(row) {
      if (row.fee === null || row.fee === undefined || row.fee === '') return '—'
      const formatted = this.formatDecimal(row.fee, 10)
      return row.fee_symbol ? `${formatted} ${row.fee_symbol}` : formatted
    },
    middleEllipsis(value, visibleLength = 14) {
      if (!value) return '—'
      const text = String(value)
      if (text.length <= visibleLength) return text
      const side = Math.floor((visibleLength - 1) / 2)
      return `${text.slice(0, side)}…${text.slice(-side)}`
    },
    async copyText(value) {
      try {
        await navigator.clipboard.writeText(String(value))
        ElMessage.success('已复制')
      } catch (error) {
        ElMessage.error('复制失败，请手动复制')
      }
    },
    supervisionStatusText(status) {
      return { submitted: '已提交', auditing: '审计中', risk: '风险交易', finished: '交易完成' }[status] || '—'
    },
    supervisionTagType(status) {
      return { submitted: 'info', auditing: 'warning', risk: 'danger', finished: 'success' }[status] || 'info'
    },
    chainStatusText(status) {
      return { success: '成功', failed: '失败', pending: '待确认', unknown: '未知' }[status] || this.displayValue(status)
    },
    chainTagType(status) {
      return { success: 'success', failed: 'danger', pending: 'warning' }[status] || 'info'
    },
    riskLevelText(level) {
      return { high: '高风险', medium: '中风险', low: '低风险', normal: '正常' }[level] || '—'
    },
    formatReasons(reasons) {
      if (Array.isArray(reasons)) return reasons.length ? reasons.join('；') : '—'
      return this.displayValue(reasons)
    },
    formatRelatedAccounts(accounts) {
      if (!Array.isArray(accounts) || !accounts.length) return '—'
      return accounts.map((item) => item.address || item.related_account || item).filter(Boolean).join('；') || '—'
    },
    organizationText(row) {
      if (row.org_no === null || row.org_no === undefined) return '—'
      return row.service_port ? `组织 ${row.org_no} / ${row.service_port}` : `组织 ${row.org_no}`
    },
    todayString() {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date())
    }
  }
}
</script>

<style scoped>
.transaction-content {
  min-width: 0;
  padding: 18px 22px 32px;
}

.transaction-page {
  width: min(100%, 1760px);
  margin: 0 auto;
  color: #1f2937;
}

.page-header,
.section-heading,
.overview-toolbar,
.cursor-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.page-header {
  margin-bottom: 16px;
}

.page-header h2,
.section-heading h3,
.detail-events h3 {
  margin: 0;
  letter-spacing: 0;
}

.page-header h2 {
  font-size: 26px;
}

.page-header p,
.section-heading span {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 14px;
}

.availability-alert {
  margin-bottom: 14px;
}

.overview-toolbar,
.filter-section,
.table-section {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.overview-toolbar {
  padding: 14px 16px;
  margin-bottom: 12px;
}

.overview-toolbar > div:first-child {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.overview-toolbar small {
  width: 100%;
  color: #b45309;
}

.date-actions {
  display: flex;
  gap: 8px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 12px;
  min-height: 116px;
  margin-bottom: 16px;
}

.kpi-card {
  min-width: 0;
  padding: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-top: 3px solid #2563eb;
  border-radius: 6px;
}

.kpi-card.submitted { border-top-color: #3b82f6; }
.kpi-card.risk { border-top-color: #dc2626; }
.kpi-card.finished { border-top-color: #16a34a; }

.kpi-card span,
.kpi-card small {
  display: block;
  color: #64748b;
}

.kpi-card strong {
  display: block;
  margin: 8px 0 4px;
  font-size: 27px;
  letter-spacing: 0;
}

.filter-section {
  padding: 16px;
  margin-bottom: 14px;
}

.section-heading {
  margin-bottom: 14px;
}

.section-heading h3,
.detail-events h3 {
  font-size: 18px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(150px, 1fr));
  gap: 0 12px;
  align-items: end;
}

.filter-grid :deep(.el-form-item) {
  margin-bottom: 12px;
}

.filter-grid :deep(.el-select),
.filter-grid :deep(.el-date-editor) {
  width: 100%;
}

.time-range-field {
  grid-column: span 3;
}

.filter-actions {
  grid-column: span 3;
  display: flex;
  justify-content: flex-end;
  padding-bottom: 12px;
}

.table-section {
  padding: 14px 16px 12px;
}

.table-section > .el-alert {
  margin-bottom: 12px;
}

.copy-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.copy-cell span {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.cursor-pagination {
  justify-content: flex-end;
  margin-top: 12px;
}

.page-size {
  width: 118px;
}

.detail-body {
  min-height: 260px;
}

.detail-events {
  margin-top: 22px;
}

.detail-events h3 {
  margin-bottom: 12px;
}

@media (max-width: 1280px) {
  .kpi-grid { grid-template-columns: repeat(3, minmax(150px, 1fr)); }
  .filter-grid { grid-template-columns: repeat(3, minmax(150px, 1fr)); }
}

@media (max-width: 820px) {
  .transaction-content { padding: 14px; }
  .page-header,
  .overview-toolbar,
  .section-heading { align-items: flex-start; flex-direction: column; }
  .date-actions { width: 100%; flex-wrap: wrap; }
  .kpi-grid { grid-template-columns: repeat(2, minmax(130px, 1fr)); }
  .filter-grid { grid-template-columns: 1fr; }
  .time-range-field,
  .filter-actions { grid-column: span 1; }
  .filter-actions { justify-content: flex-start; }
  .cursor-pagination { flex-wrap: wrap; }
}
</style>
