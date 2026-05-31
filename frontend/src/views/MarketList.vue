<template>
  <div class="market-list-view">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <MarketNavBar />
        <h2 class="title">交易列表</h2>
        <div class="table-container">
          <input type="text" placeholder="搜索项目名" class="search-input" />
          <table>
            <thead>
              <tr>
                <th>交易ID</th>
                <th>交易类型</th>
                <th>交易时间</th>
                <th>Piece</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in transactionData" :key="index">
                <td>{{ item.transactionID }}</td>
                <td>{{ item.transactionType }}</td>
                <td>{{ item.transactionTime }}</td>
                <td>{{ item.piece }}</td>
                <td>{{ item.amount }}</td>
                <td>
                  <span :class="statusClass(item.status)">{{ item.status }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import MarketNavBar from '@/components/MarketNavBar.vue'

export default {
  name: 'MarketListView',
  components: {
    AppHeader,
    AppSidebar,
    MarketNavBar
  },
  data() {
    return {
      transactionData: [
        { transactionID: 'Trans-1', transactionType: '碳证', transactionTime: '2019-09-02 15:33', piece: 423, amount: '$34,295', status: '无风险' },
        { transactionID: 'Trans-2', transactionType: '医疗', transactionTime: '2019-09-01 14:20', piece: 423, amount: '$34,295', status: '未审计' },
        { transactionID: 'Trans-3', transactionType: '文化', transactionTime: '2019-09-01 12:48', piece: 423, amount: '$34,295', status: '有风险' },
        { transactionID: 'Trans-2', transactionType: '医疗', transactionTime: '2019-09-01 14:20', piece: 423, amount: '$34,295', status: '未审计' },
        { transactionID: 'Trans-2', transactionType: '医疗', transactionTime: '2019-09-01 14:20', piece: 423, amount: '$34,295', status: '未审计' },
        { transactionID: 'Trans-1', transactionType: '碳证', transactionTime: '2019-09-02 15:33', piece: 423, amount: '$34,295', status: '无风险' }
      ]
    }
  },
  methods: {
    statusClass(status) {
      switch (status) {
        case '无风险':
          return 'status-safe'
        case '有风险':
          return 'status-risk'
        case '未审计':
          return 'status-pending'
        default:
          return ''
      }
    }
  }
}
</script>

<style scoped>
.market-list-view {
  width: 100vw;
  height: 100vh;
  background: #F5F6FA;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.main-content {
  display: flex;
  flex: 1;
  background: #F5F6FA;
  overflow-y: auto;
}

.content {
  flex: 1;
  padding: 20px;
  background: #F5F6FA;
}

.title {
  margin: 0;
  padding: 10px 0;
  text-align: left;
  padding-left: 30px;
  font-size: 24px;
  color: #333;
}

.table-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-top: 20px;
}

.search-input {
  width: 100%;
  padding: 10px;
  margin-bottom: 20px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.status-safe {
  color: #28a745;
}

.status-risk {
  color: #dc3545;
}

.status-pending {
  color: #ffc107;
}
</style>
