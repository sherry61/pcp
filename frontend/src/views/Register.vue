<template>
  <div class="auth-page">
    <div class="auth-container">
      <h2 class="auth-title">注册到数据资产交易平台</h2>
      <form @submit.prevent="register">
        <div class="form-group">
          <label for="username">用户名:</label>
          <input type="text" v-model="username" id="username" required />
        </div>
        <div class="form-group">
          <label for="password">密码:</label>
          <input type="password" v-model="password" id="password" required />
        </div>
        <div class="form-group">
          <label for="confirmPassword">确认密码:</label>
          <input type="password" v-model="confirmPassword" id="confirmPassword" required />
        </div>
        <div class="form-group">
          <label for="email">邮箱:</label>
          <input type="email" v-model="email" id="email" />
        </div>
        <div class="form-group">
          <label for="phoneNumber">手机号:</label>
          <input type="text" v-model="phoneNumber" id="phoneNumber" />
        </div>
        <div class="form-group">
          <label for="address">地址:</label>
          <input type="text" v-model="address" id="address" />
        </div>
        <button type="submit" class="auth-button">注册</button>
      </form>
      <p>已有账号？<router-link to="/login">立即登录</router-link></p>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'UserRegister',
  data() {
    return {
      username: '',
      password: '',
      confirmPassword: '',
      email: '',
      phoneNumber: '',
      address: ''
    };
  },
  methods: {
    async register() {
      // 检查密码和确认密码是否一致
      if (this.password !== this.confirmPassword) {
        alert('密码和确认密码不一致');
        return;
      }

      try {
        const response = await axios.post('http://10.112.47.214:3000/api/register', {
          username: this.username,
          password: this.password,
          email: this.email,
          phoneNumber: this.phoneNumber,
          address: this.address
        });
        console.log('注册成功', response.data);
        alert('注册成功，请登录');
        this.$router.push({ name: 'Login' }); // 注册成功后跳转到登录页面
      } catch (error) {
        console.error('注册失败', error.response.data);
        alert(error.response.data.error); // 显示错误信息
      }
    }
  }
};
</script>

<style scoped>
.auth-page {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background-color: #F5F6FA;
}

.auth-container {
  background-color: #fff;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  max-width: 500px;
  width: 100%;
}

.auth-title {
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

.auth-button {
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

.auth-button:hover {
  background-color: #0056b3;
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
