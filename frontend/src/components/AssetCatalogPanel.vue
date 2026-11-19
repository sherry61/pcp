<template>
  <div class="asset-catalog-panel">
    <!-- 顶部工具栏：平台筛选 + 搜索 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="selectedPlatform" class="platform-select" placeholder="选择平台">
          <el-option
            v-for="p in platforms"
            :key="p.value"
            :label="p.label"
            :value="p.value"
          />
        </el-select>
        <span class="count-tip">共 {{ filteredAssets.length }} 条资产</span>
      </div>
      <el-input
        v-model="searchTerm"
        class="search-input"
        placeholder="搜索资产名称 / 机构"
        clearable
      >
        <template #prefix>
          <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </template>
      </el-input>
    </div>

    <!-- 纵向卡片列表 -->
    <div class="card-list" v-loading="loading">
      <div
        v-for="item in pagedAssets"
        :key="item.id || item.code"
        class="asset-card"
        @click="openDetail(item)"
      >
        <div class="card-main">
          <div class="card-title-row">
            <span class="card-title">{{ item.name || item.code || item.id }}</span>
            <span class="org-tag">{{ item.orgId || '未知机构' }}</span>
          </div>
          <div class="card-desc">{{ truncate(item.remark, 80) }}</div>
        </div>
        <div class="card-arrow">›</div>
      </div>

      <div v-if="!loading && filteredAssets.length === 0" class="empty-tip">
        {{ allAssets.length === 0 ? '目录链暂无数据' : '该筛选条件下暂无资产' }}
      </div>
    </div>

    <!-- 分页 -->
    <div class="pagination-bar">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next"
        :total="filteredAssets.length"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[5, 10, 20]"
      />
    </div>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="资产详情" width="640px" class="detail-dialog">
      <div v-if="currentAsset" class="detail-body">
        <div class="detail-section">
          <div class="section-title">基本信息</div>
          <div class="detail-row"><span class="k">资产名称</span><span class="v strong">{{ currentAsset.name || '-' }}</span></div>
          <div class="detail-row">
            <span class="k">资产编号</span>
            <span class="v">
              <button type="button" class="copy-field" title="点击复制" @click="copyField(currentAsset.id, '资产编号')">
                <span class="mono">{{ currentAsset.id || '-' }}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </span>
          </div>
        </div>
        <div class="detail-section">
          <div class="section-title">归属信息</div>
          <div class="detail-row"><span class="k">所属机构</span><span class="v">{{ currentAsset.orgId || '-' }}</span></div>
        </div>
        <div class="detail-section">
          <div class="section-title">发布平台</div>
          <div class="detail-row"><span class="k">所在平台</span><span class="v">{{ currentAsset.platform_name || '-' }}</span></div>
          <div class="detail-row">
            <span class="k">平台网址</span>
            <span class="v">
              <a
                v-if="currentAsset.platform_url"
                class="external-link"
                :href="normalizeUrl(currentAsset.platform_url)"
                target="_blank"
                rel="noopener noreferrer"
                :title="'在新窗口打开 ' + currentAsset.platform_url"
              >
                <span class="mono">{{ currentAsset.platform_url }}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
              <span v-else class="muted">未登记</span>
            </span>
          </div>
        </div>
        <div class="detail-section">
          <div class="section-title">登记信息</div>
          <div class="detail-row"><span class="k">资产类型</span><span class="v">{{ currentAsset.asseType || '未标注' }}</span></div>
          <div class="detail-row"><span class="k">发布时间</span><span class="v">{{ formatTime(currentAsset.publishTime) }}</span></div>
          <div class="detail-row"><span class="k">版本</span><span class="v">{{ currentAsset.version ?? '-' }}</span></div>
          <div class="detail-row">
            <span class="k">状态</span>
            <span class="v"><span class="status-badge" :class="Number(currentAsset.status) === 1 ? 'is-active' : 'is-idle'">{{ statusText(currentAsset.status) }}</span></span>
          </div>
        </div>
        <div class="detail-section">
          <div class="section-title">详细描述</div>
          <div class="detail-remark">{{ currentAsset.remark || '无' }}</div>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import axios from 'axios';
import { ElMessage } from 'element-plus';

const API_BASE = 'http://10.112.191.163:3000';
const DEFAULT_PLATFORM = '北京国家大数据交易所';
// 下拉平台的扩展点：
// - ALL_PLATFORM 是"全部平台"的特殊值，下拉里作为常驻选项显示
// - SHOW_ALL_PLATFORMS 当前为 false，下拉显示"全部平台 + 北数所"；
//   以后要放开所有平台，改成 true 即可（platforms 会自动从数据中提取所有平台）
const ALL_PLATFORM = '__ALL__';
const SHOW_ALL_PLATFORMS = false;

export default {
  name: 'AssetCatalogPanel',
  data() {
    return {
      loading: false,
      allAssets: [],
      selectedPlatform: DEFAULT_PLATFORM,
      searchTerm: '',
      detailVisible: false,
      currentAsset: null,
      currentPage: 1,
      pageSize: 10
    };
  },
  computed: {
    platforms() {
      // "全部平台"作为常驻选项，方便以后扩展查看其他平台
      const allOption = { label: '全部平台', value: ALL_PLATFORM };
      if (SHOW_ALL_PLATFORMS) {
        // 扩展模式：从数据里动态提取所有平台
        const set = new Set();
        for (const item of this.allAssets) {
          const p = String(item.platform_name || '').trim();
          if (p) set.add(p);
        }
        return [allOption, ...Array.from(set).sort().map((p) => ({ label: p, value: p }))];
      }
      // 当前：全部平台 + 北数所（默认选中北数所）
      return [allOption, { label: DEFAULT_PLATFORM, value: DEFAULT_PLATFORM }];
    },
    filteredAssets() {
      const kw = String(this.searchTerm || '').trim().toLowerCase();
      return this.allAssets.filter((item) => {
        // 当前只有北数所可用：选"全部平台"时，也只放行北数所，其它平台暂时禁用
        const platformName = String(item.platform_name || '');
        const platformOk =
          this.selectedPlatform === ALL_PLATFORM
            ? platformName === DEFAULT_PLATFORM
            : platformName === this.selectedPlatform;
        if (!platformOk) return false;
        if (!kw) return true;
        const fields = [item.name, item.code, item.id, item.orgId, item.remark];
        return fields.some((v) => String(v || '').toLowerCase().includes(kw));
      });
    },
    // 当前页的卡片数据（分页切片）
    pagedAssets() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.filteredAssets.slice(start, start + this.pageSize);
    }
  },
  watch: {
    // 筛选条件变化时回到第一页，避免停留在空页
    selectedPlatform() {
      this.currentPage = 1;
    },
    searchTerm() {
      this.currentPage = 1;
    },
    pageSize() {
      this.currentPage = 1;
    }
  },
  created() {
    this.loadCatalogs();
  },
  methods: {
    async loadCatalogs() {
      this.loading = true;
      try {
        const all = [];
        let pageToken = '';
        const seenTokens = new Set();
        const maxPages = 20;
        for (let page = 0; page < maxPages; page += 1) {
          const params = { page_size: '50' };
          if (pageToken) params.page_token = pageToken;
          const res = await axios.get(`${API_BASE}/api/admin/cross-chain/catalog`, { params });
          const result = res?.data?.data?.result;
          const list = Array.isArray(result?.list) ? result.list : [];
          all.push(...list);
          const nextToken = result?.next_page_token;
          if (!nextToken || seenTokens.has(nextToken)) break;
          seenTokens.add(nextToken);
          pageToken = nextToken;
        }

        // 与跨平台检索保持一致：剔除失效记录，按 id 保留最新版本
        const latestById = new Map();
        for (const item of all) {
          if (Number(item.status) === -1) continue;
          const id = item.id || item.code || item.name;
          if (!id) continue;
          const prev = latestById.get(id);
          if (!prev || Number(item.version ?? 0) > Number(prev.version ?? 0)) {
            latestById.set(id, item);
          }
        }
        this.allAssets = Array.from(latestById.values());
      } catch (e) {
        console.error('加载目录链资产失败:', e);
        this.allAssets = [];
      } finally {
        this.loading = false;
      }
    },
    truncate(text, max) {
      const value = String(text || '');
      return value.length > max ? `${value.slice(0, max)}...` : value;
    },
    formatTime(ts) {
      const n = Number(ts);
      if (!n) return '-';
      const d = new Date(n);
      if (Number.isNaN(d.getTime())) return '-';
      const pad = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    statusText(status) {
      if (Number(status) === 1) return '有效';
      if (Number(status) === -1) return '已作废';
      return status ?? '-';
    },
    // 平台网址补全协议，保证能直接打开
    normalizeUrl(url) {
      const value = String(url || '').trim();
      if (!value) return '#';
      if (/^https?:\/\//i.test(value)) return value;
      return `https://${value}`;
    },
    // 复制字段（资产编号等），兼容非安全上下文
    async copyField(value, label) {
      const text = String(value || '');
      if (!text || text === '-') return;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        ElMessage.success(`${label}已复制`);
      } catch (e) {
        ElMessage.error('复制失败，请手动选择');
      }
    },
    openDetail(item) {
      this.currentAsset = item;
      this.detailVisible = true;
    }
  }
};
</script>

<style scoped>
.asset-catalog-panel {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 250px);
  min-height: 480px;
  padding: 20px 24px;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.platform-select {
  width: 240px;
  flex-shrink: 0;
}

.count-tip {
  color: #9ca3af;
  font-size: 13px;
  white-space: nowrap;
}

.search-input {
  width: 300px;
  flex-shrink: 0;
}

.search-icon {
  color: #9ca3af;
}

.card-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-right: 4px;
}

.asset-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  flex-shrink: 0;
}

.asset-card:hover {
  border-color: #93c5fd;
  background: #f8fbff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
}

.org-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  line-height: 1.5;
  color: #2563eb;
  background: #eff6ff;
  white-space: nowrap;
  flex-shrink: 0;
}

.card-desc {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-arrow {
  color: #cbd5e1;
  font-size: 24px;
  line-height: 1;
  flex-shrink: 0;
  transition: transform 0.15s, color 0.15s;
}

.asset-card:hover .card-arrow {
  color: #2563eb;
  transform: translateX(3px);
}

.empty-tip {
  padding: 40px 0;
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  margin-top: 4px;
  border-top: 1px solid #eef2f7;
}

/* 详情弹窗 */
.detail-body {
  max-height: 60vh;
  overflow-y: auto;
}

.detail-section {
  padding: 14px 0;
  border-bottom: 1px solid #eef2f7;
}

.detail-section:last-child {
  border-bottom: none;
}

.section-title {
  color: #374151;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.6;
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-row .k {
  width: 96px;
  flex-shrink: 0;
  color: #9ca3af;
  text-align: right;
}

.detail-row .v {
  flex: 1;
  min-width: 0;
  color: #334155;
  word-break: break-all;
}

.detail-row .v.strong {
  color: #111827;
  font-weight: 600;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}

.muted {
  color: #9ca3af;
}

/* 平台网址：唯一突出的可交互元素 */
.external-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  color: #2563eb;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.external-link .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.external-link svg {
  flex-shrink: 0;
}

.external-link:hover {
  color: #1d4ed8;
  border-bottom-color: #93c5fd;
}

/* 可复制字段 */
.copy-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 2px 6px;
  margin: -2px -6px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #334155;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: background 0.15s, color 0.15s;
}

.copy-field .mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-field svg {
  flex-shrink: 0;
  color: #9ca3af;
}

.copy-field:hover {
  background: #f1f5f9;
  color: #2563eb;
}

.copy-field:hover svg {
  color: #2563eb;
}

/* 状态徽标 */
.status-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  line-height: 1.6;
}

.status-badge.is-active {
  color: #047857;
  background: #ecfdf5;
}

.status-badge.is-idle {
  color: #6b7280;
  background: #f3f4f6;
}

.detail-remark {
  color: #334155;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
