// src/main.js
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import store from './store';
import userInfoMixin from './mixins/userInfo';  // 混入
import axios from 'axios';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';

// 创建 Vue 应用
const app = createApp(App);

// 设置 Axios 请求拦截器
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token'); // 从 localStorage 获取令牌
    if (token) {
      config.headers.Authorization = `Bearer ${token}`; // 将令牌添加到请求头
    }

    // 混合内容（Mixed Content）修复：
    // 页面以 https 打开时，浏览器会直接拦截发往 http://10.112.191.163:3000 的请求，
    // 请求根本不会发出（后端日志无记录），前端只看到登录失败。
    // 这里统一改写为同源代理路径 /node-api（见 vue.config.js 的 devServer.proxy）。
    const API_ORIGIN = 'http://10.112.191.163:3000';
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      typeof config.url === 'string' &&
      config.url.startsWith(API_ORIGIN)
    ) {
      config.url = '/node-api' + config.url.slice(API_ORIGIN.length);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 使用 Element Plus UI 框架
app.use(ElementPlus);

// 注册路由和 Vuex store
app.mixin(userInfoMixin)  // 混入
app.use(router);
app.use(store);

// 挂载 Vue 实例
app.mount('#app');
