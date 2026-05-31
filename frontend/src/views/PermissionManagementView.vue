<template>
  <div class="permission-management">
    <AppHeader />
    <div class="main-content">
      <AppSidebar :isAdmin="true" />
      <div class="content">
        <h2 class="title">权限管理</h2>
        <div class="form-container">
          <form @submit.prevent="checkPassword">
            <div class="form-group">
              <label for="admin-password">请输入管理员密码</label>
              <input type="password" id="admin-password" v-model="password" />
            </div>
            <button type="submit">提交</button>
          </form>
        </div>
        <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'

export default {
  name: 'PermissionManagementView',
  components: {
    AppHeader,
    AppSidebar
  },
  data() {
  return {
    password: '',
    errorMessage: '',
    attemptCount: 0,
    isLocked: false,
  };
},
methods: {
    checkPassword() {
      const adminPassword = process.env.VUE_APP_ADMIN_PASSWORD;
      console.log('Admin Password:', adminPassword); // 打印密码以检查是否正确获取

      // 锁定状态下，不再处理，并显示错误消息
      if (this.isLocked) {
        this.errorMessage = '输入错误次数过多，已被锁定，请1分钟后重试。';
        return;
      }

      // 检查密码是否正确
      if (this.password === adminPassword) {
        this.attemptCount = 0; // 重置尝试次数
        this.$router.push('/admin-dashboard'); // 验证成功后跳转到管理员仪表盘
      } else {
        this.attemptCount++;
        this.errorMessage = '密码错误，请重试。';

        // 达到最大错误次数，锁定用户
        if (this.attemptCount >= 5) {
          this.isLocked = true;
          setTimeout(() => {
            this.isLocked = false;
            this.attemptCount = 0; // 重置尝试次数
          }, 60000); // 1分钟锁定
        }
      }
    }
}



}
</script>

<style scoped>
.permission-management {
  display: flex;
  flex-direction: column;
  height: 100vh;
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

.form-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-top: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
}

.form-group input {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  padding: 10px 20px;
  font-size: 14px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 4px;
  cursor: pointer;
}

.error-message {
  margin-top: 15px;
  color: red;
}
</style>
