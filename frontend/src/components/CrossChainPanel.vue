<template>
  <div class="cc-panel">
    <!-- 左：跨平台检索 -->
    <div class="cc-left">
      <div class="cc-title">跨平台检索</div>

      <div class="cc-search-wrap">
        <input
          v-model="crossSearchTerm"
          class="cc-search-input"
          placeholder="输入资产名称 / 编码 / 机构"
          @keyup.enter="crossSearchAssets"
        />
        <button class="cc-search-btn" @click="crossSearchAssets" :disabled="searching" aria-label="search">
          {{ searching ? '…' : '🔍' }}
        </button>
      </div>

      <div class="cc-card">
        <div class="cc-card-title">检索结果</div>

        <div class="cc-table">
          <div class="cc-row cc-head">
            <div class="cc-col1">资产名称</div>
            <div class="cc-col2">所在平台（链）</div>
            <div class="cc-col3">唯一标识</div>
          </div>

          <div
            v-for="(a, idx) in crossSearchResults"
            :key="(a.file_hash || a.asset_id || idx) + '-' + idx"
            class="cc-row cc-body"
            :class="{ selected: selectedCrossAsset && (selectedCrossAsset.file_hash === a.file_hash) }"
            @click="selectCrossAsset(a)"
          >
            <div class="cc-col1 cc-asset">
              <span class="cc-token-dot">◎</span>
              <span class="cc-asset-name">{{ a.asset_name || 'Unknown' }}</span>
            </div>
            <div class="cc-col2">{{ getCrossPlatform(a) }}</div>
            <div class="cc-col3 cc-mono">{{ truncateHash(a.file_hash || a.asset_id || '') }}</div>
          </div>

          <div v-if="crossSearched && !searching && crossSearchResults.length === 0" class="cc-empty">
            未找到匹配结果
          </div>
          <div v-if="!crossSearched" class="cc-empty">
            输入关键词后回车检索目录链
          </div>
        </div>
      </div>
    </div>

    <!-- 中间分割线 -->
    <div class="cc-divider"></div>

    <!-- 右：资产跨链调配 -->
    <div class="cc-right">
      <div class="cc-title">资产跨链调配</div>

      <div class="cc-swap-card">
        <!-- 顶部：模式切换 -->
        <div class="cc-bridge-tabs">
          <button
            class="cc-tab"
            :class="{ active: bridgeMode === 'in' }"
            @click="bridgeMode = 'in'"
            type="button"
          >转入</button>

          <button
            class="cc-tab"
            :class="{ active: bridgeMode === 'out' }"
            @click="bridgeMode = 'out'"
            type="button"
          >转出</button>
        </div>

        <div class="cc-mode-hint">
          {{ bridgeMode === 'in' ? 'EVM → ChainMaker：先在 EVM 销毁，再在 ChainMaker 铸造' : 'ChainMaker → EVM：先在 EVM 铸造，再在 ChainMaker 销毁' }}
        </div>

        <!-- 通用：tokenId / amount -->
        <div class="cc-form">
          <div class="cc-field">
            <div class="cc-field-label">TokenId（唯一标识）</div>
            <div class="cc-field-value cc-mono">
              {{ bridgeTokenId ? truncateHash(bridgeTokenId) : '—（请先在左侧选择资产）' }}
            </div>
          </div>

          <div class="cc-field">
            <div class="cc-field-label">Amount</div>
            <input class="cc-input" v-model="bridgeAmount" placeholder="例如 1 / 100" />
          </div>

          <!-- 转入：CB-In -->
          <template v-if="bridgeMode === 'in'">
            <div class="cc-field">
              <div class="cc-field-label">To（ChainMaker 地址）</div>
              <input class="cc-input" v-model="bridgeToChainmaker" placeholder="例如 64b6a0f6..." />
            </div>

            <div class="cc-field">
              <div class="cc-field-label">CategoryName</div>
              <input class="cc-input" v-model="bridgeCategoryName" placeholder="例如 WH" />
            </div>

            <div class="cc-field">
              <div class="cc-field-label">Metadata.source</div>
              <input class="cc-input" v-model="bridgeMetaSource" placeholder="peer-burn" />
            </div>

            <div class="cc-field">
              <div class="cc-field-label">Metadata.desc</div>
              <input class="cc-input" v-model="bridgeMetaDesc" placeholder="mint after peer burn" />
            </div>
          </template>

          <!-- 转出：CB-Out -->
          <template v-else>
            <div class="cc-field">
              <div class="cc-field-label">OwnerAddress（ChainMaker 拥有者地址）</div>
              <input class="cc-input" v-model="bridgeOwnerAddress" placeholder="例如 64b6a0f6..." />
            </div>

            <div class="cc-field">
              <div class="cc-field-label">To（EVM 接收地址）</div>
              <input class="cc-input" v-model="bridgeToEvm" placeholder="例如 0x70997970..." />
            </div>
          </template>
        </div>

        <!-- 执行按钮 -->
        <button class="cc-connect" @click="submitBridge" :disabled="bridgeSubmitting">
          <span class="cc-wallet">⚡</span>
          {{ bridgeSubmitting ? '提交中...' : (bridgeMode === 'in' ? '执行转入' : '执行转出') }}
        </button>

        <!-- 返回结果 -->
        <div v-if="bridgeLastResp" class="cc-resp">
          <div class="cc-resp-title">返回：</div>
          <pre class="cc-resp-pre">{{ JSON.stringify(bridgeLastResp, null, 2) }}</pre>
        </div>
      </div>

      <div class="cc-spark">✦</div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { ElMessage } from 'element-plus';

const API_BASE = 'http://10.112.191.163:3000';

export default {
  name: 'CrossChainPanel',
  data() {
    return {
      searching: false,
      crossSearchTerm: '',
      crossSearchResults: [],
      crossSearched: false,
      selectedCrossAsset: null,

      bridgeMode: 'in', // 'in' 转入 | 'out' 转出
      bridgeAmount: '1',
      bridgeTokenId: '',
      bridgeCategoryName: 'WH',
      bridgeMetaSource: 'peer-burn',
      bridgeMetaDesc: 'mint after peer burn',
      bridgeToChainmaker: 'db15ba88c399e2998ebd65e4c127db31b1b37d34',
      bridgeToEvm: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      bridgeOwnerAddress: 'db15ba88c399e2998ebd65e4c127db31b1b37d34',
      bridgeSubmitting: false,
      bridgeLastResp: null
    };
  },
  methods: {
    truncateHash(hash) {
      const value = String(hash || '');
      if (!value) return '';
      if (value.length <= 12) return value;
      return `${value.slice(0, 6)}...${value.slice(-4)}`;
    },
    getCrossPlatform(asset) {
      const platform = asset.platform_name || asset.chain_type || 'ChainMaker(chain1)';
      const did = asset.orgDID || asset.orgId || '';
      return did ? `${platform} / ${did}` : platform;
    },
    selectCrossAsset(asset) {
      this.selectedCrossAsset = asset;
      this.bridgeTokenId = asset?.file_hash || asset?.asset_id || '';
      this.bridgeCategoryName = asset?.industry || asset?.categoryName || 'WH';
    },
    async crossSearchAssets() {
      const kw = (this.crossSearchTerm || '').trim().toLowerCase();
      this.crossSearched = true;

      if (!kw) {
        this.crossSearchResults = [];
        return;
      }

      this.searching = true;
      try {
        const allCatalogs = [];
        let pageToken = '';
        const seenTokens = new Set();
        const maxPages = 20;

        for (let page = 0; page < maxPages; page += 1) {
          const params = { page_size: '50' };
          if (pageToken) params.page_token = pageToken;

          const res = await axios.get(`${API_BASE}/api/admin/cross-chain/catalog`, { params });
          const result = res?.data?.data?.result;
          const list = Array.isArray(result?.list) ? result.list : [];
          allCatalogs.push(...list);

          const nextToken = result?.next_page_token;
          if (!nextToken || seenTokens.has(nextToken)) break;
          seenTokens.add(nextToken);
          pageToken = nextToken;
        }

        const matched = allCatalogs.filter((item) => {
          const fields = [
            item?.name,
            item?.code,
            item?.id,
            item?.remark,
            item?.orgId,
            item?.orgDID,
            item?.platform_name,
            item?.platform_url
          ];
          return fields.some((value) => String(value || '').toLowerCase().includes(kw));
        });

        const latestById = new Map();
        for (const item of matched) {
          const id = item?.id || item?.code || item?.name;
          if (!id) continue;
          if (Number(item.status) === -1) continue;

          const prev = latestById.get(id);
          if (!prev || Number(item.version ?? 0) > Number(prev.version ?? 0)) {
            latestById.set(id, item);
          }
        }

        this.crossSearchResults = Array.from(latestById.values()).map((dc) => ({
          asset_name: dc.name || '',
          file_hash: dc.id || dc.code || '',
          orgDID: dc.orgDID || '',
          orgId: dc.orgId || '',
          chain_name: dc.chain_type || 'ChainMaker (chain1)',
          code: dc.code || '',
          remark: dc.remark || '',
          publishTime: dc.publishTime || '',
          version: dc.version ?? '',
          status: dc.status ?? '',
          itemVOList: dc.itemVOList || [],
          platform_name: dc.platform_name || '',
          platform_url: dc.platform_url || '',
          chain_type: dc.chain_type || ''
        }));

        if (this.crossSearchResults.length === 0) {
          ElMessage.warning('未在目录链中检索到匹配资产');
        }
      } catch (e) {
        console.error('跨平台检索（目录链）失败:', e);
        this.crossSearchResults = [];
        ElMessage.error(e?.response?.data?.message || '跨平台检索失败：请检查目录链服务');
      } finally {
        this.searching = false;
      }
    },
    async submitBridge() {
      if (!this.selectedCrossAsset) {
        ElMessage.warning('请先在左侧选择一个资产');
        return;
      }
      if (!this.bridgeTokenId) {
        ElMessage.warning('缺少 tokenId（资产唯一标识）');
        return;
      }
      if (!this.bridgeAmount || Number(this.bridgeAmount) <= 0) {
        ElMessage.warning('请输入有效的 amount');
        return;
      }

      let payload;
      if (this.bridgeMode === 'in') {
        if (!this.bridgeToChainmaker) {
          ElMessage.warning('请输入转入地址（to：ChainMaker 地址）');
          return;
        }
        payload = {
          amount: String(this.bridgeAmount),
          to: this.bridgeToChainmaker,
          tokenId: this.bridgeTokenId,
          categoryName: this.bridgeCategoryName,
          metadata: {
            source: this.bridgeMetaSource,
            desc: this.bridgeMetaDesc
          }
        };
      } else {
        if (!this.bridgeOwnerAddress) {
          ElMessage.warning('请输入 ownerAddress（ChainMaker 资产拥有者地址）');
          return;
        }
        if (!this.bridgeToEvm) {
          ElMessage.warning('请输入转出接收地址（to：EVM 地址）');
          return;
        }
        payload = {
          amount: String(this.bridgeAmount),
          to: this.bridgeToEvm,
          tokenId: this.bridgeTokenId,
          ownerAddress: this.bridgeOwnerAddress
        };
      }

      this.bridgeSubmitting = true;
      this.bridgeLastResp = null;

      try {
        const resp = await axios.post(
          `${API_BASE}/api/admin/cross-chain/bridge/${this.bridgeMode}`,
          payload
        );

        this.bridgeLastResp = resp?.data;
        const body = resp?.data || {};
        const code = body.code ?? body.local?.code;
        const message = body.message ?? body.local?.message;

        if (resp.status === 200 && code === 0) {
          ElMessage.success(this.bridgeMode === 'in' ? '转入成功（CB-In）' : '转出成功（CB-Out）');
        } else {
          ElMessage.error(
            `${this.bridgeMode === 'in' ? '转入' : '转出'}失败：${message || 'unknown error'}`
          );
        }
      } catch (e) {
        console.error('跨链调配失败:', e);
        const respData = e?.response?.data;
        if (respData) this.bridgeLastResp = respData;

        let msg =
          respData?.message ||
          respData?.local?.message ||
          (e?.response ? `HTTP ${e.response.status}` : '网络异常，请检查后端服务');

        if (String(msg).includes('[code:4]')) {
          msg +=
            this.bridgeMode === 'in'
              ? '（合约执行失败：常见原因是该 tokenId 已在链上存在）'
              : '（合约执行失败：常见原因是 OwnerAddress 不是该 token 的真实 owner，或该 tokenId 在链上不存在）';
        }

        ElMessage.error(
          `${this.bridgeMode === 'in' ? '转入' : '转出'}失败：${msg}`
        );
      } finally {
        this.bridgeSubmitting = false;
      }
    }
  }
};
</script>

<style scoped>
.cc-panel {
  position: relative;
  width: 100%;
  height: calc(100vh - 230px);
  min-height: 560px;
  border-radius: 20px;
  background: rgba(30, 33, 37, 0.94);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  overflow: hidden;
  padding: 26px 26px 22px;
  box-sizing: border-box;
}

.cc-left,
.cc-right {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: rgba(255, 255, 255, 0.88);
  min-height: 0;
  overflow-y: auto;
  padding-right: 6px;
}

.cc-left::-webkit-scrollbar,
.cc-right::-webkit-scrollbar {
  width: 8px;
}

.cc-left::-webkit-scrollbar-thumb,
.cc-right::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 10px;
}

.cc-left::-webkit-scrollbar-track,
.cc-right::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.06);
}

.cc-divider {
  width: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 18px;
}

.cc-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.cc-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  padding: 4px 6px;
  height: 44px;
  border-radius: 12px;
  background:
    linear-gradient(rgba(15, 18, 22, 0.65), rgba(15, 18, 22, 0.65)) padding-box,
    linear-gradient(135deg, rgba(132, 255, 222, 0.9), rgba(90, 170, 255, 0.8), rgba(150, 120, 255, 0.7)) border-box;
  border: 1.5px solid transparent;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.cc-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  line-height: 1.2;
  padding: 3px 4px;
  color: rgba(255, 255, 255, 0.9);
}

.cc-search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.cc-search-btn {
  width: 32px;
  height: 32px;
  margin-left: 4px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  background: linear-gradient(135deg, rgba(132, 255, 222, 0.25), rgba(90, 170, 255, 0.25));
  color: rgba(255, 255, 255, 0.85);
  transition: background 0.2s ease, transform 0.15s ease;
}

.cc-search-btn:hover {
  background: linear-gradient(135deg, rgba(132, 255, 222, 0.4), rgba(150, 120, 255, 0.35));
  transform: translateY(-1px);
}

.cc-search-btn:disabled {
  cursor: wait;
  opacity: 0.7;
}

.cc-card {
  flex: 1;
  border-radius: 16px;
  background: rgba(14, 16, 20, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  padding: 14px 14px 10px;
  overflow: hidden;
}

.cc-card-title {
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 10px;
}

.cc-table {
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.cc-row {
  display: grid;
  grid-template-columns: 1.2fr 1.2fr 1.3fr;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  font-size: 14px;
}

.cc-head {
  background: rgba(255, 255, 255, 0.06);
  font-weight: 700;
}

.cc-body {
  background: rgba(255, 255, 255, 0.02);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
}

.cc-body:hover {
  background: rgba(132, 255, 222, 0.06);
}

.cc-body.selected {
  outline: 2px solid rgba(132, 255, 222, 0.45);
  outline-offset: -2px;
}

.cc-asset {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cc-token-dot {
  color: rgba(132, 255, 222, 0.95);
}

.cc-asset-name {
  font-weight: 600;
}

.cc-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  opacity: 0.9;
}

.cc-empty {
  padding: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.cc-swap-card {
  flex: 1;
  border-radius: 18px;
  background: rgba(14, 16, 20, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 16px 16px 18px;
  position: relative;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  min-height: 0;
  overflow-y: auto;
}

.cc-bridge-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.cc-tab {
  flex: 1;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 700;
}

.cc-tab.active {
  border-color: rgba(132, 255, 222, 0.45);
  background: rgba(132, 255, 222, 0.18);
  color: rgba(255, 255, 255, 0.95);
}

.cc-mode-hint {
  margin-bottom: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  line-height: 1.5;
}

.cc-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 10px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.cc-field-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 700;
}

.cc-field-value {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.88);
}

.cc-input {
  border: none;
  outline: none;
  border-radius: 12px;
  padding: 10px 10px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.cc-input::placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.cc-connect {
  width: 100%;
  margin-top: 18px;
  padding: 14px 16px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  background: rgba(132, 255, 222, 0.75);
  color: rgba(10, 12, 14, 0.92);
  font-weight: 900;
  letter-spacing: 0.2px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
}

.cc-connect:disabled {
  cursor: wait;
  opacity: 0.65;
}

.cc-wallet {
  margin-right: 10px;
}

.cc-resp {
  margin-top: 10px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.cc-resp-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 700;
  margin-bottom: 6px;
}

.cc-resp-pre {
  margin: 0;
  font-size: 12px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.8);
  max-height: 180px;
  overflow: auto;
}

.cc-spark {
  position: absolute;
  right: 18px;
  bottom: 14px;
  color: rgba(255, 255, 255, 0.25);
  font-size: 22px;
}
</style>
