<template>
  <div class="user-management">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="title">用户管理</h2>
        <div class="asset-container">
          <div class="info-row">
            <div class="info-text">
              <img src="@/assets/user-icon.png" alt="Info Icon" class="info-icon">
              <span>用户管理</span>
            </div>
          </div>

          <!-- 错误消息 -->
          <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

          <div class="table-container">
            <!-- 加载指示器 -->
            <div v-if="isLoading" class="loading">加载中...</div>

            <table v-else>
              <thead>
                <tr>
                  <th>用户 ID</th>
                  <th>用户名称</th>
                  <th>安全等级</th>
                  <th>备注</th>
                  <th>编辑</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in currentPageData" :key="item.id">
                  <td>{{ item.id }}</td>
                  <td>{{ item.username }}</td>
                  <td>{{ item.usertype }}</td>
                  <td>{{ formatRemarks(item.email, item.address) }}</td>
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
              <span v-for="page in pagination.pages" :key="page" @click="goToPage(page)" :class="{ active: pagination.page === page }">
                {{ page }}
              </span>
              <button @click="nextPage" :disabled="pagination.page === pagination.pages">下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal Window -->
    <div v-if="showEditModal" class="modal">
      <div class="modal-content wide-modal">
        <h3>
          <img src="@/assets/info-icon.png" alt="Info Icon" class="info-icon-modal"> 编辑用户信息
        </h3>
        <form @submit.prevent="confirmEdit">
          <div class="form-row">
            <div class="form-group">
              <label for="file-hash-modal">用户 ID</label>
              <input type="text" id="file-hash-modal" v-model="editAsset.id" disabled />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="asset-type-modal">安全等级</label>
              <input type="text" id="asset-type-modal" v-model="editAsset.usertype" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="asset-name-modal">用户名称</label>
              <input type="text" id="asset-name-modal" v-model="editAsset.username" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="email-modal">邮箱</label>
              <input type="email" id="email-modal" v-model="editAsset.email" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="address-modal">地址</label>
              <input type="text" id="address-modal" v-model="editAsset.address" />
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
      <div class="modal-content wide-modal2">
        <p>修改成功</p>
        <div class="centered-button">
          <button @click="closeSuccessModal">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>


  <script>
  import AppHeader from '@/components/AppHeader.vue'
  import AppSidebar from '@/components/AppSidebar.vue'
  import axios from 'axios'
  
  export default {
    name: 'AssetManagement',
    components: {
      AppHeader,
      AppSidebar
    },
    data() {
      return {
        assetData: [], // 初始化为空数组，将从后端获取
        pagination: {
          total: 0,
          pages: 0,
          page: 1,
          perPage: 5
        },
        showHistoryModal: false,
        historyData: [],

        perPageOptions: [5, 10, 15],
        showEditModal: false,
        showSuccessModal: false,
        isExpanded: false,
        editAsset: {
            id: '',
            username: '',
            usertype: '',
            email: '',
            address: '',
  
},

        isLoading: false,      // 新增
        errorMessage: ''       // 新增
      }
    },
    computed: {
      currentPageData() {
        return this.assetData.slice(
          (this.pagination.page - 1) * this.pagination.perPage,
          this.pagination.page * this.pagination.perPage
        )
      }
    },
    methods: {
      toggleExpand(item) {
    item.isExpanded = !item.isExpanded; // 切换当前项的展开状态
  },
  shortenHash(hash) {
    return hash.length > 10 ? hash.substring(0, 10) : hash; // 如果哈希的长度超过10，显示前10个字符
  },
      fetchAssetData() {
  axios.get('http://10.112.47.214:3000/api/get-user')
    .then(response => {
    //   // 按资产名称分组，并只保留每组中ID最新的资产
    //   const groupedAssets = response.data.reduce((acc, item) => {
    //     const key = item.file_hash;
    //     if (!acc[key] || item.id > acc[key].id) {
    //       acc[key] = item; // 更新为最新版本
    //     }
    //     return acc;
    //  }, {});

    //   this.assetData = Object.values(groupedAssets).map(item => ({
    this.assetData = response.data.map(item => ({
      id: item.id,
      username: item.username,
      usertype: item.usertype,
    //   description: item.description,
    //  
     fileHash: item.file_hash,
      email: item.email,
      address: item.address,
    //   algorithm: item.algorithm,
    //   userId: item.user_id,
    //   txperm: item.txperm,
    password: item.password,
    phone_number: item.phone_number,
    remarks: item.remarks,
      isExpanded: false // 新增字段用于控制展开状态
}));




      this.pagination.total = this.assetData.length;
      this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage);
    })
    .catch(error => {
      console.error('获取资产数据失败:', error);
      this.errorMessage = '获取资产数据失败，请稍后再试。';
    })
    .finally(() => {
      this.isLoading = false;
    });
}
,
      formatRemarks(email, address) {
        return `邮箱: ${email}, 地址: ${address}`
      },
      prevPage() {
        if (this.pagination.page > 1) {
          this.pagination.page--
          this.fetchAssetData()
        }
      },
      nextPage() {
        if (this.pagination.page < this.pagination.pages) {
          this.pagination.page++
          this.fetchAssetData()
        }
      },
      goToPage(page) {
        this.pagination.page = page
        this.fetchAssetData()
      },
      updatePages() {
        this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage)
        if (this.pagination.page > this.pagination.pages) {
          this.pagination.page = this.pagination.pages
        }
        this.fetchAssetData()
      },
      openEditModal(asset) {
        this.editAsset = { ...asset }
        this.showEditModal = true
      },
      closeEditModal() {
        this.showEditModal = false
      },
      confirmEdit() {
  this.isLoading = true;
  this.errorMessage = '';
  axios.post('http://10.112.47.214:3000/api/update-user', this.editAsset)
  .then(response => {
      if (response.status === 200) {
        // 确保成功处理逻辑在此处
        this.showSuccessModal = true;
        this.closeEditModal();
      } else {
        // 错误处理
        this.errorMessage = '更新资产失败，请稍后再试。';
      }
    })
    .catch(error => {
      console.error('更新资产失败:', error);
      this.errorMessage = '更新资产失败，请稍后再试。';
    })
    .finally(() => {
      this.isLoading = false;
    });
},



      closeSuccessModal() {
        this.showSuccessModal = false;
        location.reload(); // 刷新整个页面
      },
  //    showHistory(item) {
  // 请求所有历史版本
  // axios.get(`http://10.29.32.8:3000/api/query-assets?assetName=${item.assetName}`)

  //   .then(response => {
  //     if (response.data.count > 0) {
  //       // 直接使用后端返回的记录
  //       this.historyData = response.data.records; 
  //     } else {
  //       this.historyData = []; // 没有记录时清空
  //     }
  //     this.showHistoryModal = true; // 显示历史版本模态框
  //   })
  //   .catch(error => {
  //     console.error('获取历史版本失败:', error);
  //     this.historyData = []; // 出错时清空历史数据
  //   });
// }
// ,
  closeHistoryModal() {
    this.showHistoryModal = false;
  }
    },
    mounted() {
      this.fetchAssetData()
    },
    
}


  
  </script>
  
  <style scoped>
  body {
    background-color: #F5F6FA;
    margin: 0;
    font-family: Arial, sans-serif;
  }
  
  .asset-management {
    width: 100%;
    min-height: 100vh;
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
    width: 100%;
    overflow-x: auto; /* 允许水平滚动，防止内容溢出 */
    max-height: 500px; /* 设置最大高度，根据需要调整 */
    overflow-y: auto; /* 垂直滚动 */
    margin-bottom: 20px;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed; /* 固定表格布局 */
  }
  
  /* 修改表格样式以支持换行 */
th, td {
  padding: 10px;
  text-align: center;
  border-bottom: 1px solid #ddd;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal; /* 允许内容换行 */
  word-break: break-word; /* 单词换行 */
  vertical-align: middle; /* 垂直居中 */
  border: 1px solid #dde3eb; 
}

/* 设置最大高度和滚动条 */
.table-container {
  width: 100%;
  overflow-x: auto; /* 允许水平滚动，防止内容溢出 */
  max-height: 500px; /* 设置最大高度，根据需要调整 */
  overflow-y: auto; /* 垂直滚动 */
}

/* 增加Tooltip提示 */
td:hover::after {
  content: none; /* 使用title属性作为提示 */
  position: absolute;
  background-color: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 5px;
  border-radius: 3px;
  white-space: pre-wrap; /* 使tooltip内容自动换行 */
  z-index: 10;
}

  
  .pagination-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap; /* 允许分页控件在小屏幕上换行 */
  }
  
  .pagination-info {
    font-size: 14px;
    color: #666;
  }
  
  .pagination-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
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
    border-radius: 4px; /* 添加圆角使按钮更美观 */
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
    width: 100%; /* 确保表单行的宽度100% */
  }

  .form-group {
    width: 100%; /* 确保表单组的宽度100% */
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .form-group label {
    margin-bottom: 5px;
    font-weight: bold; /* 标签加粗 */
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%; /* 设置宽度100%以适应父元素 */
    padding: 10px;
    font-size: 14px;
    border: 1px solid #ddd;
    border-radius: 4px;
    min-width: 200px; /* 设置最小宽度，以确保框在小屏幕上仍然可读 */
    max-width: 100%; /* 设置最大宽度为100% */
    box-sizing: border-box; /* 确保内边距不会影响总宽度 */
  }

  /* 调整textarea以自适应内容*/
  .form-group textarea {
    resize: vertical; /* 允许用户垂直调整高度 */
    min-height: 50px; /* 设置最小高度 */
  }
  
  .buttons {
      display: flex;
      justify-content: flex-end; /* 按钮右对齐 */
      gap: 10px; /* 添加按钮之间的间距 */
      width: 100%; /* 确保按钮行的宽度100% */
      flex-direction: row; /* 设置为左右排列 */
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
    justify-content: center; /* 按钮右对齐 */
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
  
  .loading {
    text-align: center;
    padding: 20px;
    font-size: 16px;
    color: #666;
  }
  
  .error-message {
    color: red;
    text-align: center;
    margin-bottom: 10px;
  }
  .edit-label {  
  float: left;  
  width: 80px; /* 根据需要调整宽度 */  
  text-align: left;  
}  
.version-info {  
  margin-left: 90px; /* 要比.edit-label的宽度多一点，以确保不重叠 */  
}  

  
.version-list {  
  max-height: 300px; /* 根据你的需要调整这个高度，以显示大约10行 */  
  overflow-y: auto; /* 允许垂直滚动 */  
  margin: 0; /* 去除ul的默认外边距，如果需要 */  
  padding: 0; /* 去除ul的默认内边距，如果需要 */  
}  
  
/* 可选：为li元素设置样式，以确保它们均匀分布 */  
.version-list li {  
  list-style-type: none; /* 去除默认的列表样式 */  
  padding: 10px 0; /* 根据需要设置上下内边距 */  
}  
.red-text {
  color: red;
}

.green-text {
  color: green;
}

.hash-display {
    cursor: pointer; /* 鼠标悬停时显示为指针 */
    color: #007bff; /* 设置点击文本的颜色 */
}

.hash-display .collapse {
    cursor: pointer; /* 鼠标悬停时显示为指针 */
    color: #007bff; /* 设置收起文本的颜色 */
}

.form-row {
  display: flex;
  align-items: center; /* 使所有子元素垂直居中对齐 */
  margin-bottom: 15px;
}

.form-group {
  flex: 1; /* 确保每个表单元素都占据一定的空间 */
}

.form-group label {
  margin-bottom: 0; /* 消除下边距，保持标签与输入框紧贴 */
  margin-right: 10px; /* 可以调整标签与输入框之间的间距 */
  white-space: nowrap; /* 确保标签不换行 */
}

.form-group input,
.form-group textarea {
  width: 100%; /* 使输入框和文本域占据全部宽度 */
  padding: 10px;
  font-size: 14px;
}
.modal-content.wide-modal2 {
  width: 300px; /* 缩小弹窗的宽度 */
  padding: 10px; /* 减小内边距 */
}
.user-management {
  width: 2209px;
  height: 1509px;
  max-width: 100vw;
  max-height: 100vh;
  background: #F5F6FA;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

  </style>
  