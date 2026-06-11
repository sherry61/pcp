<template>
  <header class="app-header">
    <div class="left-section">
      <div class="logo">

  {{
    loginRole === 'user'
      ? '数字资产流通系统'
      : loginRole === 'regulator'
      ? '数字资产监管平台'
      : '数字资产审计平台'
  }}

</div>

      <div class="search-box">
        <input type="text" placeholder="Search" />
      </div>
    </div>

    <div class="user-info">
      <!-- ✅ 新增：身份切换（右上角） -->
      <div
  class="role-switch"
  v-if="loginRole === 'user'"
>
  <span class="role-label">身份：</span>

  <select
    class="role-select"
    v-model="role"
    @change="onRoleChange"
  >
    <option value="buyer">买家</option>
    <option value="seller">卖家</option>
  </select>
</div>

      <span class="welcome-text">欢迎, {{ username }} (ID: {{ userId }})</span>

      <button @click="logout">登出</button>
    </div>
  </header>
</template>

<script>
export default {
  name: 'AppHeader',
  props: {
    username: { type: String, required: true },
    userId: { type: String, required: true }
  },
  data() {
    return {
      // ✅ 默认 buyer；如果你希望默认 seller 也可以改这里
      role: localStorage.getItem('user_role') || 'seller'
    };
  },
   computed: {
    loginRole() {
      return localStorage.getItem('login_role') || 'user';
    }
  },
  
  created() {
    // ✅ 确保首次登录也有 role（否则路由守卫会用默认 buyer，但这里 select 可能空）
    if (!localStorage.getItem('user_role')) {
      localStorage.setItem('user_role', this.role);
    }
  },
  methods: {
    onRoleChange() {
      localStorage.setItem('user_role', this.role);

      // ✅ 通知 Sidebar 立刻刷新（你需要在 Sidebar 里监听 role-changed）
      window.dispatchEvent(new Event('role-changed'));

      // ✅ 触发你的 /delivery redirect（根据 role 自动去 buyer/seller）
      // 同时会触发 router.beforeEach 权限重新校验
      this.$router.push('/delivery').catch(() => {});
    },



    logout() {
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      window.dispatchEvent(new Event('role-changed'));
      this.$router.push('/login');
    }
  }
};
</script>

<style scoped>
.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.left-section {
  display: flex;
  align-items: center;
}

.logo {
  font-size: 24px;
  font-weight: bold;
}

.search-box {
  margin-left: 30px;
  background-color: #F5F6FA;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 5px 10px;
}

.search-box input {
  width: 300px;
  padding: 5px 10px;
  font-size: 16px;
  border: none;
  background-color: #F5F6FA;
  outline: none;
}

.search-box::before {
  content: "";
  display: block;
  width: 20px;
  height: 20px;
  background-image: url('@/assets/search-icon.png');
  background-size: contain;
  background-repeat: no-repeat;
  margin-right: 10px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ✅ 新增：身份切换样式 */
.role-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #F5F6FA;
  border: 1px solid #e6e6e6;
  padding: 4px 8px;
  border-radius: 6px;
}

.role-label {
  font-size: 14px;
  color: #555;
}

.role-select {
  font-size: 14px;
  border: none;
  outline: none;
  background: transparent;
  cursor: pointer;
}

.welcome-text {
  font-size: 14px;
  color: #333;
}

.user-info button {
  margin-left: 8px;
  padding: 5px 10px;
  font-size: 16px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 4px;
  cursor: pointer;
}
</style>
