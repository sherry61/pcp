<template>
  <div class="asset-management">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="title">资产管理</h2>
        <div class="asset-container">
          <div class="info-row">
            <div class="info-text">
              <img src="@/assets/info-icon.png" alt="Info Icon" class="info-icon">
              <span>资产管理</span>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>我的资产名称</th>
                  <th>资产唯一标识</th>
                  <th>资产类别</th>
                  <th>资产等级</th>
                  <th>交易合约选择</th>
                  <th>编程能力操作工具</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in currentPageData" :key="index">
                  <td>{{ item.assetName }}</td>
                  <td>{{ item.assetId }}</td>
                  <td>{{ item.assetType }}</td>
                  <td>{{ item.assetLevel }}</td>
                  <td>{{ item.contractChoice }}</td>
                  <td><button @click="openEditModal(item)">编辑</button></td>
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
              <span v-for="page in pagination.pages" :key="page" @click="goToPage(page)" :class="{ active: pagination.page === page }">{{ page }}</span>
              <button @click="nextPage" :disabled="pagination.page === pagination.pages">下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal Window -->
    <div v-if="showEditModal" class="modal">
      <div class="modal-content wide-modal">
        <h3><img src="@/assets/info-icon.png" alt="Info Icon" class="info-icon-modal"> 编辑资产编程能力</h3>
        <form @submit.prevent="confirmEdit">
          <div class="form-row">
            <div class="form-group">
              <label for="asset-name-modal">资产名称</label>
              <input type="text" id="asset-name-modal" v-model="editAsset.assetName" disabled />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="asset-id-modal">资产标识</label>
              <input type="text" id="asset-id-modal" v-model="editAsset.assetId" disabled />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="asset-type-modal">资产类型</label>
              <input type="text" id="asset-type-modal" v-model="editAsset.assetType" disabled />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="asset-level-modal">资产等级</label>
              <select id="asset-level-modal" v-model="editAsset.assetLevel">
                <option value="1">等级1</option>
                <option value="2">等级2</option>
                <option value="3">等级3</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="contract-choice-modal">交易合约选择</label>
              <select id="contract-choice-modal" v-model="editAsset.contractChoice">
                <option value="一口价">一口价</option>
                <option value="英式拍卖">英式拍卖</option>
                <option value="荷式拍卖">荷式拍卖</option>
              </select>
            </div>
          </div>
          <div class="form-row buttons">
            <button type="button" @click="closeEditModal">取消</button>
            <button type="submit">确定</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Success Modal -->
    <div v-if="showSuccessModal" class="modal">
      <div class="modal-content wide-modal">
        <p>修改成功</p>
        <div class="form-group centered-button">
          <button @click="closeSuccessModal">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'

export default {
  name: 'AssetManagement',
  components: {
    AppHeader,
    AppSidebar
  },
  data() {
    return {
      assetData: [
        { assetName: '车路信息数据集', assetId: '0X12DSADEADWADS', assetType: '自动驾驶/xxx', assetLevel: 1, contractChoice: '一口价' },
        { assetName: '大调天宫数字版权', assetId: '0X12DSADEADHYYHF', assetType: '版权/xxx', assetLevel: 2, contractChoice: '英式拍卖' },
        { assetName: '学院路路口摄像头视频集', assetId: '0X12DSFWEFWEFW', assetType: '车联网/xxx', assetLevel: 3, contractChoice: '荷式拍卖' }
      ],
      pagination: {
        total: 3,
        pages: 1,
        page: 1,
        perPage: 3
      },
      perPageOptions: [3, 5, 10],
      showEditModal: false,
      showSuccessModal: false,
      editAsset: {
        assetName: '',
        assetId: '',
        assetType: '',
        assetLevel: '',
        contractChoice: ''
      }
    }
  },
  computed: {
    currentPageData() {
      const start = (this.pagination.page - 1) * this.pagination.perPage
      const end = this.pagination.page * this.pagination.perPage
      return this.assetData.slice(start, end)
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
    openEditModal(asset) {
      this.editAsset = { ...asset }
      this.showEditModal = true
    },
    closeEditModal() {
      this.showEditModal = false
    },
    confirmEdit() {
      const index = this.assetData.findIndex(item => item.assetId === this.editAsset.assetId)
      if (index !== -1) {
        this.assetData[index] = { ...this.editAsset }
      }
      this.pagination.total = this.assetData.length
      this.closeEditModal()
      this.showSuccessModal = true
    },
    closeSuccessModal() {
      this.showSuccessModal = false
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

.asset-management {
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

.asset-container {
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
  width: 600px;
  max-width: 90%;
  text-align: center;
}

.wide-modal {
  width: 600px; /* 调整弹窗宽度 */
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

.buttons {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.buttons button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.buttons button[type="button"] {
  background-color: #f5f6fa;
  color: #333;
}

.buttons button[type="submit"] {
  background-color: #007bff;
  color: white;
}
.centered-button {
  display: flex;
  justify-content: flex-end; /* 按钮右对齐 */
  width: 100%;
}
.centered-button button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: #007bff;
  color: white;
  margin-top: 20px;
}
</style>
