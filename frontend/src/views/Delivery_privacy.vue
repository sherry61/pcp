<template>
  <div class="delivery">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />

      <div class="content">
        <h2 class="title">交付</h2>

        <!-- 顶部 3 个操作按钮 -->
        

        <!-- ============ 数字资产上传界面 ============ -->
        <div v-if="activeTab === 'assetUpload'" class="asset-upload-container">
          

          <div class="table-container">
            <table class="styled-table table-hover-row">
              <thead>
                <tr>
                  <th>资产哈希</th>
                  <th>买家信息</th>
                  <th>数字合约</th>
                    <th>交付状态</th>
                  <th>交付方法</th>
                  <th>加密文件上传</th>
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
      <button
  class="contract-btn send"
  @click="sendContract(asset)"
>
  {{ asset.sendingContract ? '发送中...' : (asset.contractSent ? '已发送' : '发送合约') }}
</button>
    </div>

    <div v-if="asset.contractSendError" class="error-status">
      {{ asset.contractSendError }}
    </div>
  </div>
</td>

<!-- 新增：交付状态 -->
<td>
  <button 
    class="delivery-status-btn"
    @click="openDeliveryDetail(asset)"
  >
    {{ getDeliveryStatusText(asset) }}
  </button>
</td>
                  

                  <td>
  <el-select
    v-model="asset.deliveryMethod"
    placeholder="请选择交付方法"
    style="width: 160px"
    :disabled="asset.contractSent || asset.sendingContract"
    @change="onDeliveryMethodChange(asset)"
  >
    <el-option
      v-for="opt in deliveryMethodOptions"
      :key="opt.value"
      :label="opt.label"
      :value="opt.value"
    />
  </el-select>

  <!--<div style="margin-top:6px; font-size:12px; color:#999;">
    {{ asset.contractSent ? '已锁定' : '发送前可修改' }}
  </div> -->

</td>


                  <td>
                    <div class="upload-section">
  <!-- 非联邦学习：保持原来的单文件上传 -->
  <template v-if="asset.deliveryMethod !== 'federated'">
    <input
      type="file"
      :id="'file-' + asset.transaction_id"
      @change="onFileChange(asset, $event)"
      accept=".xlsx,.xls,.csv,.bin"
      :disabled="!asset.contractSent"
      class="file-input"
    />

    <div v-if="asset.selectedFile" class="selected-file">
      已选择: {{ asset.selectedFile.name }}
    </div>
  </template>

  <!-- 联邦学习：上传 smashed_file 和 label_file 两个文件 -->
  <template v-else>
    <div class="fl-file-block">
      <label class="fl-file-label">Smashed 文件</label>
      <input
        type="file"
        :id="'fl-smashed-' + asset.transaction_id"
        @change="onFlSmashedFileChange(asset, $event)"
        accept=".safetensors"
        :disabled="!asset.contractSent"
        class="file-input"
      />
      <div v-if="asset.flSmashedFile" class="selected-file">
        已选择: {{ asset.flSmashedFile.name }}
      </div>
    </div>

    <div class="fl-file-block">
      <label class="fl-file-label">Label 文件</label>
      <input
        type="file"
        :id="'fl-label-' + asset.transaction_id"
        @change="onFlLabelFileChange(asset, $event)"
        accept=".safetensors"
        :disabled="!asset.contractSent"
        class="file-input"
      />
      <div v-if="asset.flLabelFile" class="selected-file">
        已选择: {{ asset.flLabelFile.name }}
      </div>
    </div>

    <!--<div class="fl-batch-row">
      <label class="fl-file-label">批次</label>
      <input
        type="number"
        min="0"
        v-model.number="asset.flBatchIndex"
        :disabled="!asset.contractSent"
        class="fl-batch-input"
      />
    </div>-->
  </template>

  <button
    class="upload-btn"
    @click="startAssetUpload(asset)"
    :disabled="!canUploadAsset(asset)"
  >
    <span v-if="asset.uploading">上传中...</span>
    <span v-else>上传资产</span>
  </button>

  <div v-if="asset.uploadProgress" class="upload-progress">
    {{ asset.uploadProgress }}
  </div>
</div>
                  </td>
                </tr>
                <tr v-if="requestedAssets.length === 0 && !isLoadingTransactions">
                  <td colspan="4" style="text-align: center; color: #999;">
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

        
 <!-- ============ 数字资产下载界面 ============ -->
<div v-if="activeTab === 'assetDownload'" class="asset-download-container">
  <div class="download-header">
    <h3>数字资产下载</h3>
    <div class="toolbar">
      <el-button type="primary" plain @click="refreshDownloadList">刷新列表</el-button>
    </div>
  </div>
  
  <div class="table-container">
    <table class="styled-table table-hover-row">
      <thead>
        <tr>
          <th>资产名称</th>
          <th>交易ID</th>
          <!--<th>资产哈希</th>-->
          <th>计算状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in downloadList" :key="item.id">
          <td>
            {{ item.asset_name }}
            <div v-if="item.seller_address" class="transaction-info">
              <small>卖家: {{ shortenAddress(item.seller_address) }}</small>
            </div>
          </td>
           <!-- 交易ID：缩短显示 + 使用更小样式 + title 显示完整值 -->
          <td>
            <span 
              class="tx-id-text"
              :title="item.transaction_id"
            >
              {{ shortenHash(item.transaction_id) }}
            </span>
          </td>

          <!-- 资产哈希：直接显示完整哈希 + hover 提示，确保肉眼可见 -->
         <!-- <td>
            <div 
              class="hash-display hash-display-full"
              :title="item.file_hash"
            >
              <span class="hash-text">
                {{ item.file_hash || '-' }}
              </span>
              <el-tooltip v-if="!item.isPlaceholder" content="已加密" placement="top">
                <i class="el-icon-lock" style="margin-left: 4px; color: #67C23A;"></i>
              </el-tooltip>
              <el-tooltip v-else content="计算中" placement="top">
                <i class="el-icon-loading" style="margin-left: 4px; color: #E6A23C;"></i>
              </el-tooltip>
            </div>
          </td>-->
          
          <td>
            <span :class="{
              'status-available': item.status === 'available',
              'status-processing': item.status === 'processing' || item.isPlaceholder,
              'status-error': item.status === 'error'
            }">
              {{ getStatusText(item) }}
            </span>
            <div v-if="item.compute_status" class="compute-status">
              <small>{{ getComputeStatusText(item.compute_status) }}</small>
            </div>
          </td>
          <td>
            <button 
              class="download-btn"
              @click="downloadAsset(item)"
              :disabled="item.status !== 'available' || item.isPlaceholder"
              :title="item.isPlaceholder ? '计算结果生成中...' : '下载加密结果'"
            >
              <span v-if="item.isPlaceholder">等待计算</span>
              <span v-else>下载结果</span>
            </button>
            <div v-if="item.last_download_time" class="download-time">
              <small>上次下载: {{ formatDownloadTime(item.last_download_time) }}</small>
            </div>
          </td>
        </tr>
        <tr v-if="downloadList.length === 0">
          <td colspan="6" style="text-align: center; color: #999;">
            暂无可用下载资源
          </td>
        </tr>
      </tbody>
    </table>
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
        <!-- ============ 交付详情弹窗 ============ -->
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
            <tr>
              <th style="width: 80px;">序号</th>
              <th>交付时间</th>
            </tr>
          </thead>
  <tbody>
  <tr
    v-for="(rec, idx) in (deliveryModal.asset.deliveryHistory || [])"
    :key="rec.delivery_index || idx"
  >
    <td>{{ rec.delivery_index || idx + 1 }}</td>
    <td>{{ formatDeliveryTime(rec.delivered_at) }}</td>
  </tr>
  <tr
    v-if="!deliveryModal.asset.deliveryHistory || deliveryModal.asset.deliveryHistory.length === 0"
  >
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

      

        <!-- 管理资产 -->
        <div v-if="assetModal.open" class="modal" @click.self="assetModal.open=false">
          <div class="modal-content wide-modal">
            <h3>管理虚机资产</h3>
            <div class="toolbar">
              <el-button type="primary" plain @click="loadAttachableAssets">刷新资产列表</el-button>
            </div>
            <div class="table-container" style="max-height: 360px; overflow:auto;">
              <table class="styled-table table-hover-row">
                <thead>
                  <tr>
                    <th style="width:60px;">选择</th>
                    <th>资产名</th>
                    <th>资产ID</th>
                    <th>领域</th>
                    <th>可用权益</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="a in attachableAssets" :key="a.file_hash" @click="toggleAsset(a)">
                    <td><input type="checkbox" :checked="isAssetPicked(a)" @change.stop="toggleAsset(a)" /></td>
                    <td>{{ a.asset_name || '-' }}</td>
                    <td>{{ a.file_hash }}</td>
                    <td>{{ industryMap[a.industry] || a.industry || '-' }}</td>
                    <td>
                      <span v-if="a.can_sell_asset">所有</span>
                      <span v-if="a.can_sell_view">/查阅</span>
                      <span v-if="a.can_sell_process">/加工</span>
                      <span v-if="!a.can_sell_asset && !a.can_sell_view && !a.can_sell_process">无</span>
                    </td>
                  </tr>
                  <tr v-if="attachableAssets.length===0">
                    <td colspan="5" style="color:#999">暂无可挂载资产</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="button-container">
              <button class="cancel-button" @click="assetModal.open=false">关闭</button>
              <button class="confirm-button" :disabled="!activeVmId || pickedAssets.length===0" @click="mountAssets">
                挂载（{{ pickedAssets.length }}）
              </button>
            </div>
          </div>
        </div>

        <!-- 计算 -->
        <div v-if="computeModal.open" class="modal" @click.self="computeModal.open=false">
          <div class="modal-content wide-modal">
            <h3>执行一次计算</h3>
            <div class="form-row">
              <div class="form-group">
                <label>模型</label>
                <el-select v-model="computeForm.model" placeholder="请选择" style="width: 100%">
                  <el-option label="隐私统计" value="privacy-stat" />
                  <el-option label="AI 推理" value="ai-infer" />
                  <el-option label="知识检索" value="rag" />
                </el-select>
              </div>
              <div class="form-group">
                <label>参数</label>
                <input v-model="computeForm.params" placeholder='例如：{"k":10}' />
              </div>
            </div>
            <div class="button-container">
              <button class="cancel-button" @click="computeModal.open=false">取消</button>
              <button class="confirm-button" :disabled="!activeVmId || !computeForm.model" @click="runCompute">
                开始计算
              </button>
            </div>
          </div>
        </div>

        <!-- 导出结果 -->
        <div v-if="exportModal.open" class="modal" @click.self="exportModal.open=false">
          <div class="modal-content wide-modal">
            <h3>导出计算结果</h3>
            
            <!-- 选择交易资产 -->
            <div class="form-row">
              <div class="form-group">
                <label class="required">选择已完成计算的资产</label>
                <el-select 
                  v-model="selectedExportTxId" 
                  placeholder="请选择要导出的资产" 
                  style="width: 100%"
                  :loading="isLoadingEligible"
                  clearable
                >
                  <el-option 
                    v-for="item in exportEligible" 
                    :key="item.transaction_id"
                    :label="`${item.asset_name || '未知资产'} (交易: ${item.transaction_id})`"
                    :value="item.transaction_id"
                  />
                </el-select>
                <div v-if="!isLoadingEligible && exportEligible.length === 0" class="no-data" style="margin-top: 8px; text-align: center;">
                  暂无已完成计算的可导出资产
                </div>
                <div v-else-if="!isLoadingEligible" class="data-count" style="margin-top: 4px; font-size: 12px; color: #666;">
                  共 {{ exportEligible.length }} 个可导出资产
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="required">导出格式</label>
                <el-select v-model="exportForm.format" placeholder="请选择" style="width: 100%">
                  <el-option label="CSV" value="csv" />
                  <el-option label="JSON" value="json" />
                  <el-option label="Excel(xlsx)" value="xlsx" />
                </el-select>
              </div>
              <div class="form-group">
                <label>文件名</label>
                <input v-model.trim="exportForm.filename" placeholder="result" />
              </div>
            </div>

            <div class="button-container">
              <button class="cancel-button" @click="exportModal.open=false">取消</button>
              <button 
                class="confirm-button" 
                :disabled="!exportForm.format || !selectedExportTxId"
                @click="exportResult"
              >
                导出
              </button>
            </div>
          </div>
        </div>

        <!-- 轻提示 -->
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
  name: 'DeliveryPage',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      moduleStatus: {
        upload: 'idle',
        manage: 'idle',
        compute: 'idle',
        export: 'idle'
      },

      username: '',
      userId: '',
      isLoading: false,
      activeTab: 'assetUpload', // 默认显示数字资产上传

      // 数字资产上传相关数据
      requestedAssets: [],
      isLoadingTransactions: false,

      // 数字资产下载相关数据
      downloadList: [],

      // 合约信息
      contractInfo: {
        visible: false,
        data: null
      },

      // 行业映射
      industryMap: {
        NY: '能源', DL: '电力', TZ: '碳证', JT: '交通出行', YL: '医疗健康',
        ZX: '征信', JR: '金融', SZ: '数字版权', ZD: '自动驾驶', CL: '车联网', WH: '文化', FL: '法律',
      },

      // 创建虚机 - 订单选择
      orderModal: { open: false, keyword: '', filterStatus: '', },
      orders: [],
      pickedOrders: [],

      // 创建虚机 - 模型/类型
      modelModal: {
        open: false,
        form: { vmName: '', vmType: '', image: '', model: '', network: 'default', autoStart: true, bindOrders: true }
      },

      // 打开虚机面板
      openVmPanel: false,
      vmList: [],
      activeVmId: '1',

      // 步骤控制
      currentStep: 1, // 1: 合约校验, 2: 文件上传

      contractValidation: {
        isVerified: false,
        isVerifying: false,
        verifyResult: null,
        verifyError: ''
      },
      
      // 发送模态框
      sendModal: {
        open: false,
        File: null,
        uploadStatus: '',
        selectedTransaction: null,
        isKeySent: false,
        peerPublicKey: '',
        progress: [
          { key: 'send_pubkey', label: '1. 发送公钥成功', state: 'idle', detail: '' },
          { key: 'recv_enc_key', label: '2. 接收加密公钥成功', state: 'idle', detail: '' },
          { key: 'decrypt_sm4', label: '3. 解密成功，密钥为：', state: 'idle', detail: '' },
          { key: 'encrypt_asset', label: '4. 加密资产成功', state: 'idle', detail: '' },
          { key: 'haiguang_accepted', label: '5. 海光已接收加密资产', state: 'idle', detail: '' },
        ]
      },

      // 管理资产
      assetModal: { open: false },
      attachableAssets: [],
      pickedAssets: [],

      // 计算
      computeModal: { open: false },
      computeForm: { model: '', params: '' },

      // 导出
      exportModal: { open: false },
      exportForm: { format: '', filename: 'result' },

      // 导出相关数据
      exportEligible: [],
      selectedExportTxId: null,
      isLoadingEligible: false,
      
      // 用户所有证书地址
      userCertAddresses: [],

      // 交付详情弹窗
      deliveryModal: {
        open: false,
        asset: null
      },


      isUploadingFile: false,

      deliveryMethodOptions: [
  { label: '同态加密', value: 'homomorphic' },
  { label: '可信执行环境（TEE）', value: 'tee' },
  { label: '联邦学习', value: 'federated' },
  { label: '多方安全计算（MPC）', value: 'mpc' },
  { label: '代理重加密', value: 'pre' },
],
    }
  },
  computed: {
    filteredOrders() {
      let list = this.orders
      if (this.orderModal.filterStatus) {
        list = list.filter(o => o.status === this.orderModal.filterStatus)
      }
      if (this.orderModal.keyword) {
        const k = this.orderModal.keyword.trim().toLowerCase()
        list = list.filter(o =>
          String(o.transaction_id).toLowerCase().includes(k) ||
          String(o.asset_id).toLowerCase().includes(k)
        )
      }
      return list
    },
    canCreateVm() {
      const f = this.modelModal.form
      return f.vmName && f.vmType && f.image && f.model
    },
    canStartUpload() {
      return this.activeVmId && 
             this.sendModal.selectedTransaction && 
             this.sendModal.File && 
             this.contractValidation.isVerified;
    },
  },
  methods: {


        // 交付状态文案
    getDeliveryStatusText(asset) {
      if (!asset) return '未交付';
      const delivered = asset.deliveryCount || 0;
      // 只认 deliveryLimit，不用 quantity 兜底了
const limit = asset.deliveryLimit ?? 10;

      if (!limit || delivered === 0) {
        return '未交付';
      }
      if (delivered >= limit) {
        return `已交付（${limit}/${limit}）`;
      }
      return `交付中（${delivered}/${limit}）`;
    },

    // 打开交付详情弹窗
    openDeliveryDetail(asset) {
      this.deliveryModal.asset = asset;
      this.deliveryModal.open = true;
    },

   /*formatDeliveryTime(ts) {
  if (!ts) return '-';
  try {
    const d = typeof ts === 'number'
      ? new Date(ts)                      // 时间戳
      : new Date(String(ts));            // 字符串
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return String(ts);
  }
},*/
formatDeliveryTime(ts) {
  if (!ts) return '-';
  return new Date(ts.replace(' ', 'T')).toLocaleString('zh-CN');
},

/*shortenHash(hash) {
  if (!hash) return '';
  
  // 如果是交易ID或短哈希，不缩短
  if (hash.length <= 16) return hash;
  
  // 标准哈希：取前6位和后6位
  if (hash.length <= 64) {
    return hash.substring(0, 6) + '...' + hash.substring(hash.length - 6);
  }
  
  // 超长哈希：进一步缩短
  return hash.substring(0, 8) + '...' + hash.substring(hash.length - 8);
},*/

    shortenHash(hash) {
  if (hash === null || hash === undefined) return '';

  // ✅ 强制转成字符串，避免 number/object 导致 substring 报错
  const s = String(hash);

  // 如果是短ID，不缩短
  if (s.length <= 16) return s;

  // 标准哈希：取前6位和后6位
  if (s.length <= 64) {
    return s.substring(0, 6) + '...' + s.substring(s.length - 6);
  }

  // 超长哈希：进一步缩短
  return s.substring(0, 8) + '...' + s.substring(s.length - 8);
},
    


    // 设置活动标签页
    setActiveTab(tab) {
      this.activeTab = tab;
    },

    // 打开数字资产上传
    openAssetUpload() {
      this.fetchRequestedAssets();
    },

    // 打开数字资产下载
    openAssetDownload() {
      this.refreshDownloadList();
    },

   async fetchRequestedAssets() {
  if (!this.userId) await this.initUser();
  this.isLoadingTransactions = true;
  try {
    const certLists = [];

    try {
      const org1Res = await axios.post('http://10.112.47.214:3000/api/get-certificates', {
        userId: this.userId,
      });
      if (org1Res.status === 200 && Array.isArray(org1Res.data.certificates)) {
        certLists.push(...org1Res.data.certificates.map(cert => ({
          org: 'wx-org1.chainmaker.org',
          cert: cert.cert
        })));
      }
    } catch (err) {
      console.error('获取 org1 证书失败:', err);
    }

    try {
      const org2Res = await axios.post('http://10.112.47.214:3000/api/get-certificates2', {
        userId: this.userId,
      });
      if (org2Res.status === 200 && Array.isArray(org2Res.data.certificates)) {
        certLists.push(...org2Res.data.certificates.map(cert => ({
          org: 'wx-org2.chainmaker.org',
          cert: cert.cert
        })));
      }
    } catch (err) {
      console.error('获取 org2 证书失败:', err);
    }

    const allTransactions = [];
    for (const { org, cert } of certLists) {
      try {
        const certPath = `/home/super/r/GoSDK/crypto-config/${org}/user/${cert}/${cert}.sign.crt`;
        const addrRes = await axios.post('http://10.112.47.214:9092/cert-to-addr', {
          cert_path: certPath,
        });

        const certAddr = addrRes?.data?.ethereum?.address;
        if (!certAddr) continue;

        const txRes = await axios.get(`http://10.112.47.214:3000/api/seller-transaction-status/${certAddr}`);
        if (txRes.status !== 200 || !Array.isArray(txRes.data.transactions)) continue;

        const formattedTxs = txRes.data.transactions
          .filter(tx => tx.status === '已确认')
          .map(tx => {
            // ======【改动 1】统一处理 delivery_history 各种格式 ======
            let historyArr = [];
            if (Array.isArray(tx.delivery_history)) {
              historyArr = tx.delivery_history;
            } else if (
              typeof tx.delivery_history === 'string' &&
              tx.delivery_history.trim().startsWith('[')
            ) {
              // 如果后端把历史存成 JSON 字符串，这里兼容解析
              try {
                historyArr = JSON.parse(tx.delivery_history);
              } catch (e) {
                console.warn('解析 delivery_history 失败:', e, tx.delivery_history);
              }
            }

            // 统一字段名：保证有 delivery_index 和 delivered_at 两个字段
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

            // ======【改动 2】构造前端使用的数据结构 ======
            return {
              transaction_id: tx.transaction_id,
              asset_name: `Asset ${tx.transaction_id}`,
              price: 1.5,
              file_hash: tx.asset_id,
              status: tx.status,
              seller_address: tx.seller_address,
              buyer_address: tx.buyer_address,
              quantity: tx.quantity,

              // 交付相关字段
              // 已交付次数：优先用后端字段，没有就用历史记录长度兜底
              deliveryCount: (typeof tx.delivery_count === 'number')
                ? tx.delivery_count
                : historyArr.length,

              // 总可交付次数：后端给了就用后端，否则默认 10
              deliveryLimit: (typeof tx.delivery_limit === 'number')
                ? tx.delivery_limit
                : 10,

              // 交付历史（已经做了字段名统一）
              deliveryHistory: historyArr,

               // ====== 新增：交付方式 & 合约发送状态 ======
  deliveryMethod: null,          
  sendingContract: false,
  contractSent: false,
  contractSendError: '',

              contractVerified: false,
              contractVerifying: false,
              contractError: '',
              selectedFile: null,
              uploading: false,
              uploadProgress: '',
              
               // PRE 相关
  preContractId: '',
  preStatus: 'idle',     // idle / published / queued / running / completed / failed
  preResultReady: false,
  buyerPublicKey: '',
  preTaskStarted: false,
  // FL 相关
flTaskId: '',
flStatus: 'idle',
flCurrentEpoch: 0,
flBatchIndex: 0,
flSmashedFile: null,
flLabelFile: null,
flGradientUrl: '',
flTaskStarted: false,
            };
          });

        allTransactions.push(...formattedTxs);
      } catch (err) {
        console.error(`处理证书 ${cert} 失败:`, err);
      }
    }

    this.requestedAssets = allTransactions;
  } catch (error) {
    console.error('获取交易列表失败:', error);
    this.$message.error('加载交易列表失败');
  } finally {
    this.isLoadingTransactions = false;
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
      } catch (error) {
        console.error('查看合约失败:', error);
        this.$message.error('查看合约失败');
      }
    },

// 发送合约到后端，由后端转发到隐私计算平台 /contract
/*async sendContract(asset) {
  try {
    asset.sendingContract = true;
    asset.contractSendError = '';

    // 1) 生成合约对象（复用你已有逻辑）
    const contractObj = await this.generateContractInfo(asset);
    if (!contractObj || !contractObj.contract_id) {
      throw new Error('生成合约信息失败或缺少 contract_id');
    }

    // 2) 仅传后端需要的字段：contract（不传交付方法）
    //    transactionId 可选：你平台内部用于日志/关联，不是隐私计算平台 /contract 需要的
    const payload = {
  transactionId: asset.transaction_id,
  deliveryMethod: asset.deliveryMethod,
  contract: {
    contract_id: contractObj.contract_id,
    seller_id: contractObj.seller_id,
    buyer_id: contractObj.buyer_id,
    data_type_1: contractObj.data_type_1,
    data_type_2: contractObj.data_type_2,
  }
};

    // 去掉 undefined，避免后端打印出来一堆空字段
    Object.keys(payload.contract).forEach(k => {
      if (payload.contract[k] === undefined || payload.contract[k] === null || payload.contract[k] === '') {
        delete payload.contract[k];
      }
    });

    const res = await axios.post(
      'http://10.112.47.214:3000/api/privacy/send-contract',
      payload,
      { timeout: 30000 }
    );

    if (!res.data || res.data.success !== true) {
      throw new Error(res.data?.message || '隐私计算平台创建合同失败');
    }

    // 3) 成功后：标记合约已发送，解锁后续上传
    asset.contractSent = true;

    // 你后端会返回 delivery_url（这是回调地址，不是交付方法）
    // 前端可以保存一下做展示（可选）
    asset.deliveryCallbackUrl = res.data.delivery_url || asset.deliveryCallbackUrl || '';

    this.$message.success('合约已发送并在隐私计算平台创建成功');
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || '发送合约失败';
    console.error('[sendContract] 发送失败:', err);
    asset.contractSendError = msg;
    asset.contractSent = false;
    this.$message.error(`发送合约失败：${msg}`);
  } finally {
    asset.sendingContract = false;
  }
},*/
async sendContract(asset) {
  try {
    asset.sendingContract = true;
    asset.contractSendError = '';

    const contractObj = await this.generateContractInfo(asset);
    if (!contractObj || !contractObj.contract_id) {
      throw new Error('生成合约信息失败或缺少 contract_id');
    }

    const deliveryMethod = String(asset.deliveryMethod || '').toLowerCase();
    if (!deliveryMethod) {
      throw new Error('请先选择交付方式');
    }

    const payload = {
      transactionId: asset.transaction_id,
      deliveryMethod,
      contract: {
        contract_id: contractObj.contract_id,
        seller_id: contractObj.seller_id,
        buyer_id: contractObj.buyer_id,
        data_type_1: contractObj.data_type_1,
        data_type_2: contractObj.data_type_2,
      }
    };

    Object.keys(payload.contract).forEach(k => {
      if (
        payload.contract[k] === undefined ||
        payload.contract[k] === null ||
        payload.contract[k] === ''
      ) {
        delete payload.contract[k];
      }
    });

    const res = await axios.post(
      'http://10.112.47.214:3000/api/privacy/send-contract',
      payload,
      { timeout: 30000 }
    );

    if (!res.data || res.data.success !== true) {
      throw new Error(res.data?.message || '发送业务合同失败');
    }

    asset.contractSent = true;
    asset.deliveryCallbackUrl = res.data.delivery_url || asset.deliveryCallbackUrl || '';

    // PRE：继续走 PRE 子流程
    if (deliveryMethod === 'pre') {
      asset.uploadProgress = '正在创建 PRE 合约...';

      const createRes = await axios.post(
        'http://10.112.47.214:3000/api/privacy/pre/create-contract',
        {
          transactionId: asset.transaction_id,
          businessContractId: contractObj.contract_id,
          sellerId: contractObj.seller_id,
          buyerId: contractObj.buyer_id
        },
        { timeout: 30000 }
      );

      if (!createRes.data || createRes.data.success !== true) {
        throw new Error(createRes.data?.message || '创建 PRE 合约失败');
      }

      asset.preContractId = createRes.data.preContractId || '';

      asset.uploadProgress = '正在发布 PRE 授权包...';
      const publishRes = await axios.post(
        'http://10.112.47.214:3000/api/privacy/pre/publish',
        { transactionId: asset.transaction_id },
        { timeout: 30000 }
      );

      if (!publishRes.data || publishRes.data.success !== true) {
        throw new Error(publishRes.data?.message || 'PRE publish 失败');
      }

      asset.uploadProgress = '正在发起 PRE 重加密...';
      const reEncryptRes = await axios.post(
        'http://10.112.47.214:3000/api/privacy/pre/re-encrypt',
        { transactionId: asset.transaction_id },
        { timeout: 30000 }
      );

      if (!reEncryptRes.data || reEncryptRes.data.success !== true) {
        throw new Error(reEncryptRes.data?.message || 'PRE re-encrypt 失败');
      }

      asset.preTaskStarted = true;
      asset.preStatus = 'QUEUED';
      asset.uploadProgress = 'PRE 任务已提交，等待处理';
      this.$message.success('PRE 合约发送并发起成功');
      return;
    }

    if (deliveryMethod === 'federated') {
  asset.uploadProgress = '正在创建联邦学习任务...';

  const flRes = await axios.post(
    'http://10.112.47.214:3000/api/privacy/fl/init',
    {
      transactionId: asset.transaction_id,
      buyerId: contractObj.buyer_id,
      sellerId: contractObj.seller_id,
      requiredSellers: 1,
      maxEpochs: 3
    },
    { timeout: 60000 }
  );

  if (!flRes.data || flRes.data.success !== true) {
    throw new Error(flRes.data?.message || '创建联邦学习任务失败');
  }

  asset.flTaskId = flRes.data.taskId;
  asset.uploadProgress = '联邦学习任务已创建';
  this.$message.success('联邦学习任务创建成功');
  return;
}

    this.$message.success('合约已发送并在隐私计算平台创建成功');
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || '发送合约失败';
    console.error('[sendContract] 发送失败:', err);
    asset.contractSendError = msg;
    asset.contractSent = false;
    asset.preTaskStarted = false;
    asset.uploadProgress = '';
    this.$message.error(`发送合约失败：${msg}`);
  } finally {
    asset.sendingContract = false;
  }
},

    // 文件选择
    onFileChange(asset, event) {
      asset.selectedFile = event.target.files?.[0] || null;
      event.target.value = '';
    },

    // 开始上传资产
    /*async startAssetUpload(asset) {
      if (!asset.contractVerified) {
        this.$message.error('请先完成合约校验');
        return;
      }

      if (!asset.selectedFile) {
        this.$message.error('请选择要上传的文件');
        return;
      }

      asset.uploading = true;
      asset.uploadProgress = '开始上传...';

      try {
        // 设置上传相关数据
        this.sendModal.selectedTransaction = asset;
        this.sendModal.File = asset.selectedFile;
        this.contractValidation.isVerified = true;

        // 调用原有的上传逻辑
        await this.sendKey();
        asset.uploadProgress = '上传完成';
        this.$message.success('资产上传成功');

        
      } catch (error) {
        console.error('上传失败:', error);
        asset.uploadProgress = '上传失败';
        this.$message.error('资产上传失败');
      } finally {
        asset.uploading = false;
      }
    },*/

async startAssetUpload(asset) {
  if (asset.deliveryMethod === 'pre') {
    return this.startPreUpload(asset)
  }
  if (asset.deliveryMethod === 'federated') {
    return this.startFederatedUpload(asset)
  }

  // 默认保持原有同态加密/TEE 逻辑
  return this.startHeUpload(asset)

},

async startHeUpload(asset){
  if (!asset.contractSent) {
    this.$message.error('请先发送数字合约，并等待交付方式返回');
    return;
  }

  if (!asset.selectedFile) {
    this.$message.error('请选择要上传的文件');
    return;
  }

  asset.uploading = true;
  asset.uploadProgress = '开始上传...';

  try {
    // 1. 获取 file 用的密钥
    asset.uploadProgress = '正在获取加密密钥...';
    const keyRes = await axios.post(
      'http://10.112.47.214:3000/api/vm/send-key',
      {
        vmId: this.activeVmId,
        purpose: 'file'           // 👈 这里要加
      },
      { timeout: 20000 }
    );
    if (keyRes.status !== 200) {
      throw new Error('获取加密密钥失败');
    }

    // 2. （可选）读取缓存里的 key（主要是给你自己看）
    const keyResponse = await axios.get(
      `http://10.112.47.214:3000/api/vm/send-key/response/${this.activeVmId}?purpose=file`,
      { timeout: 10000 }
    );
    const payload = keyResponse?.data?.payload || {};
    if (!payload.sm4KeyB64) {
      throw new Error('未获取到有效的加密密钥');
    }

    // 3. 生成并上传合约 JSON（这里 purpose 用 json 没关系，后端自己会去 ensureSm4Key）
    const contractObj = await this.generateContractInfo(asset);
    if (!contractObj) {
      throw new Error('生成合约信息失败');
    }

    asset.uploadProgress = '正在上传合约信息...';
    const jsonRes = await axios.post(
      'http://10.112.47.214:3000/api/vm/send-json',
      {
        vmId: this.activeVmId,
        purpose: 'json',
        json: JSON.stringify(contractObj)
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    if (jsonRes.status !== 200) {
      throw new Error('合约信息上传失败');
    }

    // 4. 上传文件（file）
    asset.uploadProgress = '正在上传文件...';
    const formData = new FormData();
    formData.append('vmId', this.activeVmId);
    formData.append('purpose', 'file');    // 和 send-key 的 purpose 保持一致
    formData.append('file', asset.selectedFile);

    const uploadRes = await axios.post(
      'http://10.112.47.214:3000/api/vm/send-file',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.lengthComputable) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            asset.uploadProgress = `上传中: ${percentCompleted}%`;
          }
        }
      }
    );

    if (uploadRes.status === 200) {
      asset.uploadProgress = '上传完成';
      await this.saveAssetRecord(asset);
      this.$message.success('资产上传成功');
    } else {
      throw new Error('文件上传失败');
    }

  } catch (error) {
    console.error('上传失败:', error);
    const errorMsg = error?.response?.data?.message || error?.message || '上传失败';
    asset.uploadProgress = '上传失败';
    this.$message.error(`资产上传失败: ${errorMsg}`);
  } finally {
    asset.uploading = false;
  }
},


/*async startPreUpload(asset) {
  if (!asset.contractSent) {
    this.$message.error('请先发送数字合约');
    return;
  }

  if (!asset.selectedFile) {
    this.$message.error('请选择要上传的文件');
    return;
  }

  asset.uploading = true;
  asset.uploadProgress = '开始 PRE 交付...';

  try {
    // 第 1 步：先沿用你现有文件上传接口，把密文文件/原文件存到你的平台
    asset.uploadProgress = '正在上传资产文件...';
    const formData = new FormData();
    formData.append('vmId', this.activeVmId);
    formData.append('purpose', 'file');
    formData.append('file', asset.selectedFile);

    const fileRes = await axios.post(
      'http://10.112.47.214:3000/api/vm/send-file',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      }
    );

    if (fileRes.status !== 200) {
      throw new Error('文件上传失败');
    }

    // 第 2 步：发起 PRE 主流程
    asset.uploadProgress = '正在创建 PRE 合约...';
    const createRes = await axios.post(
      'http://10.112.47.214:3000/api/privacy/pre/create-contract',
      {
        transactionId: asset.transaction_id,
        sellerId: asset.seller_address,
        buyerId: asset.buyer_address
      },
      { timeout: 30000 }
    );

    asset.preContractId = createRes.data.preContractId;

    asset.uploadProgress = '正在发布 PRE 授权包...';
    await axios.post(
      'http://10.112.47.214:3000/api/privacy/pre/publish',
      {
        transactionId: asset.transaction_id
      },
      { timeout: 30000 }
    );

    asset.uploadProgress = '正在请求重加密...';
    await axios.post(
      'http://10.112.47.214:3000/api/privacy/pre/re-encrypt',
      {
        transactionId: asset.transaction_id
      },
      { timeout: 30000 }
    );

    asset.preTaskStarted = true;
    asset.preStatus = 'queued';
    asset.uploadProgress = 'PRE 已启动，正在处理中...';
    this.$message.success('代理重加密任务已提交');

  } catch (error) {
    const msg = error?.response?.data?.message || error?.message || 'PRE 上传失败';
    asset.uploadProgress = 'PRE 交付失败';
    this.$message.error(msg);
  } finally {
    asset.uploading = false;
  }
},*/

/*async startPreUpload(asset) {
  if (!asset.contractSent) {
    this.$message.error('请先发送数字合约');
    return;
  }

  if (!asset.selectedFile) {
    this.$message.error('请选择要上传的文件');
    return;
  }

  asset.uploading = true;
  asset.uploadProgress = '开始 PRE 交付...';

  try {
    // 1) 先为 file 目的获取并缓存密钥
    asset.uploadProgress = '正在获取文件加密密钥...';
    const keyRes = await axios.post(
      'http://10.112.47.214:3000/api/vm/send-key',
      {
        vmId: this.activeVmId,
        purpose: 'file'
      },
      { timeout: 20000 }
    );

    if (keyRes.status !== 200) {
      throw new Error('获取文件加密密钥失败');
    }

    // 2) 再上传文件
    asset.uploadProgress = '正在上传资产文件...';

    const formData = new FormData();
    formData.append('vmId', this.activeVmId);
    formData.append('purpose', 'file');
    formData.append('file', asset.selectedFile);

    const fileRes = await axios.post(
      'http://10.112.47.214:3000/api/vm/send-file',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      }
    );

    if (fileRes.status !== 200) {
      throw new Error('文件上传失败');
    }

    asset.uploadProgress = 'PRE 文件上传成功，等待买家侧查询结果';
    this.$message.success('PRE 文件上传成功');
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message || 'PRE 文件上传失败';
    asset.uploadProgress = 'PRE 交付失败';
    this.$message.error(msg);
  } finally {
    asset.uploading = false;
  }
},*/

/*async startPreUpload(asset) {
  if (!asset.contractSent) {
    this.$message.error('请先发送数字合约');
    return;
  }

  if (!asset.selectedFile) {
    this.$message.error('请选择要上传的文件');
    return;
  }

  asset.uploading = true;
  asset.uploadProgress = '开始 PRE 文件上传...';

  try {
    const formData = new FormData();
    formData.append('transactionId', asset.transaction_id);
    formData.append('file', asset.selectedFile);

    const uploadRes = await axios.post(
      'http://10.112.47.214:3000/api/privacy/pre/upload-file',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      }
    );

    if (!uploadRes.data || uploadRes.data.success !== true) {
      throw new Error(uploadRes.data?.message || 'PRE 文件上传失败');
    }

    asset.uploadProgress = 'PRE 文件上传成功';
    this.$message.success('PRE 文件上传成功');
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message || 'PRE 文件上传失败';
    asset.uploadProgress = 'PRE 交付失败';
    this.$message.error(msg);
  } finally {
    asset.uploading = false;
  }
},*/
async startPreUpload(asset) {
  if (!asset.contractSent) {
    this.$message.error('请先发送数字合约');
    return;
  }

  if (!asset.selectedFile) {
    this.$message.error('请选择要上传的文件');
    return;
  }

  asset.uploading = true;
  asset.uploadProgress = '开始 PRE 文件上传...';

  try {
    const formData = new FormData();
    formData.append('transactionId', asset.transaction_id);
    formData.append('file', asset.selectedFile);

    const uploadRes = await axios.post(
      'http://10.112.47.214:3000/api/privacy/pre/upload-file',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      }
    );

    if (!uploadRes.data || uploadRes.data.success !== true) {
      throw new Error(uploadRes.data?.message || 'PRE 文件上传失败');
    }

    asset.uploadProgress = 'PRE 文件上传成功，等待买家查询结果';
    this.$message.success('PRE 文件上传成功');
  } catch (error) {
    const msg = error?.response?.data?.message || error?.message || 'PRE 文件上传失败';
    asset.uploadProgress = 'PRE 交付失败';
    this.$message.error(msg);
  } finally {
    asset.uploading = false;
  }
},

/*async startFederatedUpload(asset) {
  if (!asset.contractSent) {
    this.$message.error('请先发送数字合约');
    return;
  }

  if (!asset.selectedFile) {
    this.$message.error('请选择联邦学习上传文件');
    return;
  }

  asset.uploading = true;
  asset.uploadProgress = '开始联邦学习交付...';

  try {
    const formData = new FormData();
    formData.append('transactionId', asset.transaction_id);
    formData.append('sellerId', asset.seller_address);
    formData.append('batchIndex', '0');
    formData.append('file', asset.selectedFile);

    const res = await axios.post(
      'http://10.112.47.214:3000/api/privacy/fl/forward-upload',
      formData,
      {
        timeout: 60000
      }
    );

    if (!res.data || res.data.success !== true) {
      throw new Error(res.data?.message || '联邦学习上传失败');
    }

    asset.uploadProgress = '联邦学习数据上传成功，等待聚合训练';
    this.$message.success('联邦学习上传成功');
  } catch (err) {
    const msg = err?.response?.data?.message || err.message || '联邦学习上传失败';
    asset.uploadProgress = '联邦学习交付失败';
    this.$message.error(msg);
  } finally {
    asset.uploading = false;
  }
},*/

async startFederatedUpload(asset) {
  if (!asset.contractSent) {
    this.$message.error('请先发送数字合约');
    return;
  }

  if (!asset.flSmashedFile) {
    this.$message.error('请选择 smashed_file 文件');
    return;
  }

  if (!asset.flLabelFile) {
    this.$message.error('请选择 label_file 文件');
    return;
  }

  asset.uploading = true;
  asset.uploadProgress = '开始联邦学习前向数据上传...';

  try {
    const formData = new FormData();
    formData.append('transactionId', asset.transaction_id);
    formData.append('sellerId', asset.seller_address);
    formData.append('batchIndex', String(asset.flBatchIndex || 0));
    formData.append('smashed_file', asset.flSmashedFile);
    formData.append('label_file', asset.flLabelFile);

    const res = await axios.post(
      'http://10.112.47.214:3000/api/privacy/fl/forward-upload',
      formData,
      {
        timeout: 60000
      }
    );

    if (!res.data || res.data.success !== true) {
      throw new Error(res.data?.message || '联邦学习上传失败');
    }

    asset.flTaskId = res.data.taskId || asset.flTaskId || '';
    asset.flStatus = 'FORWARD_UPLOADED';
    asset.uploadProgress = '联邦学习前向数据上传成功，等待聚合训练';
    this.$message.success('联邦学习上传成功');
  } catch (err) {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.remote?.detail ||
      err?.message ||
      '联邦学习上传失败';

    asset.uploadProgress = '联邦学习交付失败';
    this.$message.error(msg);
  } finally {
    asset.uploading = false;
  }
},


async pollPreStatus(asset) {
  if (!asset.transaction_id) return;

  const res = await axios.get(
    'http://10.112.47.214:3000/api/privacy/pre/status',
    { params: { transactionId: asset.transaction_id }, timeout: 15000 }
  );

  asset.preStatus = res.data.status || 'unknown';
  asset.preResultReady = asset.preStatus === 'COMPLETED';
},

async downloadPreResult(asset) {
  const res = await axios.get(
    'http://10.112.47.214:3000/api/privacy/pre/result',
    {
      params: { transactionId: asset.transaction_id },
      responseType: 'blob',
      timeout: 30000
    }
  );

  const blob = new Blob([res.data]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pre_result_${asset.transaction_id}.bin`;
  a.click();
  window.URL.revokeObjectURL(url);
},


// ===== 新增：从 /api/privacy/results 按“用户所有证书地址”拉取计算结果并合并 =====
async loadPrivacyResultsByAllCerts() {
  // 1) 拿到用户所有证书地址
  const addrs = await this.getAllCertAddresses();
  if (!Array.isArray(addrs) || addrs.length === 0) {
    this.downloadList = [];
    return;
  }

  // 2) 并发请求每个地址的 results
  const reqs = addrs.map(addr =>
    axios.get('http://10.112.47.214:3000/api/privacy/results', {
      params: { buyerCertAddr: addr },
      timeout: 20000
    }).then(r => ({ ok: true, addr, data: r.data }))
      .catch(e => ({ ok: false, addr, err: e }))
  );

  const results = await Promise.all(reqs);

  // 3) 合并 items
  const merged = [];
  for (const r of results) {
    if (!r.ok) {
      console.warn('[privacy/results] 拉取失败 addr=', r.addr, r.err?.message || r.err);
      continue;
    }
    const items = r.data?.items;
    if (Array.isArray(items)) merged.push(...items);
  }

  // 4) 去重（建议用 transaction_id + contract_id 更稳；没有就用 id）
  const uniq = [];
  const seen = new Set();
  for (const it of merged) {
    const key = `${it.transaction_id || ''}__${it.contract_id || ''}__${it.id || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(it);
  }

  // 5) 映射成你下载表格需要的字段（尽量兼容你现有 UI）
  // 你后端表里：id, buyer_cert_addr, transaction_id, contract_id, payload_json, payload_text, status, created_at
  this.downloadList = uniq.map(it => ({
    id: it.id || it.transaction_id || it.contract_id, // 表格 v-for :key 用
    asset_name: (it.payload_json && (() => {
      try { return JSON.parse(it.payload_json)?.product_name } catch(e) { return null }
    })()) || it.contract_id || `计算结果_${it.transaction_id || it.id}`,
    transaction_id: it.transaction_id || '',
    contract_id: it.contract_id || '',
    buyer_address: it.buyer_cert_addr || '',

    // ✅ 统一给你的状态字段（你表格里用 item.status）
    // 建议：available=可下载；processing=计算中；error=错误
    status: (it.status === 'done' || it.status === 'available') ? 'available'
          : (it.status === 'error' ? 'error' : 'processing'),

    // 给 UI 的辅助字段
    compute_status: it.status || '',
    created_at: it.created_at || '',
    payload_text: it.payload_text || '',
    payload_json: it.payload_json || '',
    isPlaceholder: (it.status !== 'done' && it.status !== 'available') // 非完成态就提示“等待计算”
  }));

  // 6) 按时间排序（created_at DESC）
  this.downloadList.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
},


 // 刷新下载列表 - 获取用户作为买家收到的加密计算结果
// 刷新下载列表：优先从隐私计算结果表 privacy_delivery_results 拉取
/*async refreshDownloadList() {
  try {
    // 1) 保证 userId 已有
    if (!this.userId) await this.initUser();

    // 2) 走你新写的“按全部证书地址拉取并合并”
    await this.loadPrivacyResultsByAllCerts();

    // 3) 兜底：如果没有任何结果，就用旧逻辑展示“计算中”（可选）
    if (!Array.isArray(this.downloadList) || this.downloadList.length === 0) {
      await this.loadBuyerTransactionsAsDownloadList();
    }
  } catch (error) {
    console.error('[refreshDownloadList] error:', error);
    this.$message?.error('加载下载列表失败');

    // 兜底：出错就回退到旧逻辑
    await this.loadBuyerTransactionsAsDownloadList();
  }
},*/


async refreshDownloadList() {
  try {
    // 1) 保证 userId 已有
    if (!this.userId) await this.initUser();

    // 2) 只走数据库：按全部证书地址拉取并合并
    await this.loadPrivacyResultsByAllCerts();

    // 3) 不做兜底：downloadList 为空就显示“暂无记录”
  } catch (error) {
    console.error('[refreshDownloadList] error:', error);
    this.$message?.error('加载下载列表失败');

    // 出错时也不要回退旧逻辑，避免塞入大量占位项
    this.downloadList = [];
  }
},


// 从交易记录获取买家数据作为下载列表
async loadBuyerTransactionsAsDownloadList() {
  try {
    const buyerAddresses = await this.getAllCertAddresses();
    const allTransactions = [];

    for (const buyerAddress of buyerAddresses) {
      try {
        const txRes = await axios.get(`http://10.112.47.214:3000/api/buyer-transaction-status/${buyerAddress}`);
        if (txRes.status === 200 && Array.isArray(txRes.data.transactions)) {
          const buyerTxs = txRes.data.transactions
            .filter(tx => tx.status === '已确认')
            .map(tx => ({
              id: tx.transaction_id,
              asset_name: `加密计算结果_${tx.transaction_id}`,
              file_hash: tx.asset_id,
              file_size: '计算中...',
              status: 'processing', // 默认处理中状态
              transaction_id: tx.transaction_id,
              asset_id: tx.asset_id,
              seller_address: tx.seller_address,
              buyer_address: tx.buyer_address,
              isPlaceholder: true, // 标记为占位数据
              compute_status: 'pending'
            }));
          allTransactions.push(...buyerTxs);
        }
      } catch (error) {
        console.error(`获取地址 ${buyerAddress} 的交易记录失败:`, error);
      }
    }

    this.downloadList = allTransactions.filter((asset, index, self) => 
      index === self.findIndex(a => a.id === asset.id)
    );

  } catch (error) {
    console.error('加载交易记录作为下载列表失败:', error);
    this.downloadList = [{
      id: 'error',
      asset_name: '加载失败',
      file_hash: '请重试',
      file_size: '-',
      status: 'error',
      isPlaceholder: true
    }];
  }
},

// 下载资产 - 买家下载加密计算结果
async downloadAsset(item) {
  if (item.isPlaceholder) {
    this.$message.warning('该资产的计算结果尚未生成，请稍后再试');
    return;
  }

  try {
    this.$message.info('开始下载加密计算结果...');

    const payload = {
      vmId: this.activeVmId || '1',
      format: 'bin',
      filename: `encrypted_result_${item.transaction_id}`,
      purpose: 'export',
      transaction_id: item.transaction_id
    };

    console.log('下载请求参数:', payload);

    const response = await axios.post(
      'http://10.112.47.214:3000/api/vm/export',
      payload,
      {
        responseType: 'blob',
        timeout: 60000
      }
    );

    /*if (response.status !== 200) {
      throw new Error(`服务器返回错误状态: ${response.status}`);
    }

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;

    const contentDisposition = response.headers['content-disposition'];
    let filename = `encrypted_result_${item.transaction_id}.bin`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);

    this.$message.success('加密计算结果下载成功');
    this.updateDownloadStatus(item, 'downloaded');
*/
    if (response.status !== 200) {
      throw new Error(`服务器返回错误状态: ${response.status}`);
    }

    // ========= 1. 正常保存并触发浏览器下载 =========
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;

    const contentDisposition = response.headers['content-disposition'];
    let filename = `encrypted_result_${item.transaction_id}.bin`;

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);

    // ========= 2. 下载成功后，调用后端记录一次交付 =========
    let serverTime = null;
    try {
      const recordRes = await axios.post(
        'http://10.112.47.214:3000/api/delivery/record',
        { transactionId: item.transaction_id }
      );

      const recData = recordRes?.data || {};
      const history = recData.deliveryHistory || recData.history || [];

      if (Array.isArray(history) && history.length > 0) {
        const last = history[history.length - 1];
        // 约定后端字段叫 delivered_at
        serverTime = last.delivered_at || last.time || null;
      }

      // 如果你希望同步刷新卖家侧的“交付中 / 已交付”状态，也可以顺便：
      // this.fetchRequestedAssets();
    } catch (e) {
      console.error('记录交付失败（不影响下载）:', e);
    }

    // ========= 3. 用后端时间更新下载状态 =========
    this.$message.success('加密计算结果下载成功');
    this.updateDownloadStatus(item, 'downloaded', serverTime);

  } catch (error) {
    console.error('下载失败:', error);

    let errorMessage = '下载失败';

    if (error.response) {
      // ===== 这里是关键修改：专门处理 404 的“目录为空”情况 =====
      if (error.response.status === 404) {
        // 后端在目录为空时会返回 404，这里统一提示“暂无可下载文件”
        errorMessage = '当前暂时没有可下载的结果文件，请稍后再试';
        console.warn('导出目录为空或结果文件尚未生成:', {
          url: error.config?.url,
          method: error.config?.method,
        });
      } else if (error.response.status === 500) {
        errorMessage = '服务器内部错误，请稍后重试';
      } else {
        errorMessage = `服务器错误: ${error.response.status}`;
      }
    } else if (error.request) {
      errorMessage = '无法连接到服务器，请检查网络连接';
    } else {
      errorMessage = error.message || '下载过程出现错误';
    }

    this.$message.error(errorMessage);
    this.updateDownloadStatus(item, 'error');
  }
},


// 更新下载状态
/*updateDownloadStatus(item, status) {
  const index = this.downloadList.findIndex(a => a.id === item.id);
  if (index !== -1) {
    this.downloadList[index].download_status = status;
    this.downloadList[index].last_download_time = new Date().toISOString();
  }
},*/

// 更新下载状态，支持传入后端的时间
updateDownloadStatus(item, status, serverTime) {
  const index = this.downloadList.findIndex(a => a.id === item.id);
  if (index !== -1) {
    this.downloadList[index].download_status = status;
    // 优先使用后端返回的时间
    this.downloadList[index].last_download_time = serverTime || new Date().toISOString();
  }
},



// 获取状态显示文本
getStatusText(item) {
  if (item.isPlaceholder) {
    return '计算中';
  }
  
  const statusMap = {
    'available': '可下载',
    'processing': '处理中', 
    'error': '错误',
    'downloaded': '已下载'
  };
  return statusMap[item.status] || item.status || '未知';
},

// 获取计算状态文本
getComputeStatusText(computeStatus) {
  const statusMap = {
    'pending': '等待计算',
    'computing': '计算中',
    'completed': '计算完成',
    'error': '计算错误'
  };
  return statusMap[computeStatus] || computeStatus;
},

// 格式化下载时间
formatDownloadTime(timestamp) {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return timestamp;
  }
},

// 缩短地址显示
shortenAddress(address) {
  return address && address.length > 10 ? 
    address.substring(0, 6) + '...' + address.substring(address.length - 4) : 
    address;
},

// 格式化文件大小
formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '未知';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
},


    // 关闭合约信息
    closeContractInfo() {
      this.contractInfo.visible = false;
    },

    // 格式化日期
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

    // ============ 原有的方法保持不变 ============
    // 设置模块状态
    setModuleStatus(module, status) {
      if (this.moduleStatus[module] !== undefined) {
        this.moduleStatus[module] = status;
      }
    },

    // 重置所有模块状态
    resetAllModuleStatus() {
      this.moduleStatus = {
        upload: 'idle',
        manage: 'idle', 
        compute: 'idle',
        export: 'idle'
      };
    },

    // 步骤控制方法
    goToStep1() {
      this.currentStep = 1;
    },

    goToStep2() {
      if (this.contractValidation.isVerified) {
        this.currentStep = 2;
      }
    },

    // 原有的上传操作开始方法
    startUploadOperation() {
      this.resetAllModuleStatus();
      this.currentStep = 1;
      this.sendModal.open = true; 
      this.fetchRequestedAssets();
      this.resetContractValidation();
    },

    // 关闭上传弹窗
    closeUploadModal() {
      this.sendModal.open = false;
      this.currentStep = 1;
      this.resetContractValidation();
    },

    // 重置合约校验状态
    resetContractValidation() {
      this.contractValidation = {
        isVerified: false,
        isVerifying: false,
        verifyResult: null,
        verifyError: ''
      };
    },

    // 生成合约信息
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

        const contractObj = {
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
            quantity: transaction.quantity ?? tx.quantity ?? null
          }
        };
        
        return contractObj;
      } catch (error) {
        console.error('生成合约信息失败:', error);
        this.$message.error('生成合约信息失败');
        return null;
      }
    },

    // 原有的上传相关方法
    async sendKey() {
      if (!this.activeVmId) { 
        this.$message.error('请先选择目标虚拟机'); 
        this.setModuleStatus('upload', 'error');
        return; 
      }
      if (!this.sendModal.selectedTransaction) { 
        this.$message.error('请选择要上传的交易记录'); 
        this.setModuleStatus('upload', 'error');
        return; 
      }
      if (!this.sendModal.File) { 
        this.$message.error('请选择要上传的资产文件'); 
        this.setModuleStatus('upload', 'error');
        return; 
      }

      this.resetUploadState({ file: true, tx: true });
      this.sendModal.open = true;
      this.sendModal.uploadStatus = '正在获取密钥...';

      try {
        this.resetUploadState();
        this.sendModal.open = true;
        this.sendModal.File = this.sendModal.File || null;
        this.sendModal.selectedTransaction = this.sendModal.selectedTransaction || null;

        this.sendModal.uploadStatus = '正在获取密钥...';

        this.markStep('send_pubkey', 'doing');
        const res = await axios.post(
          'http://10.112.47.214:3000/api/vm/send-key',
          { vmId: this.activeVmId },
          { timeout: 20000 }
        );
        if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
        
        this.markStep('send_pubkey', 'done');
        this.markStep('recv_enc_key', 'done');

        const resp2 = await axios.get(
          `http://10.112.47.214:3000/api/vm/send-key/response/${this.activeVmId}`,
          { timeout: 10000 }
        );
        const payload = resp2?.data?.payload || {};
        const expiresAt = resp2?.data?.expiresAt ?? res?.data?.expiresAt;

        if (payload.sm4KeyB64) {
          this.sendModal.sm4KeyBase64 = payload.sm4KeyB64;
          this.sendModal.sm4KeyHex = this.base64ToHex(payload.sm4KeyB64);
          this.sendModal.keyExpiresAt = expiresAt ? new Date(expiresAt).toLocaleString() : '';

          const detail = `
            <div>Base64：<code>${this.sendModal.sm4KeyBase64}</code></div>
            <div>Hex：<code>${this.sendModal.sm4KeyHex}</code></div>
            ${this.sendModal.keyExpiresAt ? `<div>缓存到期：${this.sendModal.keyExpiresAt}</div>` : '' }
          `;
          this.markStep('decrypt_sm4', 'done', detail);

          this.sendModal.uploadStatus = '密钥获取成功（已缓存 SM4 16B）';
          this.sendModal.isKeySent = true;
          this.$message.success('密钥获取成功，准备上传资产');

          setTimeout(() => this.sendFileAndJson(), 600);
        } else {
          const note = payload.note || '未返回 16B 密钥';
          const dump = payload.dumpPath ? `（明文已写入：${payload.dumpPath}）` : '';
          this.markStep('decrypt_sm4', 'error', `<div>${note}${dump}</div>`);
          this.sendModal.uploadStatus = `未获取到 16B 的 SM4 密钥：${note}${dump}`;
          this.$message.warning(this.sendModal.uploadStatus);
          this.setModuleStatus('upload', 'error');
        }
      } catch (err) {
        const errorMsg = err?.response?.data?.message || err?.message || '获取密钥失败';
        this.markStep('send_pubkey', 'error');
        this.markStep('recv_enc_key', 'error');
        this.markStep('decrypt_sm4', 'error', `<div>${errorMsg}</div>`);
        console.error('send-key 接口异常:', errorMsg);
        this.sendModal.uploadStatus = `获取密钥失败：${errorMsg}`;
        this.$message.error(`获取密钥失败：${errorMsg}`);
        this.setModuleStatus('upload', 'error');
      }
    },

    // 发送文件和JSON
    async sendFileAndJson() {
      if (!this.sendModal.isKeySent) { 
        this.$message.error('请先完成密钥获取步骤'); 
        this.setModuleStatus('upload', 'error');
        return; 
      }
      if (this.isUploadingFile) return;

      const vmId = this.activeVmId;
      const file = this.sendModal.File;
      if (!file) { 
        this.$message.error('请选择要上传的文件'); 
        this.setModuleStatus('upload', 'error');
        return; 
      }

      try {
        this.isUploadingFile = true;
        this.setModuleStatus('upload', 'processing');
        
        // 使用已经生成并校验通过的合约信息
        const contractObj = this.contractInfo.data;
        const jsonString = JSON.stringify(contractObj);

        // 发送 JSON
        this.sendModal.uploadStatus = '正在加密并发送交易JSON...';
        this.markStep('encrypt_asset', 'doing', '<div>JSON阶段：SM4加密并上送</div>');

        await this.ensureSm4Key(vmId, 'json');

        const jsonRes = await axios.post(
          'http://10.112.47.214:3000/api/vm/send-json',
          { vmId, purpose: 'json', json: jsonString },
          { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        if (jsonRes.status === 200) {
          this.markStep('encrypt_asset', 'done', '<div>JSON阶段完成</div>');
          const remoteJ = jsonRes?.data?.remote;
          const acceptedJ = (remoteJ && (remoteJ.status === 'ok' || remoteJ.note || (remoteJ.status >= 200 && remoteJ.status < 300))) || false;
          if (acceptedJ) this.markStep('haiguang_accepted', 'done', '<div>对端已接收JSON</div>');
          else this.markStep('haiguang_accepted', 'doing', `<div>JSON已发送，等待对端确认${remoteJ ? `（对端返回：${JSON.stringify(remoteJ)}）` : ''}</div>`);
        } else {
          throw new Error(`JSON发送失败，状态码 ${jsonRes.status}`);
        }

        // 发送文件
        this.sendModal.uploadStatus = '正在加密并上传文件...';
        this.markStep('encrypt_asset', 'doing', '<div>文件阶段：SM4加密并上送</div>');

        await this.ensureSm4Key(vmId, 'file');

        const formData = new FormData();
        formData.append('vmId', vmId);
        formData.append('purpose', 'file');
        formData.append('file', file);

        const uploadRes = await axios.post(
          'http://10.112.47.214:3000/api/vm/send-file',
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 }
        );

        if (uploadRes.status === 200) {
          this.markStep('encrypt_asset', 'done', '<div>文件阶段完成</div>');
          const remote = uploadRes?.data?.remote;
          const accepted = (remote && (remote.status === 'ok' || remote.note || (remote.status >= 200 && remote.status < 300))) || false;
          if (accepted) this.markStep('haiguang_accepted', 'done', '<div>对端已接收文件</div>');
          else this.markStep('haiguang_accepted', 'doing', `<div>文件已发送，等待对端确认${remote ? `（对端返回：${JSON.stringify(remote)}）` : ''}</div>`);

          await this.saveAssetRecord();

          this.setModuleStatus('upload', 'success');
          this.setModuleStatus('manage', 'success');
          this.setModuleStatus('compute', 'success');

          this.sendModal.uploadStatus = 'JSON 与 文件均已上传成功！';
          this.$message.success('交易JSON与文件已分别加密并上传成功');

          setTimeout(() => {
            this.sendModal.open = false;
            this.resetUploadState();
          }, 3000);
          
        } else {
          throw new Error(`文件发送失败，状态码 ${uploadRes.status}`);
        }

      } catch (err) {
        const errorMsg = err?.response?.data?.message || err?.message || '上传失败';
        if (this.findStep('encrypt_asset').state === 'doing') {
          this.markStep('encrypt_asset', 'error', `<div>${errorMsg}</div>`);
          this.markStep('haiguang_accepted', 'error');
        } else {
          this.markStep('encrypt_asset', 'error');
          this.markStep('haiguang_accepted', 'error');
        }
        console.error('send-json / send-file 异常:', errorMsg);
        this.sendModal.uploadStatus = `上传失败：${errorMsg}`;
        this.$message.error(`上传失败：${errorMsg}`);
        this.setModuleStatus('upload', 'error');
      } finally {
        this.isUploadingFile = false;
      }
    },

    // 保留已选 File 与 selectedTransaction
    resetUploadState(preserve = { file: true, tx: true }) {
      const keepFile = preserve?.file ? this.sendModal.File : null;
      const keepTx   = preserve?.tx   ? this.sendModal.selectedTransaction : null;

      this.isUploadingFile = false;
      this.sendModal = {
        open: false,
        File: keepFile,
        uploadStatus: '',
        selectedTransaction: keepTx,
        isKeySent: false,
        sm4KeyBase64: '',
        sm4KeyHex: '',
        keyExpiresAt: '',
        progress: [
          { key: 'send_pubkey', label: '1. 发送公钥成功', state: 'idle', detail: '' },
          { key: 'recv_enc_key', label: '2. 接收加密公钥成功', state: 'idle', detail: '' },
          { key: 'decrypt_sm4', label: '3. 解密成功，密钥为：', state: 'idle', detail: '' },
          { key: 'encrypt_asset', label: '4. 加密资产成功', state: 'idle', detail: '' },
          { key: 'haiguang_accepted', label: '5. 海光已接收加密资产', state: 'idle', detail: '' },
        ]
      };
      this.requestedAssets = [];
    },

    // 原有的其他方法
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

    openContractTip() {
      this.$message?.info('此处可放合同/免责声明弹窗，确认后继续。')
    },

    async openCreateVmFlow() {
      if (!this.userId) await this.initUser()
      await this.loadOrders()
      this.orderModal.open = true
    },

    async getAllCertAddresses() {
      const res = []
      const orgs = [
        { org: 'wx-org1.chainmaker.org', api: 'get-certificates' },
        { org: 'wx-org2.chainmaker.org', api: 'get-certificates2' },
      ]
      for (const { org, api } of orgs) {
        try {
          const r = await axios.post(`http://10.112.47.214:3000/api/${api}`, { userId: this.userId })
          const certs = r.data.certificates || []
          for (const c of certs) {
            const certPath = `/home/super/r/GoSDK/crypto-config/${org}/user/${c.cert}/${c.cert}.sign.crt`
            const addrRes = await axios.post('http://10.112.47.214:9092/cert-to-addr', { cert_path: certPath })
            const addr = addrRes?.data?.ethereum?.address
            if (addr) res.push(addr)
          }
        } catch (e) { console.warn('证书或地址获取失败', e) }
      }
      return [...new Set(res)]
    },

    async loadOrders() {
      try {
        this.isLoading = true
        const addrs = await this.getAllCertAddresses()
        const all = []
        for (const a of addrs) {
          const r = await axios.get(`http://10.112.47.214:3000/api/buyer-transaction-status/${a}`)
          ;(r.data.transactions || []).forEach(t => all.push(t))
        }
        this.orders = all.sort((a,b)=> (b.transaction_id||0)-(a.transaction_id||0))
        this.pickedOrders = []
      } catch (e) {
        console.error('加载订单失败', e)
        this.orders = []
      } finally {
        this.isLoading = false
      }
    },

    toggleOrder(o) {
      const i = this.pickedOrders.findIndex(x => x.transaction_id === o.transaction_id)
      if (i >= 0) this.pickedOrders.splice(i, 1)
      else this.pickedOrders.push(o)
    },

    isPicked(o) { return this.pickedOrders.some(x => x.transaction_id === o.transaction_id) },

    statusClass(s) {
      return {
        'green-text': s === '已确认',
        'yellow-text': s === '待确认',
        'red-text': s === '已拒绝'
      }
    },

    goModelStep() {
      this.orderModal.open = false
      this.modelModal.open = true
    },

    async createVm() {
      try {
        this.isLoading = true
        const payload = {
          name: this.modelModal.form.vmName,
          vmType: this.modelModal.form.vmType,
          image: this.modelModal.form.image,
          model: this.modelModal.form.model,
          network: this.modelModal.form.network,
          autoStart: this.modelModal.form.autoStart ? 1 : 0,
          bindOrders: this.modelModal.form.bindOrders ? 1 : 0,
          orders: this.pickedOrders.map(o => ({
            transaction_id: o.transaction_id,
            asset_id: o.asset_id,
            buyer_address: o.buyer_address,
            seller_address: o.seller_address
          })),
          userId: this.userId
        }
        console.log('[创建虚机] 请求参数 =>', payload)

        const r = await axios.post('http://10.112.47.214:3000/api/vm/create', payload)

        this.$message?.success('虚机创建成功')
        this.modelModal.open = false
        this.openVmPanel = true
        await this.refreshVmList()
        if (r?.data?.vmId) this.activeVmId = r.data.vmId
      } catch (e) {
        console.error('创建虚机失败', e)
        this.$message?.error('创建虚机失败')
      } finally {
        this.isLoading = false
      }
    },

    async refreshVmList() {
      try {
        const r = await axios.get('http://10.112.47.214:3000/api/vm/list', { params: { userId: this.userId } })
        this.vmList = r.data?.vms || []
        if (!this.activeVmId && this.vmList.length) this.activeVmId = this.vmList[0].id
      } catch (e) {
        console.error('获取虚机列表失败', e)
        this.vmList = []
      }
    },

    selectTransaction(asset) {
      this.sendModal.selectedTransaction = asset;
      this.generateContractInfo(asset);
    },

    onFile(e) {
      this.sendModal.File = e.target.files?.[0] || null;
      e.target.value = '';
    },

    getUploadStatusIcon() {
      const status = this.sendModal.uploadStatus;
      if (status.includes('失败')) return 'icon-error';
      if (status.includes('加载') || status.includes('正在')) return 'icon-loading';
      if (status.includes('成功')) return 'icon-success';
      return '';
    },

    // 原有的合约校验方法
    async verifyContractOld() {
      if (!this.sendModal.selectedTransaction) {
        this.$message.error('请先选择交易记录');
        return;
      }

      this.contractValidation.isVerifying = true;
      this.contractValidation.verifyError = '';

      try {
        const contractObj = await this.generateContractInfo(this.sendModal.selectedTransaction);
        if (!contractObj) {
          throw new Error('生成合约信息失败');
        }
        
        const verifyRes = await axios.post('http://10.112.47.214:3000/api/vm/verify-contract', {
          vmId: this.activeVmId,
          contract: contractObj
        });

        if (verifyRes.data.success) {
          this.contractValidation.isVerified = true;
          this.contractValidation.verifyResult = 'success';
          this.$message.success('数字合约校验通过，可以继续上传文件');
        } else {
          throw new Error(verifyRes.data.message || '合约校验失败');
        }
      } catch (error) {
        const errorMsg = error?.response?.data?.message || error?.message || '合约校验失败';
        this.contractValidation.verifyError = errorMsg;
        this.contractValidation.verifyResult = 'error';
        this.$message.error(`合约校验失败: ${errorMsg}`);
      } finally {
        this.contractValidation.isVerifying = false;
      }
    },

    // 开始上传（整合原有的 sendKey 逻辑）
    async startUpload() {
      if (!this.contractValidation.isVerified) {
        this.$message.error('请先完成合约校验');
        return;
      }

      this.setModuleStatus('upload', 'processing');
      
      try {
        await this.sendKey();
      } catch (error) {
        this.setModuleStatus('upload', 'error');
        console.error('上传失败:', error);
      }
    },

    // 管理资产
    async loadAttachableAssets() {
      try {
        const [a1, a2] = await Promise.all([
          axios.get('http://10.112.47.214:3000/api/available-assets'),
          axios.get('http://10.112.47.214:3000/api/resalable-assets')
        ])
        this.attachableAssets = [...(a1.data||[]), ...(a2.data||[])]
        this.pickedAssets = []
      } catch (e) {
        console.error('获取可挂载资产失败', e)
        this.attachableAssets = []
      }
    },

    toggleAsset(a) {
      const i = this.pickedAssets.findIndex(x => x.file_hash === a.file_hash)
      if (i >= 0) this.pickedAssets.splice(i, 1)
      else this.pickedAssets.push(a)
    },

    isAssetPicked(a) { return this.pickedAssets.some(x => x.file_hash === a.file_hash) },

    async mountAssets() {
      try {
        const payload = {
          vmId: this.activeVmId,
          assets: this.pickedAssets.map(a => a.file_hash)
        }
        await axios.post('http://10.112.47.214:3000/api/vm/mount-assets', payload)
        this.$message?.success('已挂载到虚机')
        this.assetModal.open = false
      } catch (e) {
        console.error('挂载资产失败', e)
        this.$message?.error('挂载资产失败')
      }
    },

    async runCompute() {
      try {
        const payload = {
          vmId: this.activeVmId,
          model: this.computeForm.model,
          params: this.computeForm.params
        }
        await axios.post('http://10.112.47.214:3000/api/vm/compute', payload)
        this.$message?.success('计算任务已提交')
        this.computeModal.open = false
      } catch (e) {
        console.error('提交计算失败', e)
        this.$message?.error('提交计算失败')
      }
    },

    // 导出相关方法
    async openExportModal() {
      this.exportModal.open = true;
      await this.loadEligibleExports();
    },

    async loadEligibleExports() {
      if (!this.activeVmId) { 
        this.$message?.error('请先选择虚机'); 
        return; 
      }
      
      this.isLoadingEligible = true;
      try {
        const buyerAddresses = await this.getAllCertAddresses();
        if (buyerAddresses.length === 0) {
          this.$message?.error('未找到用户地址');
          return;
        }

        console.log('用户所有证书地址:', buyerAddresses);

        const allEligibleAssets = [];
        
        for (const buyerAddress of buyerAddresses) {
          try {
            const r = await axios.get('http://10.112.47.214:3000/api/vm/export/eligible', {
              params: { 
                vmId: '1',
                buyerAddress: buyerAddress
              }
            });
            
            if (r.data?.success && Array.isArray(r.data.items)) {
              allEligibleAssets.push(...r.data.items);
            }
          } catch (e) {
            console.error(`查询地址 ${buyerAddress} 的可导出资产失败:`, e);
          }
        }

        this.exportEligible = allEligibleAssets.filter((asset, index, self) => 
          index === self.findIndex(a => a.transaction_id === asset.transaction_id)
        );
        
        if (this.exportEligible.length === 1) {
          this.selectedExportTxId = this.exportEligible[0].transaction_id;
        } else {
          this.selectedExportTxId = null;
        }

        console.log('最终可导出资产列表:', this.exportEligible);

      } catch (e) {
        console.error('加载可导出清单失败', e);
        this.exportEligible = [];
        this.$message?.error('加载可导出条目失败');
      } finally {
        this.isLoadingEligible = false;
      }
    },

    // 保存资产记录
    /*async saveAssetRecord() {
      try {
        const transaction = this.sendModal.selectedTransaction;
        if (!transaction) return;

        const payload = {
          vmId: '1',
          transactionId: transaction.transaction_id,
          assetId: transaction.file_hash,
          assetName: transaction.asset_name,
          sellerAddress: transaction.seller_address,
          buyerAddress: transaction.buyer_address
        };

        const response = await axios.post('http://10.112.47.214:3000/api/vm/asset/record', payload);
        
        if (response.data?.success) {
          console.log('资产记录保存成功');
        } else {
          console.error('资产记录保存失败:', response.data?.message);
        }
      } catch (error) {
        console.error('保存资产记录失败:', error);
      }
    },*/

// 保存资产记录
async saveAssetRecord(asset) {
  try {
    const payload = {
      vmId: this.activeVmId,
      transactionId: asset.transaction_id,
      assetId: asset.file_hash,
      assetName: asset.asset_name,
      sellerAddress: asset.seller_address,
      buyerAddress: asset.buyer_address
    };

    const response = await axios.post('http://10.112.47.214:3000/api/vm/asset/record', payload);
    
    if (response.data?.success) {
      console.log('资产记录保存成功');
    } else {
      console.log('资产记录保存响应:', response.data);
    }
  } catch (error) {
    console.error('保存资产记录失败:', error);
    // 不阻止主流程，记录错误即可
  }
},


    startExportOperation() {
      this.exportModal.open = true;
      this.openExportModal();
    },

    async exportResult() {
      try {
        this.setModuleStatus('export', 'processing');
        
        const payload = {
          vmId: this.activeVmId,
          format: this.exportForm.format,
          filename: this.exportForm.filename || 'result',
          purpose: 'export',
          transaction_id: this.selectedExportTxId,
          file: this.selectedExportFile || undefined
        }
        const r = await axios.post('http://10.112.47.214:3000/api/vm/export', payload, { responseType: 'blob' })
        const url = URL.createObjectURL(new Blob([r.data]))
        const a = document.createElement('a')
        a.href = url
        a.download = `${payload.filename}.${payload.format}`
        a.click()
        URL.revokeObjectURL(url)
        
        this.setModuleStatus('export', 'success');
        this.$message?.success('导出成功')
        this.exportModal.open = false
      } catch (e) {
        this.setModuleStatus('export', 'error');
        console.error('导出失败', e)
        this.$message?.error('导出失败')
      }
    },

    startManageOperation() {
      this.assetModal.open = true;
    },

    startComputeOperation() {
      this.computeModal.open = true;
    },

    showContractInfo(contractData) {
      this.contractInfo.data = contractData;
      this.contractInfo.visible = true;
    },

    // 工具方法
    findStep(key) {
      return this.sendModal.progress.find(s => s.key === key);
    },

    markStep(key, state, detailHtml = '') {
      const s = this.findStep(key);
      if (s) { s.state = state; s.detail = detailHtml; }
    },

    getStateIcon(state) {
      if (state === 'done') return 'ok el-icon-circle-check';
      if (state === 'doing') return 'spin el-icon-loading';
      if (state === 'error') return 'el-icon-circle-close';
      return 'el-icon-time';
    },

    base64ToHex(b64) {
      const bin = atob(b64);
      let hex = '';
      for (let i = 0; i < bin.length; i++) hex += ('0' + bin.charCodeAt(i).toString(16)).slice(-2);
      return hex;
    },

    async ensureSm4Key(vmId, purpose) {
      const base = 'http://10.112.47.214:3000';
      try {
        const peek = await axios.get(`${base}/api/vm/send-key/response/${vmId}?purpose=${purpose}`, { timeout: 8000 });
        if (peek?.status === 200) return true;
      } catch (e) {
        if (e?.response?.status !== 404) throw e;
      }
      const r = await axios.post(`${base}/api/vm/send-key`, { vmId, purpose }, {
        headers: { 'Content-Type': 'application/json' }, timeout: 20000
      });
      return r?.status === 200;
    },

    onVmChange() {
      // VM 变更处理
    },

    onDeliveryMethodChange(asset) {
  asset.selectedFile = null;
  asset.flSmashedFile = null;
  asset.flLabelFile = null;
  asset.flBatchIndex = 0;
  asset.uploadProgress = '';
  asset.contractSendError = '';
},

onFlSmashedFileChange(asset, event) {
  asset.flSmashedFile = event.target.files?.[0] || null;
  event.target.value = '';
},

onFlLabelFileChange(asset, event) {
  asset.flLabelFile = event.target.files?.[0] || null;
  event.target.value = '';
},

canUploadAsset(asset) {
  if (!asset.contractSent || asset.uploading) {
    return false;
  }

  if (asset.deliveryMethod === 'federated') {
    return !!asset.flSmashedFile && !!asset.flLabelFile;
  }

  return !!asset.selectedFile;
},


   
  },
   async mounted() {
    await this.initUser();
    // 默认显示上传 TAB 时，加载卖家侧交易
    if (this.activeTab === 'assetUpload') {
      this.fetchRequestedAssets();
    } else if (this.activeTab === 'assetDownload') {
      this.refreshDownloadList();
    }
  }
}
</script>

<style scoped>

.fl-file-block {
  margin-bottom: 8px;
}

.fl-file-label {
  display: block;
  font-size: 12px;
  color: #555;
  margin-bottom: 4px;
}

.fl-batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
}

.fl-batch-input {
  width: 80px;
  height: 28px;
  padding: 2px 6px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}


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

.delivery-status-btn:hover {
  background: #bae7ff;
  border-color: #40a9ff;
}



/* 交易信息显示 */
.transaction-info {
  margin-top: 4px;
}

.transaction-info small {
  color: #666;
  font-size: 11px;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
}

/* 计算状态显示 */
.compute-status {
  margin-top: 2px;
}

.compute-status small {
  color: #999;
  font-size: 10px;
}

/* 下载时间显示 */
.download-time {
  margin-top: 4px;
}

.download-time small {
  color: #999;
  font-size: 10px;
}

/* 交易ID显示：缩小占用空间 */
.tx-id-text {
  font-family: monospace;
  font-size: 11px;
  padding: 0;
  border: none;
  background: transparent;
  word-break: break-all;
  display: inline-block;
  max-width: 140px;
}

/* 原来的 .transaction-id 如果其他地方还用，可以弱化一下 */
.transaction-id {
  font-family: monospace;
  font-size: 11px;
  background: transparent;
  padding: 0;
  border: none;
  word-break: break-all;
}

/* 资产哈希：允许一行内尽量展示，必要时换行 */
.hash-display-full {
  font-family: monospace;
  font-size: 11px;
  background: #f5f5f5;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid #e8e8e8;
  word-break: break-all;
}

.hash-text {
  display: inline-block;
  max-width: 100%;
}



/* 状态颜色 */
.status-available {
  color: #52c41a;
  font-weight: 500;
}

.status-processing {
  color: #faad14;
  font-weight: 500;
}

.status-error {
  color: #ff4d4f;
  font-weight: 500;
}

/* 哈希显示增强 */
.hash-display {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hash-display .el-icon-lock {
  font-size: 12px;
  color: #52c41a;
}

.hash-display .el-icon-loading {
  font-size: 12px;
  color: #e6a23c;
  animation: spin 1s linear infinite;
}



/* 新增计算元数据显示样式 */
.compute-metadata {
  margin-top: 4px;
}

.compute-metadata small {
  color: #666;
  font-size: 11px;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 3px;
}

/* 哈希显示增强 */
.hash-display {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hash-display .el-icon-lock {
  font-size: 12px;
}



/* 新增样式 - 数字资产上传和下载界面 */
.asset-upload-container,
.asset-download-container {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  margin: 20px 30px;
  box-shadow: 0 2px 4px rgba(0,0,0,.06);
}

.upload-header,
.download-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.upload-header h3,
.download-header h3 {
  margin: 0;
  color: #333;
  font-size: 18px;
  font-weight: 600;
}

.hash-display {
  font-family: monospace;
  background: #f5f5f5;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid #e8e8e8;
}

.buyer-info {
  text-align: left;
}

.buyer-info p {
  margin: 4px 0;
  font-size: 12px;
  line-height: 1.4;
}

.buyer-info strong {
  color: #666;
}

.contract-actions {
  display: flex;
  flex-direction: column;   /* 外层还是竖排，方便状态在下面 */
  gap: 6px;
  align-items: flex-start;
}

.contract-btn-row {
  display: flex;
  flex-direction: row;      /* 这一行按钮横向排 */
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
  background: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

.contract-btn.verify {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

.contract-btn.verify:disabled {
  background: #f5f5f5;
  color: #999;
  border-color: #d9d9d9;
  cursor: not-allowed;
}

.contract-btn.verify.verified {
  background: #52c41a;
  color: white;
  border-color: #52c41a;
}

.contract-btn:hover:not(:disabled) {
  opacity: 0.8;
  transform: translateY(-1px);
}

.verifying-status,
.error-status {
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
}

.verifying-status {
  color: #1890ff;
  background: #f0f7ff;
}

.error-status {
  color: #ff4d4f;
  background: #fff2f0;
}

.delivery-method {
  background: #f0f7ff;
  color: #1890ff;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid #d6e4ff;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.file-input {
  font-size: 12px;
  padding: 4px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}

.file-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.upload-btn {
  padding: 6px 12px;
  background: #1890ff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.upload-btn:hover:not(:disabled) {
  background: #096dd9;
  transform: translateY(-1px);
}

.upload-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
}

.selected-file {
  font-size: 11px;
  color: #666;
  word-break: break-all;
  padding: 4px 8px;
  background: #f9f9f9;
  border-radius: 4px;
  border-left: 3px solid #1890ff;
}

.upload-progress {
  font-size: 11px;
  color: #1890ff;
  font-weight: 500;
}

.download-btn {
  padding: 6px 12px;
  background: #52c41a;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.download-btn:hover:not(:disabled) {
  background: #389e0d;
  transform: translateY(-1px);
}

.download-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
}

.status-available {
  color: #52c41a;
  font-weight: 500;
}

.status-processing {
  color: #faad14;
  font-weight: 500;
}

.status-error {
  color: #ff4d4f;
  font-weight: 500;
}

/* 平台操作按钮 */
.platform-actions {
  margin: 20px 30px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .asset-upload-container,
  .asset-download-container {
    margin: 16px;
    padding: 16px;
  }
  
  .upload-header,
  .download-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .contract-actions {
    align-items: stretch;
  }
  
  .contract-btn {
    width: 100%;
  }
}

/* ============ 原有样式保持不变 ============ */

/* 步骤指示器样式 */
.steps-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #f5f5f5;
  border: 2px solid #d9d9d9;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #666;
  margin-bottom: 8px;
  transition: all 0.3s ease;
}

.step.active .step-number {
  background: #007bff;
  border-color: #007bff;
  color: white;
}

.step.completed .step-number {
  background: #52c41a;
  border-color: #52c41a;
  color: white;
}

.step-label {
  font-size: 14px;
  color: #666;
  font-weight: 500;
}

.step.active .step-label {
  color: #007bff;
  font-weight: 600;
}

.step.completed .step-label {
  color: #52c41a;
}

.step-connector {
  width: 80px;
  height: 2px;
  background: #d9d9d9;
  margin: 0 16px;
  position: relative;
  top: -16px;
}

.step-connector.completed {
  background: #52c41a;
}

.step-content {
  min-height: 300px;
}

.step-summary {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
}

.summary-item {
  margin-bottom: 8px;
  font-size: 14px;
}

.summary-item:last-child {
  margin-bottom: 0;
}

.status-success {
  color: #52c41a;
  font-weight: 600;
}

/* 合约校验相关样式 */
.contract-verify-section {
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 16px;
  background: #fafafa;
}

.contract-preview {
  margin-bottom: 12px;
  padding: 12px;
  background: white;
  border-radius: 4px;
  border-left: 3px solid #007bff;
}

.contract-preview h4 {
  margin: 0 0 8px 0;
  color: #007bff;
  font-size: 14px;
}

.preview-content p {
  margin: 4px 0;
  font-size: 13px;
}

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

.verify-button {
  background: #007bff;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.verify-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.verify-button:not(:disabled):hover {
  background: #0056b3;
}

.verify-tip {
  color: #ff4d4f;
  font-size: 12px;
  margin-top: 4px;
}

.spinner.small {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

/* 合约信息样式 */
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

/* 修改网格布局为两行两列 */
.vm-grid.two-by-two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 16px;
}

.vm-op {
  background: #f9fafb;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 120px;
  position: relative;
}

.vm-op-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.vm-op-title {
  font-weight: 600;
  font-size: 16px;
  color: #333;
  flex: 1;
}

/* 进度指示器样式 */
.progress-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-left: 8px;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

/* 空闲状态 - 灰色 */
.progress-indicator.idle {
  background: #e4e7ed;
  border: 2px solid #e4e7ed;
}

/* 处理中状态 - 黄色闪烁 */
.progress-indicator.processing {
  background: #e6a23c;
  border: 2px solid #e6a23c;
  animation: pulse 1.5s ease-in-out infinite;
  box-shadow: 0 0 10px rgba(230, 162, 60, 0.5);
}

/* 成功状态 - 绿色 */
.progress-indicator.success {
  background: #67c23a;
  border: 2px solid #67c23a;
  box-shadow: 0 0 10px rgba(103, 194, 58, 0.5);
}

/* 错误状态 - 红色 */
.progress-indicator.error {
  background: #f56c6c;
  border: 2px solid #f56c6c;
  box-shadow: 0 0 10px rgba(245, 108, 108, 0.5);
  animation: shake 0.5s ease-in-out;
}

.vm-op-desc {
  color: #666;
  font-size: 14px;
  line-height: 1.4;
}

.vm-op:hover {
  background: #eef5ff;
  border-color: #007bff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.15);
}

/* 脉冲动画 */
@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

/* 错误状态抖动动画 */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}

/* 保留原有交付界面布局和风格 */
.content { 
  padding: 20px; 
  flex: 1;
}

.title { 
  margin: 0; 
  padding: 10px 0 0 30px; 
  font-size: 24px; 
  color: #333; 
}

.actions { 
  display:flex; 
  gap:12px; 
  margin: 20px 30px; 
}

.action-btn {
  padding: 10px 18px;
  border: 1px solid #ddd;
  background:#f5f6fa;
  border-radius: 6px;
  cursor: pointer;
  color: #333;
  transition: all 0.2s ease;
  font-size: 14px;
  font-weight: 500;
}

.action-btn:hover {
  background: #f0f0f0;
}

.action-btn.active {
  background:#007bff;
  color:#fff;
  border-color:#007bff;
}

.action-btn.primary { 
  background:#007bff; 
  color:#fff; 
  border-color:#007bff; 
}

.card {
  background:#fff;
  border-radius:8px;
  margin: 20px 30px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,.06);
}

.vm-header { 
  display:flex; 
  justify-content: space-between; 
  align-items:center; 
  margin-bottom: 10px; 
}

.toolbar { 
  display:flex; 
  align-items:center; 
  gap:8px; 
  margin:10px 0 14px; 
}

.table-hover-row tbody tr:hover { 
  background-color:#eef5ff; 
}

.green-text { color: #28a745; }
.yellow-text { color: #ffc107; }
.red-text { color: #dc3545; }

/* modal、spinner */
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

.wide-modal { 
  width: 720px; 
}

.form-row { 
  display:flex; 
  gap:16px; 
  margin: 12px 0; 
}

.form-group { 
  flex:1; 
  display:flex; 
  flex-direction:column; 
}

.form-group label { 
  margin-bottom:6px; 
  color:#333; 
  font-weight: 500;
}

.form-group input, .form-group textarea {
  padding:10px;
  border:1px solid #ddd;
  border-radius:6px;
  font-size: 14px;
}

.form-group textarea { 
  min-height: 90px; 
  resize: vertical; 
}

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
  transition: background 0.2s ease;
}

.confirm-button:hover:not(:disabled) {
  background: #0056b3;
}

.confirm-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.cancel-button {
  background:#f5f6fa;
  color:#333;
  border:1px solid #ddd;
  padding:10px 16px;
  border-radius:6px;
  cursor:pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.cancel-button:hover:not(:disabled) {
  background: #e8e8e8;
}

.cancel-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

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
  border-radius:50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { 
  to { 
    transform: rotate(360deg); 
  } 
}

/* === 关键修改，保证侧边栏撑满、右侧自适应 === */
:root {
  --header-height: 60px;
  --sidebar-width: 220px;
}

.delivery {
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

:deep(.app-sidebar) {
  position: sticky;
  top: var(--header-height);
  height: calc(100vh - var(--header-height));
  flex-shrink: 0;
  width: var(--sidebar-width);
  background: #1f2329;
}

:global(html, body, #app) {
  height: 100%;
  margin: 0;
  padding: 0;
}

/* 资产上传部分 */
/* 隐藏默认列表圆点 */
.transaction-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* 基础样式：必填项标记 */
label.required::after {
  content: '*';
  color: #f5222d;
  margin-left: 2px;
}

/* 交易列表样式 */
.transaction-list {
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  max-height: 280px;
  overflow-y: auto;
  margin-top: 8px;
  background: #fff;
}

.transaction-item {
  padding: 12px 16px;
  border-bottom: 1px solid #f5f5f5;
  cursor: pointer;
  transition: background 0.2s;
}

.transaction-item:hover {
  background: #fafafa;
}

.transaction-item.selected {
  background: #e6f7ff;
  border-left: 3px solid #1890ff;
}

.transaction-item p {
  margin: 4px 0;
  font-size: 14px;
  color: #333;
}

.loading, .no-data {
  padding: 24px;
  text-align: center;
  color: #666;
  font-size: 14px;
}

.file-status-ok {
  color: #52c41a;
}

/* 已选文件名称 */
.selected-file-name {
  margin-top: 8px;
  padding: 6px 10px;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 13px;
  color: #666;
}

/* 上传状态样式 */
.upload-status {
  margin-top: 12px;
  padding: 10px;
  border-radius: 4px;
  font-size: 14px;
  display: flex;
  align-items: center;
}

.upload-status .icon {
  margin-right: 8px;
  font-size: 16px;
}

/* 状态图标：成功/加载/失败 */
.icon-success {
  color: #52c41a;
}

.icon-loading {
  color: #1890ff;
  animation: spin 1.5s linear infinite;
}

.icon-error {
  color: #f5222d;
}

/* 对方公钥展示 */
.peer-public-key {
  margin-top: 6px;
  padding: 6px;
  background: #f0f7ff;
  border-radius: 2px;
  font-size: 12px;
  color: #1890ff;
}

/* 表格样式 */
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

.styled-table tbody tr:last-child td {
  border-bottom: none;
}

/* 进度步骤样式 */
.progress-steps { 
  margin-top: 16px; 
  display: grid; 
  gap: 8px; 
}

.progress-step { 
  display: flex; 
  align-items: flex-start; 
  gap: 8px; 
  font-size: 13px; 
  padding: 8px;
  border-radius: 4px;
}

.progress-step .label { 
  font-weight: 500; 
  min-width: 160px;
}

.progress-step .detail { 
  margin-left: 0;
  color: #666; 
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; 
  font-size: 12px;
  flex: 1;
}

.progress-step.doing  { 
  background: #fffbe6;
  color: #8a6d3b; 
}

.progress-step.done   { 
  background: #f6ffed;
  color: #3c763d; 
}

.progress-step.error  { 
  background: #fff2f0;
  color: #a94442; 
}

.progress-step.idle {
  background: #fafafa;
  color: #666;
}

.icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon.ok { 
  color: #3c763d; 
}

.icon.spin { 
  animation: spin 1s linear infinite; 
}

.icon.error {
  color: #a94442;
}

.vm-header .right {
  display: flex;
  align-items: center;
  gap: 14px;
}

/* 移除右上角状态灯相关样式 */
.status-lights,
.lamp,
.lamp-label,
.bulbs,
.bulb {
  display: none;
}

/* 表单元素样式优化 */
.el-select, .el-input {
  width: 100%;
}

/* 响应式表格 */
@media (max-width: 768px) {
  .content {
    padding: 16px;
  }
  
  .title {
    padding: 10px 0 0 16px;
  }
  
  .actions {
    margin: 16px;
    flex-wrap: wrap;
  }
  
  .card {
    margin: 16px;
  }
  
  .vm-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .form-row {
    flex-direction: column;
    gap: 12px;
  }
  
  .modal-content {
    width: 95%;
    padding: 16px;
  }
  
  .wide-modal {
    width: 95%;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .vm-grid.two-by-two {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(4, 1fr);
    gap: 12px;
  }
  
  .steps-indicator {
    flex-direction: column;
    gap: 16px;
  }

  .step-connector {
    width: 2px;
    height: 40px;
    margin: 0;
  }
}

/* 滚动条样式 */
.transaction-list::-webkit-scrollbar,
.table-container::-webkit-scrollbar {
  width: 6px;
}

.transaction-list::-webkit-scrollbar-track,
.table-container::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.transaction-list::-webkit-scrollbar-thumb,
.table-container::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.transaction-list::-webkit-scrollbar-thumb:hover,
.table-container::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 表格单元格特殊样式 */
.styled-table td:nth-child(2) { /* 买家信息列 */
  min-width: 180px;
}

.styled-table td:nth-child(3) { /* 数字合约列 */
  min-width: 150px;
}

.styled-table td:nth-child(4) { /* 交付方法列 */
  min-width: 120px;
}

.styled-table td:nth-child(5) { /* 上传文件列 */
  min-width: 200px;
}


</style>
