<template>
  <div class="delivery">
    <!-- 顶部 Header（不改你的业务逻辑；这里只是加框架） -->
    <AppHeader :username="username" :userId="userId" />

    <!-- 主体：Sidebar + Content -->
    <div class="main-content">
      <!-- ✅ 关键：显式加 class，确保样式命中 -->
      <AppSidebar />

      <div class="content">
        <h2 class="page-title">资产交付</h2>

        <el-table
          :data="downloadList"
          border
          stripe
          v-loading="isLoading"
          style="width: 100%"
        >
          <el-table-column prop="transaction_id" label="交易ID" width="120" />
          <el-table-column prop="asset_name" label="资产哈希" />

          <el-table-column prop="seller_address" label="卖方地址">
            <template v-slot="scope">
              {{ shortenAddress(scope.row.seller_address) }}
            </template>
          </el-table-column>

          <!-- ✅ 新增：数字合约（复用卖家逻辑） -->
  <el-table-column label="数字合约" width="160">
    <template v-slot="scope">
      <el-button size="mini" @click="viewContract(scope.row)">查看</el-button>
    </template>
  </el-table-column>

  <!-- ✅ 新增：交付状态（与卖家一致，可点开详情） -->
  <el-table-column label="交付状态" width="150">
    <template v-slot="scope">
      <el-button size="mini" type="info" plain @click="openDeliveryDetail(scope.row)">
        {{ getDeliveryStatusText(scope.row) }}
      </el-button>
    </template>
  </el-table-column>

         <!-- <el-table-column prop="statusText" label="交付状态" width="120" /> -->

          <el-table-column label="操作" width="320">
            <template v-slot="scope">
              <!-- ✅ 申请交付：永远显示（可下载也保留） -->
              <el-button
                size="mini"
                type="primary"
                :loading="scope.row.requesting"
                :disabled="scope.row.requesting"
                @click="openRequestDialog(scope.row)"
              >
                {{ scope.row.requestBtnText }}
              </el-button>

              <!-- ✅ 下载：只有可下载才可点 -->
              <el-button
                size="mini"
                type="success"
                :loading="scope.row.downloading"
                :disabled="!scope.row.canDownload || scope.row.downloading"
                @click="downloadAsset(scope.row)"
              >
                下载结果
              </el-button>

              <!--<el-button
                size="mini"
                @click="refreshDownloadList"
                :disabled="isLoading"
                style="margin-left: 8px"
              >
                刷新
              </el-button>-->
            </template>
          </el-table-column>
        </el-table>


        <!-- ============ 合约信息显示弹窗 ============ -->
<div v-if="contractInfo.visible" class="modal" @click.self="closeContractInfo">
  <div class="modal-content wide-modal">
    <h3>数字合约信息</h3>

    <div class="contract-info" v-if="contractInfo.data">
      <div class="info-section">
        <h4>基本信息</h4>
        <div class="info-grid">
          <div class="info-item">
            <label>合约ID:</label>
            <span>{{ contractInfo.data.contract_id }}</span>
          </div>
          <div class="info-item">
            <label>合约名称:</label>
            <span>{{ contractInfo.data.contract_name }}</span>
          </div>
          <div class="info-item">
            <label>创建时间:</label>
            <span>{{ formatDate(contractInfo.data.created_at) }}</span>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h4>产品信息</h4>
        <div class="info-grid">
          <div class="info-item">
            <label>产品名称:</label>
            <span>{{ contractInfo.data.product_name }}</span>
          </div>
          <div class="info-item">
            <label>Token ID:</label>
            <span>{{ contractInfo.data.token_id }}</span>
          </div>
          <div class="info-item">
            <label>合约描述:</label>
            <span class="description">{{ contractInfo.data.contract_description }}</span>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h4>参与方</h4>
        <div class="info-grid">
          <div class="info-item">
            <label>卖家:</label>
            <span class="address">{{ contractInfo.data.seller_id }}</span>
          </div>
          <div class="info-item">
            <label>买家:</label>
            <span class="address">{{ contractInfo.data.buyer_id }}</span>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h4>操作权限</h4>
        <div class="operations">
          <span
            v-for="op in contractInfo.data.operations"
            :key="op"
            class="operation-tag"
          >
            {{ op }}
          </span>
        </div>
      </div>

      <div class="info-section" v-if="contractInfo.data.constraints">
        <h4>约束条件</h4>
        <div class="info-grid">
          <div class="info-item" v-if="contractInfo.data.constraints.expiration_time">
            <label>到期时间:</label>
            <span>{{ formatDate(contractInfo.data.constraints.expiration_time) }}</span>
          </div>
          <div class="info-item" v-if="contractInfo.data.constraints.quantity">
            <label>数量限制:</label>
            <span>{{ contractInfo.data.constraints.quantity }}</span>
          </div>
          <div class="info-item" v-if="contractInfo.data.constraints.model_file_hash">
  <label>模型哈希:</label>
  <span class="address">{{ contractInfo.data.constraints.model_file_hash }}</span>
</div>
        </div>
      </div>
    </div>

    <div class="button-container">
      <button class="confirm-button" @click="closeContractInfo">
        确认
      </button>
    </div>
  </div>
</div>


<!-- 交付详情弹窗 -->
<div v-if="deliveryModal.open" class="modal" @click.self="deliveryModal.open = false">
  <div class="modal-content">
    <h3>交付详情</h3>
    <div v-if="deliveryModal.asset">
      <p><strong>交易ID：</strong>{{ deliveryModal.asset.transaction_id }}</p>
      <p><strong>资产哈希：</strong>{{ deliveryModal.asset.asset_id || deliveryModal.asset.asset_name }}</p>


      <p style="margin-top: 8px;">
        <strong>交付进度：</strong>{{ getDeliveryStatusText(deliveryModal.asset) }}
      </p>

      <div class="table-container" style="margin-top: 12px;">
        <table class="styled-table">
          <thead>
            <tr><th style="width: 80px;">序号</th><th>交付时间</th></tr>
          </thead>
          <tbody>
            <tr v-for="(rec, idx) in (deliveryModal.asset.deliveryHistory || [])" :key="rec.delivery_index || idx">
              <td>{{ rec.delivery_index || idx + 1 }}</td>
              <td>{{ formatDeliveryTime(rec.delivered_at) }}</td>
            </tr>
            <tr v-if="!deliveryModal.asset.deliveryHistory || deliveryModal.asset.deliveryHistory.length === 0">
              <td colspan="2" style="text-align:center; color:#999;">暂无交付记录</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="button-container" style="margin-top: 16px;">
      <button class="confirm-button" @click="deliveryModal.open = false">关闭</button>
    </div>
  </div>
</div>

        <!-- =========================
        * 申请交付弹窗（新增）
        * ========================= -->
        <el-dialog
          title="申请交付（创建虚机参数）"
          v-model="requestDialogVisible"
          width="520px"
          :close-on-click-modal="false"
        >
          <el-form
            ref="requestFormRef"
            :model="requestForm"
            :rules="requestFormRules"
            label-width="120px"
          >
            <el-form-item label="交易ID">
              <el-input v-model="requestForm.transaction_id" disabled />
            </el-form-item>

            <el-form-item label="虚机名称" prop="vm_name">
              <el-input v-model="requestForm.vm_name" placeholder="例如：tx-12345-vm" />
            </el-form-item>

            <el-form-item label="CPU 核数" prop="vm_cpu">
              <el-input-number
                v-model="requestForm.vm_cpu"
                :min="1"
                :max="64"
                :step="1"
                style="width: 180px"
              />
            </el-form-item>

            <el-form-item label="内存(MB)" prop="vm_memory_mb">
              <el-input-number
                v-model="requestForm.vm_memory_mb"
                :min="256"
                :max="262144"
                :step="256"
                style="width: 180px"
              />
            </el-form-item>

            <el-form-item label="模型">
  <el-input v-model="requestForm.model_name" disabled />
</el-form-item>
          </el-form>

          <template #footer>
            <span class="dialog-footer">
              <el-button @click="requestDialogVisible = false" :disabled="requestSubmitting">
                取消
              </el-button>
              <el-button
                type="primary"
                :loading="requestSubmitting"
                @click="submitRequestDelivery"
              >
                提交申请
              </el-button>
            </span>
          </template>
        </el-dialog>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

/* ✅ 只改框架：引入 Header/Sidebar，不改你任何方法逻辑 */
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';

export default {
  name: 'DeliveryBuyer',
  components: { AppHeader, AppSidebar },

  data() {
    return {
      userId: '',
      username: '',
      activeVmId: '1',

      isLoading: false,
      downloadList: [],

      // ====== 弹窗相关 ======
      requestDialogVisible: false,
      requestSubmitting: false,
      currentRowRef: null, // 当前点“申请交付”的那一行（用于按钮 loading 等）

      contractInfo: { visible: false, data: null },
      deliveryModal: { open: false, asset: null },


      requestForm: {
        transaction_id: '',
        buyer_address: '',
        seller_address: '',
        vm_name: '',
        vm_cpu: 2,
        vm_memory_mb: 2048,
        model_name: '加权平均模型',  // ✅ 新增：写死模型
        note: ''
      },

      requestFormRules: {
        vm_name: [
          { required: true, message: '请输入虚机名称', trigger: 'blur' },
          { min: 2, max: 128, message: '长度需在 2~128 之间', trigger: 'blur' }
        ],
        vm_cpu: [{ required: true, message: '请输入 CPU 核数', trigger: 'change' }],
        vm_memory_mb: [{ required: true, message: '请输入内存大小', trigger: 'change' }]
      }
    };
  },

  async created() {
    await this.initUser();
    await this.refreshDownloadList();
  },

  methods: {


     // ====== 交付状态文案（沿用你的）======
    getDeliveryStatusText(asset) {
      if (!asset) return '未交付';
      const delivered = asset.deliveryCount || 0;
      const limit = asset.deliveryLimit ?? 10;
      if (!limit || delivered === 0) return '未交付';
      if (delivered >= limit) return `已交付（${limit}/${limit}）`;
      return `交付中（${delivered}/${limit}）`;
    },

    async openDeliveryDetail(asset) {
  if (!asset || !asset.transaction_id) return;

  const tid = String(asset.transaction_id);

  // ✅ 如果已经有 history，就直接弹窗
  if (Array.isArray(asset.deliveryHistory) && asset.deliveryHistory.length > 0) {
    this.deliveryModal.asset = asset;
    this.deliveryModal.open = true;
    return;
  }

  // ✅ 没有 history：现场去卖家交易接口补齐
  try {
    const r = await axios.get(
      `http://10.112.47.214:3000/api/seller-transaction-status/${asset.seller_address}`
    );
    const txs = r?.data?.transactions || [];
    const matched = txs.find(t => String(t.transaction_id) === tid);

    if (matched) {
      // delivery_history 可能是数组或字符串
      let historyArr = [];
      if (Array.isArray(matched.delivery_history)) {
        historyArr = matched.delivery_history;
      } else if (
        typeof matched.delivery_history === 'string' &&
        matched.delivery_history.trim().startsWith('[')
      ) {
        try {
          historyArr = JSON.parse(matched.delivery_history);
        } catch (e) {
          // 忽略解析失败
        }
      }

      // 统一成你弹窗里要用的结构
      historyArr = historyArr.map((rec, idx) => ({
        delivery_index: rec.delivery_index ?? rec.index ?? rec.seq ?? (idx + 1),
        delivered_at:
          rec.delivered_at ||
          rec.delivery_time ||
          rec.time ||
          rec.created_at ||
          rec.timestamp ||
          null
      }));

      // ✅ 回写到当前行（这样弹窗就能显示）
      asset.deliveryHistory = historyArr;
      asset.deliveryCount =
        typeof matched.delivery_count === 'number'
          ? matched.delivery_count
          : historyArr.length;
      asset.deliveryLimit =
        typeof matched.delivery_limit === 'number'
          ? matched.delivery_limit
          : 10;
    }
  } catch (e) {
    console.warn('[openDeliveryDetail] 拉取交付历史失败:', e?.message || e);
  }

  // ✅ 最后打开弹窗
  this.deliveryModal.asset = asset;
  this.deliveryModal.open = true;
},

    formatDeliveryTime(ts) {
      if (!ts) return '-';
      try {
        return new Date(String(ts).replace(' ', 'T')).toLocaleString('zh-CN');
      } catch (e) {
        return String(ts);
      }
    },

    // ====== 你的 generateContractInfo（保持一致）======
    async generateContractInfo(transaction) {
      try {
        const transactionId = transaction.transaction_id;
        if (!transactionId) throw new Error('缺少 transaction_id');

        const txDetailRes = await axios.get(`http://10.112.47.214:3000/api/get-transaction-detail/${transactionId}`);
        const tx = txDetailRes?.data?.transaction;
        if (!tx) throw new Error('未获取到交易详情');

        const assetId = tx.asset_id || transaction.file_hash;
        const assetRes = await axios.get(`http://10.112.47.214:3000/api/asset/${assetId}`);
        const assetInfo = assetRes?.data || {};

        const ops = (tx.quality || '').split(',').map(s => s.trim()).filter(Boolean)
          .map(s => (s === '所有权' ? '所有' : s));

        return {
          contract_id: `CONTRACT-${transactionId}`,
          contract_name: `${assetInfo.asset_name || '数字产品'}-数字合约`,
          contract_description: assetInfo.description || '该数字合约依据平台交易信息自动生成，用于界定交易双方权责与限制条件',
          created_at: (tx.created_at && new Date(tx.created_at.replace(' ', 'T')).toISOString()) || new Date().toISOString(),
          token_id: assetId,
          product_name: assetInfo.asset_name || '未知产品',
          seller_id: tx.seller_address ?? 'unknown-seller',
          buyer_id: tx.buyer_address ?? 'unknown-buyer',
          operations: ops.length ? ops : ['所有'],
          constraints: {
            expiration_time: tx.expiration_time ? new Date(tx.expiration_time.replace(' ', 'T')).toISOString() : null,
            quantity: transaction.quantity ?? tx.quantity ?? null,
            model_file_hash: tx.model_file_hash || null // ✅ 新增：模型哈希
          }
        };
      } catch (e) {
        console.error('生成合约信息失败:', e);
        this.$message?.error('生成合约信息失败');
        return null;
      }
    },

    // 查看合约
    async viewContract(asset) {
      try {
        const contractObj = await this.generateContractInfo(asset);
        if (contractObj) {
          this.contractInfo.data = contractObj;
          this.contractInfo.visible = true;
        }
      } catch (e) {
        console.error('查看合约失败:', e);
        this.$message?.error('查看合约失败');
      }
    },

    closeContractInfo() {
      this.contractInfo.visible = false;
    },

    formatDate(dateString) {
      if (!dateString) return '-';
      try {
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        return dateString;
      }
    },


    /* =========================
     * 用户 & 证书
     * ========================= */
    parseJwt(token) {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    },

    async initUser() {
      const token = localStorage.getItem('token');
      if (!token) return;

      const payload = this.parseJwt(token);
      this.username = decodeURIComponent(payload.username);

      const r = await axios.post('http://10.112.47.214:3000/api/get-user-id', {
        username: this.username
      });
      this.userId = String(r.data.id || '');
    },

    async getAllCertAddresses() {
      const res = [];
      const orgs = [
        { org: 'wx-org1.chainmaker.org', api: 'get-certificates' },
        { org: 'wx-org2.chainmaker.org', api: 'get-certificates2' }
      ];

      for (const { org, api } of orgs) {
        try {
          const r = await axios.post(`http://10.112.47.214:3000/api/${api}`, {
            userId: this.userId
          });
          const certs = r.data.certificates || [];

          for (const c of certs) {
            const certPath = `/home/super/r/GoSDK/crypto-config/${org}/user/${c.cert}/${c.cert}.sign.crt`;
            const addrRes = await axios.post('http://10.112.47.214:9092/cert-to-addr', {
              cert_path: certPath
            });
            const addr = addrRes?.data?.ethereum?.address;
            if (addr) res.push(addr);
          }
        } catch (e) {
          console.warn('获取证书地址失败:', e?.message || e);
        }
      }
      return [...new Set(res)];
    },

    /* =========================
     * 核心刷新逻辑
     * ========================= */
    async refreshDownloadList() {
      this.isLoading = true;
      try {
        const buyerAddresses = await this.getAllCertAddresses();

        // 1) 买家所有已确认交易
        const allTxs = [];
        for (const addr of buyerAddresses) {
          const txRes = await axios.get(
            `http://10.112.47.214:3000/api/buyer-transaction-status/${addr}`
          );
          const txs = txRes?.data?.transactions || [];

          txs
            .filter(tx => tx.status === '已确认')
            .forEach(tx => {
              allTxs.push({
                transaction_id: tx.transaction_id,
                asset_id: tx.asset_id,
                asset_name: `${tx.asset_id}`,
                seller_address: tx.seller_address,
                buyer_address: tx.buyer_address
              });
            });
        }

        // 去重
        const uniqTxs = [];
        const seen = new Set();
        for (const t of allTxs) {
          const k = String(t.transaction_id);
          if (!seen.has(k)) {
            seen.add(k);
            uniqTxs.push(t);
          }
        }

        // 2) 可导出结果（交付完成/结果生成）
        const eligibleMap = new Map();
        for (const addr of buyerAddresses) {
          try {
            const r = await axios.get('http://10.112.47.214:3000/api/vm/export/eligible', {
              params: {
                vmId: this.activeVmId,
                buyerAddress: addr
              }
            });

            if (r.data?.success && Array.isArray(r.data.items)) {
              r.data.items.forEach(item => {
                const tid = String(item.transaction_id ?? item.transactionId ?? '');
                if (tid) eligibleMap.set(tid, item);
              });
            }
          } catch (e) {
            console.warn('[eligible] 查询失败(可能未交付完成)：', addr, e?.message || e);
          }
        }


        // 2.5) ✅ 补齐：卖家交付状态所需字段
// 用于买家侧显示「交付状态 + 交付历史」
const deliveryInfoMap = new Map();

await Promise.all(
  uniqTxs.map(async (tx) => {
    try {
      const tid = String(tx.transaction_id);
      const detailRes = await axios.get(
        `http://10.112.47.214:3000/api/get-transaction-detail/${tid}`
      );
      const t = detailRes?.data?.transaction;
      if (!t) return;

      // delivery_history 可能是数组或字符串
      let historyArr = [];
      if (Array.isArray(t.delivery_history)) {
        historyArr = t.delivery_history;
      } else if (
        typeof t.delivery_history === 'string' &&
        t.delivery_history.trim().startsWith('[')
      ) {
        try {
          historyArr = JSON.parse(t.delivery_history);
        } catch (e) {
          // 忽略 JSON 解析失败，保持 historyArr 为空数组
        }
      }

      historyArr = historyArr.map((rec, idx) => ({
        delivery_index:
          rec.delivery_index ?? rec.index ?? rec.seq ?? (idx + 1),
        delivered_at:
          rec.delivered_at ||
          rec.delivery_time ||
          rec.time ||
          rec.created_at ||
          rec.timestamp ||
          null
      }));

      deliveryInfoMap.set(tid, {
        deliveryCount:
          typeof t.delivery_count === 'number'
            ? t.delivery_count
            : historyArr.length,
        deliveryLimit:
          typeof t.delivery_limit === 'number'
            ? t.delivery_limit
            : 10,
        deliveryHistory: historyArr
      });
    } catch (e) {
      // 查不到就保持默认（未交付）
    }
  })
);


        // 3) 合并：可下载也保留“申请交付”
        this.downloadList = uniqTxs.map(tx => {
  const tid = String(tx.transaction_id);
  const eligible = eligibleMap.get(tid);
  const canDownload = !!eligible;

  // ✅ 卖家侧交付状态信息
  const deliveryInfo = deliveryInfoMap.get(tid) || {
    deliveryCount: 0,
    deliveryLimit: 10,
    deliveryHistory: []
  };

  return {
    ...tx,
    ...deliveryInfo,   // ⭐ 关键：注入卖家交付状态字段

    canDownload,
    statusText: canDownload ? '可下载' : '交付中',
    exportPayload: eligible || null,

    requestBtnText: canDownload ? '再次申请交付' : '申请交付',
    requesting: false,
    downloading: false
  };
});

      } catch (e) {
        console.error('刷新买家交付列表失败:', e);
        this.$message.error('加载交付列表失败');
      } finally {
        this.isLoading = false;
      }
    },

    /* =========================
     * ✅ 打开申请交付弹窗
     * ========================= */
    openRequestDialog(row) {
      if (!row || !row.transaction_id) {
        this.$message.error('缺少交易信息');
        return;
      }

      this.currentRowRef = row;

      // 初始化表单：把后端必须字段先带上
      this.requestForm.transaction_id = String(row.transaction_id);
      this.requestForm.buyer_address = String(row.buyer_address || '');
      this.requestForm.seller_address = String(row.seller_address || '');

      // vm 默认值（你可以按 transaction_id 自动生成名字）
      this.requestForm.vm_name = `tx-${row.transaction_id}-vm`;
      this.requestForm.vm_cpu = 2;
      this.requestForm.vm_memory_mb = 2048;
      
      this.requestForm.model_name = '加权平均模型'; // ✅ 新增
      this.requestForm.note = '';

      this.requestDialogVisible = true;

      // 打开弹窗后清除上次校验状态
      this.$nextTick(() => {
        this.$refs.requestFormRef && this.$refs.requestFormRef.clearValidate();
      });
    },

    /* =========================
     * ✅ 提交申请交付（调用新接口 /api/delivery/request-vm）
     * ========================= */
    async submitRequestDelivery(asset) {
  try {
    const response = await axios.post(
      'http://10.112.47.214:3000/api/delivery/request-secure',
      {
        transactionId: asset.transaction_id,
        buyerAddress: asset.buyer_address,
        sellerAddress: asset.seller_address,
        assetId: asset.file_hash,
        vmCpu: 4,
        vmMemoryMb: 4096
      },
      {
        timeout: 30000
      }
    );

    if (!response.data?.success) {
      throw new Error(response.data?.message || '申请交付失败');
    }

    this.$message.success('交付申请已提交，等待卖家确认');

    if (this.fetchPurchasedAssets) {
      await this.fetchPurchasedAssets();
    }
  } catch (error) {
    this.$message.error(
      error.response?.data?.message ||
      error.message ||
      '申请交付失败'
    );
  }
},

    /* =========================
     * 下载逻辑（复用你原系统）
     * ========================= */
    async downloadAsset(item) {
      if (!item || !item.transaction_id) {
        this.$message.error('缺少交易信息');
        return;
      }
      if (!item.canDownload) {
        this.$message.warning('交付未完成，暂不可下载');
        return;
      }
      if (item.downloading) return;

      item.downloading = true;
      try {
        const payload = {
          vmId: this.activeVmId,
          format: 'bin',
          filename: `encrypted_result_${item.transaction_id}`,
          purpose: 'export',
          transaction_id: item.transaction_id
        };

        const response = await axios.post('http://10.112.47.214:3000/api/vm/export', payload, {
          responseType: 'blob',
          timeout: 60000
        });

        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${payload.filename}.bin`;
        link.click();
        window.URL.revokeObjectURL(url);

        // 记录一次交付
        try {
          await axios.post('http://10.112.47.214:3000/api/delivery/record', {
            transactionId: item.transaction_id
          });
        } catch (e) {
          console.warn('[delivery/record] 记录交付失败（不影响下载）:', e?.message || e);
        }

        this.$message.success('下载成功');
      } catch (e) {
        console.error('下载失败', e);
        this.$message.error('下载失败');
      } finally {
        item.downloading = false;
      }
    },

    shortenAddress(addr) {
      return addr && addr.length > 10
        ? addr.substring(0, 6) + '...' + addr.substring(addr.length - 4)
        : addr || '-';
    }
  }
};
</script>

<style scoped>
/* ✅ scoped 下 :root 不一定生效，建议变量挂到容器上 */
.delivery {
  --header-height: 60px;
  --sidebar-width: 280px;

  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #F5F6FA;
}

.main-content {
  display: flex;
  flex: 1;
  background: #F5F6FA;
  min-height: calc(100vh - var(--header-height));
}

.content {
  flex: 1;
  padding: 20px;
}

.page-title {
  font-size: 20px;
  margin-bottom: 20px;
}

/* 让页面高度稳定（你原来就有） */
:global(html, body, #app) {
  height: 100%;
  margin: 0;
  padding: 0;
}

/* =========================================================
   ✅ 新增：弹窗（合约弹窗 + 交付详情弹窗）必要样式
   ========================================================= */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 8px;
  padding: 18px;
  width: 600px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.wide-modal {
  width: 720px;
}

.button-container {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}

.confirm-button {
  background: #007bff;
  color: #fff;
  border: none;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.confirm-button:hover:not(:disabled) {
  background: #0056b3;
}
.confirm-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* =========================================================
   ✅ 新增：合约信息区域（你弹窗里用到的）
   ========================================================= */
.contract-info {
  max-height: 400px;
  overflow-y: auto;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 16px;
}

.info-section {
  margin-bottom: 20px;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border-left: 4px solid #007bff;
}

.info-section h4 {
  margin: 0 0 12px 0;
  color: #007bff;
  font-size: 14px;
  font-weight: 600;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
}

.info-item label {
  font-weight: 500;
  color: #666;
  font-size: 12px;
  margin-bottom: 4px;
}

.info-item span {
  color: #333;
  font-size: 13px;
  word-break: break-all;
}

.info-item .description {
  font-style: italic;
  color: #666;
}

.info-item .address {
  font-family: monospace;
  font-size: 12px;
  background: #f1f3f4;
  padding: 2px 6px;
  border-radius: 3px;
}

.operations {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.operation-tag {
  background: #e6f7ff;
  color: #007bff;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  border: 1px solid #91d5ff;
}

/* =========================================================
   ✅ 新增：交付详情弹窗里的表格样式（styled-table）
   ========================================================= */
.table-container {
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}

.styled-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.styled-table th,
.styled-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #e8e8e8;
  vertical-align: top;
}

.styled-table th {
  background: #fafafa;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e8e8e8;
}

/* =========================================================
   ✅ 可选：spinner（如果你弹窗或页面用到 loading）
   ========================================================= */
.loading-container {
  position: fixed;
  right: 24px;
  bottom: 24px;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 4px solid rgba(0,0,0,.1);
  border-top-color: #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ✅ 响应式：小屏弹窗两列变一列 */
@media (max-width: 768px) {
  .modal-content { width: 95%; padding: 16px; }
  .wide-modal { width: 95%; }
  .info-grid { grid-template-columns: 1fr; }
}
</style>
