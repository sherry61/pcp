<template>
  <div class="delivery">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />

      <div class="content">
        <h2 class="title">资产交付</h2>

        <!-- 只保留：数字资产上传（卖家侧） -->
        <div class="asset-upload-container">
          <div class="upload-header">
            
            <div class="toolbar">
              <el-button type="primary" plain @click="fetchRequestedAssets">刷新交易列表</el-button>
            </div>
          </div>

          <div class="table-container">
            <table class="styled-table table-hover-row">
              <thead>
                <tr>
                  <th>资产哈希</th>
                  <th>买家信息</th>
                  <th>数字合约</th>
                  <th>交付状态</th>
                  <th>交付方法</th>
                  <!--<th>上传文件</th>-->
                  <!-- ✅ 新增列：卖家批准买家交付申请 -->
                  <th>买家交付申请</th>
                </tr>
              </thead>

              <tbody>
                <tr v-for="asset in requestedAssets" :key="asset.transaction_id">
                  <td>
                    <div class="hash-display">
                      <span>{{ shortenHash(asset.file_hash) }}</span>
                    </div>
                  </td>

                  <td>
                    <div class="buyer-info">
                      <p><strong>买家地址:</strong> {{ asset.buyer_address }}</p>
                      <p><strong>交易ID:</strong> {{ asset.transaction_id }}</p>
                    </div>
                  </td>

                  <td>
                    <div class="contract-actions">
                      <div class="contract-btn-row">
                        <button class="contract-btn view" @click="viewContract(asset)">
                          查看
                        </button>
                        <!--<button
                          class="contract-btn verify"
                          @click="verifyContract(asset)"
                          :disabled="asset.contractVerified || asset.contractVerifying"
                          :class="{ verified: asset.contractVerified }"
                        >
                          {{ asset.contractVerifying ? '校验中...' : asset.contractVerified ? '已校验' : '校验' }}
                        </button>-->
                      </div>

                      <!--<div v-if="asset.contractVerifying" class="verifying-status">
                        <div class="spinner small"></div>
                        <span>校验中...</span>
                      </div>
                      <div v-if="asset.contractError" class="error-status">
                        {{ asset.contractError }}
                      </div>-->
                    </div>
                  </td>

                  <!-- 交付状态 -->
                  <td>
                    <button class="delivery-status-btn" @click="openDeliveryDetail(asset)">
                      {{ getDeliveryStatusText(asset) }}
                    </button>
                  </td>

                  <td>
                    <span class="delivery-method">可信执行环境</span>
                  </td>

                  <!--<td>
                    <div class="upload-section">
                      <input
                        type="file"
                        :id="'file-'+asset.transaction_id"
                        @change="onFileChange(asset, $event)"
                        accept=".xlsx,.xls,.csv"
                        class="file-input"
                      />
                      <button
                        class="upload-btn"
                        @click="startAssetUpload(asset)"
                      >
                        <span v-if="asset.uploading">上传中...</span>
                        <span v-else>上传资产</span>
                      </button>
                      <div v-if="asset.selectedFile" class="selected-file">
                        已选择: {{ asset.selectedFile.name }}
                      </div>
                      <div v-if="asset.uploadProgress" class="upload-progress">
                        {{ asset.uploadProgress }}
                      </div>
                    </div>
                  </td>-->

                  <!-- ✅ 新增：买家交付申请 + 卖家确认交付 -->
                  <td>
                    <div class="approve-col">
                      <div class="request-badge" :class="asset.buyerDeliveryRequested ? 'yes' : 'no'">
                        {{ asset.buyerDeliveryRequested ? '已申请' : '未申请' }}
                      </div>

                      <button
                        class="confirm-delivery-btn"
                        @click="confirmDelivery(asset)"
                        :disabled="!asset.buyerDeliveryRequested || asset.confirmingDelivery"
                        :title="asset.buyerDeliveryRequested ? '确认买家交付申请' : '买家尚未申请交付'"
                      >
                        <span v-if="asset.confirmingDelivery">确认中...</span>
                        <span v-else>确认交付</span>
                      </button>

                      <div v-if="asset.deliveryConfirmMsg" class="tiny-msg">
                        {{ asset.deliveryConfirmMsg }}
                      </div>
                    </div>
                  </td>
                </tr>

                <tr v-if="requestedAssets.length === 0 && !isLoadingTransactions">
                  <td colspan="7" style="text-align: center; color: #999;">
                    暂无交易记录
                  </td>
                </tr>
              </tbody>
            </table>

            <div v-if="isLoadingTransactions" class="loading-container">
              <div class="spinner"></div>
              <span>加载交易列表中...</span>
            </div>
          </div>
        </div>

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

        <!-- 交付详情弹窗（沿用你原来） -->
        <div v-if="deliveryModal.open" class="modal" @click.self="deliveryModal.open = false">
          <div class="modal-content">
            <h3>交付详情</h3>
            <div v-if="deliveryModal.asset">
              <p><strong>交易ID：</strong>{{ deliveryModal.asset.transaction_id }}</p>
              <p><strong>资产哈希：</strong>{{ deliveryModal.asset.file_hash }}</p>
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

        <div v-if="isLoading" class="loading-container"><div class="spinner" /></div>
      </div>
    </div>
  </div>
</template>

<script>
/* eslint-disable vue/multi-word-component-names */
import axios from 'axios'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'

export default {
  name: 'DeliverySellerPage',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      username: '',
      userId: '',
      isLoading: false,

      requestedAssets: [],
      isLoadingTransactions: false,

      contractInfo: { visible: false, data: null },

      deliveryModal: { open: false, asset: null },

      // 如果你卖家侧也有 vmId 逻辑，沿用你原来 activeVmId
      activeVmId: '1',
    }
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

    openDeliveryDetail(asset) {
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

    shortenHash(hash) {
      if (!hash) return '';
      if (hash.length <= 16) return hash;
      if (hash.length <= 64) return hash.substring(0, 6) + '...' + hash.substring(hash.length - 6);
      return hash.substring(0, 8) + '...' + hash.substring(hash.length - 8);
    },

    // ====== 用户初始化（沿用你的）======
    parseJwt(token) {
      const base64Url = token.split('.')[1]
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      }).join(''))
      return JSON.parse(jsonPayload)
    },

    async initUser() {
      const token = localStorage.getItem('token')
      if (!token) return
      const payload = this.parseJwt(token)
      this.username = decodeURIComponent(payload.username)
      const r = await axios.post('http://10.112.47.214:3000/api/get-user-id', { username: this.username })
      this.userId = String(r.data.id || '')
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

    // 校验合约（沿用你原来的 verify-contract 调用）
    async verifyContract(asset) {
      asset.contractVerifying = true;
      asset.contractError = '';
      try {
        const contractObj = await this.generateContractInfo(asset);
        if (!contractObj) throw new Error('生成合约信息失败');

        const verifyRes = await axios.post('http://10.112.47.214:3000/api/vm/verify-contract', {
          vmId: this.activeVmId,
          contract: contractObj
        });

        if (verifyRes.data.success) {
          asset.contractVerified = true;
          this.$message?.success('数字合约校验通过');
        } else {
          throw new Error(verifyRes.data.message || '合约校验失败');
        }
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '合约校验失败';
        asset.contractError = msg;
        this.$message?.error(`合约校验失败: ${msg}`);
      } finally {
        asset.contractVerifying = false;
      }
    },

    onFileChange(asset, event) {
      asset.selectedFile = event.target.files?.[0] || null;
      event.target.value = '';
    },

    // 你原来 startAssetUpload 的“purpose=file + send-json + send-file + record”
    async startAssetUpload(asset) {
  if (!asset.selectedFile) return this.$message?.error('请选择要上传的文件');

  const traceId = `upl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const base = 'http://10.112.47.214:3000';

  const log = (...args) => console.log(`[startAssetUpload][${traceId}]`, ...args);
  const logErr = (...args) => console.error(`[startAssetUpload][${traceId}]`, ...args);

  asset.uploading = true;
  asset.uploadProgress = '开始上传...';

  try {
    const vmId = String(this.activeVmId || '');
    log('step=0 init', {
      vmId,
      hasFile: !!asset.selectedFile,
      fileName: asset.selectedFile?.name,
      fileSize: asset.selectedFile?.size,
      fileType: asset.selectedFile?.type,
    });

    if (!vmId) throw new Error('activeVmId 为空');

    // =========================
    // Step 1: 获取 file purpose 的 key
    // =========================
    asset.uploadProgress = '正在获取加密密钥(file)...';
    log('step=1 POST /api/vm/send-key purpose=file -> start');

    const keyResFile = await axios.post(
      `${base}/api/vm/send-key`,
      { vmId, purpose: 'file' },
      { timeout: 20000 }
    );

    log('step=1 POST /send-key(file) -> done', {
      status: keyResFile.status,
      data: keyResFile.data,
    });
    if (keyResFile.status !== 200) throw new Error('获取加密密钥(file)失败');

    log('step=1.1 GET /send-key/response purpose=file -> start');
    const keyRespFile = await axios.get(
      `${base}/api/vm/send-key/response/${encodeURIComponent(vmId)}?purpose=file`,
      { timeout: 10000 }
    );
    const payloadFile = keyRespFile?.data?.payload || {};
    log('step=1.1 GET response(file) -> done', {
      status: keyRespFile.status,
      hasSm4: !!payloadFile.sm4KeyB64,
      expiresAt: keyRespFile?.data?.expiresAt,
      cacheKey: keyRespFile?.data?.cacheKey,
      note: payloadFile.note,
      source: payloadFile.source,
    });
    if (!payloadFile.sm4KeyB64) throw new Error('未获取到有效的加密密钥(file)');

    // =========================
    // Step 2: 生成合约信息
    // =========================
    log('step=2 generateContractInfo -> start');
    const contractObj = await this.generateContractInfo(asset);
    log('step=2 generateContractInfo -> done', {
      ok: !!contractObj,
      contract_id: contractObj?.contract_id,
      buyer_id: contractObj?.buyer_id,
      seller_id: contractObj?.seller_id,
    });
    if (!contractObj) throw new Error('生成合约信息失败');

    // =========================
    // Step 3: 获取 json purpose 的 key（关键修复点）
    // =========================
    asset.uploadProgress = '正在获取加密密钥(json)...';
    log('step=3 POST /api/vm/send-key purpose=json -> start');

    const keyResJson = await axios.post(
      `${base}/api/vm/send-key`,
      { vmId, purpose: 'json' },
      { timeout: 20000 }
    );

    log('step=3 POST /send-key(json) -> done', {
      status: keyResJson.status,
      data: keyResJson.data,
    });
    if (keyResJson.status !== 200) throw new Error('获取加密密钥(json)失败');

    log('step=3.1 GET /send-key/response purpose=json -> start');
    const keyRespJson = await axios.get(
      `${base}/api/vm/send-key/response/${encodeURIComponent(vmId)}?purpose=json`,
      { timeout: 10000 }
    );
    const payloadJson = keyRespJson?.data?.payload || {};
    log('step=3.1 GET response(json) -> done', {
      status: keyRespJson.status,
      hasSm4: !!payloadJson.sm4KeyB64,
      expiresAt: keyRespJson?.data?.expiresAt,
      cacheKey: keyRespJson?.data?.cacheKey,
      note: payloadJson.note,
      source: payloadJson.source,
    });
    if (!payloadJson.sm4KeyB64) throw new Error('未获取到有效的加密密钥(json)');

    // =========================
    // Step 4: 上传合约信息（send-json 使用 purpose=json）
    // =========================
    asset.uploadProgress = '正在上传合约信息...';
    const jsonBody = { vmId, purpose: 'json', json: JSON.stringify(contractObj) };

    log('step=4 POST /api/vm/send-json -> start', {
      url: `${base}/api/vm/send-json`,
      vmId,
      purpose: 'json',
      jsonLen: jsonBody.json.length,
      jsonHead: jsonBody.json.slice(0, 120),
    });

    const jsonRes = await axios.post(
      `${base}/api/vm/send-json`,
      jsonBody,
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    log('step=4 POST /send-json -> done', {
      status: jsonRes.status,
      data: jsonRes.data,
    });
    if (jsonRes.status !== 200) throw new Error('合约信息上传失败');

    // =========================
    // Step 5: 上传文件（send-file 使用 purpose=file）
    // =========================
    // Step 5: 上传文件（send-file 使用 purpose=file）
asset.uploadProgress = '正在上传文件...';
const formData = new FormData();
formData.append('vmId', vmId);
formData.append('purpose', 'file');
formData.append('file', asset.selectedFile);

// ✅ 关键：把合约信息带上
formData.append('contractId', contractObj.contract_id);
if (contractObj.transaction_id) formData.append('transactionId', contractObj.transaction_id);

    log('step=5 POST /api/vm/send-file -> start', {
      vmId,
      purpose: 'file',
      fileName: asset.selectedFile?.name,
      fileSize: asset.selectedFile?.size,
    });

    const uploadRes = await axios.post(
      `${base}/api/vm/send-file`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
        onUploadProgress: (evt) => {
          if (evt.lengthComputable) {
            const p = Math.round((evt.loaded * 100) / evt.total);
            asset.uploadProgress = `上传中: ${p}%`;
          }
        }
      }
    );

    log('step=5 POST /send-file -> done', {
      status: uploadRes.status,
      data: uploadRes.data,
    });
    if (uploadRes.status !== 200) throw new Error('文件上传失败');

    asset.uploadProgress = '上传完成';
    log('step=6 saveAssetRecord -> start');
    await this.saveAssetRecord(asset);
    log('step=6 saveAssetRecord -> done');

    this.$message?.success('资产上传成功');
    log('DONE success');

  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || '上传失败';
    logErr('FAILED', {
      msg,
      status: e?.response?.status,
      data: e?.response?.data,
      stack: e?.stack,
    });
    asset.uploadProgress = '上传失败';
    this.$message?.error(`资产上传失败: ${msg}`);
  } finally {
    asset.uploading = false;
    console.log(`[startAssetUpload][${traceId}] finally uploading=false`);
  }
},

    // ✅ 新增：查询“买家是否申请交付”
    async refreshBuyerDeliveryRequestFlags(list) {
      // 并发查（你也可以后端做成批量接口）
      await Promise.all(
        (list || []).map(async (asset) => {
          asset.buyerDeliveryRequested = false;
          asset.confirmingDelivery = false;
          asset.deliveryConfirmMsg = '';
          try {
            const r = await axios.get(
              `http://10.112.47.214:3000/api/delivery/seller/request-status/${asset.transaction_id}`
            );
            // 约定：{ success:true, requested:true/false, status:'pending|approved|...' }
            const requested = !!r?.data?.requested;
           const status = String(r?.data?.status || '').toUpperCase(); // ✅ 统一转大写
           asset.buyerDeliveryRequested = requested && status === 'PENDING';
            // 如果你希望“approved 后也显示已申请”，可以改成：
            // asset.buyerDeliveryRequested = requested;
          } catch (e) {
            // 查不到就当没申请（默认 disabled）
            console.warn('查询买家交付申请失败:', asset.transaction_id, e?.response?.status || e?.message);
          }
        })
      );
    },

    // ✅ 新增：卖家确认交付
    /*async confirmDelivery(asset) {
      if (!asset?.transaction_id) return;
      if (!asset.buyerDeliveryRequested) return;

      asset.confirmingDelivery = true;
      asset.deliveryConfirmMsg = '';

      try {
        const r = await axios.post('http://10.112.47.214:3000/api/delivery/seller/confirm', {
          transactionId: asset.transaction_id,
          sellerAddress: asset.seller_address,
        });

        if (r?.data?.success) {
          asset.deliveryConfirmMsg = '已确认交付';
          asset.buyerDeliveryRequested = false; // 变回不可点
          this.$message?.success('确认交付成功');
        } else {
          throw new Error(r?.data?.message || '确认失败');
        }
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '确认失败';
        //asset.deliveryConfirmMsg = `确认失败：${msg}`;
        this.$message?.error(`确认交付失败: ${msg}`);
      } finally {
        asset.confirmingDelivery = false;
      }
    },*/

async confirmDelivery(asset) {
  if (!asset?.transaction_id) return;

  asset.confirmingDelivery = true;
  asset.deliveryConfirmMsg = '';

  try {
    const response = await axios.post(
      'http://10.112.47.214:3000/api/delivery/secure-confirm',
      {
        transactionId: asset.transaction_id
      },
      {
        timeout: 300000
      }
    );

    if (!response.data?.success) {
      throw new Error(response.data?.message || '确认交付失败');
    }

    asset.deliveryConfirmMsg = `虚机已启动：${response.data.vmId}`;
    asset.vmId = response.data.vmId;
    asset.vmStatus = response.data.status;

    this.$message.success('确认交付成功，虚机已启动，密钥协商已完成');

    await this.fetchRequestedAssets();
  } catch (error) {
    const msg =
      error.response?.data?.message ||
      error.message ||
      '确认交付失败';

    asset.deliveryConfirmMsg = msg;
    this.$message.error(msg);
  } finally {
    asset.confirmingDelivery = false;
  }
},

    // ====== 核心：拉卖家交易列表（沿用你原来 fetchRequestedAssets 的思路）======
    async fetchRequestedAssets() {
      if (!this.userId) await this.initUser();
      this.isLoadingTransactions = true;

      try {
        // 这里我直接复用你原来逻辑：卖家证书 -> 地址 -> seller-transaction-status
        const certLists = [];

        try {
          const org1Res = await axios.post('http://10.112.47.214:3000/api/get-certificates', { userId: this.userId });
          if (org1Res.status === 200 && Array.isArray(org1Res.data.certificates)) {
            certLists.push(...org1Res.data.certificates.map(cert => ({ org: 'wx-org1.chainmaker.org', cert: cert.cert })));
          }
        } catch (err) { console.error('获取 org1 证书失败:', err); }

        try {
          const org2Res = await axios.post('http://10.112.47.214:3000/api/get-certificates2', { userId: this.userId });
          if (org2Res.status === 200 && Array.isArray(org2Res.data.certificates)) {
            certLists.push(...org2Res.data.certificates.map(cert => ({ org: 'wx-org2.chainmaker.org', cert: cert.cert })));
          }
        } catch (err) { console.error('获取 org2 证书失败:', err); }

        const allTransactions = [];

        for (const { org, cert } of certLists) {
          try {
            const certPath = `/home/super/r/GoSDK/crypto-config/${org}/user/${cert}/${cert}.sign.crt`;
            const addrRes = await axios.post('http://10.112.47.214:9092/cert-to-addr', { cert_path: certPath });
            const certAddr = addrRes?.data?.ethereum?.address;
            if (!certAddr) continue;

            const txRes = await axios.get(`http://10.112.47.214:3000/api/seller-transaction-status/${certAddr}`);
            if (txRes.status !== 200 || !Array.isArray(txRes.data.transactions)) continue;

            const formatted = txRes.data.transactions
              .filter(tx => tx.status === '已确认')
              .map(tx => {
                let historyArr = [];
                if (Array.isArray(tx.delivery_history)) historyArr = tx.delivery_history;
                else if (typeof tx.delivery_history === 'string' && tx.delivery_history.trim().startsWith('[')) {
                  try { historyArr = JSON.parse(tx.delivery_history); } catch (e) {console.warn('解析 delivery_history 失败:', tx.delivery_history);}
                }
                historyArr = historyArr.map((rec, idx) => ({
                  delivery_index: rec.delivery_index ?? rec.index ?? rec.seq ?? (idx + 1),
                  delivered_at: rec.delivered_at || rec.delivery_time || rec.time || rec.created_at || rec.timestamp || null
                }));

                return {
                  transaction_id: tx.transaction_id,
                  asset_name: `Asset ${tx.transaction_id}`,
                  file_hash: tx.asset_id,
                  status: tx.status,
                  seller_address: tx.seller_address,
                  buyer_address: tx.buyer_address,
                  quantity: tx.quantity,

                  deliveryCount: (typeof tx.delivery_count === 'number') ? tx.delivery_count : historyArr.length,
                  deliveryLimit: (typeof tx.delivery_limit === 'number') ? tx.delivery_limit : 10,
                  deliveryHistory: historyArr,

                  contractVerified: false,
                  contractVerifying: false,
                  contractError: '',
                  selectedFile: null,
                  uploading: false,
                  uploadProgress: '',

                  // ✅ 新增字段（默认不可点）
                  buyerDeliveryRequested: false,
                  confirmingDelivery: false,
                  deliveryConfirmMsg: '',
                };
              });

            allTransactions.push(...formatted);
          } catch (err) {
            console.error(`处理证书 ${cert} 失败:`, err);
          }
        }

        this.requestedAssets = allTransactions;

        // ✅ 拉完交易后：查询每笔交易是否被买家申请交付
        await this.refreshBuyerDeliveryRequestFlags(this.requestedAssets);

      } catch (e) {
        console.error('获取交易列表失败:', e);
        this.$message?.error('加载交易列表失败');
      } finally {
        this.isLoadingTransactions = false;
      }
    },
  },

  async mounted() {
    await this.initUser();
    await this.fetchRequestedAssets();
  }
}
</script>

<style scoped>
/* ========== 容器/布局（对齐 delivery 风格） ========== */
.delivery {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #F5F6FA;

  /* ✅ scoped 下不要用 :root，变量挂到容器上才生效 */
  --header-height: 60px;
  --sidebar-width: 220px;
}

.main-content {
  display: flex;
  flex: 1;
  background: #F5F6FA;
  min-height: calc(100vh - var(--header-height));
}

.content {
  padding: 20px;
  flex: 1;
}

.title {
  margin: 0;
  padding: 10px 0 0 30px;
  font-size: 20px;
  color: #333;
}

/* 如果你也有侧边栏（可选） */
:deep(.app-sidebar) {
  position: sticky;
  top: var(--header-height);
  height: calc(100vh - var(--header-height));
  flex-shrink: 0;
  width: var(--sidebar-width);
  background: #1f2329;
}

/* ========== 页面卡片容器（复用 delivery） ========== */
.asset-upload-container {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 30px;
  box-shadow: 0 2px 4px rgba(0,0,0,.06);
}

.upload-header {
  display:flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

/* ========== 表格样式 ========== */
.table-container {
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
  margin-top: 16px;
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

.table-hover-row tbody tr:hover {
  background-color:#eef5ff;
}

/* ========== hash / buyer / status 这些你原来有的保留 ========== */
.hash-display {
  font-family: monospace;
  background: #f5f5f5;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid #e8e8e8;
  word-break: break-all;
}

.buyer-info { text-align: left; }
.buyer-info p { margin: 4px 0; font-size: 12px; line-height: 1.4; }
.buyer-info strong { color:#666; }

/* ========== 合约操作按钮区域（复用 delivery） ========== */
.contract-actions {
  display:flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.contract-btn-row {
  display:flex;
  gap: 8px;
  align-items: center;
}

.contract-btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
  min-width: 80px;
}

.contract-btn.view {
  background:#e6f7ff;
  color:#1890ff;
  border:1px solid #91d5ff;
}

.contract-btn.verify {
  background:#f6ffed;
  color:#52c41a;
  border:1px solid #b7eb8f;
}

.contract-btn.verify:disabled {
  background:#f5f5f5;
  color:#999;
  border-color:#d9d9d9;
  cursor:not-allowed;
}

.contract-btn.verify.verified {
  background:#52c41a;
  color:#fff;
  border-color:#52c41a;
}

.contract-btn:hover:not(:disabled) {
  opacity: 0.85;
  transform: translateY(-1px);
}

.verifying-status,
.error-status {
  font-size: 11px;
  display:flex;
  align-items:center;
  gap:4px;
  padding: 4px 8px;
  border-radius: 4px;
}
.verifying-status { color:#1890ff; background:#f0f7ff; }
.error-status { color:#ff4d4f; background:#fff2f0; }

/* ========== 交付状态按钮（你原来有） ========== */
.delivery-status-btn {
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid #91d5ff;
  background: #e6f7ff;
  color: #1890ff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.delivery-status-btn:hover { background:#bae7ff; border-color:#40a9ff; }

.delivery-method {
  background: #f0f7ff;
  color: #1890ff;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid #d6e4ff;
}

/* ========== 上传区（你原来有） ========== */
.upload-section {
  display:flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.file-input { font-size:12px; padding:4px; border:1px solid #d9d9d9; border-radius:4px; }
.file-input:disabled { background:#f5f5f5; cursor:not-allowed; }

.upload-btn {
  padding: 6px 12px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor:pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}
.upload-btn:hover:not(:disabled) { background:#096dd9; transform: translateY(-1px); }
.upload-btn:disabled { background:#ccc; cursor:not-allowed; transform:none; }

.selected-file {
  font-size: 11px;
  color:#666;
  word-break: break-all;
  padding: 4px 8px;
  background:#f9f9f9;
  border-radius:4px;
  border-left: 3px solid #1890ff;
}

.upload-progress { font-size: 11px; color:#1890ff; font-weight:500; }

/* ========== ✅ 新增列：批准列样式（你原来那套保留） ========== */
.approve-col {
  display:flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.request-badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid #d9d9d9;
  background: #f5f5f5;
  color: #666;
  white-space: nowrap;
}
.request-badge.yes {
  border-color: #b7eb8f;
  background: #f6ffed;
  color: #52c41a;
}
.request-badge.no {
  border-color: #ffccc7;
  background: #fff2f0;
  color: #ff4d4f;
}

.confirm-delivery-btn {
  padding: 6px 12px;
  border-radius: 4px;
  border: 1px solid #b7eb8f;
  background: #52c41a;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
}
.confirm-delivery-btn:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
.confirm-delivery-btn:disabled {
  background: #ccc;
  border-color: #d9d9d9;
  cursor: not-allowed;
  transform:none;
}

.tiny-msg { font-size: 11px; color:#666; }

/* =========================================================
   ✅ 关键补充：把 delivery 里“查看合约弹窗格式”移植过来
   这部分是你现在卖家界面缺的
   ========================================================= */

/* modal、spinner（复用 delivery） */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index:1000;
}

.modal-content {
  background:#fff;
  border-radius:8px;
  padding:18px;
  width: 600px;
  max-width:90%;
  max-height: 90vh;
  overflow-y: auto;
}

.wide-modal { width: 720px; }

.button-container {
  display:flex;
  justify-content:flex-end;
  gap:12px;
  margin-top: 12px;
}

.confirm-button {
  background:#007bff;
  color:#fff;
  border:none;
  padding:10px 16px;
  border-radius:6px;
  cursor:pointer;
  font-size: 14px;
}
.confirm-button:hover:not(:disabled) { background:#0056b3; }
.confirm-button:disabled { background:#ccc; cursor:not-allowed; }

.cancel-button {
  background:#f5f6fa;
  color:#333;
  border:1px solid #ddd;
  padding:10px 16px;
  border-radius:6px;
  cursor:pointer;
  font-size: 14px;
}
.cancel-button:hover:not(:disabled) { background:#e8e8e8; }
.cancel-button:disabled { opacity:.6; cursor:not-allowed; }

.loading-container { position: fixed; right: 24px; bottom: 24px; }
.spinner {
  width: 36px;
  height: 36px;
  border: 4px solid rgba(0,0,0,.1);
  border-top-color: #007bff;
  border-radius:50%;
  animation: spin 1s linear infinite;
}
.spinner.small { width:16px; height:16px; border-width:2px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 合约信息（delivery 的 contract-info 那套） */
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

/* 合约操作列表 tag */
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

/* 校验状态块（如果卖家界面也展示 verify-status） */
.verify-status {
  margin: 12px 0;
  padding: 8px 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.verify-status.success {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  color: #52c41a;
}
.verify-status.error {
  background: #fff2f0;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
}
.verify-status .verifying {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1890ff;
}
.verify-status .verified {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ========== 响应式：合约弹窗两列改一列（复用 delivery） ========== */
@media (max-width: 768px) {
  .asset-upload-container { margin: 16px; padding: 16px; }
  .upload-header { flex-direction: column; gap: 12px; align-items: flex-start; }

  .modal-content { width: 95%; padding: 16px; }
  .wide-modal { width: 95%; }

  .info-grid { grid-template-columns: 1fr; }

  .contract-actions { align-items: stretch; }
  .contract-btn { width: 100%; }
}
</style>

