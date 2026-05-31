<template>
  <div class="market-details-view">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <MarketNavBar />
        <h2 class="title">交易详情</h2>
        <div class="table-container">
          <input type="text" placeholder="搜索项目名" class="search-input" />
          <table>
            <thead>
              <tr>
                <th>交易ID</th>
                <th>数据ID</th>
                <th>创建时间</th>
                <th>定价模式</th>
                <th>更新时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in transactionDetails" :key="index">
                <td>
                  <a href="#" @click="openModal(item)">{{ item.transactionID }}</a>
                </td>
                <td>{{ item.dataID }}</td>
                <td>{{ item.creationTime }}</td>
                <td>{{ item.pricingMode }}</td>
                <td>{{ item.updateTime }}</td>
                <td>
                  <span :class="statusClass(item.status)">
                    <template v-if="item.status === '详情'">
                      <a href="#" @click="viewDetails(item)">详情</a>
                    </template>
                    <template v-else-if="item.status === '上传'">
                      <a href="#" @click="uploadMaterial(item)">上传</a>
                    </template>
                    <template v-else>
                      {{ item.status }}
                    </template>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <!-- 审计详细信息弹窗 -->
    <div v-if="showModal" class="modal">
      <div class="modal-content">
        <button class="close-button" @click="closeModal">×</button>
        <h3>审计详情</h3>
        <div class="audit-details">
          <p><strong>交易ID:</strong> {{ selectedTransaction.transactionID }}</p>
          <p><strong>审计方:</strong> {{ selectedTransaction.auditors.join('; ') }}</p>
          <p><strong>审计记录:</strong></p>
          <ul>
            <li v-for="(record, index) in selectedTransaction.auditRecords" :key="index">
              {{ record.auditor }} 于 {{ record.time }} <span :class="auditStatusClass(record.status)">{{ record.status }}</span>
            </li>
          </ul>
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
  name: 'MarketDetailsView',
  components: {
    AppHeader,
    AppSidebar,
    MarketNavBar
  },
  data() {
    return {
      transactionDetails: [
        { transactionID: 'Trans-1', dataID: 'Data-1', creationTime: 'xxxxx', pricingMode: '竞拍', updateTime: 'xxxxx', status: '正在竞拍', auditors: ['监管用户1', '监管用户2', '监管用户3'], auditRecords: [{ auditor: '监管用户3', time: '2020-01-18 19:24:30', status: '审计通过' }, { auditor: '监管用户2', time: '2020-01-18 19:22:10', status: '审计通过' }, { auditor: '监管用户1', time: '2020-01-18 19:22:10', status: '审计通过' }] },
        { transactionID: 'Trans-2', dataID: 'Data-5', creationTime: 'xxxxx', pricingMode: '一口价', updateTime: 'xxxxx', status: '已定价' },
        { transactionID: 'Trans-3', dataID: 'Data-7', creationTime: 'xxxxx', pricingMode: '竞拍', updateTime: 'xxxxx', status: '等待数据论文 上传' },
        { transactionID: 'Trans-4', dataID: 'Data-2', creationTime: 'xxxxx', pricingMode: '一口价', updateTime: 'xxxxx', status: '等待收款材料 上传' },
        { transactionID: 'Trans-5', dataID: 'Data-3', creationTime: 'xxxxx', pricingMode: '竞拍', updateTime: 'xxxxx', status: '等待数据密钥 上传' },
        { transactionID: 'Trans-6', dataID: 'Data-4', creationTime: 'xxxxx', pricingMode: '一口价', updateTime: 'xxxxx', status: '交易超时' }
      ],
      showModal: false,
      selectedTransaction: null
    }
  },
  methods: {
    statusClass(status) {
      if (status.includes('上传')) {
        return 'status-upload'
      }
      switch (status) {
        case '正在竞拍':
          return 'status-auction'
        case '已定价':
          return 'status-priced'
        case '交易超时':
          return 'status-timeout'
        default:
          return ''
      }
    },
    auditStatusClass(status) {
      switch (status) {
        case '审计通过':
          return 'audit-passed'
        case '审计未通过':
          return 'audit-failed'
        default:
          return ''
      }
    },
    viewDetails(item) {
      console.log('查看详情:', item)
    },
    uploadMaterial(item) {
      console.log('上传材料:', item)
    },
    openModal(item) {
      this.selectedTransaction = item
      this.showModal = true
    },
    closeModal() {
      this.showModal = false
      this.selectedTransaction = null
    }
  }
}
</script>

<style scoped>
.market-details-view {
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

.status-upload a {
  color: #007bff;
  text-decoration: underline;
  cursor: pointer;
}

.status-auction {
  color: #28a745;
}

.status-priced {
  color: #007bff;
}

.status-timeout {
  color: #dc3545;
}

/* Modal Styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-content {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  width: 500px;
  max-width: 90%;
  text-align: left;
}

.close-button {
  background: none;
  border: none;
  font-size: 24px;
  float: right;
  cursor: pointer;
}

.audit-details {
  margin-top: 20px;
}

.audit-details p {
  margin: 10px 0;
}

.audit-details ul {
  list-style-type: none;
  padding: 0;
}

.audit-details li {
  margin: 5px 0;
}

.audit-passed {
  color: #28a745;
}

.audit-failed {
  color: #dc3545;
}
</style>
