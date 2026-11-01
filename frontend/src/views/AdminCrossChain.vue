<template>
  <div class="admin-cross-chain-page">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <div class="page-head">
          <div>
            <h2 class="page-title">跨链跨平台</h2>
            <p class="page-hint">
              仅管理员可用。左侧检索目录链资产，右侧在 ChainMaker 与 EVM 之间执行转入 / 转出。
            </p>
          </div>
        </div>

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

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-title {
  margin: 0;
  font-size: 22px;
  color: #1f2937;
}

.page-hint {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.6;
}
</style>
