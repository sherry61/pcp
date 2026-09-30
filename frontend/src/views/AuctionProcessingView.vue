<template>
  <div class="page">
    <AppHeader />
    <div class="main"><AppSidebar />
      <section class="content">
        <h2>交易处理</h2>
        <div v-if="loading">加载中…</div>
        <div v-else-if="assets.length === 0" class="empty">暂无待处理的获拍资产</div>
        <article v-for="asset in assets" :key="asset.file_hash" class="card">
          <img v-if="asset.picture" :src="`data:image/jpeg;base64,${asset.picture}`" alt="资产图片" />
          <div class="info"><h3>{{ asset.asset_name }}</h3><p>{{ asset.description || '暂无描述' }}</p><p>获拍价：<strong>{{ asset.bid_price }} 元</strong></p><p>成交时间：{{ formatTime(asset.auction_end_time) }}</p></div>
          <button @click="process(asset)">提交交易申请</button>
        </article>
      </section>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';

export default {
  name: 'AuctionProcessingView', components: { AppHeader, AppSidebar },
  data: () => ({ assets: [], loading: true, userId: '', errorMessage: '' }),
  async mounted() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const payloadPart = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(payloadPart + '='.repeat((4 - payloadPart.length % 4) % 4)));
      const username = payload.username ? String(payload.username) : '';
      if (!username) throw new Error('登录信息中缺少用户名');
      const { data } = await axios.post('http://10.112.191.163:3000/api/get-user-id', { username });
      if (!data?.id) throw new Error('未获取到买方用户ID');
      this.userId = data.id;
      const response = await axios.get(`http://10.112.191.163:3000/api/auction/won/${this.userId}`);
      this.assets = response.data || [];
    } catch (error) {
      // 查询失败时按空列表处理，不打扰买方；详细错误仅写入控制台便于排查。
      this.assets = [];
      console.error('获拍资产查询失败:', error);
    }
    finally { this.loading = false; }
  },
  methods: {
    formatTime(value) { return value ? new Date(String(value).replace(' ', 'T')).toLocaleString('zh-CN', { hour12: false }) : '-'; },
    process(asset) { this.$router.push({ name: 'AssetDetail', params: { id: asset.file_hash }, query: { auctionWinner: '1' } }); }
  }
};
</script>

<style scoped>
.page { height: 100vh; min-height: 0; background: #f5f6fa; overflow: hidden; }.main { display: flex; height: calc(100vh - 64px); min-height: 0; overflow: hidden; }.content { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 28px 40px; }.empty { padding: 40px; background: white; border-radius: 8px; color: #667085; }.card { display: flex; align-items: center; gap: 18px; margin: 16px 0; padding: 18px; background: #fff; border-radius: 10px; box-shadow: 0 2px 8px #0000000d; }.card img { width: 96px; height: 72px; object-fit: cover; border-radius: 6px; }.info { flex: 1; }.info h3,.info p { margin: 5px 0; }.card button { border: 0; border-radius: 6px; background: #2a5bd7; color: #fff; padding: 10px 14px; cursor: pointer; }
</style>
