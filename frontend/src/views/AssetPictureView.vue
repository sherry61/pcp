<template>
  <div class="asset-picture">
    <h2>可交易资产列表</h2>

    <!-- 行业筛选器 -->
    <div class="filter-container">
      <label for="industry-filter">按行业筛选：</label>
      <select id="industry-filter" v-model="selectedIndustry">
        <option value="">全部</option>
        <option v-for="industry in industries" :key="industry" :value="industry">{{ industry }}</option>
      </select>
    </div>

    <!-- 添加一个外部容器，允许滚动 -->
    <div class="assets-grid">
      <div v-for="asset in filteredAssets" :key="asset.file_hash" class="asset-item">
        <h3>{{ asset.asset_name }}</h3>
        <!-- 优化哈希值显示，只显示前6位和后4位 -->
        <p><strong>哈希值:</strong> {{ truncateHash(asset.file_hash) }}</p>
        <p><strong>行业:</strong> {{ asset.industry }}</p>
        <!-- 如果有图片则显示图片，否则显示“无” -->
        <div class="image-container">
          <div v-if="asset.picture">
            <img :src="`data:image/jpeg;base64,${asset.picture}`" alt="资产图片" />
          </div>
          <div v-else>
            <p>无图片</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  data() {
    return {
      assets: [],          // 存储资产信息
      industries: [],      // 存储行业列表
      selectedIndustry: '', // 当前选择的行业
    };
  },
  created() {
    this.fetchAssets();
  },
  computed: {
    // 基于选择的行业进行资产筛选
    filteredAssets() {
      if (this.selectedIndustry) {
        return this.assets.filter(asset => asset.industry === this.selectedIndustry);
      }
      return this.assets;
    }
  },
  methods: {
    async fetchAssets() {
      try {
        const response = await axios.get('http://10.29.32.8:3000/api/available-assets');
        const { assets, industries } = response.data;
        this.assets = assets;
        this.industries = industries;
      } catch (error) {
        console.error('加载资产列表失败:', error);
      }
    },
    // 截断哈希值，只显示前6位和后4位
    truncateHash(hash) {
      if (!hash) {
        return ''; // 如果 hash 是 undefined 或 null，返回空字符串
      }
      return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
    }
  },
};
</script>

<style scoped>
.asset-picture {
  padding: 20px;
  max-height: 80vh; /* 限制总高度 */
  overflow-y: auto; /* 添加垂直滚动 */
}

.filter-container {
  margin-bottom: 20px;
}

.assets-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.asset-item {
  border: 1px solid #ddd;
  padding: 15px;
  border-radius: 5px;
  width: 250px;
  text-align: center;
}

.image-container {
  margin-top: 10px;
}

img {
  max-width: 200px;
  height: auto;
}

/* 设置滚动条样式（可选） */
.asset-picture::-webkit-scrollbar {
  width: 10px;
}

.asset-picture::-webkit-scrollbar-thumb {
  background-color: #888;
  border-radius: 5px;
}

.asset-picture::-webkit-scrollbar-thumb:hover {
  background-color: #555;
}
</style>
