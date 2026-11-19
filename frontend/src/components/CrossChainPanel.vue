<template>
  <div class="cross-chain-panel">
    <!-- 左：跨平台检索 -->
    <section class="panel-column left-column">
      <h3 class="panel-title">跨平台检索</h3>

      <el-input
        v-model="crossSearchTerm"
        placeholder="输入资产名称 / 机构"
        clearable
        @keyup.enter="crossSearchAssets"
      >
        <template #append>
          <el-button :loading="searching" @click="crossSearchAssets">检索</el-button>
        </template>
      </el-input>

      <el-table
        :data="crossSearchResults"
        v-loading="searching"
        height="440"
        size="small"
        class="result-table"
        :row-class-name="rowClassName"
        :empty-text="emptyText"
        @row-click="selectCrossAsset"
      >
        <el-table-column prop="asset_name" label="资产名称" min-width="200" show-overflow-tooltip />
        <el-table-column label="所在平台" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ getCrossPlatform(row) }}</template>
        </el-table-column>
      </el-table>
    </section>

    <div class="panel-divider"></div>

    <!-- 右：资产跨链调配 -->
    <section class="panel-column right-column">
      <h3 class="panel-title">资产跨链调配</h3>

      <el-radio-group v-model="bridgeMode" class="mode-switch">
        <el-radio-button label="in">转入</el-radio-button>
        <el-radio-button label="out">转出</el-radio-button>
      </el-radio-group>

      <p class="mode-hint">
        {{ bridgeMode === 'in'
          ? '转入：EVM → ChainMaker，先在 EVM 销毁，再在 ChainMaker 铸造'
          : '转出：ChainMaker → EVM，先在 EVM 铸造，再在 ChainMaker 销毁' }}
      </p>

      <el-form label-position="top" class="bridge-form">
        <el-form-item label="TokenId（唯一标识）">
          <el-input
            :model-value="bridgeTokenId ? truncateHash(bridgeTokenId) : ''"
            placeholder="请先在左侧选择资产"
            disabled
          />
        </el-form-item>

        <el-form-item label="Amount">
          <el-input v-model="bridgeAmount" placeholder="例如 1 / 100" />
        </el-form-item>

        <template v-if="bridgeMode === 'in'">
          <el-form-item label="To（ChainMaker 地址）">
            <el-input v-model="bridgeToChainmaker" placeholder="例如 64b6a0f6..." />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item label="OwnerAddress（ChainMaker 拥有者地址）">
            <el-input v-model="bridgeOwnerAddress" placeholder="例如 64b6a0f6..." />
          </el-form-item>

          <el-form-item label="To（EVM 接收地址）">
            <el-input v-model="bridgeToEvm" placeholder="例如 0x70997970..." />
          </el-form-item>
        </template>
      </el-form>

      <el-button
        type="primary"
        class="submit-button"
        :loading="bridgeSubmitting"
        @click="submitBridge"
      >
        {{ bridgeSubmitting ? '提交中...' : (bridgeMode === 'in' ? '执行转入' : '执行转出') }}
      </el-button>

      <div v-if="bridgeLastResp" class="result-box">
        <div class="result-title">返回</div>
        <pre class="result-pre">{{ JSON.stringify(bridgeLastResp, null, 2) }}</pre>
      </div>
    </section>
  </div>
</template>

<script>
import axios from 'axios';
import { ElMessage } from 'element-plus';

const API_BASE = 'http://10.112.191.163:3000';
// 跨平台检索当前只放行北数所，其它平台暂时禁用
const ALLOWED_PLATFORM = '北京国家大数据交易所';

export default {
  name: 'CrossChainPanel',
  data() {
    return {
      searching: false,
      crossSearchTerm: '',
      crossSearchResults: [],
      crossSearched: false,
      selectedCrossAsset: null,

      bridgeMode: 'in',
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
  computed: {
    emptyText() {
      if (this.searching) return '检索中...';
      if (this.crossSearched) return '未找到匹配结果';
      return '输入关键词后回车检索目录链';
    }
  },
  methods: {
    truncateHash(hash) {
      const value = String(hash || '');
      if (!value) return '';
      if (value.length <= 12) return value;
      return `${value.slice(0, 6)}...${value.slice(-4)}`;
    },
    getCrossPlatform(asset) {
      return asset.platform_name || asset.chain_type || 'ChainMaker(chain1)';
    },
    rowClassName({ row }) {
      if (!this.selectedCrossAsset) return '';
      return this.selectedCrossAsset.file_hash === row.file_hash ? 'is-selected' : '';
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
          // 当前只放行北数所，其它平台暂时禁用
          if (String(item?.platform_name || '') !== ALLOWED_PLATFORM) return false;
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
.cross-chain-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) 1px minmax(0, 1fr);
  gap: 0;
  width: 100%;
  height: calc(100vh - 200px);
  min-height: 620px;
  padding: 20px 24px;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid #eef2f7;
  border-radius: 12px;
}

.panel-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.left-column {
  padding-right: 24px;
}

.right-column {
  padding-left: 24px;
  overflow-y: auto;
}

.panel-title {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.panel-divider {
  width: 1px;
  background: #eef2f7;
}

.result-table {
  margin-top: 14px;
  border: 1px solid #eef2f7;
  border-radius: 8px;
}

.mode-switch {
  margin-bottom: 10px;
}

.mode-hint {
  margin: 0 0 14px;
  color: #9ca3af;
  font-size: 12px;
  line-height: 1.5;
}

.bridge-form {
  flex: 1;
}

.bridge-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.bridge-form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.4;
}

.submit-button {
  width: 100%;
}

.result-box {
  margin-top: 14px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
}

.result-title {
  margin-bottom: 6px;
  color: #6b7280;
  font-size: 12px;
  font-weight: 600;
}

.result-pre {
  margin: 0;
  max-height: 160px;
  overflow: auto;
  color: #334155;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: #4b5563;
}

:deep(.el-table__row) {
  cursor: pointer;
}

:deep(.el-table__row.is-selected > td) {
  background: #eef6ff !important;
}
</style>
