<template>
  <div class="admin-cross-chain-page">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="page-title">跨链跨平台</h2>
        <CrossChainPanel />
      </div>
    </div>
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';
import CrossChainPanel from '@/components/CrossChainPanel.vue';

export default {
  name: 'AdminCrossChain',
  components: { AppHeader, AppSidebar, CrossChainPanel }
};
</script>

<style scoped>
.admin-cross-chain-page {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f5f7fb;
}

.main-content {
  display: flex;
  height: calc(100vh - 64px);
  min-height: 0;
  overflow-y: auto;
}

.content {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 24px 32px;
  box-sizing: border-box;
}

.page-title {
  margin: 0 0 20px;
  font-size: 22px;
  color: #1f2937;
}
</style>
