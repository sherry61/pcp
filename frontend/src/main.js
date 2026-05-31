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
