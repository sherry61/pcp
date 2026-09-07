<template>
  <div class="home">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <main class="content transaction-content">
        <section class="transaction-page">
          <header class="page-header">
            <div>
              <!-- <p class="eyebrow">ChainMaker 交易监管</p> -->
              <h2>交易监管</h2>
              <span>展示当前接入数据源中的链上交易及其监管状态。</span>
            </div>
            <el-button type="primary" :loading="refreshing" @click="refreshAll()">刷新页面</el-button>
          </header>

          <el-alert
            v-if="overviewLoaded && !backendAvailable"
            :title="availabilityMessage"
            :type="overviewError ? 'error' : 'warning'"
            show-icon
            :closable="false"
            class="availability-alert"
          >
            <template v-if="overviewError" #default>
              <el-button size="small" @click="loadOverview()">重试统计</el-button>
            </template>
          </el-alert>

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
                  <el-option label="未知" value="unknown" />
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
              max-height="520"
              empty-text="暂无符合条件的交易"
            >
              <el-table-column label="交易时间" width="176">
                <template #default="{ row }">{{ formatDateTime(row.datetime, row.timestamp) }}</template>
              </el-table-column>
              <el-table-column label="交易哈希" min-width="210">
                <template #default="{ row }">
                  <div class="hash-cell">
                    <div class="copy-cell">
                      <el-tooltip :content="row.tx_hash || '暂无链上哈希'" placement="top">
                        <span>{{ row.tx_hash ? middleEllipsis(row.tx_hash, 22) : '暂无链上哈希' }}</span>
                      </el-tooltip>
                      <el-button v-if="row.tx_hash" link type="primary" @click="copyText(row.tx_hash)">复制</el-button>
                    </div>
                    <small v-if="!row.tx_hash">{{ fallbackIdentifierText(row) }}</small>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="block_number" label="区块高度" width="120">
                <template #default="{ row }">{{ formatIntegerOrDash(row.block_number) }}</template>
              </el-table-column>
              <el-table-column prop="chain_id" label="链 ID" width="108">
                <template #default="{ row }">{{ displayValue(row.chain_id) }}</template>
              </el-table-column>
              <el-table-column label="合约名称" min-width="150">
                <template #default="{ row }">
                  <el-tooltip :content="displayValue(row.contract_name)" placement="top">
                    <span class="overflow-text">{{ displayValue(row.contract_name) }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column label="合约方法" min-width="150">
                <template #default="{ row }">
                  <el-tooltip :content="displayValue(row.contract_method)" placement="top">
                    <span class="overflow-text">{{ displayValue(row.contract_method) }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column label="发送地址" min-width="190">
                <template #default="{ row }">
                  <div class="copy-cell">
                    <el-tooltip :content="displayValue(row.sender_address)" placement="top">
                      <span>{{ middleEllipsis(row.sender_address, 18) }}</span>
                    </el-tooltip>
                    <el-button v-if="row.sender_address" link type="primary" @click="copyText(row.sender_address)">复制</el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="交易类型" min-width="154">
                <template #default="{ row }">
                  <el-tooltip :content="displayValue(row.tx_type)" placement="top">
                    <span class="overflow-text">{{ txTypeText(row.tx_type) }}</span>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column label="Gas 使用量" width="118" align="right">
                <template #default="{ row }">{{ formatIntegerOrDash(row.gas_used) }}</template>
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
              <span class="pagination-summary">{{ paginationSummary }}</span>
              <div class="pagination-actions">
                <el-select v-model="pageSize" class="page-size" @change="changePageSize">
                  <el-option v-for="size in [20, 50, 100, 200]" :key="size" :label="`${size} 条/页`" :value="size" />
                </el-select>
                <el-button :disabled="tableLoading || cursorHistory.length === 0" @click="previousPage">上一页</el-button>
                <el-button :disabled="tableLoading || !hasMore" @click="nextPage">下一页</el-button>
              </div>
            </footer>
          </section>
        </section>
      </main>
    </div>

    <el-drawer v-model="detailVisible" size="min(960px, 96vw)" title="交易详情" :destroy-on-close="true" @closed="closeDetail">
      <div v-loading="detailLoading" class="detail-body">
        <el-alert v-if="detailError" :title="detailError" type="error" show-icon :closable="false">
          <template #default>
            <el-button size="small" @click="retryDetail">重试</el-button>
          </template>
        </el-alert>
        <template v-else>
          <h3 class="detail-section-title">链上信息</h3>
          <el-descriptions :column="2" border class="chain-descriptions">
            <el-descriptions-item label="交易哈希" :span="2">
              <span class="breakable-value">{{ detail.tx_hash || '暂无链上哈希' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="链 ID">{{ displayValue(detail.chain_id) }}</el-descriptions-item>
            <el-descriptions-item label="交易类型">{{ txTypeText(detail.tx_type) }}</el-descriptions-item>
            <el-descriptions-item label="区块高度">{{ formatIntegerOrDash(detail.block_number) }}</el-descriptions-item>
            <el-descriptions-item label="区块内序号">{{ formatIntegerOrDash(detail.transaction_index) }}</el-descriptions-item>
            <el-descriptions-item label="区块哈希" :span="2">
              <span class="breakable-value">{{ displayValue(detail.block_hash) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="交易时间">{{ formatDateTime(detail.datetime, detail.timestamp) }}</el-descriptions-item>
            <el-descriptions-item label="Gas 使用量">{{ formatIntegerOrDash(detail.gas_used) }}</el-descriptions-item>
            <el-descriptions-item label="合约名称">{{ displayValue(detail.contract_name) }}</el-descriptions-item>
            <el-descriptions-item label="合约方法">{{ displayValue(detail.contract_method) }}</el-descriptions-item>
            <el-descriptions-item label="发送组织">{{ displayValue(detail.sender_org_id) }}</el-descriptions-item>
            <el-descriptions-item label="成员类型">{{ displayValue(detail.sender_member_type) }}</el-descriptions-item>
            <el-descriptions-item label="发送地址" :span="2">
              <span class="breakable-value">{{ displayValue(detail.sender_address) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="签名证书指纹" :span="2">
              <span class="breakable-value">{{ displayValue(detail.signer_cert_fingerprint) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="链上结果码">{{ displayValue(detail.result_code) }}</el-descriptions-item>
            <el-descriptions-item label="合约结果码">{{ displayValue(detail.contract_result_code) }}</el-descriptions-item>
            <el-descriptions-item label="链上执行状态">{{ chainStatusText(detail.chain_status) }}</el-descriptions-item>
            <el-descriptions-item label="业务执行结果">{{ businessSuccessText(detail.business_success) }}</el-descriptions-item>
            <el-descriptions-item label="结果信息" :span="2">{{ displayValue(detail.result_message) }}</el-descriptions-item>
            <el-descriptions-item v-if="hasValue(detail.error_message)" label="错误信息" :span="2">
              {{ displayValue(detail.error_message) }}
            </el-descriptions-item>
          </el-descriptions>

          <h3 class="detail-section-title">数据源与业务字段</h3>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="记录键" :span="2">
              <span class="breakable-value">{{ displayValue(detail.record_key) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="数据源类型">{{ sourceKindText(detail.source_kind) }}</el-descriptions-item>
            <el-descriptions-item label="批次">{{ displayValue(detail.batch_id) }}</el-descriptions-item>
            <el-descriptions-item label="业务交易编号">{{ displayValue(detail.business_transaction_id) }}</el-descriptions-item>
            <el-descriptions-item label="Token ID">{{ displayValue(detail.token_id) }}</el-descriptions-item>
            <el-descriptions-item label="组织 / 服务端口">{{ organizationText(detail) }}</el-descriptions-item>
            <el-descriptions-item label="操作">{{ displayValue(detail.operation) }}</el-descriptions-item>
            <el-descriptions-item label="开始时间">{{ displayValue(detail.started_at) }}</el-descriptions-item>
            <el-descriptions-item label="完成时间">{{ displayValue(detail.finished_at) }}</el-descriptions-item>
            <el-descriptions-item label="耗时">{{ formatDuration(detail.duration_ms) }}</el-descriptions-item>
            <el-descriptions-item label="原始金额">{{ displayValue(detail.value_raw) }}</el-descriptions-item>
            <el-descriptions-item label="格式化金额">{{ formatAmount(detail) }}</el-descriptions-item>
            <el-descriptions-item v-if="hasValue(detail.fee) || hasValue(detail.fee_raw)" label="数据源手续费">
              {{ formatFee(detail) }}
            </el-descriptions-item>
            <el-descriptions-item label="业务 From 地址" :span="2">
              <span class="breakable-value">{{ displayValue(detail.from_address) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="业务 To 地址" :span="2">
              <span class="breakable-value">{{ displayValue(detail.to_address) }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <h3 class="detail-section-title">监管信息</h3>
          <el-descriptions :column="2" border>
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
      username: localStorage.getItem('username') || 'user',
      userId: localStorage.getItem('userId') || '-',
      overview: { available: false, total: 0, finished_total: 0, status_counts: { ...EMPTY_COUNTS } },
      overviewDate: '',
      overviewLoading: false,
      overviewLoaded: false,
      overviewError: '',
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
      totalRecords: null,
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
      detailRequestId: 0,
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
      return !this.overviewError && this.overview.available === true
    },
    availabilityMessage() {
      return this.overviewError || this.overview.message || '交易数据源暂时不可用。'
    },
    overviewCards() {
      return [
        { key: 'finished', label: '交易完成数量', value: this.overview.finished_total ?? 0, note: '数据库全部交易记录数' },
        { key: 'total', label: '当日交易量', value: this.overview.total ?? 0, note: this.overview.stat_date || '尚无统计日期' },
        { key: 'submitted', label: '已提交', value: this.statusCount('submitted'), note: '当前统计日期' },
        { key: 'risk', label: '存在风险', value: this.statusCount('risk'), note: '当前统计日期未处置风险' }
      ]
    },
    isHistoricalDate() {
      if (!this.overview.stat_date || this.overviewDate) return false
      return this.overview.stat_date !== this.todayString()
    },
    pageNumber() {
      return this.cursorHistory.length + 1
    },
    totalPages() {
      const total = Number(this.totalRecords)
      const size = Number(this.pageSize)
      if (this.totalRecords === null || !Number.isFinite(total) || total < 0 || !Number.isFinite(size) || size <= 0) {
        return null
      }
      return total === 0 ? 0 : Math.ceil(total / size)
    },
    paginationSummary() {
      if (this.totalPages !== null) {
        return `第 ${this.pageNumber} / ${this.totalPages} 页，共 ${this.formatInteger(this.totalRecords)} 条`
      }
      return `第 ${this.pageNumber} 页，本页 ${this.transactions.length} 条`
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
      this.overviewError = ''
      try {
        const params = {}
        if (this.overviewDate) params.date = this.overviewDate
        params.timezone = 'Asia/Shanghai'
        const response = await fetchTransactionOverview(params, controller.signal)
        if (requestId === this.overviewRequestId) {
          this.overview = response.data || { available: false }
        }
      } catch (error) {
        if (!this.isCanceled(error) && requestId === this.overviewRequestId) {
          this.overviewError = this.errorMessage(error, '交易统计加载失败')
          if (!silent) ElMessage.error(this.overviewError)
        }
      } finally {
        if (requestId === this.overviewRequestId) {
          this.overviewLoading = false
          this.overviewLoaded = true
        }
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
        const responseTotal = Number(response.data.total)
        this.totalRecords = Object.prototype.hasOwnProperty.call(response.data, 'total') && Number.isFinite(responseTotal) && responseTotal >= 0
          ? responseTotal
          : null
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
      this.totalRecords = null
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
      const requestId = ++this.detailRequestId
      this.detailLoading = true
      this.detailError = ''
      try {
        const response = await fetchTransactionDetail(this.detailIdentifier, controller.signal)
        if (requestId === this.detailRequestId) this.detail = response.data || {}
      } catch (error) {
        if (!this.isCanceled(error) && requestId === this.detailRequestId) {
          this.detailError = this.errorMessage(error, '交易详情加载失败')
        }
      } finally {
        if (requestId === this.detailRequestId) this.detailLoading = false
      }
    },
    retryDetail() {
      this.loadDetail()
    },
    closeDetail() {
      this.abortRequest('detailController')
      this.detailRequestId += 1
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
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') return detail
      if (detail?.message) return detail.message
      return error?.response?.data?.message || error?.message || fallback
    },
    hasValue(value) {
      return value !== null && value !== undefined && value !== ''
    },
    displayValue(value) {
      return this.hasValue(value) ? String(value) : '—'
    },
    formatInteger(value) {
      const number = Number(value)
      return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '0'
    },
    formatIntegerOrDash(value) {
      if (!this.hasValue(value)) return '—'
      const number = Number(value)
      return Number.isFinite(number) ? number.toLocaleString('zh-CN') : this.displayValue(value)
    },
    statusCount(status) {
      const nestedValue = this.overview.status_counts?.[status]
      return nestedValue ?? this.overview[status] ?? 0
    },
    formatTimestamp(value) {
      if (value === null || value === undefined || value === '') return '—'
      const number = Number(value)
      if (!Number.isFinite(number)) return this.displayValue(value)
      const milliseconds = number < 100000000000 ? number * 1000 : number
      const date = new Date(milliseconds)
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false
      })
    },
    formatDateTime(value, timestampFallback) {
      if (!this.hasValue(value)) return this.formatTimestamp(timestampFallback)
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return this.displayValue(value)
      return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
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
    formatDuration(value) {
      if (!this.hasValue(value)) return '—'
      const milliseconds = Number(value)
      if (!Number.isFinite(milliseconds)) return this.displayValue(value)
      if (milliseconds < 1000) return `${milliseconds.toLocaleString('zh-CN')} ms`
      return `${(milliseconds / 1000).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} s`
    },
    middleEllipsis(value, visibleLength = 14) {
      if (!value) return '—'
      const text = String(value)
      if (text.length <= visibleLength) return text
      const side = Math.floor((visibleLength - 1) / 2)
      return `${text.slice(0, side)}…${text.slice(-side)}`
    },
    fallbackIdentifierText(row) {
      if (this.hasValue(row.business_transaction_id)) {
        return `业务编号：${this.middleEllipsis(row.business_transaction_id, 18)}`
      }
      return `记录键：${this.middleEllipsis(row.record_key, 18)}`
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
      return { success: '成功', failed: '失败', unknown: '未知' }[status] || this.displayValue(status)
    },
    chainTagType(status) {
      return { success: 'success', failed: 'danger', unknown: 'info' }[status] || 'info'
    },
    txTypeText(type) {
      return {
        INVOKE_CONTRACT: '调用合约',
        QUERY_CONTRACT: '查询合约',
        SUBSCRIBE: '订阅',
        ARCHIVE: '归档'
      }[type] || this.displayValue(type)
    },
    businessSuccessText(value) {
      if (value === true) return '成功'
      if (value === false) return '失败'
      return '—'
    },
    sourceKindText(value) {
      return { chain: 'ChainMaker 链上数据' }[value] || this.displayValue(value)
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
.home {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  background: #f4f6f8;
  color: #17202a;
}

.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.transaction-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  padding: 24px;
  overflow-x: hidden;
  overflow-y: auto;
}

.transaction-page {
  width: min(100%, 1720px);
  margin: 0 auto;
  padding-bottom: 24px;
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
  margin-bottom: 20px;
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

.page-header span,
.section-heading span {
  color: #687481;
  font-size: 13px;
}

.eyebrow {
  margin: 0;
  color: #397265;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.availability-alert {
  margin-bottom: 14px;
}

.overview-toolbar,
.filter-section,
.table-section {
  background: #fff;
  border: 1px solid #dce2e7;
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
  border: 1px solid #dce2e7;
  border-top: 3px solid #397265;
  border-radius: 6px;
}

.kpi-card.submitted { border-top-color: #3b82f6; }
.kpi-card.risk { border-top-color: #dc2626; }
.kpi-card.finished { border-top-color: #16a34a; }

.kpi-card span,
.kpi-card small {
  display: block;
  color: #6c7782;
  font-size: 13px;
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

.hash-cell small {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #7b8792;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overflow-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cursor-pagination {
  margin-top: 12px;
}

.pagination-summary {
  color: #5f6b76;
  font-size: 14px;
  white-space: nowrap;
}

.pagination-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.page-size {
  width: 118px;
}

.detail-body {
  min-height: 260px;
}

.detail-section-title {
  margin: 22px 0 12px;
  font-size: 16px;
  letter-spacing: 0;
}

.detail-section-title:first-child {
  margin-top: 0;
}

.breakable-value {
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
  .cursor-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .pagination-actions {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  :deep(.el-descriptions__body .el-descriptions__table) {
    table-layout: fixed;
  }
}
</style>
