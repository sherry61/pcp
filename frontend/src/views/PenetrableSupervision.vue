<template>
  <div class="home">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <section class="supervision-page">
          <header class="supervision-header">
            <div class="header-copy">
              <p class="eyebrow">穿透式监管组件</p>
              <h2>账户交易关系检测分析</h2>
              <span>输入链上账户地址后，系统将采样交易子图并执行交易分析。</span>
            </div>
            <div class="search-panel">
              <div class="search-box-main">
                <input
                  v-model.trim="searchValue"
                  class="search-input"
                  type="text"
                  placeholder="输入账户 address，例如 0x..."
                  :disabled="isBusy"
                  @keyup.enter="startTracking"
                />
                <button class="track-btn" :disabled="isBusy" @click="startTracking">
                  {{ isBusy ? '处理中' : '检索账户' }}
                </button>
              </div>
              <div class="header-actions">
                <button class="ghost-btn" :disabled="isBusy" @click="resetWorkspace">重置</button>
                <button class="ghost-btn" @click="refreshData">刷新</button>
                <button class="ghost-btn" @click="exportData">导出</button>
              </div>
            </div>
          </header>

          <main class="workspace">
            <section class="graph-card">
              <div class="card-title-row">
                <div>
                  <p class="section-kicker">交易子图</p>
                  <h3>{{ graphTitle }}</h3>
                </div>
                <span class="state-pill" :class="statusClass">{{ statusText }}</span>
              </div>
              <div class="chart-wrap">
                <div id="main" class="graph-canvas"></div>
                <div v-if="showIdleOverlay" class="idle-overlay">
                  <strong>等待检索中</strong>
                  <span>请输入账户地址，系统会先进行 B38 子图采样，再执行异常检测。</span>
                </div>
              </div>
            </section>

            <aside class="side-panel">
              <section class="status-card">
                <p class="section-kicker">流程状态</p>
                <h3>{{ workflowTitle }}</h3>
                <div class="steps">
                  <div v-for="step in steps" :key="step.key" class="step" :class="step.state">
                    <i></i>
                    <span>{{ step.label }}</span>
                  </div>
                </div>
                <div v-if="inferenceVisible" class="inference-box">
                  <div class="progress-head">
                    <span>模型正在推理</span>
                    <b>{{ inferenceProgress }}%</b>
                  </div>
                  <div class="progress-track">
                    <div class="progress-bar" :style="{ width: inferenceProgress + '%' }"></div>
                  </div>
                </div>
                <p class="message-line">{{ processMessage }}</p>
              </section>

              <section class="summary-card" :class="{ danger: isAnomaly, normal: detectionDone && !isAnomaly }">
                <p class="section-kicker">账户状态</p>
                <h3>{{ verdictTitle }}</h3>
                <div class="address-text">{{ activeAddress || '未选择账户' }}</div>
                <div class="summary-grid">
                  <div>
                    <span>异常概率</span>
                    <b>{{ formatPercent(accountSummary.anomalyProbability) }}</b>
                  </div>
                  <div>
                    <span>检测结果</span>
                    <b>{{ accountSummary.predLabel || '-' }}</b>
                  </div>
                  <div>
                    <span>入账次数</span>
                    <b>{{ formatNumber(accountSummary.inCount) }}</b>
                  </div>
                  <div>
                    <span>出账次数</span>
                    <b>{{ formatNumber(accountSummary.outCount) }}</b>
                  </div>
                  <div>
                    <span>入账金额</span>
                    <b>{{ formatCompact(accountSummary.inAmount) }}</b>
                  </div>
                  <div>
                    <span>出账金额</span>
                    <b>{{ formatCompact(accountSummary.outAmount) }}</b>
                  </div>
                </div>
              </section>
            </aside>
          </main>

          <section class="log-card">
            <div class="card-title-row compact">
              <div>
                <p class="section-kicker">交易信息摘要</p>
                <h3>目标账户关联交易</h3>
              </div>
              <span>{{ tableData.length }} 条</span>
            </div>
            <el-table :data="tableData" stripe height="220" style="width: 100%">
              <el-table-column prop="direction" label="方向" width="90" />
              <el-table-column prop="from" label="From" min-width="220" show-overflow-tooltip />
              <el-table-column prop="to" label="To" min-width="220" show-overflow-tooltip />
              <el-table-column prop="count" label="次数" width="90" />
              <el-table-column prop="amount" label="金额" width="140" />
              <el-table-column prop="fee" label="手续费" width="120" />
            </el-table>
          </section>
        </section>
      </div>
    </div>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import axios from 'axios'
import * as echarts from 'echarts'

const MODEL_API_BASE = process.env.VUE_APP_MODEL_API_BASE || 'http://10.112.47.214:8000'
const GRAPH_NODE_REVEAL_MS = 2500
const MIN_INFERENCE_MS = 5500

export default {
  name: 'PenetrableSupervision',
  components: {
    AppHeader,
    AppSidebar
  },
  data() {
    return {
      username: localStorage.getItem('username') || 'user',
      userId: localStorage.getItem('userId') || '-',
      myChart: null,
      searchValue: '',
      activeAddress: '',
      graphData: null,
      displayedNodes: [],
      displayedLinks: [],
      selectedNode: null,
      tableData: [],
      sampleResult: null,
      predictResult: null,
      isBusy: false,
      detectionDone: false,
      isAnomaly: false,
      inferenceVisible: false,
      inferenceProgress: 0,
      processMessage: '等待检索账户地址。',
      statusText: '待检索',
      workflowTitle: '等待输入',
      graphTitle: '实时账户关系网络',
      showIdleOverlay: true,
      animationTimer: null,
      progressTimer: null,
      steps: [
        { key: 'sample', label: '子图采样', state: 'idle' },
        { key: 'draw', label: '图谱渲染', state: 'idle' },
        { key: 'infer', label: '异常检测', state: 'idle' }
      ]
    }
  },
  computed: {
    statusClass() {
      if (this.isAnomaly) return 'danger'
      if (this.detectionDone) return 'success'
      if (this.isBusy) return 'running'
      return 'idle'
    },
    verdictTitle() {
      if (!this.detectionDone) return '尚未检测'
      return this.isAnomaly ? '异常账户' : '账户正常'
    },
    accountSummary() {
      const pred = this.predictResult?.results?.[0]
      const anchorNode = this.findNodeByAddress(this.activeAddress)
      const raw = anchorNode?.raw || {}
      return {
        anomalyProbability: pred?.anomaly_probability || 0,
        predLabel: this.detectionDone && !this.isAnomaly ? 'normal' : (pred?.pred_label || ''),
        inCount: raw.N_in_cnt || 0,
        outCount: raw.N_out_cnt || 0,
        inAmount: raw.N_in_sum_amt || 0,
        outAmount: raw.N_out_sum_amt || 0
      }
    }
  },
  mounted() {
    this.initChart()
    this.renderIdleGraph()
    window.addEventListener('resize', this.resizeChart)
  },
  beforeUnmount() {
    this.clearTimers()
    window.removeEventListener('resize', this.resizeChart)
    if (this.myChart) this.myChart.dispose()
  },
  methods: {
    initChart() {
      const chartDom = document.getElementById('main')
      this.myChart = echarts.init(chartDom)
      this.myChart.on('click', (params) => {
        if (params.dataType === 'node') this.handleNodeClick(params)
      })
    },
    resizeChart() {
      if (this.myChart) this.myChart.resize()
    },
    clearTimers() {
      if (this.animationTimer) window.clearInterval(this.animationTimer)
      if (this.progressTimer) window.clearInterval(this.progressTimer)
      this.animationTimer = null
      this.progressTimer = null
    },
    setStep(key, state) {
      this.steps = this.steps.map((step) => step.key === key ? { ...step, state } : step)
    },
    resetSteps() {
      this.steps = this.steps.map((step) => ({ ...step, state: 'idle' }))
    },
    async startTracking() {
      const address = this.searchValue.trim()
      if (!address) {
        this.resetWorkspace()
        return
      }
      this.clearTimers()
      this.isBusy = true
      this.detectionDone = false
      this.isAnomaly = false
      this.activeAddress = address
      this.sampleResult = null
      this.predictResult = null
      this.tableData = []
      this.displayedNodes = []
      this.displayedLinks = []
      this.showIdleOverlay = false
      this.resetSteps()
      this.statusText = '采样中'
      this.workflowTitle = '正在采样交易子图'
      this.processMessage = '正在根据 B38 配置提取目标账户的交易邻域。'
      this.setStep('sample', 'running')
      this.myChart.showLoading({ text: '正在采样子图...' })

      try {
        const sampleRes = await axios.post(`${MODEL_API_BASE}/api/subgraph/sample`, {
          address,
          include_feature_matrix: true,
          max_feature_rows: 3000
        })
        this.sampleResult = sampleRes.data
        this.setStep('sample', 'done')
        this.statusText = '渲染中'
        this.workflowTitle = '正在展开账户关系图'
        this.processMessage = '采样完成，正在按采样节点顺序逐步显示交易账户。'

        const echartsRes = await axios.post(`${MODEL_API_BASE}/api/subgraph/echarts`, {
          file_path: this.sampleResult.model_input.file_path,
          anchor_address: address,
          max_nodes: 600,
          max_links: 1500
        })
        this.graphData = this.orderGraphBySample(echartsRes.data, this.sampleResult.features?.node_order || [])
        this.myChart.hideLoading()
        await this.animateGraph(this.graphData)

        this.setStep('draw', 'done')
        this.statusText = '检测中'
        this.workflowTitle = '正在执行异常检测'
        this.processMessage = '图谱已生成，正在对目标账户进行异常检测。'
        await this.runInference(this.sampleResult.model_input.file_path)
      } catch (error) {
        this.statusText = '失败'
        this.workflowTitle = '流程中断'
        this.processMessage = error?.response?.data?.detail || error.message || '采样或检测失败。'
        this.renderError(this.processMessage)
      } finally {
        this.isBusy = false
        this.inferenceVisible = false
      }
    },
    orderGraphBySample(graph, nodeOrder) {
      const rank = new Map(nodeOrder.map((id, idx) => [String(id).toLowerCase(), idx]))
      const nodes = [...(graph.nodes || [])].sort((a, b) => {
        const ar = rank.has(String(a.id).toLowerCase()) ? rank.get(String(a.id).toLowerCase()) : Number.MAX_SAFE_INTEGER
        const br = rank.has(String(b.id).toLowerCase()) ? rank.get(String(b.id).toLowerCase()) : Number.MAX_SAFE_INTEGER
        return ar - br
      })
      return { ...graph, nodes }
    },
    animateGraph(graph) {
      return new Promise((resolve) => {
        this.setStep('draw', 'running')
        const nodes = graph.nodes || []
        const links = graph.links || []
        const visible = new Set()
        let idx = 0
        this.applyGraphOption([], [], graph.categories || [])
        this.animationTimer = window.setInterval(() => {
          for (let i = 0; i < 1 && idx < nodes.length; i += 1) {
            visible.add(String(nodes[idx].id))
            idx += 1
          }
          this.displayedNodes = nodes.slice(0, idx)
          this.displayedLinks = links.filter((link) => visible.has(String(link.source)) && visible.has(String(link.target)))
          this.applyGraphOption(this.displayedNodes, this.displayedLinks, graph.categories || [])
          this.processMessage = `正在展开交易账户：${this.displayedNodes.length}/${nodes.length}`
          if (idx >= nodes.length) {
            window.clearInterval(this.animationTimer)
            this.animationTimer = null
            this.tableData = this.buildTransactionRows(this.activeAddress, this.displayedLinks)
            resolve()
          }
        }, GRAPH_NODE_REVEAL_MS)
      })
    },
    applyGraphOption(nodes, links, categories) {
      const normalized = nodes.map((node) => ({
        ...node,
        label: { show: String(node.id).toLowerCase() === this.activeAddress.toLowerCase(), formatter: '{b}' },
        itemStyle: {
          color: String(node.id).toLowerCase() === this.activeAddress.toLowerCase() ? '#1f6feb' : undefined,
          borderColor: '#ffffff',
          borderWidth: 1
        }
      }))
      this.myChart.setOption({
        backgroundColor: 'transparent',
        tooltip: {
          confine: true,
          formatter: (p) => {
            if (p.dataType === 'edge') {
              const raw = p.data.raw || {}
              return `${p.data.source}<br/>→ ${p.data.target}<br/>次数：${raw.E_cnt || 0}<br/>金额：${this.formatCompact(raw.E_sum_amt || 0)}`
            }
            const raw = p.data.raw || {}
            return `${p.data.name}<br/>度数：${p.data.value || 0}<br/>入账：${raw.N_in_cnt || 0}<br/>出账：${raw.N_out_cnt || 0}`
          }
        },
        legend: {
          top: 8,
          right: 16,
          data: categories.map((item) => item.name),
          textStyle: { color: '#667085' }
        },
        series: [{
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          data: normalized,
          links,
          categories,
          edgeSymbol: ['none', 'arrow'],
          edgeSymbolSize: 7,
          lineStyle: { color: '#9aa4b2', opacity: 0.55, curveness: 0.08 },
          force: { repulsion: 130, edgeLength: 95, gravity: 0.08 },
          emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
          animationDuration: 260
        }]
      }, true)
    },
    async runInference(filePath) {
      this.setStep('infer', 'running')
      this.inferenceVisible = true
      this.inferenceProgress = 8
      this.progressTimer = window.setInterval(() => {
        if (this.inferenceProgress < 88) this.inferenceProgress += Math.max(1, Math.round((90 - this.inferenceProgress) * 0.03))
      }, 220)

      const inferPromise = axios.post(`${MODEL_API_BASE}/api/model/predict`, { file_path: filePath })
      const delayPromise = new Promise((resolve) => window.setTimeout(resolve, MIN_INFERENCE_MS))
      const [inferRes] = await Promise.all([inferPromise, delayPromise])
      if (this.progressTimer) window.clearInterval(this.progressTimer)
      this.inferenceProgress = 100
      await new Promise((resolve) => window.setTimeout(resolve, 220))

      this.predictResult = inferRes.data
      const result = this.predictResult.results?.[0] || {}
      this.isAnomaly = Boolean(result.pass_threshold?.[result.pred_label])
      this.detectionDone = true
      this.setStep('infer', 'done')
      this.statusText = this.isAnomaly ? '异常' : '正常'
      this.workflowTitle = this.isAnomaly ? '发现异常账户' : '账户检测正常'
      this.processMessage = this.isAnomaly
        ? `模型判定该账户属于 ${result.pred_label} 风险类型，已在图中红色标记。`
        : '模型未发现超过阈值的异常风险，账户正常。'
      if (this.isAnomaly) this.markAnomalyNode(this.activeAddress)
    },
    markAnomalyNode(address) {
      const option = this.myChart.getOption()
      const series = option.series?.[0]
      if (!series?.data) return
      series.data = series.data.map((node) => {
        if (String(node.id).toLowerCase() !== address.toLowerCase()) return node
        return {
          ...node,
          symbolSize: Math.max(node.symbolSize || 30, 48),
          itemStyle: {
            ...(node.itemStyle || {}),
            color: '#d92d20',
            borderColor: '#fff',
            borderWidth: 3,
            shadowBlur: 18,
            shadowColor: 'rgba(217,45,32,0.45)'
          },
          label: { show: true, formatter: '异常账户\n{b}', color: '#d92d20', fontWeight: 700 }
        }
      })
      this.myChart.setOption({ series: [series] })
    },
    renderIdleGraph() {
      this.showIdleOverlay = true
      this.statusText = '待检索'
      this.workflowTitle = '等待输入'
      this.graphTitle = '实时账户关系网络'
      this.processMessage = '等待检索账户地址。'
      this.resetSteps()
      const nodes = Array.from({ length: 24 }).map((_, idx) => ({
        id: `idle-${idx}`,
        name: `账户 ${idx + 1}`,
        value: Math.round(Math.random() * 8 + 1),
        symbolSize: Math.round(Math.random() * 16 + 12),
        category: idx % 4,
        itemStyle: { color: ['#2f80ed', '#12b76a', '#f79009', '#667085'][idx % 4] }
      }))
      const links = Array.from({ length: 34 }).map(() => ({
        source: `idle-${Math.floor(Math.random() * nodes.length)}`,
        target: `idle-${Math.floor(Math.random() * nodes.length)}`,
        lineStyle: { opacity: 0.35 }
      })).filter((link) => link.source !== link.target)
      this.myChart.setOption({
        backgroundColor: 'transparent',
        series: [{
          type: 'graph',
          layout: 'force',
          roam: false,
          data: nodes,
          links,
          categories: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
          force: { repulsion: 80, edgeLength: 80 },
          lineStyle: { color: '#c7ced8' },
          label: { show: false },
          silent: true
        }]
      }, true)
    },
    renderError(message) {
      this.myChart.hideLoading()
      this.myChart.setOption({
        title: { text: '处理失败', subtext: message, left: 'center', top: 'center', textStyle: { color: '#d92d20' } },
        series: []
      }, true)
    },
    resetWorkspace() {
      this.clearTimers()
      this.searchValue = ''
      this.activeAddress = ''
      this.graphData = null
      this.sampleResult = null
      this.predictResult = null
      this.detectionDone = false
      this.isAnomaly = false
      this.inferenceVisible = false
      this.inferenceProgress = 0
      this.tableData = []
      this.isBusy = false
      this.renderIdleGraph()
    },
    refreshData() {
      if (this.activeAddress) this.startTracking()
      else this.renderIdleGraph()
    },
    exportData() {
      const payload = JSON.stringify({ sample: this.sampleResult, prediction: this.predictResult }, null, 2)
      const blob = new Blob([payload], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `supervision-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    handleNodeClick(params) {
      this.selectedNode = params.data
      this.tableData = this.buildTransactionRows(params.data.id, this.displayedLinks.length ? this.displayedLinks : (this.graphData?.links || []))
    },
    findNodeByAddress(address) {
      const target = String(address || '').toLowerCase()
      return (this.graphData?.nodes || []).find((node) => String(node.id).toLowerCase() === target)
    },
    buildTransactionRows(address, links) {
      const target = String(address || '').toLowerCase()
      return (links || [])
        .filter((link) => String(link.source).toLowerCase() === target || String(link.target).toLowerCase() === target)
        .slice(0, 12)
        .map((link) => {
          const raw = link.raw || {}
          const isOut = String(link.source).toLowerCase() === target
          return {
            direction: isOut ? '转出' : '转入',
            from: link.source,
            to: link.target,
            count: raw.E_cnt || 0,
            amount: this.formatCompact(raw.E_sum_amt || 0),
            fee: this.formatCompact(raw.E_sum_fee || 0)
          }
        })
    },
    formatPercent(value) {
      return `${((Number(value) || 0) * 100).toFixed(2)}%`
    },
    formatNumber(value) {
      return Number(value || 0).toLocaleString()
    },
    formatCompact(value) {
      const num = Number(value || 0)
      if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`
      if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`
      if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(2)}K`
      return num.toFixed(2)
    }
  }
}
</script>

<style scoped>
.home {
  width: 100vw;
  height: 100vh;
  background: #f5f6fa;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  background: #f5f6fa;
}

.content {
  flex: 1;
  min-width: 0;
  padding: 18px 20px;
  overflow: auto;
}

.supervision-page {
  display: grid;
  gap: 16px;
  min-height: calc(100vh - 96px);
}

.supervision-header,
.graph-card,
.side-panel > section,
.log-card {
  background: #fff;
  border: 1px solid #e7ebf0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.06);
}

.supervision-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  padding: 18px 20px;
}

.header-copy h2,
.card-title-row h3,
.side-panel h3,
.log-card h3 {
  margin: 0;
  color: #1f2937;
  letter-spacing: 0;
}

.header-copy h2 {
  font-size: 22px;
}

.header-copy span {
  display: block;
  margin-top: 6px;
  color: #667085;
  font-size: 14px;
}

.eyebrow,
.section-kicker {
  margin: 0 0 5px;
  color: #2f80ed;
  font-size: 12px;
  font-weight: 700;
}

.search-panel {
  display: grid;
  gap: 10px;
  min-width: 460px;
}

.search-box-main {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 112px;
  gap: 10px;
}

.search-input {
  min-height: 40px;
  border: 1px solid #d8dee8;
  border-radius: 7px;
  padding: 0 12px;
  font-size: 14px;
  color: #1f2937;
  outline: none;
}

.search-input:focus {
  border-color: #2f80ed;
  box-shadow: 0 0 0 3px rgba(47, 128, 237, 0.12);
}

.track-btn,
.ghost-btn {
  min-height: 40px;
  border-radius: 7px;
  border: 0;
  font-weight: 700;
  cursor: pointer;
}

.track-btn {
  background: #2f80ed;
  color: #fff;
}

.track-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.header-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ghost-btn {
  padding: 0 14px;
  background: #f2f5f9;
  color: #344054;
  border: 1px solid #e1e7ef;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
  min-height: 560px;
}

.graph-card {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  padding: 16px;
  min-width: 0;
}

.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.card-title-row.compact {
  margin-bottom: 10px;
}

.state-pill {
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  background: #eef2f6;
  color: #667085;
}

.state-pill.running {
  background: #eaf2ff;
  color: #2f80ed;
}

.state-pill.success {
  background: #e9f8ef;
  color: #138a4d;
}

.state-pill.danger {
  background: #fdecec;
  color: #d92d20;
}

.chart-wrap {
  position: relative;
  min-height: 500px;
  border: 1px solid #e7ebf0;
  border-radius: 8px;
  background: #fbfcff;
  overflow: hidden;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  min-height: 500px;
}

.idle-overlay {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, 78%);
  padding: 18px 20px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(214, 222, 234, 0.9);
  backdrop-filter: blur(8px);
  text-align: center;
  color: #344054;
  box-shadow: 0 12px 36px rgba(16, 24, 40, 0.12);
}

.idle-overlay strong {
  display: block;
  margin-bottom: 6px;
  font-size: 18px;
  color: #1f2937;
}

.idle-overlay span {
  color: #667085;
  font-size: 14px;
}

.side-panel {
  display: grid;
  gap: 16px;
  align-content: start;
}

.status-card,
.summary-card {
  padding: 16px;
}

.steps {
  display: grid;
  gap: 10px;
  margin: 14px 0;
}

.step {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #667085;
  font-size: 14px;
}

.step i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c9d2df;
}

.step.running i {
  background: #2f80ed;
  box-shadow: 0 0 0 5px rgba(47, 128, 237, 0.12);
}

.step.done i {
  background: #12b76a;
}

.inference-box {
  margin: 12px 0;
  padding: 12px;
  border-radius: 8px;
  background: #f5f8ff;
}

.progress-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  color: #344054;
  font-size: 13px;
}

.progress-track {
  height: 8px;
  border-radius: 999px;
  background: #dce7fb;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #2f80ed, #12b76a);
  transition: width 0.16s ease;
}

.message-line {
  margin: 8px 0 0;
  color: #667085;
  line-height: 1.5;
  font-size: 13px;
}

.summary-card.normal {
  border-color: #b9ebcf;
}

.summary-card.danger {
  border-color: #f4b6b0;
}

.address-text {
  margin: 10px 0 14px;
  color: #667085;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.summary-grid div {
  border: 1px solid #edf1f6;
  border-radius: 8px;
  padding: 10px;
  background: #fbfcfe;
  min-width: 0;
}

.summary-grid span {
  display: block;
  margin-bottom: 4px;
  color: #667085;
  font-size: 12px;
}

.summary-grid b {
  color: #1f2937;
  overflow-wrap: anywhere;
}

.log-card {
  padding: 16px;
}

@media (max-width: 1180px) {
  .supervision-header,
  .workspace {
    grid-template-columns: 1fr;
  }

  .supervision-header {
    display: grid;
  }

  .search-panel {
    min-width: 0;
  }

  .workspace {
    display: grid;
  }
}

@media (max-width: 760px) {
  .content {
    padding: 12px;
  }

  .search-box-main,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .chart-wrap,
  .graph-canvas {
    min-height: 380px;
  }
}
</style>
