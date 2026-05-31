<!-- src/views/AdminDashboard.vue -->
<template>
  <div class="admin-dashboard">
    <AppHeader />
    <div class="main-content">
      <AppSidebar :isAdmin="true" />
      <div class="content">
        <h2 class="title">权限管理</h2>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>地址</th>
                <th>权限等级</th>
                <th>可访问范围</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(user, index) in users" :key="index">
                <td>{{ user.username }}</td>
                <td>{{ user.email }}</td>
                <td>{{ user.address }}</td>
                <td>{{ user.permissionLevel }}</td>
                <td>{{ user.accessScope }}</td>
                <td><button @click="editUser(user)">编辑</button></td>
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
    <div v-if="showModal" class="modal">
      <div class="modal-content">
        <h3>编辑用户权限</h3>
        <form @submit.prevent="updateUser">
          <div class="form-row">
            <div class="form-group">
              <label for="username">用户名</label>
              <input type="text" id="username" v-model="selectedUser.username" disabled />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="email">邮箱</label>
              <input type="email" id="email" v-model="selectedUser.email" disabled />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="address">地址</label>
              <input type="text" id="address" v-model="selectedUser.address" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="permissionLevel">权限等级</label>
              <select id="permissionLevel" v-model="selectedUser.permissionLevel">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="accessScope">可访问范围</label>
              <select id="accessScope" v-model="selectedUser.accessScope">
                <option value="上链登记, 估值定价">上链登记, 估值定价</option>
                <option value="审计监督">审计监督</option>
                <option value="交易市场">交易市场</option>
              </select>
            </div>
          </div>
          <div class="buttons-row">
            <button type="button" @click="closeModal">取消</button>
            <button type="submit">确定</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'

export default {
  name: 'AdminDashboard',
  components: {
    AppHeader,
    AppSidebar
  },
  data() {
    return {
      users: [
        { username: 'try', email: '1256796676@qq.com', address: '北京邮电大学', permissionLevel: 1, accessScope: '上链登记, 估值定价' },
        { username: 'hello', email: '1256796676@qq.com', address: '北京邮电大学', permissionLevel: 2, accessScope: '审计监督' },
        { username: 'user', email: '1256796676@qq.com', address: '北京邮电大学', permissionLevel: 3, accessScope: '交易市场' }
      ],
      pagination: {
        total: 3,
        pages: 1,
        page: 1,
        perPage: 10
      },
      perPageOptions: [10, 20, 50],
      showModal: false,
      selectedUser: null
    }
  },
  computed: {
    currentPageData() {
      const start = (this.pagination.page - 1) * this.pagination.perPage
      const end = this.pagination.page * this.pagination.perPage
      return this.users.slice(start, end)
    }
  },
  methods: {
    editUser(user) {
      this.selectedUser = { ...user }
      this.showModal = true
    },
    closeModal() {
      this.showModal = false
    },
    updateUser() {
      const index = this.users.findIndex(u => u.username === this.selectedUser.username)
      if (index !== -1) {
        this.users.splice(index, 1, this.selectedUser)
      }
      this.closeModal()
    },
    updatePages() {
      this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage)
      if (this.pagination.page > this.pagination.pages) {
        this.pagination.page = this.pagination.pages
      }
    },
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
    }
  }
}
</script>

<style scoped>
.admin-dashboard {
  width: 100vw;
  height: 100vh;
  background: #F5F6FA;
  display: flex;
  flex-direction: column;
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
  width: 500px;
  max-width: 90%;
  text-align: center;
}

.modal-content h3 {
  margin-top: 0;
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
</style>
