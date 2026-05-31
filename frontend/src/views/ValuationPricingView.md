<template>
  <div class="valuation-pricing">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="title">估值定价</h2>
        <div class="valuation-container">
          <div class="info-row">
            <div class="info-text">
              <img src="@/assets/info-icon.png" alt="Info Icon" class="info-icon">
              <span>数字资产估值策略</span>
            </div>
            <button class="add-strategy-btn" @click="openModal">新增估值策略</button>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>资产类型</th>
                  <th>估值方法</th>
                  <th>定价方法</th>
                  <th>创建时间</th>
                  <th>操作人</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in currentPageData" :key="index">
                  <td>{{ item.assetType }}</td>
                  <td>{{ item.valuationMethod }}</td>
                  <td>{{ item.pricingMethod }}</td>
                  <td>{{ item.creationTime }}</td>
                  <td>{{ item.operator }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pagination-container">
            <div class="pagination-info">
              {{ pagination.total }} 条，共 {{ pagination.pages }} 页
            </div>
            <div class="pagination-controls">
              <select v-model="pagination.perPage" @change="updatePages">
                <option v-for="option in perPageOptions" :key="option" :value="option">{{ option }} 条/页</option>
              </select>
              <button @click="prevPage" :disabled="pagination.page === 1">上一页</button>
              <span v-for="page in pagesArray" :key="page" @click="goToPage(page)" :class="{ active: pagination.page === page }">{{ page }}</span>
              <button @click="nextPage" :disabled="pagination.page === pagination.pages">下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Window -->
    <div v-if="showModal" class="modal">
      <div class="modal-content">
        <h3><img src="@/assets/info-icon.png" alt="Info Icon" class="info-icon-modal"> 新增数字资产估值策略</h3>
        <form @submit.prevent="addValuationStrategy">
          <div class="form-row">
            <div class="form-group">
              <label for="asset-name-modal">资产名称</label>
              <input type="text" id="asset-name-modal" v-model="newStrategy.assetName" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="valuation-method-modal">估值方法</label>
              <select id="valuation-method-modal" v-model="newStrategy.valuationMethod">
                <option value="方法1">方法1</option>
                <option value="方法2">方法2</option>
                <option value="方法3">方法3</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="pricing-method-modal">定价方法</label>
              <select id="pricing-method-modal" v-model="newStrategy.pricingMethod">
                <option value="拍卖">拍卖</option>
                <option value="一口价">一口价</option>
                <option value="xx">xx</option>
              </select>
            </div>
          </div>
          <div class="buttons-row">
            <button type="button" @click="closeModal">取消</button>
            <button type="submit">新增</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div v-if="showConfirmation" class="modal">
      <div class="modal-content">
        <h3>确认信息</h3>
        <p><strong>资产名称:</strong> {{ newStrategy.assetName }}</p>
        <p><strong>估值方法:</strong> {{ newStrategy.valuationMethod }}</p>
        <p><strong>定价方法:</strong> {{ newStrategy.pricingMethod }}</p>
        <div class="buttons-row">
          <button type="button" @click="closeConfirmation">取消</button>
          <button type="button" @click="confirmStrategy">确认</button>
        </div>
      </div>
    </div>

    <!-- Success Modal -->
    <div v-if="showSuccess" class="modal">
      <div class="modal-content success">
        <h3>新增成功</h3>
        <div class="buttons-row">
          <button type="button" @click="closeSuccess">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'

export default {
  name: 'ValuationPricing',
  components: {
    AppHeader,
    AppSidebar
  },
  data() {
    return {
      valuationData: [
        { assetType: '类型1', valuationMethod: 'xxx', pricingMethod: '拍卖', creationTime: '2024-01-01 10:00:00', operator: '用户1' },
        { assetType: '类型2', valuationMethod: 'xxx', pricingMethod: '一口价', creationTime: '2024-01-01 10:00:00', operator: '用户2' },
        { assetType: '类型3', valuationMethod: 'xxx', pricingMethod: 'xx', creationTime: '2024-01-01 10:00:00', operator: '用户2' },
        { assetType: '类型4', valuationMethod: 'yyy', pricingMethod: '拍卖', creationTime: '2024-01-01 10:00:00', operator: '用户3' },
        { assetType: '类型5', valuationMethod: 'zzz', pricingMethod: '一口价', creationTime: '2024-01-01 10:00:00', operator: '用户4' },
        { assetType: '类型6', valuationMethod: 'aaa', pricingMethod: 'xx', creationTime: '2024-01-01 10:00:00', operator: '用户5' },
        { assetType: '类型7', valuationMethod: 'bbb', pricingMethod: '拍卖', creationTime: '2024-01-01 10:00:00', operator: '用户6' },
        { assetType: '类型8', valuationMethod: 'ccc', pricingMethod: '一口价', creationTime: '2024-01-01 10:00:00', operator: '用户7' },
        { assetType: '类型9', valuationMethod: 'ddd', pricingMethod: 'xx', creationTime: '2024-01-01 10:00:00', operator: '用户8' }
      ],
      pagination: {
        total: 9,
        pages: 3,
        page: 1,
        perPage: 3
      },
      perPageOptions: [3, 5, 10],
      showModal: false,
      showConfirmation: false,
      showSuccess: false,
      newStrategy: {
        assetName: '',
        valuationMethod: '',
        pricingMethod: ''
      }
    }
  },
  computed: {
    currentPageData() {
      const start = (this.pagination.page - 1) * this.pagination.perPage
      const end = this.pagination.page * this.pagination.perPage
      return this.valuationData.slice(start, end)
    },
    pagesArray() {
      return Array.from({ length: this.pagination.pages }, (_, i) => i + 1)
    }
  },
  methods: {
    prevPage() {
      if (this.pagination.page > 1) {
        this.pagination.page--
      }
    },
    nextPage() {
      if (this.pagination.page < this.pagination.pages) {
        this.pagination.page++
      }
    },
    goToPage(page) {
      this.pagination.page = page
    },
    updatePages() {
      this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage)
      if (this.pagination.page > this.pagination.pages) {
        this.pagination.page = this.pagination.pages
      }
    },
    openModal() {
      this.showModal = true
    },
    closeModal() {
      this.showModal = false
    },
    openConfirmation() {
      this.showModal = false
      this.showConfirmation = true
    },
    closeConfirmation() {
      this.showConfirmation = false
    },
    addValuationStrategy() {
      this.openConfirmation()
    },
    confirmStrategy() {
      const newStrategy = {
        assetType: this.newStrategy.assetName,
        valuationMethod: this.newStrategy.valuationMethod,
        pricingMethod: this.newStrategy.pricingMethod,
        creationTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
        operator: '当前用户'
      }
      this.valuationData.push(newStrategy)
      this.pagination.total++
      this.updatePages()
      this.closeConfirmation()
      this.showSuccess = true
    },
    closeSuccess() {
      this.showSuccess = false
      this.updatePages()
    }
  }
}
</script>

<style scoped>
body {
  background-color: #F5F6FA;
  margin: 0;
  font-family: Arial, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  overflow: hidden;
}

.valuation-pricing {
  width: 2209px;
  height: 1509px;
  max-width: 100vw;
  max-height: 100vh;
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

.valuation-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-top: 20px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.info-text {
  display: flex;
  align-items: center;
}

.info-icon {
  width: 20px;
  height: 20px;
  margin-right: 10px;
}

.add-strategy-btn {
  padding: 8px 16px;
  font-size: 14px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 4px;
  cursor: pointer;
}

.table-container {
  margin-bottom: 20px;
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

.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pagination-info {
  font-size: 14px;
  color: #666;
}

.pagination-controls {
  display: flex;
  align-items: center;
}

.pagination-controls select {
  margin-right: 10px;
}

.pagination-controls button,
.pagination-controls span {
  padding: 5px 10px;
  margin: 0 2px;
  border: none;
  background-color: #f5f6fa;
  cursor: pointer;
}

.pagination-controls button:disabled,
.pagination-controls span.active {
  background-color: #007bff;
  color: white;
  cursor: default;
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
  width: 500px; /* 增加宽度 */
  max-width: 90%;
  text-align: center;
}

.modal-content h3 {
  margin-top: 0;
  display: flex;
  align-items: center;
}

.info-icon-modal {
  width: 20px;
  height: 20px;
  margin-right: 10px;
}

.form-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 15px;
}

.form-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.form-group label {
  margin-bottom: 5px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.buttons-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.buttons-row button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.buttons-row button[type="button"] {
  background-color: #f5f6fa;
  color: #333;
}

.buttons-row button[type="submit"] {
  background-color: #007bff;
  color: white;
}

/* Success Modal Styles */
.modal-content.success {
  width: 500px; /* 增加宽度 */
  text-align: center;
  position: relative;
}

.modal-content.success h3 {
  margin: 20px 0;
}

.buttons-row {
  display: flex;
  justify-content: flex-end;
  width: 100%;
  margin-top: 20px;
}

.buttons-row button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: #007bff;
  color: white;
}
</style>
