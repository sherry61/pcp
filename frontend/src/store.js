// src/store.js
import { createStore } from 'vuex';

const store = createStore({
  state: {
    username: '', // 初始化为空
    userId: '', // 初始化为空
    isAdmin: false, // 初始化管理员状态为 false
  },
  mutations: {
    setUsername(state, username) {
      state.username = username;
    },
    setUserId(state, userId) {
      state.userId = userId;
    },
    setAdminStatus(state, isAdmin) {
      state.isAdmin = isAdmin; // 更新管理员状态
    },
  },
  actions: {
    // 可以添加异步操作，例如从服务器获取用户信息并更新状态
  },
  getters: {
    // 获取 Vuex 中状态的辅助函数，如果有需要可以定义 getter
  }
});

export default store;
