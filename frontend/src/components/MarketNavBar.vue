<template>
  <div class="navbar">
    <router-link to="/market" class="nav-item">交易市场</router-link>
    <router-link to="/market/list" class="nav-item">交易列表</router-link>
    <router-link to="/market/details" class="nav-item">交易详情</router-link>
  </div>
</template>

<script>
export default {
  name: 'MarketNavBar'
}
</script>

<style scoped>
.navbar {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  background-color: #fff;
  padding: 10px;
  border-bottom: 1px solid #ddd;
}

.nav-item {
  margin-right: 20px;
  text-decoration: none;
  color: #333;
  font-weight: bold;
}

.nav-item.router-link-active {
  color: #007bff;
}
</style>
