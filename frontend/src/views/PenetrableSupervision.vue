<template>
  <div class="home">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <main class="content">
        <section class="supervision-page">
          <header class="page-header">
            <div>
              <p class="eyebrow">自动监管分析平台</p>
              <h2>穿透式账户监管工作台</h2>
              <span>持续发现、排队检测并沉淀账户风险快照。</span>
            </div>
            <div class="manual-check">
              <input
                v-model.trim="manualAddress"
                type="text"
                placeholder="人工补检账户 0x..."
                :disabled="submitting"
                @keyup.enter="submitManualTask"
              />
              <button :disabled="submitting" @click="submitManualTask">
                {{ submitting ? '提交中' : '提交补检' }}
              </button>
            </div>
          </header>

          <div v-if="!serviceStatus.api_ready" class="service-warning">
            <strong>模型 API 当前未运行</strong>
            <span>监管数据暂停刷新，打开下方“模型 API”开关即可恢复服务。</span>
          </div>

          <section class="kpi-grid">
            <article v-for="item in kpis" :key="item.label" class="kpi-card">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
              <small>{{ item.note }}</small>
            </article>
          </section>

          <section class="status-band">
            <div class="section-heading">
              <div>
                <p class="section-kicker">自动监管状态</p>
                <h3>监管流水线</h3>
              </div>
              <div class="toolbar">
                <div class="service-control">
                  <span>模型 API</span>
                  <el-switch
                    v-model="modelApiSwitch"
                    :loading="serviceActionBusy"
                    inline-prompt
                    active-text="开"
                    inactive-text="关"
                    @change="toggleModelApi"
                  />
                  <b :class="{ online: serviceStatus.api_ready }">
                    {{ serviceStatus.api_ready ? '服务正常' : '服务停止' }}
                  </b>
                </div>
                <span class="auto-state" :class="autoStatus.status">
                  {{ autoStatusText }}
                </span>
                <el-radio-group v-model="autoMode" size="small" :disabled="autoStatus.status === 'running'">
                  <el-radio-button label="continuous">持续监管</el-radio-button>
                  <el-radio-button label="scan_once">单次扫描</el-radio-button>
                </el-radio-group>
                <button class="secondary" :disabled="autoActionBusy" @click="discoverAccounts">发现账户</button>
                <button
                  v-if="autoStatus.status !== 'running'"
                  :disabled="autoActionBusy"
                  @click="startAutoSupervision"
                >
                  启动自动监管
                </button>
                <button v-else class="danger-btn" :disabled="autoActionBusy" @click="stopAutoSupervision">
                  停止自动监管
                </button>
              </div>
            </div>
            <div class="agent-grid">
              <div v-for="agent in agentStates" :key="agent.name" class="agent-item">
                <i :class="agent.state"></i>
                <div>
                  <strong>{{ agent.name }}</strong>
                  <span>{{ agent.description }}</span>
                </div>
                <b>{{ agent.metric }}</b>
              </div>
            </div>
          </section>

          <section class="data-section">
            <div class="section-heading">
              <div>
                <p class="section-kicker">任务队列</p>
                <h3>正在检测与最近任务</h3>
              </div>
              <button class="secondary" @click="refreshDashboard">刷新</button>
            </div>
            <el-table :data="tasks" stripe height="280" empty-text="暂无检测任务">
              <el-table-column prop="address" label="账户地址" min-width="280" show-overflow-tooltip />
              <el-table-column prop="source" label="来源" width="120">
                <template #default="{ row }">{{ sourceText(row.source) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="120">
                <template #default="{ row }">
                  <el-tag :type="taskTagType(row.status)" effect="plain">{{ taskStatusText(row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="进度" width="180">
                <template #default="{ row }">
                  <el-progress :percentage="Math.round((row.progress || 0) * 100)" :stroke-width="8" />
                </template>
              </el-table-column>
              <el-table-column prop="num_nodes" label="节点" width="80" />
              <el-table-column prop="num_edges" label="边" width="80" />
              <el-table-column label="排队时间" width="180">
                <template #default="{ row }">{{ formatTime(row.queued_at) }}</template>
              </el-table-column>
              <el-table-column label="错误" min-width="180" show-overflow-tooltip>
                <template #default="{ row }">{{ row.error_message || '-' }}</template>
              </el-table-column>
              <el-table-column label="检测过程" width="110" fixed="right">
                <template #default="{ row }">
                  <button class="table-action" @click.stop="openTaskProcess(row)">查看过程</button>
                </template>
              </el-table-column>
            </el-table>
          </section>

          <section class="data-section">
            <div class="section-heading">
              <div>
                <p class="section-kicker">风险交易提示</p>
                <h3>中高风险交易事件</h3>
              </div>
              <span>{{ riskTransactions.length }} 条</span>
            </div>
            <el-table :data="riskTransactions" stripe height="280" empty-text="暂无风险交易">
              <el-table-column label="等级" width="90">
                <template #default="{ row }">
                  <el-tag :type="row.risk_level === 'high' ? 'danger' : 'warning'">
                    {{ riskLevelText(row.risk_level) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="tx_hash" label="交易哈希" min-width="190" show-overflow-tooltip />
              <el-table-column prop="from_address" label="From" min-width="190" show-overflow-tooltip />
              <el-table-column prop="to_address" label="To" min-width="190" show-overflow-tooltip />
              <el-table-column prop="value" label="金额" width="110" />
              <el-table-column prop="related_account" label="关联异常账户" min-width="190" show-overflow-tooltip />
              <el-table-column label="类别" width="120">
                <template #default="{ row }">{{ labelText(row.related_account_label) }}</template>
              </el-table-column>
              <el-table-column label="风险原因" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">{{ (row.risk_reasons || []).join('；') || '-' }}</template>
              </el-table-column>
              <el-table-column label="处置状态" width="110">
                <template #default="{ row }">{{ row.action_status === 'unhandled' ? '待处置' : row.action_status }}</template>
              </el-table-column>
            </el-table>
          </section>

          <section class="data-section">
            <div class="section-heading">
              <div>
                <p class="section-kicker">账户状态库</p>
                <h3>已检测账户</h3>
              </div>
              <span>点击账户查看检测快照和交易子图</span>
            </div>
            <el-table
              :data="accounts"
              stripe
              height="360"
              empty-text="暂无已检测账户"
              row-class-name="clickable-row"
              @row-click="openAccountDetail"
            >
              <el-table-column prop="address" label="账户地址" min-width="300" show-overflow-tooltip />
              <el-table-column label="检测类别" width="130">
                <template #default="{ row }">{{ labelText(row.current_label) }}</template>
              </el-table-column>
              <el-table-column label="异常状态" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.is_anomaly ? 'danger' : 'success'">
                    {{ row.is_anomaly ? '异常' : '正常' }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="异常概率" width="120">
                <template #default="{ row }">{{ formatPercent(row.anomaly_probability) }}</template>
              </el-table-column>
              <el-table-column label="风险等级" width="110">
                <template #default="{ row }">{{ riskLevelText(row.risk_level) }}</template>
              </el-table-column>
              <el-table-column prop="detection_count" label="检测次数" width="100" />
              <el-table-column prop="num_nodes" label="节点" width="80" />
              <el-table-column prop="num_edges" label="边" width="80" />
              <el-table-column label="最后检测" width="180">
                <template #default="{ row }">{{ formatTime(row.last_detected_at) }}</template>
              </el-table-column>
            </el-table>
          </section>
        </section>
      </main>
    </div>

    <el-drawer
      v-model="processDrawerVisible"
      size="72%"
      :destroy-on-close="true"
      @closed="closeTaskProcess"
    >
      <template #header>
        <div class="drawer-title">
          <div>
            <p class="section-kicker">检测过程</p>
            <h3>{{ processTask.address || '账户检测任务' }}</h3>
          </div>
          <el-tag :type="taskTagType(processTask.status)" effect="plain">
            {{ taskStatusText(processTask.status) }}
          </el-tag>
        </div>
      </template>
      <div class="process-content">
        <section class="process-steps">
          <div v-for="step in processSteps" :key="step.key" class="process-step" :class="step.state">
            <i></i>
            <div>
              <strong>{{ step.label }}</strong>
              <span>{{ step.description }}</span>
            </div>
          </div>
        </section>
        <section class="process-progress">
          <div>
            <span>{{ processProgressText }}</span>
            <b>{{ processVisualProgress }}%</b>
          </div>
          <el-progress :percentage="processVisualProgress" :show-text="false" :stroke-width="10" />
        </section>
        <section class="process-result">
          <div class="process-verdict">
            <span>异常类别</span>
            <strong>{{ processCategoryText }}</strong>
          </div>
          <div class="process-verdict">
            <span>异常概率</span>
            <strong>{{ processResultSnapshot.anomaly_probability == null ? '分析中' : formatPercent(processResultSnapshot.anomaly_probability) }}</strong>
          </div>
          <div class="process-probabilities">
            <div v-for="(value, key) in processResultSnapshot.class_probabilities || {}" :key="key">
              <span>{{ labelText(key) }}</span>
              <b>{{ formatPercent(value) }}</b>
              <el-progress
                :percentage="Math.round((value || 0) * 100)"
                :show-text="false"
                :status="processResultSnapshot.pass_threshold?.[key] ? 'exception' : ''"
              />
            </div>
            <span v-if="!Object.keys(processResultSnapshot.class_probabilities || {}).length" class="result-pending">
              模型完成分析后显示四类账户概率。
            </span>
          </div>
        </section>
        <section class="process-graph-panel">
          <div class="section-heading">
            <div>
              <p class="section-kicker">{{ processShouldAnimate ? '动态构图' : '采样结果' }}</p>
              <h3>{{ processShouldAnimate ? '分析过程中逐步展开节点' : '账户交易子图' }}</h3>
            </div>
            <span>{{ processDisplayedNodes.length }} / {{ processGraphData?.nodes?.length || processTask.num_nodes || 0 }} 节点</span>
          </div>
          <div ref="processGraph" class="process-graph"></div>
          <div v-if="!processTask.subgraph_path" class="process-waiting">
            <strong>{{ processTask.status === 'queued' ? '等待采样任务启动' : '正在生成账户交易子图' }}</strong>
            <span>子图文件生成后，节点会以 2.5 秒间隔逐步显示。</span>
          </div>
        </section>
      </div>
    </el-drawer>

    <el-drawer v-model="drawerVisible" size="78%" :destroy-on-close="true" @closed="disposeDetailChart">
      <template #header>
        <div class="drawer-title">
          <div>
            <p class="section-kicker">账户详情</p>
            <h3>{{ detailAddress }}</h3>
          </div>
          <button class="secondary" :disabled="submitting" @click="rescanDetail">重新检测</button>
        </div>
      </template>
      <div v-loading="detailLoading" class="drawer-content">
        <section class="detail-summary">
          <div>
            <span>当前类别</span>
            <strong>{{ labelText(detailState.current_label) }}</strong>
          </div>
          <div>
            <span>异常概率</span>
            <strong>{{ formatPercent(detailState.anomaly_probability) }}</strong>
          </div>
          <div>
            <span>风险等级</span>
            <strong>{{ riskLevelText(detailState.risk_level) }}</strong>
          </div>
          <div>
            <span>子图规模</span>
            <strong>{{ detailState.num_nodes || 0 }} / {{ detailState.num_edges || 0 }}</strong>
          </div>
          <div>
            <span>模型版本</span>
            <strong>{{ detailState.last_model_version || '-' }}</strong>
          </div>
        </section>
        <section class="detail-grid">
          <div class="graph-panel">
            <div class="section-heading">
              <h3>账户交易关系子图</h3>
              <span>{{ graphSummary }}</span>
            </div>
            <div ref="detailGraph" class="detail-graph"></div>
            <p v-if="!detailState.subgraph_path && !detailLoading" class="empty-hint">该账户暂无可用子图。</p>
          </div>
          <aside class="probability-panel">
            <h3>分类结果</h3>
            <div v-for="(value, key) in detailSnapshot.class_probabilities || {}" :key="key" class="probability-row">
              <div>
                <span>{{ labelText(key) }}</span>
                <b>{{ formatPercent(value) }}</b>
              </div>
              <el-progress
                :percentage="Math.round((value || 0) * 100)"
                :show-text="false"
                :status="detailSnapshot.pass_threshold?.[key] ? 'exception' : ''"
              />
            </div>
            <h3>目标账户摘要</h3>
            <dl>
              <dt>入账次数</dt><dd>{{ formatNumber(anchorSummary.inCount) }}</dd>
              <dt>出账次数</dt><dd>{{ formatNumber(anchorSummary.outCount) }}</dd>
              <dt>入账金额</dt><dd>{{ formatCompact(anchorSummary.inAmount) }}</dd>
              <dt>出账金额</dt><dd>{{ formatCompact(anchorSummary.outAmount) }}</dd>
            </dl>
          </aside>
        </section>
        <section class="detail-transactions">
          <div class="section-heading">
            <h3>目标账户关联交易</h3>
            <span>{{ detailTransactions.length }} 条</span>
          </div>
          <el-table :data="detailTransactions" stripe height="260" empty-text="暂无交易边">
            <el-table-column prop="direction" label="方向" width="90" />
            <el-table-column prop="from" label="From" min-width="220" show-overflow-tooltip />
            <el-table-column prop="to" label="To" min-width="220" show-overflow-tooltip />
            <el-table-column prop="count" label="次数" width="90" />
            <el-table-column prop="amount" label="金额" width="140" />
            <el-table-column prop="fee" label="手续费" width="120" />
          </el-table>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import axios from 'axios'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'

const MODEL_API_BASE = process.env.VUE_APP_MODEL_API_BASE || 'http://10.112.47.214:8000'
const SERVICE_CONTROL_BASE = process.env.VUE_APP_SERVICE_CONTROL_BASE || MODEL_API_BASE.replace(/:8000$/, ':8001')
const POLL_INTERVAL_MS = 5000
const GET_TIMEOUT = 30000
const POST_TIMEOUT = 120000
const GRAPH_NODE_REVEAL_MS = 2500
const INFERENCE_DURATION_MS = 5500

export default {
  name: 'PenetrableSupervision',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      username: localStorage.getItem('username') || 'user',
      userId: localStorage.getItem('userId') || '-',
      overview: {},
      tasks: [],
      accounts: [],
      riskTransactions: [],
      autoStatus: { status: 'stopped' },
      autoMode: 'continuous',
      serviceStatus: { status: 'stopped', active: false, api_ready: false },
      modelApiSwitch: false,
      manualAddress: '',
      submitting: false,
      autoActionBusy: false,
      serviceActionBusy: false,
      pollingTimer: null,
      refreshing: false,
      drawerVisible: false,
      detailLoading: false,
      detailAddress: '',
      detail: {},
      detailGraphData: null,
      detailChart: null,
      detailTransactions: [],
      processDrawerVisible: false,
      processTask: {},
      processGraphData: null,
      processResultDetail: {},
      processChart: null,
      processDisplayedNodes: [],
      processDisplayedLinks: [],
      processAnimationTimer: null,
      processProgressTimer: null,
      processInferenceProgress: 0,
      processGraphLoadedPath: ''
    }
  },
  computed: {
    kpis() {
      return [
        { label: '已检测账户数', value: this.overview.detected_accounts || 0, note: '账户状态库' },
        { label: '异常账户数', value: this.overview.anomaly_accounts || 0, note: '通过分类阈值' },
        { label: '异常账户占比', value: this.formatPercent(this.overview.anomaly_ratio), note: '异常 / 已检测' },
        { label: '正在检测账户数', value: this.overview.running_tasks || 0, note: '采样、推理或保存' },
        { label: '待检测账户数', value: this.overview.pending_tasks || 0, note: '任务队列' },
        { label: '高风险交易数', value: this.overview.high_risk_transactions || 0, note: '待监管处置' }
      ]
    },
    agentStates() {
      const running = this.autoStatus.status === 'running'
      return [
        {
          name: 'Observer',
          state: running ? 'active' : 'idle',
          description: running ? '正在发现预生成子图账户' : '等待启动自动发现',
          metric: `${this.overview.pending_tasks || 0} 待检`
        },
        {
          name: 'Analysis',
          state: (this.overview.running_tasks || 0) > 0 ? 'active' : 'idle',
          description: '执行子图采样与异常模型推理',
          metric: `${this.overview.running_tasks || 0} 运行`
        },
        {
          name: 'Governance',
          state: (this.overview.high_risk_transactions || 0) > 0 ? 'warning' : 'idle',
          description: '汇总异常账户和风险交易事件',
          metric: `${this.overview.high_risk_transactions || 0} 高风险`
        }
      ]
    },
    autoStatusText() {
      if (this.autoStatus.status === 'running') {
        return this.autoStatus.mode === 'scan_once' ? '单次扫描执行中' : '持续监管运行中'
      }
      if (this.autoStatus.completion_reason === 'scan_completed') return '单次扫描已完成'
      return '自动监管已停止'
    },
    processSteps() {
      const order = ['queued', 'sampling', 'inferencing', 'saving', 'done']
      const currentIndex = order.indexOf(this.processTask.status)
      const failed = this.processTask.status === 'failed'
      return [
        { key: 'sampling', label: '子图采样', description: '提取目标账户交易邻域', index: 1 },
        { key: 'drawing', label: '动态构图', description: '逐步展开节点和交易关系', index: 2 },
        { key: 'inferencing', label: '模型分析', description: '执行四类异常账户检测', index: 2 },
        { key: 'saving', label: '结果保存', description: '写入快照和账户状态', index: 3 }
      ].map((step) => ({
        ...step,
        state: failed
          ? 'failed'
          : currentIndex > step.index
            ? 'done'
            : currentIndex === step.index
              ? 'active'
              : 'pending'
      }))
    },
    processVisualProgress() {
      if (this.processInferenceProgress > 0 && this.processInferenceProgress < 100) {
        return Math.max(65, Math.round(65 + this.processInferenceProgress * 0.25))
      }
      return Math.round((this.processTask.progress || 0) * 100)
    },
    processProgressText() {
      if (this.processInferenceProgress > 0 && this.processInferenceProgress < 100) return '模型正在分析账户行为特征'
      return {
        queued: '任务等待执行',
        sampling: '正在采样账户交易子图',
        inferencing: '正在执行异常模型分析',
        saving: '正在保存检测结果',
        done: '检测与结果保存已完成',
        failed: this.processTask.error_message || '检测任务失败'
      }[this.processTask.status] || '等待任务状态'
    },
    processShouldAnimate() {
      return ['sampling', 'inferencing', 'saving'].includes(this.processTask.status)
    },
    processResultSnapshot() {
      return this.processResultDetail.latest_snapshot || {}
    },
    processCategoryText() {
      const snapshot = this.processResultSnapshot
      if (!snapshot.pred_label) return '模型分析中'
      return snapshot.is_anomaly
        ? `${this.labelText(snapshot.display_label || snapshot.pred_label)}（异常）`
        : '正常账户'
    },
    detailState() {
      return this.detail.current_state || {}
    },
    detailSnapshot() {
      return this.detail.latest_snapshot || {}
    },
    graphSummary() {
      const summary = this.detailGraphData?.summary
      if (!summary) return '等待加载'
      return `${summary.num_nodes_returned} 节点 / ${summary.num_links_returned} 边`
    },
    anchorSummary() {
      const node = this.findNodeByAddress(this.detailAddress)
      const raw = node?.raw || {}
      return {
        inCount: raw.N_in_cnt || 0,
        outCount: raw.N_out_cnt || 0,
        inAmount: raw.N_in_sum_amt || 0,
        outAmount: raw.N_out_sum_amt || 0
      }
    }
  },
  mounted() {
    this.refreshDashboard()
    this.pollingTimer = window.setInterval(this.refreshDashboard, POLL_INTERVAL_MS)
    window.addEventListener('resize', this.resizeDetailChart)
    window.addEventListener('resize', this.resizeProcessChart)
  },
  beforeUnmount() {
    if (this.pollingTimer) window.clearInterval(this.pollingTimer)
    window.removeEventListener('resize', this.resizeDetailChart)
    window.removeEventListener('resize', this.resizeProcessChart)
    this.disposeDetailChart()
    this.closeTaskProcess()
  },
  methods: {
    async refreshDashboard() {
      if (this.refreshing) return
      this.refreshing = true
      const requests = [
        axios.get(`${MODEL_API_BASE}/api/supervision/overview`, { timeout: GET_TIMEOUT }),
        axios.get(`${MODEL_API_BASE}/api/supervision/tasks`, { params: { page: 1, page_size: 50 }, timeout: GET_TIMEOUT }),
        axios.get(`${MODEL_API_BASE}/api/supervision/accounts`, { params: { page: 1, page_size: 100 }, timeout: GET_TIMEOUT }),
        axios.get(`${MODEL_API_BASE}/api/supervision/risk-transactions`, { params: { page: 1, page_size: 50 }, timeout: GET_TIMEOUT }),
        axios.get(`${MODEL_API_BASE}/api/supervision/auto/status`, { timeout: GET_TIMEOUT }),
        axios.get(`${SERVICE_CONTROL_BASE}/api/service/model/status`, { timeout: GET_TIMEOUT })
      ]
      const [overview, tasks, accounts, risks, auto, service] = await Promise.allSettled(requests)
      if (overview.status === 'fulfilled') this.overview = overview.value.data
      if (tasks.status === 'fulfilled') {
        this.tasks = tasks.value.data.items || []
        this.syncProcessTask()
      }
      if (accounts.status === 'fulfilled') this.accounts = accounts.value.data.items || []
      if (risks.status === 'fulfilled') this.riskTransactions = risks.value.data.items || []
      if (auto.status === 'fulfilled') {
        this.autoStatus = auto.value.data
        if (auto.value.data.mode) this.autoMode = auto.value.data.mode
      }
      if (service.status === 'fulfilled') {
        this.serviceStatus = service.value.data
        this.modelApiSwitch = Boolean(service.value.data.active)
      }
      this.refreshing = false
    },
    async toggleModelApi(enabled) {
      this.serviceActionBusy = true
      try {
        const action = enabled ? 'start' : 'stop'
        const response = await axios.post(
          `${SERVICE_CONTROL_BASE}/api/service/model/${action}`,
          null,
          { timeout: POST_TIMEOUT }
        )
        this.serviceStatus = response.data
        this.modelApiSwitch = Boolean(response.data.active)
        ElMessage.success(enabled ? '模型 API 已启动' : '模型 API 已停止')
        if (enabled) await this.refreshDashboard()
      } catch (error) {
        this.modelApiSwitch = !enabled
        ElMessage.error(this.errorMessage(error, '模型 API 操作失败'))
      } finally {
        this.serviceActionBusy = false
      }
    },
    async submitManualTask() {
      const address = this.manualAddress.trim().toLowerCase()
      if (!/^0x[0-9a-f]{40}$/.test(address)) {
        ElMessage.warning('请输入有效的以太坊账户地址')
        return
      }
      this.submitting = true
      try {
        const response = await axios.post(
          `${MODEL_API_BASE}/api/supervision/tasks`,
          { address, source: 'manual', force: false },
          { timeout: POST_TIMEOUT }
        )
        ElMessage.success(`任务已创建：${response.data.task_id}`)
        this.manualAddress = ''
        await this.refreshDashboard()
      } catch (error) {
        ElMessage.error(this.errorMessage(error, '补检任务创建失败'))
      } finally {
        this.submitting = false
      }
    },
    async discoverAccounts() {
      await this.runAutoAction('/api/supervision/auto/discover-prebuilt?limit=50', '账户发现已执行')
    },
    async startAutoSupervision() {
      await this.runAutoAction(
        `/api/supervision/auto/start?mode=${this.autoMode}&limit=50&interval_seconds=60`,
        this.autoMode === 'continuous' ? '持续监管已启动' : '单次扫描已启动'
      )
    },
    async stopAutoSupervision() {
      await this.runAutoAction('/api/supervision/auto/stop', '自动监管已停止')
    },
    async runAutoAction(path, successMessage) {
      this.autoActionBusy = true
      try {
        const response = await axios.post(`${MODEL_API_BASE}${path}`, null, { timeout: POST_TIMEOUT })
        const queued = response.data.queued
        ElMessage.success(queued === undefined ? successMessage : `${successMessage}，新增 ${queued} 个任务`)
        await this.refreshDashboard()
      } catch (error) {
        ElMessage.error(this.errorMessage(error, '自动监管操作失败'))
      } finally {
        this.autoActionBusy = false
      }
    },
    async openAccountDetail(row) {
      this.drawerVisible = true
      this.detailLoading = true
      this.detailAddress = row.address
      this.detail = {}
      this.detailGraphData = null
      this.detailTransactions = []
      try {
        const response = await axios.get(
          `${MODEL_API_BASE}/api/supervision/accounts/${encodeURIComponent(row.address)}`,
          { timeout: GET_TIMEOUT }
        )
        this.detail = response.data
        const path = this.detail.current_state?.subgraph_path
        if (path) await this.loadDetailGraph(path, row.address)
      } catch (error) {
        ElMessage.error(this.errorMessage(error, '账户详情加载失败'))
      } finally {
        this.detailLoading = false
      }
    },
    async openTaskProcess(row) {
      this.closeTaskProcess()
      this.processTask = { ...row }
      this.processDrawerVisible = true
      if (row.status === 'done') await this.loadProcessResult(row.address)
      if (row.subgraph_path) await this.loadProcessGraph(row.subgraph_path, row.address)
    },
    syncProcessTask() {
      if (!this.processDrawerVisible || !this.processTask.task_id) return
      const updated = this.tasks.find((task) => task.task_id === this.processTask.task_id)
      if (!updated) return
      const previousStatus = this.processTask.status
      this.processTask = { ...updated }
      if (updated.subgraph_path && updated.subgraph_path !== this.processGraphLoadedPath) {
        this.loadProcessGraph(updated.subgraph_path, updated.address)
      }
      if (updated.status === 'done' && previousStatus !== 'done') {
        this.showCompleteProcessGraph()
        this.loadProcessResult(updated.address)
      }
    },
    async loadProcessResult(address) {
      try {
        const response = await axios.get(
          `${MODEL_API_BASE}/api/supervision/accounts/${encodeURIComponent(address)}`,
          { timeout: GET_TIMEOUT }
        )
        this.processResultDetail = response.data
      } catch (error) {
        ElMessage.error(this.errorMessage(error, '检测概率结果加载失败'))
      }
    },
    async loadProcessGraph(filePath, address) {
      this.processGraphLoadedPath = filePath
      try {
        const response = await axios.post(
          `${MODEL_API_BASE}/api/subgraph/echarts`,
          { file_path: filePath, anchor_address: address, max_nodes: 24, max_links: 72 },
          { timeout: POST_TIMEOUT }
        )
        this.processGraphData = response.data
        this.processDisplayedNodes = []
        this.processDisplayedLinks = []
        await this.$nextTick()
        this.initProcessChart()
        if (this.processShouldAnimate) {
          this.animateProcessGraph()
        } else {
          this.showCompleteProcessGraph()
        }
      } catch (error) {
        this.processGraphLoadedPath = ''
        ElMessage.error(this.errorMessage(error, '检测过程子图加载失败'))
      }
    },
    initProcessChart() {
      if (!this.$refs.processGraph) return
      this.disposeProcessChart()
      this.processChart = echarts.init(this.$refs.processGraph)
      this.renderProcessGraph()
    },
    renderProcessGraph() {
      if (!this.processChart || !this.processGraphData) return
      this.processChart.setOption({
        tooltip: { trigger: 'item' },
        legend: [{ data: (this.processGraphData.categories || []).map((item) => item.name), bottom: 8 }],
        animationDurationUpdate: 800,
        series: [{
          type: 'graph',
          layout: 'force',
          roam: true,
          data: this.processDisplayedNodes,
          links: this.processDisplayedLinks,
          categories: this.processGraphData.categories || [],
          label: { show: false },
          emphasis: { focus: 'adjacency', label: { show: true } },
          lineStyle: { color: 'source', curveness: 0.08, opacity: 0.58 },
          force: { repulsion: 130, edgeLength: [65, 130], gravity: 0.08 }
        }]
      }, true)
    },
    animateProcessGraph() {
      this.clearProcessTimers()
      const nodes = this.processGraphData?.nodes || []
      const links = this.processGraphData?.links || []
      if (!nodes.length) return
      let index = 0
      const revealNext = () => {
        this.processDisplayedNodes = nodes.slice(0, index + 1)
        const visibleIds = new Set(this.processDisplayedNodes.map((node) => String(node.id || node.name)))
        this.processDisplayedLinks = links.filter(
          (link) => visibleIds.has(String(link.source)) && visibleIds.has(String(link.target))
        )
        this.renderProcessGraph()
        index += 1
        if (index >= nodes.length) {
          window.clearInterval(this.processAnimationTimer)
          this.processAnimationTimer = null
          this.startProcessInferenceAnimation()
        }
      }
      revealNext()
      if (nodes.length > 1) this.processAnimationTimer = window.setInterval(revealNext, GRAPH_NODE_REVEAL_MS)
    },
    showCompleteProcessGraph() {
      this.clearProcessTimers()
      this.processInferenceProgress = 100
      this.processDisplayedNodes = this.processGraphData?.nodes || []
      this.processDisplayedLinks = this.processGraphData?.links || []
      this.renderProcessGraph()
    },
    startProcessInferenceAnimation() {
      this.processInferenceProgress = 1
      const tickMs = 110
      const increment = 100 / (INFERENCE_DURATION_MS / tickMs)
      this.processProgressTimer = window.setInterval(() => {
        this.processInferenceProgress = Math.min(100, this.processInferenceProgress + increment)
        if (this.processInferenceProgress >= 100) {
          window.clearInterval(this.processProgressTimer)
          this.processProgressTimer = null
        }
      }, tickMs)
    },
    clearProcessTimers() {
      if (this.processAnimationTimer) window.clearInterval(this.processAnimationTimer)
      if (this.processProgressTimer) window.clearInterval(this.processProgressTimer)
      this.processAnimationTimer = null
      this.processProgressTimer = null
    },
    closeTaskProcess() {
      this.clearProcessTimers()
      this.disposeProcessChart()
      this.processDrawerVisible = false
      this.processTask = {}
      this.processGraphData = null
      this.processResultDetail = {}
      this.processDisplayedNodes = []
      this.processDisplayedLinks = []
      this.processInferenceProgress = 0
      this.processGraphLoadedPath = ''
    },
    disposeProcessChart() {
      if (this.processChart) {
        this.processChart.dispose()
        this.processChart = null
      }
    },
    resizeProcessChart() {
      if (this.processChart) this.processChart.resize()
    },
    async loadDetailGraph(filePath, address) {
      const response = await axios.post(
        `${MODEL_API_BASE}/api/subgraph/echarts`,
        { file_path: filePath, anchor_address: address, max_nodes: 600, max_links: 1500 },
        { timeout: POST_TIMEOUT }
      )
      this.detailGraphData = response.data
      this.detailTransactions = this.buildTransactionRows(response.data.links || [], address)
      await this.$nextTick()
      this.renderDetailGraph()
    },
    renderDetailGraph() {
      if (!this.$refs.detailGraph || !this.detailGraphData) return
      this.disposeDetailChart()
      this.detailChart = echarts.init(this.$refs.detailGraph)
      const series = {
        ...(this.detailGraphData.series?.[0] || {}),
        data: this.detailGraphData.nodes || [],
        links: this.detailGraphData.links || [],
        categories: this.detailGraphData.categories || [],
        label: { show: false },
        emphasis: { focus: 'adjacency', label: { show: true } },
        lineStyle: { color: 'source', curveness: 0.08, opacity: 0.55 },
        force: { repulsion: 125, edgeLength: [60, 130], gravity: 0.08 }
      }
      this.detailChart.setOption({
        tooltip: {
          trigger: 'item',
          formatter: (params) => params.dataType === 'node'
            ? `${params.name}<br/>连接度：${params.value || 0}`
            : `${params.data.source} → ${params.data.target}<br/>金额：${this.formatCompact(params.data.value)}`
        },
        legend: [{ data: (this.detailGraphData.categories || []).map((item) => item.name), bottom: 8 }],
        animationDurationUpdate: 600,
        series: [series]
      }, true)
    },
    async rescanDetail() {
      this.manualAddress = this.detailAddress
      await this.submitManualTask()
    },
    buildTransactionRows(links, address) {
      const target = String(address || '').toLowerCase()
      return links
        .filter((link) => String(link.source).toLowerCase() === target || String(link.target).toLowerCase() === target)
        .slice(0, 100)
        .map((link) => ({
          direction: String(link.target).toLowerCase() === target ? '转入' : '转出',
          from: link.source,
          to: link.target,
          count: this.formatNumber(link.raw?.E_cnt || 0),
          amount: this.formatCompact(link.raw?.E_sum_amt || link.value || 0),
          fee: this.formatCompact(link.raw?.E_sum_fee || 0)
        }))
    },
    findNodeByAddress(address) {
      const target = String(address || '').toLowerCase()
      return (this.detailGraphData?.nodes || []).find((node) => String(node.id || node.name).toLowerCase() === target)
    },
    disposeDetailChart() {
      if (this.detailChart) {
        this.detailChart.dispose()
        this.detailChart = null
      }
    },
    resizeDetailChart() {
      if (this.detailChart) this.detailChart.resize()
    },
    taskTagType(status) {
      if (status === 'done') return 'success'
      if (status === 'failed') return 'danger'
      if (status === 'queued') return 'info'
      return 'warning'
    },
    taskStatusText(status) {
      return {
        queued: '等待检测',
        sampling: '子图采样',
        inferencing: '模型推理',
        saving: '保存结果',
        done: '已完成',
        failed: '失败'
      }[status] || status || '-'
    },
    sourceText(source) {
      return {
        manual: '人工补检',
        prebuilt: '自动发现',
        watchlist: '观察名单',
        transaction_stream: '交易流',
        risk_expand: '风险扩展',
        external_label: '外部标签'
      }[source] || source || '-'
    },
    labelText(label) {
      return {
        normal: '正常',
        exchange: '交易所',
        ico_wallet: 'ICO 钱包',
        mining: '挖矿账户',
        phish_hack: '钓鱼/黑客'
      }[label] || label || '-'
    },
    riskLevelText(level) {
      return { high: '高风险', medium: '中风险', low: '低风险', normal: '正常', unknown: '未知' }[level] || level || '-'
    },
    formatPercent(value) {
      const number = Number(value)
      return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : '0.00%'
    },
    formatNumber(value) {
      const number = Number(value)
      return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '0'
    },
    formatCompact(value) {
      const number = Number(value)
      if (!Number.isFinite(number)) return '0'
      return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 2 }).format(number)
    },
    formatTime(value) {
      if (!value) return '-'
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
    },
    errorMessage(error, fallback) {
      const detail = error?.response?.data?.detail
      if (typeof detail === 'string') return detail
      if (detail?.message) return detail.message
      return error?.message || fallback
    }
  }
}
</script>

<style scoped>
.home {
  min-height: 100vh;
  background: #f4f6f8;
  color: #17202a;
}

.main-content {
  display: flex;
  min-height: calc(100vh - 64px);
}

.content {
  flex: 1;
  min-width: 0;
  padding: 24px;
  overflow: hidden;
}

.supervision-page {
  max-width: 1720px;
  margin: 0 auto;
}

.page-header,
.section-heading,
.drawer-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.service-warning {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
  border: 1px solid #e1b9bd;
  border-radius: 5px;
  padding: 11px 14px;
  background: #fff7f7;
  color: #8f303b;
  font-size: 13px;
}

.service-warning span {
  color: #75575b;
}

.page-header h2,
.section-heading h3,
.drawer-title h3 {
  margin: 4px 0 0;
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

.eyebrow,
.section-kicker {
  margin: 0;
  color: #397265;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.manual-check {
  display: flex;
  width: min(560px, 48%);
}

.manual-check input {
  flex: 1;
  min-width: 0;
  height: 42px;
  border: 1px solid #c9d1d9;
  border-right: 0;
  border-radius: 5px 0 0 5px;
  padding: 0 14px;
  outline: none;
}

.manual-check input:focus {
  border-color: #397265;
}

button {
  height: 38px;
  border: 1px solid #2f665a;
  border-radius: 5px;
  padding: 0 16px;
  background: #2f665a;
  color: #fff;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.manual-check button {
  height: 42px;
  border-radius: 0 5px 5px 0;
}

.secondary {
  border-color: #b9c3cb;
  background: #fff;
  color: #33414c;
}

.danger-btn {
  border-color: #a83d48;
  background: #a83d48;
}

.table-action {
  height: 30px;
  border-color: #9fb1ad;
  padding: 0 10px;
  background: #fff;
  color: #2f665a;
  font-size: 12px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(135px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-card {
  min-height: 118px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
  padding: 16px;
  background: #fff;
}

.kpi-card span,
.kpi-card small {
  display: block;
  color: #6c7782;
  font-size: 13px;
}

.kpi-card strong {
  display: block;
  margin: 10px 0 8px;
  font-size: 28px;
  line-height: 1;
}

.status-band,
.data-section {
  margin-bottom: 16px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
  background: #fff;
}

.status-band {
  padding: 18px;
}

.data-section {
  padding: 18px 18px 14px;
}

.section-heading {
  margin-bottom: 14px;
}

.section-heading h3 {
  font-size: 17px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.service-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
  border-right: 1px solid #dce2e7;
  padding-right: 16px;
  font-size: 13px;
}

.service-control b {
  color: #a13c47;
  font-size: 12px;
}

.service-control b.online {
  color: #2f665a;
}

.auto-state {
  margin-right: 4px;
  color: #7a4650;
  font-size: 13px;
}

.auto-state.running {
  color: #2f665a;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid #e4e8ec;
}

.agent-item {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  align-items: center;
  gap: 12px;
  min-height: 86px;
  padding: 12px 18px;
  border-right: 1px solid #e4e8ec;
}

.agent-item:last-child {
  border-right: 0;
}

.agent-item i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #aeb7bf;
}

.agent-item i.active {
  background: #2f806d;
  box-shadow: 0 0 0 4px #dcece8;
}

.agent-item i.warning {
  background: #b54a54;
  box-shadow: 0 0 0 4px #f3dfe1;
}

.agent-item strong,
.agent-item span {
  display: block;
}

.agent-item span {
  margin-top: 5px;
  color: #6c7782;
  font-size: 12px;
}

.agent-item b {
  font-size: 13px;
}

:deep(.clickable-row) {
  cursor: pointer;
}

.drawer-content {
  min-height: 620px;
}

.process-content {
  min-height: 650px;
}

.process-steps {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-bottom: 16px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
}

.process-step {
  display: grid;
  grid-template-columns: 14px 1fr;
  gap: 10px;
  min-height: 82px;
  padding: 16px;
  border-right: 1px solid #e4e8ec;
}

.process-step:last-child {
  border-right: 0;
}

.process-step i {
  width: 11px;
  height: 11px;
  margin-top: 3px;
  border-radius: 50%;
  background: #b7c0c7;
}

.process-step.active i {
  background: #397265;
  box-shadow: 0 0 0 5px #deece8;
}

.process-step.done i {
  background: #397265;
}

.process-step.failed i {
  background: #b34450;
  box-shadow: 0 0 0 5px #f4e1e3;
}

.process-step strong,
.process-step span {
  display: block;
}

.process-step span {
  margin-top: 6px;
  color: #6c7782;
  font-size: 12px;
  line-height: 1.45;
}

.process-progress {
  margin-bottom: 16px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
  padding: 14px 16px;
}

.process-progress > div {
  display: flex;
  justify-content: space-between;
  margin-bottom: 9px;
  font-size: 13px;
}

.process-result {
  display: grid;
  grid-template-columns: 150px 150px minmax(0, 1fr);
  gap: 0;
  margin-bottom: 16px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
}

.process-verdict {
  padding: 16px;
  border-right: 1px solid #e4e8ec;
}

.process-verdict span,
.process-verdict strong {
  display: block;
}

.process-verdict span {
  margin-bottom: 8px;
  color: #6c7782;
  font-size: 12px;
}

.process-verdict strong {
  font-size: 16px;
}

.process-probabilities {
  display: grid;
  grid-template-columns: repeat(4, minmax(100px, 1fr));
  gap: 14px;
  align-items: center;
  padding: 13px 16px;
}

.process-probabilities > div {
  min-width: 0;
}

.process-probabilities span,
.process-probabilities b {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
}

.process-probabilities b {
  font-size: 13px;
}

.process-probabilities .result-pending {
  grid-column: 1 / -1;
  margin: 0;
  color: #74808a;
}

.process-graph-panel {
  position: relative;
  min-height: 500px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
  padding: 16px;
}

.process-graph {
  width: 100%;
  height: 430px;
}

.process-waiting {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -35%);
  text-align: center;
}

.process-waiting strong,
.process-waiting span {
  display: block;
}

.process-waiting span {
  margin-top: 8px;
  color: #74808a;
  font-size: 13px;
}

.drawer-title {
  width: 100%;
  padding-right: 20px;
}

.drawer-title h3 {
  max-width: 760px;
  overflow: hidden;
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-summary {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-bottom: 16px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
}

.detail-summary div {
  min-width: 0;
  padding: 14px 16px;
  border-right: 1px solid #e4e8ec;
}

.detail-summary div:last-child {
  border-right: 0;
}

.detail-summary span,
.detail-summary strong {
  display: block;
}

.detail-summary span {
  margin-bottom: 7px;
  color: #6c7782;
  font-size: 12px;
}

.detail-summary strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 480px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
}

.graph-panel {
  position: relative;
  min-width: 0;
  padding: 16px;
  border-right: 1px solid #e4e8ec;
}

.detail-graph {
  width: 100%;
  height: 410px;
}

.empty-hint {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  color: #7c8790;
}

.probability-panel {
  padding: 18px;
}

.probability-panel h3 {
  margin: 0 0 16px;
  font-size: 15px;
}

.probability-panel h3:nth-of-type(2) {
  margin-top: 28px;
}

.probability-row {
  margin-bottom: 14px;
}

.probability-row > div {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
}

.probability-panel dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  margin: 0;
  font-size: 13px;
}

.probability-panel dt {
  color: #687481;
}

.probability-panel dd {
  margin: 0;
  font-weight: 700;
}

.detail-transactions {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid #dce2e7;
  border-radius: 6px;
}

@media (max-width: 1250px) {
  .kpi-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .manual-check {
    width: 100%;
  }
}

@media (max-width: 820px) {
  .content {
    padding: 14px;
  }

  .kpi-grid,
  .agent-grid,
  .detail-summary {
    grid-template-columns: repeat(2, 1fr);
  }

  .agent-item,
  .detail-summary div {
    border-bottom: 1px solid #e4e8ec;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .graph-panel {
    border-right: 0;
    border-bottom: 1px solid #e4e8ec;
  }

  .toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .process-steps {
    grid-template-columns: repeat(2, 1fr);
  }

  .process-result {
    grid-template-columns: repeat(2, 1fr);
  }

  .process-probabilities {
    grid-column: 1 / -1;
    grid-template-columns: repeat(2, 1fr);
    border-top: 1px solid #e4e8ec;
  }
}
</style>
