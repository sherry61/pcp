<template>
  <div class="home">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="dashboard-title">数据面板</h2>
        <div class="dashboard">
          <div class="dashboard-item">
            <div class="header">
              <h3>交易量</h3>
              <img src="@/assets/transaction-icon.png" alt="Transaction Icon" class="dashboard-icon">
            </div>
            <p class="main-number">{{ todayTransactionVolume }}</p>
            <p class="main-label">今日交易量</p>
            <p class="sub-metric">总交易量 <span class="sub-metric-value">{{ totalTransactionVolume }}</span></p>
            <p class="sub-metric">可支持的最大单日订单处理量 <span class="sub-metric-value">{{ 70000 }}</span></p>
            <!--<p class="details">较昨日{{ trend }} <span :class="trendClass">{{ transactionChangePercent }}</span></p>-->
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
              <h3>已审计交易</h3>
              <img src="@/assets/audited-icon.png" alt="Audited Icon" class="dashboard-icon">
            </div>
            <p class="main-number">{{ auditedTransactions }}</p>
           
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
    tpsLoading: false
  }
},

mounted() {
  this.fetchTodayTransaction();
  this.fetchTotalTransaction();
  this.fetchTransactionHistory();
},

  methods: {
    refreshChart() {
    this.chartKey++;  // 更新 key 强制重新渲染组件
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
  margin-bottom: 10px;
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
  text-align: left;
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
</style>
