<template>
  <div class="sidebar">
    <!-- 侧边栏框架始终存在 -->
    <!--<router-link to="/home">主页</router-link>
    <router-link to="/chain-registration">上链登记</router-link>
    <router-link to="/asset-management2">资产管理</router-link>
   
    <router-link to="/market">交易市场</router-link>

   
<div class="menu-group">
  <div class="menu-title" @click="toggleDelivery">
    <span>资产交付</span>
    <span class="arrow" :class="{ open: deliveryOpen }">▸</span>
  </div>

  <div v-show="deliveryOpen" class="submenu">
    <router-link to="/delivery/seller" class="submenu-link">卖家</router-link>
    <router-link to="/delivery/buyer" class="submenu-link">买家</router-link>
  </div>
</div> 

    <router-link to="/user-center">个人中心</router-link>-->

    <!-- 仅管理员可见，通过 isAdminVisible 控制显示，避免闪现 -->
    <!-- <router-link v-if="isAdminVisible" to="/user-management">用户管理(管理员)</router-link> -->

    <template v-if="!isAuditor">

  <router-link to="/home">主页</router-link>

  <router-link v-if="isSeller" to="/chain-registration">
    上链登记
  </router-link>

  <router-link to="/asset-management2">
    资产管理
  </router-link>

  <router-link :to="marketPath">
    交易市场
  </router-link>

  <router-link :to="deliveryPath">
    资产交付
  </router-link>

  <router-link to="/user-center">
    个人中心
  </router-link>

</template>

  </div>
</template>

<script>
import axios from 'axios';
import { mapState, mapMutations } from 'vuex';

export default {
  name: 'AppSidebar',
  data() {
    return {
      loading: true, // 增加一个 loading 状态来控制初始渲染
      isAdminVisible: false, // 控制是否显示管理员链接，初始为 false
      deliveryOpen: false,
      roleTick: 0, // ✅ 新增
    };
  },
  computed: {
    ...mapState(['isAdmin']), // 从 Vuex 中获取 isAdmin 状态
    
  userRole() {
    this.roleTick; // ✅ 关键：触发重新计算
    return localStorage.getItem('user_role') || 'seller';
  },
  isSeller() {
    return this.userRole === 'seller';
  },
  isBuyer() {
    return this.userRole === 'buyer';
  },
  isAuditor() {
  return this.userRole === 'auditor';
},
  deliveryPath() {
  if (this.userRole === 'auditor') {
    return '/home';
  }

  return this.isSeller
    ? '/delivery/seller'
    : '/delivery/buyer';
},
  marketPath() {
    return this.isBuyer ? "/market" : "/market/seller";
  }
  },
  methods: {
    ...mapMutations(['setAdminStatus', 'setUserId', 'setUsername']), // 引入 Vuex 中的 mutation 方法


    toggleDelivery() {
  this.deliveryOpen = !this.deliveryOpen;
},

    fetchUserId() {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = this.parseJwt(token);
        this.username = decodeURIComponent(payload.username);
        this.setUsername(this.username);
        console.log('当前登录用户名:', this.username);

        // 请求用户ID
        axios.post('http://10.112.47.214:3000/api/get-user-id', { username: this.username })
          .then(response => {
            if (response.status === 200 && response.data.id) {
              this.userId = response.data.id.toString();
              this.setUserId(this.userId);
              console.log('获取的用户ID:', this.userId);

              // 判断是否是管理员
              if (this.username === 'rrrao' || this.username === 'liu') {
                this.setAdminStatus(true); // 使用 Vuex mutation 更新状态
                console.log('管理员状态设置为: true');
                this.isAdminVisible = true; // 只有确认是管理员后才设置为 true
              } else {
                this.setAdminStatus(false); // 使用 Vuex mutation 更新状态
                console.log('管理员状态设置为: false');
              }
            } else {
              console.error('获取用户ID失败:', response.data);
            }
          })
          .catch(error => {
            console.error('请求用户ID时发生错误:', error);
          })
          .finally(() => {
            this.loading = false; // 请求完成后，无论是否成功，都结束 loading 状态
          });
      } else {
        console.log('未找到有效的 Token');
        this.loading = false; // 如果没有 token，直接结束 loading 状态
      }
    },
    
    parseJwt(token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(decodeURIComponent(escape(window.atob(base64))));
      } catch (error) {
        console.error('JWT 解析错误:', error);
        return {};
      }
    },

    fetchAssetData() {
      console.log('开始获取资产数据...');
    },

    onRoleChanged() {
    this.roleTick++;
  }
  
  },

  mounted() {
    window.addEventListener('role-changed', this.onRoleChanged);
    console.log('Sidebar 组件已挂载');
    this.fetchUserId();
  }, 
  beforeUnmount() { // Vue3
  window.removeEventListener('role-changed', this.onRoleChanged);
}

};
</script>

<style scoped>
.sidebar {
  width: 10vw;
  background: #333;
  color: #fff;
  height: 100%;
  max-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow: hidden;
}

.sidebar a {
  color: #fff;
  text-decoration: none;
  padding: 10px 0;
  margin: 5px 0;
  border-bottom: 1px solid #444;
}

.sidebar a:hover {
  background: #444;
}


.menu-group { margin: 5px 0; }

.menu-title{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding: 10px 0;
  margin: 5px 0;
  border-bottom: 1px solid #444;
  cursor:pointer;
  user-select:none;
}

.menu-title:hover{ background:#444; }

.arrow { transition: transform 0.15s ease; }
.arrow.open { transform: rotate(90deg); }

.submenu { padding-left: 12px; }
.submenu-link{
  display:block;
  color:#fff;
  text-decoration:none;
  padding:8px 0;
  margin:3px 0;
  border-bottom: 1px dashed #444;
}
.submenu-link:hover{ background:#444; }

</style>
