<template>
  <div class="login-page">
    <div class="login-container">
      <h2 class="login-title">基于区块链的数字资产流通系统</h2>
      <form @submit.prevent="login">
        <div class="form-group">
          <label for="username">用户名:</label>
          <input type="text" v-model="username" id="username" required />
        </div>
        <div class="form-group">
          <label for="password">密码:</label>
          <input type="password" v-model="password" id="password" required />
        </div>

        <div class="form-group">
  <label>登录身份:</label>

  <div class="role-group">
    <label class="role-item">
      <input
        type="radio"
        value="user"
        v-model="loginRole"
      />
      普通用户
    </label>

    <label class="role-item">
      <input
        type="radio"
        value="regulator"
        v-model="loginRole"
      />
      监管方
    </label>

    <label
      class="role-item"
    >
      <input
        type="radio"
        value="auditor"
        v-model="loginRole"
      />
      审计方
    </label>
  </div>
</div>

        <button type="submit" class="login-button" :disabled="loading">
          {{ loading ? "登录中..." : "登录" }}
        </button>
      </form>
      <p>还没有账户？<router-link to="/register">立即注册</router-link></p>
    </div>
  </div>
</template>

<script>
import axios from "axios";

export default {
  name: "LoginPage",
  data() {
  return {
    username: "",
    password: "",

    loginRole: "user",

    loading: false,
    userIP: ""
  }
},
  methods: {
    async login() {
      this.loading = true; // 启用加载状态
      try {
        // 1. 发送登录请求
        const response = await axios.post("http://10.112.47.214:3000/api/login", {
          username: this.username,
          password: this.password,
        });

        console.log("登录成功", response.data);
        localStorage.setItem("token", response.data.token);
        localStorage.setItem( "login_role", this.loginRole);
        if (this.loginRole === 'regulator') {
          localStorage.setItem('user_role', 'buyer');
        } else if (!localStorage.getItem('user_role')) {
          localStorage.setItem('user_role', 'seller');
        }

        // 2. 获取公网 IP
        await this.getUserIP();

        // 3. 发送 IP 到后端
        await this.sendIPToBackend();

        // 4. 跳转到主页
        if (this.loginRole === 'user') {

  localStorage.setItem(
    'user_role',
    'seller'
  );

  this.$router.push({
    name: 'Home'
  });

} else if (
  this.loginRole === 'regulator'
) {

  this.$router.push({
    name: 'Supervision'
  });
} else if (
  this.loginRole === 'auditor'
) {

  window.location.href =
    'http://10.112.47.214:5173/auth/ssologin';

}
      } catch (error) {
        console.error("登录失败", error.response?.data);
        alert(error.response?.data?.error || "登录失败，请检查用户名和密码");
      } finally {
        this.loading = false; // 结束加载状态
      }
    },

    // 获取公网 IP
    async getUserIP() {
      try {
        const response = await axios.get("https://ipapi.co/json/");
        this.userIP = response.data.ip;
        console.log("获取到的公网 IP:", this.userIP);
      } catch (error) {
        console.error("获取公网 IP 失败:", error);
      }
    },
    

    // 发送 IP 到后端
    async sendIPToBackend() {
      if (!this.userIP) return; // IP 获取失败则不发送
      try {
        await axios.post("http://10.112.47.214:8848/pre/Ipaddr", {
          ip: this.userIP,
        });
        console.log("IP 记录成功");
      } catch (error) {
        console.error("发送 IP 失败:", error);
      }
    },
  },
};
</script>

<style scoped>

.role-group { display: flex; gap: 18px; margin-top: 6px; }
.role-item { display: inline-flex; align-items: center; gap: 6px; }

.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #F5F6FA;
}

.login-container {
  background-color: #fff;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  max-width: 400px;
  width: 100%;
}

.login-title {
  font-size: 24px;
  color: #333;
  text-align: center;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  font-size: 14px;
  color: #333;
  margin-bottom: 5px;
}

.form-group input {
  width: 100%;
  padding: 10px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-sizing: border-box;
}

.login-button {
  width: 100%;
  padding: 10px;
  font-size: 16px;
  color: #fff;
  background-color: #007bff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 10px;
}

.login-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

p {
  text-align: center;
  margin-top: 15px;
  font-size: 14px;
}

p a {
  color: #007bff;
  text-decoration: none;
}

p a:hover {
  text-decoration: underline;
}
</style>
