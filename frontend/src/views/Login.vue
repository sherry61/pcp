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

    loading: false
    // userIP: "" // IP 归属地功能已停用
  }
},
  methods: {
    async fetchPamEntryUrl(token) {
      const response = await axios.post(
        "http://10.112.191.163:3000/api/pam/entry-start",
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      return response.data?.entry_url;
    },

    async enterAuditTarget(target, token) {
      if (!target) {
        alert('管理员尚未分配审计入口，请联系管理员');
        return;
      }

      if (target === 'HUB') {
        const pamEntryUrl = await this.fetchPamEntryUrl(token);
        if (!pamEntryUrl) {
          throw new Error('审计平台未返回跳转地址');
        }
        window.location.href = pamEntryUrl;
        return;
      }

      if (String(target).startsWith('NODE:')) {
        const response = await axios.post(
          'http://10.112.191.163:3000/api/pam/node-ticket',
          { node_id: String(target).slice(5) },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.data?.url) {
          throw new Error(response.data?.message || '生成审计节点入口失败');
        }
        const launchPath = response.data.url;
        // HTTPS 页面下走 devServer 的 /node-api 同源代理，避免混合内容拦截。
        window.location.href = window.location.protocol === 'https:'
          ? `/node-api${launchPath}`
          : `http://10.112.191.163:3000${launchPath}`;
        return;
      }

      throw new Error('管理员分配的审计入口无效，请联系管理员');
    },

    async login() {
      this.loading = true; // 启用加载状态
      try {
        const response = await axios.post("http://10.112.191.163:3000/api/login", {
          username: this.username,
          password: this.password,
        });

        const token = response.data.token;
        const user = response.data.user || {};
        const role = String(user.role || 'USER').toUpperCase();
        const tradeRole = String(user.trade_role || 'BOTH').toUpperCase();

        localStorage.setItem("token", token);
        localStorage.setItem("login_role", role.toLowerCase());
        localStorage.setItem(
          'user_role',
          role === 'USER' && tradeRole === 'SELLER' ? 'seller' : 'buyer'
        );

        // IP 归属地记录已停用：GoSDK /pre/Ipaddr 只查日志，不落库
        // await this.getUserIP();
        // await this.sendIPToBackend();

        if (role === 'ADMIN') {
          this.$router.push({ name: 'AdminUsers' });
        } else if (role === 'REGULATOR') {
          this.$router.push({ name: 'Supervision' });
        } else if (role === 'AUDITOR') {
          await this.enterAuditTarget(user.auditor_target, token);
        } else {
          this.$router.push({ path: '/market' });
        }
      } catch (error) {
        console.error("登录失败", error.response?.data);
        alert(
          error.response?.data?.error ||
          error.response?.data?.message ||
          error.message ||
          "登录失败，请检查用户名和密码"
        );
      } finally {
        this.loading = false; // 结束加载状态
      }
    },

    /*
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
        await axios.post("http://10.112.191.163:8848/pre/Ipaddr", {
          ip: this.userIP,
        });
        console.log("IP 记录成功");
      } catch (error) {
        console.error("发送 IP 失败:", error);
      }
    },
    */
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
