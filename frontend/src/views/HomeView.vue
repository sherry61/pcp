<template>
  <div class="home">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="dashboard-title">数据面板</h2>
        <!--<div class="dashboard">
          <div class="dashboard-item">
            <div class="header">
              <h3>交易量</h3>
              <img src="@/assets/transaction-icon.png" alt="Transaction Icon" class="dashboard-icon">
            </div>
            <p class="main-number">{{ todayTransactionVolume }}</p>
            <p class="main-label">今日交易量</p>
            <p class="sub-metric">总交易量 <span class="sub-metric-value">{{ totalTransactionVolume }}</span></p>
            <p class="sub-metric">可支持的最大单日订单处理量 <span class="sub-metric-value">{{ 70000 }}</span></p>
          </div>
          <div class="dashboard-item">
  <div class="header">
    <h3>交易 (TPS)</h3>
    <div class="tps-header-actions">
      <el-button
        size="small"
        plain
        :loading="tpsLoading"
        @click="fetchTPS"
      >
        刷新
      </el-button>
      <img src="@/assets/tps-icon.png" alt="TPS Icon" class="dashboard-icon">
    </div>
  </div>
  <p class="main-number">{{ currentTPS }}</p>
  <p class="main-label">底链吞吐量</p>
</div>
          <div class="dashboard-item">
            <div class="header">
              <h3>已监管账户数量</h3>
              <img src="@/assets/audited-icon.png" alt="Supervision Icon" class="dashboard-icon">
            </div>
            <p class="main-number">{{ detectedAccounts }}</p>
            <p class="details">异常账户占比 <span class="detail-overload">{{ anomalyAccountRatio }}</span></p>
          </div>
          <div class="dashboard-item">
            <div class="header">
              <h3>已审计交易</h3>
              <img src="@/assets/audited-icon.png" alt="Audited Icon" class="dashboard-icon">
            </div>
            <p class="main-number">{{ auditedTransactions }}</p>
          </div>
        </div>-->
        <div class="dashboard dashboard-new">
  <!-- 左侧：交易量不变 -->
  <div class="dashboard-item transaction-card">
    <div class="header">
      <h3>交易量</h3>
      <img src="@/assets/transaction-icon.png" alt="Transaction Icon" class="dashboard-icon">
    </div>
    <p class="main-number">{{ todayTransactionVolume }}</p>
    <p class="main-label">今日交易量</p>
    <p class="sub-metric">总交易量 <span class="sub-metric-value">{{ totalTransactionVolume }}</span></p>
    <p class="sub-metric">可支持的最大单日订单处理量 <span class="sub-metric-value">70000</span></p>
  </div>

  <!-- 中间：领域交易数量 -->
  <div class="dashboard-item industry-card">
    <div class="header">
      <h3>领域交易数量</h3>
      <img src="@/assets/transaction-icon.png" alt="Industry Icon" class="dashboard-icon">
    </div>

    <div class="industry-grid">
      <div
        v-for="item in industryStats"
        :key="item.industryName"
        class="industry-chip"
      >
        <span class="industry-name">{{ item.industryName }}</span>
        <span class="industry-count">{{ item.count }}</span>
      </div>
    </div>
  </div>

  <!-- 右侧：三个指标合并 -->
  <div class="dashboard-item overview-card">
    <div class="header">
      <h3>系统运行概览</h3>
      <img src="@/assets/audited-icon.png" alt="Overview Icon" class="dashboard-icon">
    </div>

    <div class="overview-metrics">
      <div class="overview-metric">
        <div class="overview-title">
          交易 TPS
          <el-button size="small" plain :loading="tpsLoading" @click="fetchTPS">刷新</el-button>
        </div>
        <div class="overview-number">{{ currentTPS }}</div>
        <div class="overview-label">底链吞吐量</div>
      </div>

      <div class="overview-metric">
        <div class="overview-title">已监管账户数量</div>
        <div class="overview-number">{{ detectedAccounts }}</div>
        <div class="overview-label">
          异常账户占比 <span class="detail-overload">{{ anomalyAccountRatio }}</span>
        </div>
      </div>

      <div class="overview-metric">
        <div class="overview-title">已审计交易</div>
        <div class="overview-number">{{ auditedTransactions }}</div>
        <div class="overview-label">审计通过记录</div>
      </div>
    </div>
  </div>
</div>
        <div class="sales-details">
          <h3>交易历史</h3>
          <div class="line-chart-container">
            <LineChart :key="chartKey" :historyData="transactionHistory" />


          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import LineChart from '@/components/LineChart.vue'
import axios from 'axios'
const MODEL_API_BASE = process.env.VUE_APP_MODEL_API_BASE || 'http://10.112.47.214:8000'
export default {
  name: 'HomeView',
  components: {
    AppHeader,
    AppSidebar,
    LineChart
  },
data() {
  return {
    todayTransactionVolume: 0,
    totalTransactionVolume: 0,
    transactionLoad: '10000+',
    auditedTransactions: 1,
    transactionChangePercent: '0%', // 新增字段，用于展示提升百分比
    chartKey: 0,
    transactionHistory:[],
    trend: '',
    currentTPS: '25411',
    detectedAccounts: 0,
    anomalyAccountRatio: '0.00%',
    supervisionTimer: null,
    tpsLoading: false,
    industryStats: []
  }
},

mounted() {
  this.fetchTodayTransaction();
  this.fetchTotalTransaction();
  this.fetchTransactionHistory();
  this.fetchSupervisionOverview();
  this.fetchIndustryStats();
  this.supervisionTimer = window.setInterval(this.fetchSupervisionOverview, 5000);
},
beforeUnmount() {
  if (this.supervisionTimer) window.clearInterval(this.supervisionTimer);
},
  methods: {
    refreshChart() {
    this.chartKey++;  // 更新 key 强制重新渲染组件
  },

  async fetchIndustryStats() {
  try {
    const response = await axios.get('http://10.112.47.214:3000/api/industry-transaction-stats');

    if (response.status === 200 && response.data?.success) {
      this.industryStats = response.data.data || [];
    }
  } catch (error) {
    console.error('获取领域交易数量失败:', error);
    this.industryStats = [];
  }
},

  async fetchTPS() {
  this.tpsLoading = true;

  try {
    const response = await axios.get('http://10.112.47.214:3000/api/get-tps');

    if (response.status === 200 && response.data?.success) {
      this.currentTPS =
        response.data.tps == null
          ? '--'
          : Number(response.data.tps).toFixed(2);
    } else {
      this.currentTPS = '--';
    }
  } catch (error) {
    console.error('获取TPS失败:', error);
    this.currentTPS = '--';
  } finally {
    this.tpsLoading = false;
  }
},

  async fetchTodayTransaction() {
    try {
      const response = await axios.get('http://10.112.47.214:3000/api/get-today-transaction-stats');
      if (response.status === 200 && response.data) {
        this.todayTransactionVolume = response.data.today_transaction_count || 0;
        
        const rawPercent = response.data.percent_change || '0%';
        this.transactionChangePercent = Math.abs(parseFloat(rawPercent)) + '%';

        this.trend = response.data.trend || '持平';
      }
      console.log("今日交易量", this.todayTransactionVolume);
      console.log("交易变化", this.transactionChangePercent);
    } catch (error) {
      console.error('获取今日交易数据失败:', error);
    }
  },

  async fetchTotalTransaction() {
    try {
      const response = await axios.get('http://10.112.47.214:3000/api/get-total-transaction-stats');
      if (response.status === 200 && response.data) {
        this.totalTransactionVolume = response.data.total_transaction_count || 0;
      }
      console.log('总交易量', this.totalTransactionVolume);
    } catch (error) {
      console.error('获取总交易量失败:', error);
    }
  },

    async fetchSupervisionOverview() {
    try {
      const response = await axios.get(
        `${MODEL_API_BASE}/api/supervision/overview`,
        { timeout: 10000 }
      );
      const overview = response.data || {};
      this.detectedAccounts = Number(overview.detected_accounts) || 0;
      const ratio = Number(overview.anomaly_ratio);
      this.anomalyAccountRatio = Number.isFinite(ratio)
        ? `${(ratio * 100).toFixed(2)}%`
        : '0.00%';
    } catch (error) {
      console.error('获取监管状态失败:', error);
    }
  },

  async fetchTransactionHistory() {
    try {
      const response = await axios.get('http://10.112.47.214:3000/api/get-transaction-history');
      if (response.status === 200 && response.data.transaction_history) {
        this.transactionHistory = response.data.transaction_history;
        console.log('历史交易数据:', this.transactionHistory);
      }
    } catch (error) {
      console.error('获取历史交易失败:', error);
    }
  }



},

computed: {
  trendClass() {
    if (this.trend === '下降') {
      return 'detail-decrease';
    }

    if (this.trend === '持平') {
      return 'detail-neutral';
    }

    return 'detail-increase';
  }
}

}
</script>

<style>
body {
  background-color: #F5F6FA;
  margin: 0;
  font-family: Arial, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  overflow: hidden; /* 禁用滚动 */
}

.home {
  width: 2209px;
  height: 1509px;
  max-width: 100vw;
  max-height: 100vh;
  background: #F5F6FA;
  display: flex;
  flex-direction: column;
  box-sizing: border-box; /* 确保内边距和边框被包含在总高度和宽度内 */
}

.main-content {
  display: flex;
  flex: 1;
  background: #F5F6FA;
  overflow-y: auto; /* 允许内容区滚动 */
}

.content {
  flex: 1;
  padding: 20px;
  background: #F5F6FA;
}

.dashboard-title {
  margin: 0;
  padding: 10px 0;
  text-align: left; /* 左对齐 */
  padding-left: 30px; /* 根据侧边栏的宽度调整 */
  font-size: 24px;
  color: #333;
}

.dashboard {
  display: flex;
  justify-content: space-around;
  margin-bottom: 20px;
  background: #F5F6FA;
  flex-wrap: wrap; /* 允许在纵向上进行折行 */
}

.dashboard-item {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  flex: 1 1 200px; /* 允许在纵向上调整大小 */
  margin: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  

    padding-bottom:10px;

    margin-bottom:15px;

    border-bottom:1px solid #eef2f7;

  box-shadow: none;
}

.dashboard-icon {
  width: 40px;
  height: 40px;
  margin-left: 10px;
}

.header h3 {
  margin: 0;
  font-size: 14px;
  color: #333;
}

.main-number {
  font-size: 28px;
  color: #000;
  margin: 6px 0 2px;
}

.main-label {
  margin: 0 0 14px;
  font-size: 13px;
  color: #666;
}

.sub-metric {
  margin: 0 0 8px;
  font-size: 13px;
  color: #888;
  display:flex;
  justify-content:space-between;
  margin-top:14px;
}

.sub-metric-value {
  margin-left: 8px;
  font-size: 18px;
  font-weight: 600;
  color: #222;
}

.details {
  font-size: 12px;
  color: #888;
  text-align: left;
}

.detail-buyer {
  color: #00bfa5;
}

.detail-seller {
  color: #ff6d00;
}

.detail-admin {
  color: #7e57c2;
}

.detail-increase {
  color: #00bfa5;
}

.detail-decrease {
  color: #ff5252;
}

.detail-neutral {
  color: #666;
}

.detail-overload {
  color: #ff5252;
}

.sales-details {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.sales-details h3 {
  margin: 0 0 20px;
  font-size: 18px;
}

.line-chart-container {
  height: 400px; /* 调整图表的高度 */
  width: 800px; /* 设置图表宽度 */
  max-width: 800px; /* 设置图表最大宽度 */
  margin: 0 auto; /* 居中对齐 */
}

.tps-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dashboard-new{
    display:grid;

    grid-template-columns:
        minmax(280px,1fr)
        minmax(520px,1.6fr)
        minmax(320px,1fr);

    gap:18px;

    max-width:1500px;
    margin:0 auto 25px;
}

.dashboard-item {
  background: #fff;
  padding: 22px;
  border-radius: 10px;
  text-align: center;
  margin: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.transaction-card,
.industry-card,
.overview-card{

    height:260px;

    display:flex;
    flex-direction:column;
     overflow: hidden;
}

.industry-grid{

    margin-top:15px;

    display:grid;

    grid-template-columns:
        repeat(3,minmax(0,1fr));

    gap:10px;

    max-height:165px;

    overflow-y:auto;
}

.industry-chip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f6f8fc;
  border: 1px solid #edf0f7;
  border-radius: 8px;
  padding: 9px 10px;
  min-height: 34px;
}

.industry-name {
  font-size: 12px;
  color: #4b5563;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.industry-count {
  font-size: 16px;
  font-weight: 700;
  color: #1f2937;
  margin-left: 8px;
}

.overview-metrics {
  flex: 1;
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  gap: 8px;
  min-height: 0;
  margin-top: 10px;
}

.overview-metric {
  min-height: 0;
  padding: 8px 14px;
  border-radius: 8px;
  background: #f6f8fc;
  box-sizing: border-box;
  overflow: hidden;

  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 12px;
  align-items: center;
}

.overview-title {
  grid-column: 1;
  grid-row: 1;
  font-size: 13px;
  color: #555;
  margin: 0;
  white-space: nowrap;
  text-align: left;
}

.overview-number {
  grid-column: 2;
  grid-row: 1 / span 2;
  font-size: 24px;
  line-height: 1;
  font-weight: 700;
  color: #111;
  text-align: right;
  white-space: nowrap;
}

.overview-label {
  grid-column: 1;
  grid-row: 2;
  font-size: 12px;
  line-height: 1.2;
  color: #888;
  margin: 4px 0 0;
  white-space: nowrap;
  text-align: left;
}

.overview-title .el-button {
  margin-left: 8px;
}

@media (max-width: 1200px) {
  .dashboard-new {
    grid-template-columns: 1fr;
  }

  .industry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
