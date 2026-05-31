<template>
  <div class="delivery">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />

      <div class="content">
        <h2 class="title">交付</h2>

        <!-- 顶部 3 个操作按钮 -->
        <div class="actions">
  <button class="action-btn"
          :class="{ active: activeTab === 'contract' }"
          @click="setActiveTab('contract'); openContractTip()">
    签约交付
  </button>
  <button class="action-btn"
          :class="{ active: activeTab === 'createVm' }"
          @click="setActiveTab('createVm'); openCreateVmFlow()">
    创建虚机
  </button>
  <button class="action-btn"
          :class="{ active: activeTab === 'openVm' }"
          @click="setActiveTab('openVm'); openVmPanel = true">
    打开虚机
  </button>
</div>


        <!-- ============ 创建虚机：弹窗① 选择订单 ============ -->
        <div v-if="orderModal.open" class="modal" @click.self="orderModal.open=false">
          <div class="modal-content wide-modal">
            <h3>选择交易订单</h3>

            <div class="toolbar">
              <el-select v-model="orderModal.filterStatus" placeholder="筛选状态(可选)" clearable style="width: 180px">
                <el-option label="已确认" value="已确认" />
                <el-option label="待确认" value="待确认" />
                <el-option label="已拒绝" value="已拒绝" />
              </el-select>
              <el-input
                v-model="orderModal.keyword"
                placeholder="按交易ID / 资产ID搜索"
                clearable style="width: 260px; margin-left: 10px"
              />
              <el-button type="primary" plain @click="loadOrders">刷新</el-button>
            </div>

            <div class="table-container" style="max-height: 360px; overflow:auto;">
              <table class="styled-table table-hover-row">
                <thead>
                  <tr>
                    <th style="width:60px;">选择</th>
                    <th>交易ID</th>
                    <th>资产ID</th>
                    <th>权益</th>
                    <th>数量</th>
                    <th>买家</th>
                    <th>卖家</th>
                    <th>状态</th>
                    <th>到期</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="o in filteredOrders"
                    :key="o.transaction_id + '-' + o.asset_id"
                    @click="toggleOrder(o)"
                    style="cursor:pointer"
                  >
                    <td>
                      <input type="checkbox" :checked="isPicked(o)" @change.stop="toggleOrder(o)" />
                    </td>
                    <td>{{ o.transaction_id }}</td>
                    <td>{{ o.asset_id }}</td>
                    <td>{{ o.quality || '-' }}</td>
                    <td>{{ o.quantity || '-' }}</td>
                    <td>{{ o.buyer_address }}</td>
                    <td>{{ o.seller_address }}</td>
                    <td :class="statusClass(o.status)">{{ o.status }}</td>
                    <td>{{ o.expiration_time || '-' }}</td>
                  </tr>
                  <tr v-if="orders.length===0">
                    <td colspan="9" style="color:#999">暂无订单</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="button-container">
              <button class="cancel-button" @click="orderModal.open=false">取消</button>
              <button class="confirm-button" :disabled="pickedOrders.length===0" @click="goModelStep">
                下一步（已选 {{ pickedOrders.length }} 条）
              </button>
            </div>
          </div>
        </div>

        <!-- ============ 创建虚机：弹窗② 选择模型/虚机类型 ============ -->
        <div v-if="modelModal.open" class="modal" @click.self="modelModal.open=false">
          <div class="modal-content wide-modal">
            <h3>选择计算方式（模型）与虚机类型</h3>

            <div class="form-row">
              <div class="form-group">
                <label>虚机名称</label>
                <input v-model.trim="modelModal.form.vmName" placeholder="例如：资产计算-1" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>虚机类型</label>
                <el-select v-model="modelModal.form.vmType" placeholder="请选择" style="width: 100%">
                  <el-option label="标准型 S2 (2C4G)" value="s2" />
                  <el-option label="计算增强型 C4 (4C8G)" value="c4" />
                  <el-option label="内存增强型 M8 (4C16G)" value="m8" />
                </el-select>
              </div>
              <div class="form-group">
                <label>镜像</label>
                <el-select v-model="modelModal.form.image" placeholder="请选择" style="width: 100%">
                  <el-option label="Ubuntu 22.04" value="ubuntu-22" />
                  <el-option label="CentOS 7" value="centos7" />
                  <el-option label="自定义镜像" value="custom" />
                </el-select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>计算方式（模型）</label>
                <el-select v-model="modelModal.form.model" placeholder="请选择" style="width: 100%">
                  <el-option label="隐私统计" value="privacy-stat" />
                  <el-option label="AI 推理" value="ai-infer" />
                  <el-option label="知识检索" value="rag" />
                </el-select>
              </div>
              <div class="form-group">
                <label>网络</label>
                <el-select v-model="modelModal.form.network" placeholder="请选择" style="width: 100%">
                  <el-option label="默认网络" value="default" />
                  <el-option label="隔离网络 A" value="net-a" />
                </el-select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>高级选项</label>
                <div>
                  <label style="margin-right:14px"><input type="checkbox" v-model="modelModal.form.autoStart" /> 创建后自动启动</label>
                  <label><input type="checkbox" v-model="modelModal.form.bindOrders" /> 将所选订单绑定到虚机</label>
                </div>
              </div>
            </div>

            <div class="button-container">
              <button class="cancel-button" @click="modelModal.open=false">上一步</button>
              <button class="confirm-button" :disabled="!canCreateVm" @click="createVm">
                确认创建
              </button>
            </div>
          </div>
        </div>

        <!-- ============ 打开虚机面板（四个功能） ============ -->
        <div v-if="openVmPanel" class="card">
          <div class="vm-header">
            <div class="left">
              <span>选择虚机：</span>
              <el-select v-model="activeVmId" placeholder="请选择虚机" @change="onVmChange" style="width: 260px">
                <el-option v-for="vm in vmList" :key="vm.id" :label="vm.name" :value="vm.id" />
              </el-select>
            </div>
            <div class="right">
  <el-button type="primary" plain @click="refreshVmList">刷新</el-button>

  <!--  
  <div class="status-lights">
    网络 
    <el-tooltip content="网络：在线/离线" placement="bottom">
      <div class="lamp" aria-label="网络状态">
        <span class="lamp-label">网络</span>
        <div class="bulbs">
          <span :class="bulbClass('net','red')" />
          <span :class="bulbClass('net','yellow')" />
          <span :class="bulbClass('net','green')" />
        </div>
      </div>
    </el-tooltip>

    计算 
    <el-tooltip content="计算：就绪/占用" placement="bottom">
      <div class="lamp" aria-label="计算状态">
        <span class="lamp-label">计算</span>
        <div class="bulbs">
          <span :class="bulbClass('compute','red')" />
          <span :class="bulbClass('compute','yellow')" />
          <span :class="bulbClass('compute','green')" />
        </div>
      </div>
    </el-tooltip>

    下载 
    <el-tooltip content="下载：可导出/无结果" placement="bottom">
      <div class="lamp" aria-label="下载状态">
        <span class="lamp-label">下载</span>
        <div class="bulbs">
          <span :class="bulbClass('download','red')" />
          <span :class="bulbClass('download','yellow')" />
          <span :class="bulbClass('download','green')" />
        </div>
      </div>
    </el-tooltip>
  </div>
  -->
</div>
          </div>

    <!--       
    <div class="vm-grid two-by-two">
      <div class="vm-op" @click="sendModal.open=true; fetchRequestedAssets()">
        <div class="vm-op-title">交易资产上传</div>
        <div class="vm-op-desc">上传交易的对应资产至该虚机</div>
      </div>
      <div class="vm-op" @click="assetModal.open=true">
        <div class="vm-op-title">管理资产</div>
        <div class="vm-op-desc">把资产挂载到虚机用于计算</div>
      </div>
      <div class="vm-op" @click="computeModal.open=true">
        <div class="vm-op-title">计算</div>
        <div class="vm-op-desc">选择模型参数并执行一次计算任务</div>
      </div>
      <div class="vm-op" @click="openExportModal()">
        <div class="vm-op-title">导出结果</div>
        <div class="vm-op-desc">把计算结果导出为文件</div>
      </div>
    </div>
  </div>
-->


     <!-- 修改这里：在每个功能模块旁边添加进度指示器 -->
          <div class="vm-grid two-by-two">
            <div class="vm-op" @click="startUploadOperation">
              <div class="vm-op-header">
                <div class="vm-op-title">交易资产上传</div>
                <div class="progress-indicator" :class="moduleStatus.upload"></div>
              </div>
              <div class="vm-op-desc">上传交易的对应资产至该虚机</div>
            </div>
            
            <div class="vm-op" @click="assetModal.open=true">
              <div class="vm-op-header">
                <div class="vm-op-title">管理资产</div>
                <div class="progress-indicator" :class="moduleStatus.manage"></div>
              </div>
              <div class="vm-op-desc">把资产挂载到虚机用于计算</div>
            </div>
            
            <div class="vm-op" @click="computeModal.open=true">
              <div class="vm-op-header">
                <div class="vm-op-title">计算</div>
                <div class="progress-indicator" :class="moduleStatus.compute"></div>
              </div>
              <div class="vm-op-desc">选择模型参数并执行一次计算任务</div>
            </div>
            
            <div class="vm-op" @click="openExportModal()">
              <div class="vm-op-header">
                <div class="vm-op-title">导出结果</div>
                <div class="progress-indicator" :class="moduleStatus.export"></div>
              </div>
              <div class="vm-op-desc">把计算结果导出为文件</div>
            </div>
          </div>
        </div>

        <!-- 资产上传 -->
        <div v-if="sendModal.open" class="modal" @click.self="sendModal.open=false">
          <div class="modal-content wide-modal">
            <h3>上传资产到虚机</h3>

            <!-- 1. 交易选择列表（保留原有逻辑，优化选中样式） -->
            <div class="form-row">
              <div class="form-group">
                <label class="required">选择交易记录</label>
                <div class="transaction-list">
                  <div v-if="isLoadingTransactions" class="loading">加载交易列表中...</div>
                  <div v-else-if="requestedAssets.length === 0" class="no-data">暂无可用交易记录</div>
                  <ul v-else>
                    <li 
                      v-for="asset in requestedAssets" 
                      :key="asset.transaction_id"
                      :class="{ 'transaction-item': true, 'selected': sendModal.selectedTransaction?.transaction_id === asset.transaction_id }"
                      @click="selectTransaction(asset)"
                    >
                      <p><strong>交易ID:</strong> {{ asset.transaction_id }}</p>
                      <p><strong>资产名称:</strong> {{ asset.asset_name }}</p>
                      <p><strong>价格:</strong> {{ asset.price }} ETH</p>
                      <p><strong>状态:</strong> <span class="file-status-ok">{{ asset.status }}</span></p>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- 2. 资产文件上传 -->
            <div class="form-row">
              <div class="form-group">
                <label class="required">上传资产文件</label>
                <input 
                  type="file" 
                  @change="onFile" 
                  accept=".xlsx,.xls,.csv"
                  :disabled="isUploadingFile"
                />
                <!-- 已选文件名称展示 -->
                <div v-if="sendModal.File" class="selected-file-name">
                  已选择：{{ sendModal.File.name }}
                </div>

                <!-- 3. 上传状态流转显示 -->
              </div>
            </div>

            <!-- 4. 操作按钮 -->
            <div class="button-container">
              <button 
                class="cancel-button" 
                @click="sendModal.open=false"
                :disabled="isUploadingFile"
              >
                取消
              </button>
              <button 
                class="confirm-button" 
                @click="sendKey"
                :disabled="!activeVmId || !sendModal.selectedTransaction || !sendModal.File || isUploadingFile"
              >
                <span v-if="!isUploadingFile">开始上传</span>
                <span v-else>上传中...</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 新增：合约信息显示弹窗 -->
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
     /* status: {
      net: 'green',       // 'green' | 'yellow' | 'red'
      compute: 'green',
      download: 'green',
      lampAnimating: false,   // 正在执行时序动画时为 true
    _lampTimers: [],        // 存放 setTimeout 的 id，便于清理
    },*/
     moduleStatus: {
      upload: 'idle',    // 上传交易文件 - 实际需要操作
      manage: 'idle',    // 管理资产 - 在上传成功后自动变亮
      compute: 'idle',   // 计算 - 在上传成功后自动变亮
      export: 'idle'     // 导出结果 - 实际需要操作
    },

      username: '',
      userId: '',
      isLoading: false,
       activeTab: 'createVm', // 默认高亮“创建虚机”

      // 行业映射（和你市场页一致）
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

      // 发送密钥
      sendModal: {
        open: false,
        File: null, // 仅保留文件上传（后端不接受前端传公钥）
        uploadStatus: '', // 上传状态流转：空→获取密钥→获取成功→加密数据→上传资产→上传成功
        selectedTransaction: null, // 选中的交易记录
        isKeySent: false, // 标记 /api/vm/send-key 是否调用成功（用于后续获取对方公钥）
        peerPublicKey: '' // 存储后端返回的「对方公钥」（用于前端状态展示，非加密用）
      },
      requestedAssets: [], // 交易列表数据
      isLoadingTransactions: false, // 交易列表加载状态
      isUploadingFile: false, // 资产上传中状态锁

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

      // ★ 新增：可导出清单 & 选择项
/*exportEligible: [],                 // [{transaction_id, asset_id, asset_name, result_files, result_count, ...}]
selectedExportTxId: null,           // 选择的交易 ID
selectedExportFile: '',             // 选择的具体文件名（可选）
isLoadingEligible: false,*/

       // 导出相关数据
    exportEligible: [],                 // 可导出的资产列表
    selectedExportTxId: null,           // 选择的交易 ID
    isLoadingEligible: false,           // 加载状态
    
    // 用户所有证书地址
    userCertAddresses: [],              // 存储用户所有证书地址

     // 合约信息显示
    contractInfo: {
      visible: false,
      data: null
    },
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
    }
  },
  methods: {

// 设置模块状态
  /*setModuleStatus(module, status) {
    if (this.moduleStatus[module] !== undefined) {
      this.moduleStatus[module] = status;
      
      // 如果是成功状态，3秒后恢复为idle
      if (status === 'success') {
        setTimeout(() => {
          this.moduleStatus[module] = 'idle';
        }, 3000);
      }
      
      // 如果是错误状态，5秒后恢复为idle
      if (status === 'error') {
        setTimeout(() => {
          this.moduleStatus[module] = 'idle';
        }, 5000);
      }
    }
  },*/

  setModuleStatus(module, status) {
  if (this.moduleStatus[module] !== undefined) {
    this.moduleStatus[module] = status;
    // 移除自动恢复 idle 的定时器，让状态保持常亮
  }
},
// 重置所有模块状态（在开始新上传时调用）
resetAllModuleStatus() {
  this.moduleStatus = {
    upload: 'idle',
    manage: 'idle', 
    compute: 'idle',
    export: 'idle'
  };
},

startUploadOperation() {
  // 点击上传时重置所有状态
  this.resetAllModuleStatus();
  this.sendModal.open = true; 
  this.fetchRequestedAssets();
},


    
     // 打开导出弹窗时加载可导出列表
  async openExportModal() {
    this.exportModal.open = true;
    await this.loadEligibleExports();
  },

  // 获取用户所有证书地址（复用你现有的逻辑）
  /*async getAllCertAddresses() {
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
      } catch (e) { 
        console.warn('证书或地址获取失败', e) 
      }
    }
    return [...new Set(res)]
  },*/

  // 加载可导出的资产列表（查询用户所有证书地址下的资产）
  async loadEligibleExports() {
    if (!this.activeVmId) { 
      this.$message?.error('请先选择虚机'); 
      return; 
    }
    
    this.isLoadingEligible = true;
    try {
      // 获取当前用户的所有证书地址（作为买家）
      const buyerAddresses = await this.getAllCertAddresses();
      if (buyerAddresses.length === 0) {
        this.$message?.error('未找到用户地址');
        return;
      }

      console.log('用户所有证书地址:', buyerAddresses);

      // 为每个地址查询可导出资产
      const allEligibleAssets = [];
      
      for (const buyerAddress of buyerAddresses) {
        try {
          const r = await axios.get('http://10.112.47.214:3000/api/vm/export/eligible', {
            params: { 
              vmId: '1', // 固定为1
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

      // 去重（基于 transaction_id）
      this.exportEligible = allEligibleAssets.filter((asset, index, self) => 
        index === self.findIndex(a => a.transaction_id === asset.transaction_id)
      );
      
      // 自动选择逻辑
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

  // 保存资产记录（在文件上传成功后调用）
  async saveAssetRecord() {
    try {
      const transaction = this.sendModal.selectedTransaction;
      if (!transaction) return;

      const payload = {
        vmId: '1', // 固定为1
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
  },

  // 更新计算状态
  /*async updateComputeStatus(transactionId, status) {
    try {
      const response = await axios.post('http://10.112.47.214:3000/api/vm/asset/compute-status', {
        vmId: '1', // 固定为1
        transactionId: transactionId,
        status: status
      });
      
      if (response.data?.success) {
        console.log(`计算状态更新为: ${status}`);
      } else {
        console.error('计算状态更新失败:', response.data?.message);
      }
    } catch (error) {
      console.error('更新计算状态失败:', error);
    }
  },*/


     /*openExportModal() {
    this.exportModal.open = true;
    this.loadEligibleExports();   // ★ 拉取当前用户在该 VM 的可导出条目
  },
  async loadEligibleExports() {
    if (!this.activeVmId) { this.$message?.error('请先选择虚机'); return; }
    this.isLoadingEligible = true;
    try {
      const r = await axios.get('http://10.112.47.214:3000/api/vm/export/eligible', {
        params: { vmId: this.activeVmId }
      });
      this.exportEligible = r.data?.items || [];
      // 如果只有一条、且只有一个文件，帮用户预选
      if (this.exportEligible.length === 1) {
        this.selectedExportTxId = this.exportEligible[0].transaction_id;
        if ((this.exportEligible[0].result_files || []).length === 1) {
          this.selectedExportFile = this.exportEligible[0].result_files[0];
        }
      } else {
        this.selectedExportTxId = null;
        this.selectedExportFile = '';
      }
    } catch (e) {
      console.error('加载可导出清单失败', e);
      this.exportEligible = [];
      this.$message?.error('加载可导出条目失败');
    } finally {
      this.isLoadingEligible = false;
    }
  },*/


    clearLampTimers() {
    (this.status._lampTimers || []).forEach(id => clearTimeout(id)); // **改动**
    this.status._lampTimers = [];                                     // **改动**
    this.status.lampAnimating = false;                                // **改动**
  },

  // ✅ 修复：同上，全部改为 this.status.*
  scheduleLampSequence(keys, steps) {
    this.clearLampTimers();
    this.status.lampAnimating = true;                                 // **改动**

    let delay = 0;
    steps.forEach(step => {
      const id = setTimeout(() => {
        keys.forEach(k => this.setLamp(k, step.color));
        if (step.done) this.status.lampAnimating = false;             // **改动**
      }, delay);
      this.status._lampTimers.push(id);                               // **改动**
      delay += (step.after || 0);
    });
  },

  // ✅ 修复：这里判断动画中状态也要从 status 里取
  refreshVmStatus() {
    if (this.status.lampAnimating) return;                            // **改动**

    // 网络：选了 vm 就置绿，否则红
    this.status.net = this.activeVmId ? 'green' : 'red';

    // 计算：上传/计算中给黄，否则绿
    this.status.compute = (this.isUploadingFile || this.computeModal.open) ? 'yellow' : 'green';

    // 下载：有 vm 且不是上传中默认绿；若没有 vm 红
    this.status.download = this.activeVmId ? (this.isUploadingFile ? 'yellow' : 'green') : 'red';
  },


  /** ⬇️ 新增：上传成功后的灯光流程（红10s→黄2s→绿） **/
  startUploadLampFlow() {
    this.scheduleLampSequence(
      ['compute','download'],
      [
        { color: 'red',    after: 0 },        // 立刻红
        { color: 'red', after: 3000 },    // 10 秒后变黄
        { color: 'yellow', after: 1000 },    // 10 秒后变黄
        { color: 'green',  after: 2000, done: true }, // 再过 2 秒变绿并解锁
      ]
    );
  },
    bulbClass(key, color) {
    const on = this.status[key] === color
    return [
      'bulb',
      on ? `on ${color}` : 'off'
    ].join(' ')
  },
  setLamp(key, to) {
    if (!['net','compute','download'].includes(key)) return
    if (!['green','yellow','red'].includes(to)) return
    this.status[key] = to
  },
  onVmChange() {
    this.refreshVmStatus()
  },

  // 在合适的节点也刷新一下（如上传/计算开始与结束时）
  // 举例：开始上传置 compute=yellow、download=yellow；完成后改回绿
  // 在 sendFileAndJson 的 try/finally 里分别调用 setLamp/refreshVmStatus 即可


    
    // 放到 Vue 组件的 methods 里
    
async ensureSm4Key(vmId, purpose) {
  const base = 'http://10.112.47.214:3000';
  try {
    // 先探测缓存（如果有就不再请求对端）
    const peek = await axios.get(`${base}/api/vm/send-key/response/${vmId}?purpose=${purpose}`, { timeout: 8000 });
    if (peek?.status === 200) return true; // 已有且未过期
  } catch (e) {
    // 404 表示未命中缓存，继续去要
    if (e?.response?.status !== 404) throw e;
  }
  // 没有缓存 → 现在去对端申请并在后端落缓存（按 purpose 分桶）
  const r = await axios.post(`${base}/api/vm/send-key`, { vmId, purpose }, {
    headers: { 'Content-Type': 'application/json' }, timeout: 20000
  });
  return r?.status === 200;
},
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
  return 'el-icon-time'; // idle
},
base64ToHex(b64) {
  const bin = atob(b64);
  let hex = '';
  for (let i = 0; i < bin.length; i++) hex += ('0' + bin.charCodeAt(i).toString(16)).slice(-2);
  return hex;
},

  

    setActiveTab(tab) {
    this.activeTab = tab
  },
    // ========== 通用 ==========
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
      // 拉 userId
      const r = await axios.post('http://10.112.47.214:3000/api/get-user-id', { username: this.username })
      this.userId = String(r.data.id || '')
    },

    // ========== 顶部按钮 ==========
    openContractTip() {
      this.$message?.info('此处可放合同/免责声明弹窗，确认后继续。')
    },

    async openCreateVmFlow() {
      if (!this.userId) await this.initUser()
      await this.loadOrders()
      this.orderModal.open = true
    },

    // ========== 订单收集 ==========
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
        // 只保留与创建虚机相关的订单（通常已确认）
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

        // TODO：把这里换成你们真实创建接口
        const r = await axios.post('http://10.112.47.214:3000/api/vm/create', payload)

        this.$message?.success('虚机创建成功')
        this.modelModal.open = false
        this.openVmPanel = true
        await this.refreshVmList()
        // 选中新建的虚机（如果接口返回 id/name）
        if (r?.data?.vmId) this.activeVmId = r.data.vmId
      } catch (e) {
        console.error('创建虚机失败', e)
        this.$message?.error('创建虚机失败')
      } finally {
        this.isLoading = false
      }
    },

    // ========== 打开虚机面板 ==========
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
    // onVmChange() {},

    // 发送密钥
    async fetchRequestedAssets() {
      if (!this.userId) await this.initUser(); // 确保有 userId
      this.isLoadingTransactions = true; // 显示加载状态
      try {
        const certLists = [];

        // 获取 org1 证书
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

        // 获取 org2 证书
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

            // 修改后的代码（查询卖方交易）
            const txRes = await axios.get(`http://10.112.47.214:3000/api/seller-transaction-status/${certAddr}`);
            if (txRes.status !== 200 || !Array.isArray(txRes.data.transactions)) continue;

            // 格式化交易数据
            const formattedTxs = txRes.data.transactions
            .filter(tx => tx.status === '已确认')
            .map(tx => ({
              transaction_id: tx.transaction_id,
              asset_name: `Asset ${tx.transaction_id}`,
              price: 1.5,
              file_hash: tx.asset_id,
              status: tx.status,
              seller_address: tx.seller_address,
              buyer_address: tx.buyer_address,
              quantity: tx.quantity,
            }));
            allTransactions.push(...formattedTxs);
          } catch (err) {
            console.error(`处理证书 ${cert} 失败:`, err);
          }
        }

        this.requestedAssets = allTransactions; // 赋值到交易列表
      } catch (error) {
        console.error('获取交易列表失败:', error);
        this.$message.error('加载交易列表失败');
      } finally {
        this.isLoadingTransactions = false; // 关闭加载状态
      }
    },

    // 选择交易记录
    selectTransaction(asset) {
      this.sendModal.selectedTransaction = asset;
    },

    // 处理上传文件选择
    onFile(e) {
      this.sendModal.File = e.target.files?.[0] || null;
      e.target.value = '';
    },

    // 获取上传状态图标
    getUploadStatusIcon() {
      const status = this.sendModal.uploadStatus;
      if (status.includes('失败')) return 'icon-error';
      if (status.includes('加载') || status.includes('正在')) return 'icon-loading';
      if (status.includes('成功')) return 'icon-success';
      return '';
    },
    

   /* async sendKey() {
      if (!this.activeVmId) { this.$message.error('请先选择目标虚拟机'); return; }
  if (!this.sendModal.selectedTransaction) { this.$message.error('请选择要上传的交易记录'); return; }
  if (!this.sendModal.File) { this.$message.error('请选择要上传的资产文件'); return; }

  this.resetUploadState({ file: true, tx: true });

  this.sendModal.open = true;
  this.sendModal.uploadStatus = '正在获取密钥...';

  try {
    // 重置步骤
    this.resetUploadState();
    // 重新填充已选内容
    this.sendModal.open = true;
    this.sendModal.File = this.sendModal.File || null; // 已在外层赋值的忽略
    this.sendModal.selectedTransaction = this.sendModal.selectedTransaction || null;

    this.sendModal.uploadStatus = '正在获取密钥...';

    // 1) 发送公钥 → doing
    this.markStep('send_pubkey', 'doing');
    const res = await axios.post(
      'http://10.112.47.214:3000/api/vm/send-key',
      { vmId: this.activeVmId },
      { timeout: 20000 }
    );
    if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
    // 1) done
    this.markStep('send_pubkey', 'done');
    // 2) 接收加密公钥成功（后端到对端往返成功）
    this.markStep('recv_enc_key', 'done');

    // 2.1) 拉取缓存详情，拿到 sm4KeyB64
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

      // 3) 解密成功 + 显示密钥
      const detail = `
        <div>Base64：<code>${this.sendModal.sm4KeyBase64}</code></div>
        <div>Hex：<code>${this.sendModal.sm4KeyHex}</code></div>
        ${this.sendModal.keyExpiresAt ? `<div>缓存到期：${this.sendModal.keyExpiresAt}</div>` : '' }
      `;
      this.markStep('decrypt_sm4', 'done', detail);

      this.sendModal.uploadStatus = '密钥获取成功（已缓存 SM4 16B）';
      this.sendModal.isKeySent = true;
      this.$message.success('密钥获取成功，准备生成交易JSON并上传资产');

      setTimeout(() => this.sendFileAndJson(), 600);
    } else {
      const note = payload.note || '未返回 16B 密钥';
      const dump = payload.dumpPath ? `（明文已写入：${payload.dumpPath}）` : '';
      this.markStep('decrypt_sm4', 'error', `<div>${note}${dump}</div>`);
      this.sendModal.uploadStatus = `未获取到 16B 的 SM4 密钥：${note}${dump}`;
      this.$message.warning(this.sendModal.uploadStatus);
    }
  } catch (err) {
    const errorMsg = err?.response?.data?.message || err?.message || '获取密钥失败';
    this.markStep('send_pubkey', 'error');
    this.markStep('recv_enc_key', 'error');
    this.markStep('decrypt_sm4', 'error', `<div>${errorMsg}</div>`);
    console.error('send-key 接口异常:', errorMsg);
    this.sendModal.uploadStatus = `获取密钥失败：${errorMsg}`;
    this.$message.error(`获取密钥失败：${errorMsg}`);
  }
},*/

/*async sendFileAndJson() {
  if (!this.sendModal.isKeySent) { this.$message.error('请先完成密钥获取步骤'); return; }
  if (this.isUploadingFile) return;

  const transaction = this.sendModal.selectedTransaction;
  const vmId = this.activeVmId;
  const file = this.sendModal.File;
  if (!file) { this.$message.error('请选择要上传的文件'); return; }

  try {
    this.isUploadingFile = true;

    // —— 生成交易 JSON（保持你原逻辑）——
    this.sendModal.uploadStatus = '正在生成交易JSON...';
    const transactionId = transaction.transaction_id;
    if (!transactionId) throw new Error('缺少 transaction_id，无法生成JSON');

    const txDetailRes = await axios.get(`http://10.112.47.214:3000/api/get-transaction-detail/${transactionId}`);
    const tx = txDetailRes?.data?.transaction;
    if (!tx) throw new Error('未获取到交易详情');

    const assetId = tx.asset_id || transaction.file_hash;
    const assetRes = await axios.get(`http://10.112.47.214:3000/api/asset/${assetId}`);
    const assetInfo = assetRes?.data || {};

    const ops = (tx.quality || '').split(',').map(s => s.trim()).filter(Boolean).map(s => (s === '所有权' ? '所有' : s));

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
    const jsonString = JSON.stringify(contractObj);

    // —— 阶段1：预热 purpose=json 的密钥 + 发送 JSON —— 
    this.sendModal.uploadStatus = '正在加密并发送交易JSON...';
    this.markStep('encrypt_asset', 'doing', '<div>JSON阶段：SM4加密并上送</div>');

    await this.ensureSm4Key(vmId, 'json'); // ★ 关键：确保有 purpose=json 的缓存

    const jsonRes = await axios.post(
      'http://10.112.47.214:3000/api/vm/send-json',
      { vmId, purpose: 'json', json: jsonString }, // ★ 显式带上 purpose
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

    // —— 阶段2：预热 purpose=file 的密钥 + 发送文件 —— 
    this.sendModal.uploadStatus = '正在加密并上传文件...';
    this.markStep('encrypt_asset', 'doing', '<div>文件阶段：SM4加密并上送</div>');

    await this.ensureSm4Key(vmId, 'file'); // ★ 关键：确保有 purpose=file 的缓存

    const formData = new FormData();
    formData.append('vmId', vmId);
    formData.append('purpose', 'file'); // ★ 显式带上 purpose
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

 // ★ 新增：保存资产记录到数据库
    await this.saveAssetRecord();

      this.sendModal.uploadStatus = 'JSON 与 文件均已上传成功！';
      this.$message.success('交易JSON与文件已分别加密并上传成功');



this.startUploadLampFlow();

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
  } finally {
    this.isUploadingFile = false;
  }
},*/

// 保留已选 File 与 selectedTransaction（默认 true）
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
      { key: 'send_pubkey',        label: '1. 发送公钥成功',          state: 'idle', detail: '' },
      { key: 'recv_enc_key',       label: '2. 接收加密公钥成功',      state: 'idle', detail: '' },
      { key: 'decrypt_sm4',        label: '3. 解密成功，SM4秘钥为：', state: 'idle', detail: '' },
      { key: 'encrypt_asset',      label: '4. 加密资产成功',          state: 'idle', detail: '' },
      { key: 'haiguang_accepted',  label: '5. 海光已接收加密资产',    state: 'idle', detail: '' },
    ]
  };
  this.requestedAssets = [];
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

    /*
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

    // 计算
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

    // 导出
    async exportResult() {
  try {
    const payload = {
      vmId: this.activeVmId,
      format: this.exportForm.format,   // 'zip' | 'csv' | 'json' | 'txt' | 'pdf' ...
      filename: this.exportForm.filename || 'result',
      purpose: 'export',                // 建议：用于后端区分日志
      transaction_id: this.selectedExportTxId,  // ★ 关键：带交易 ID
      file: this.selectedExportFile || undefined // ★ 可选：带具体文件名
    }
    const r = await axios.post('http://10.112.47.214:3000/api/vm/export', payload, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([r.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `${payload.filename}.${payload.format}`
    a.click()
    URL.revokeObjectURL(url)
    this.$message?.success('导出成功')
    this.exportModal.open = false
  } catch (e) {
    console.error('导出失败', e)
    this.$message?.error('导出失败')
  }
}
  },*/

   // 修改上传相关方法，添加状态更新
  async sendKey() {
     // 开始上传时设置上传状态为处理中
  this.setModuleStatus('upload', 'processing');
  
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

    this.setModuleStatus('upload', 'processing');
    
    // 原有的 sendKey 方法内容保持不变
    this.resetUploadState({ file: true, tx: true });
    this.sendModal.open = true;
    this.sendModal.uploadStatus = '正在获取密钥...';

    try {
      // 重置步骤
      this.resetUploadState();
      // 重新填充已选内容
      this.sendModal.open = true;
      this.sendModal.File = this.sendModal.File || null;
      this.sendModal.selectedTransaction = this.sendModal.selectedTransaction || null;

      this.sendModal.uploadStatus = '正在获取密钥...';

      // 1) 发送公钥 → doing
      this.markStep('send_pubkey', 'doing');
      const res = await axios.post(
        'http://10.112.47.214:3000/api/vm/send-key',
        { vmId: this.activeVmId },
        { timeout: 20000 }
      );
      if (res.status !== 200) throw new Error(`状态码 ${res.status}`);
      // 1) done
      this.markStep('send_pubkey', 'done');
      // 2) 接收加密公钥成功（后端到对端往返成功）
      this.markStep('recv_enc_key', 'done');

      // 2.1) 拉取缓存详情，拿到 sm4KeyB64
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

        // 3) 解密成功 + 显示密钥
        const detail = `
          <div>Base64：<code>${this.sendModal.sm4KeyBase64}</code></div>
          <div>Hex：<code>${this.sendModal.sm4KeyHex}</code></div>
          ${this.sendModal.keyExpiresAt ? `<div>缓存到期：${this.sendModal.keyExpiresAt}</div>` : '' }
        `;
        this.markStep('decrypt_sm4', 'done', detail);

        this.sendModal.uploadStatus = '密钥获取成功（已缓存 SM4 16B）';
        this.sendModal.isKeySent = true;
        this.$message.success('密钥获取成功，准备生成交易JSON并上传资产');

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
  
 /*async sendFileAndJson() {
    if (!this.sendModal.isKeySent) { 
      this.$message.error('请先完成密钥获取步骤'); 
      this.setModuleStatus('upload', 'error');
      return; 
    }
    if (this.isUploadingFile) return;

    const transaction = this.sendModal.selectedTransaction;
    const vmId = this.activeVmId;
    const file = this.sendModal.File;
    if (!file) { 
      this.$message.error('请选择要上传的文件'); 
      return; 
    }

    try {
      this.isUploadingFile = true;
      this.setModuleStatus('upload', 'processing');
      
      // —— 生成交易 JSON（保持你原逻辑）——
      this.sendModal.uploadStatus = '正在生成交易JSON...';
      const transactionId = transaction.transaction_id;
      if (!transactionId) throw new Error('缺少 transaction_id，无法生成JSON');

      const txDetailRes = await axios.get(`http://10.112.47.214:3000/api/get-transaction-detail/${transactionId}`);
      const tx = txDetailRes?.data?.transaction;
      if (!tx) throw new Error('未获取到交易详情');

      const assetId = tx.asset_id || transaction.file_hash;
      const assetRes = await axios.get(`http://10.112.47.214:3000/api/asset/${assetId}`);
      const assetInfo = assetRes?.data || {};

      const ops = (tx.quality || '').split(',').map(s => s.trim()).filter(Boolean).map(s => (s === '所有权' ? '所有' : s));

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
      const jsonString = JSON.stringify(contractObj);

      // —— 阶段1：预热 purpose=json 的密钥 + 发送 JSON —— 
      this.sendModal.uploadStatus = '正在加密并发送交易JSON...';
      this.markStep('encrypt_asset', 'doing', '<div>JSON阶段：SM4加密并上送</div>');

      await this.ensureSm4Key(vmId, 'json'); // ★ 关键：确保有 purpose=json 的缓存

      const jsonRes = await axios.post(
        'http://10.112.47.214:3000/api/vm/send-json',
        { vmId, purpose: 'json', json: jsonString }, // ★ 显式带上 purpose
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

      // —— 阶段2：预热 purpose=file 的密钥 + 发送文件 —— 
      this.sendModal.uploadStatus = '正在加密并上传文件...';
      this.markStep('encrypt_asset', 'doing', '<div>文件阶段：SM4加密并上送</div>');

      await this.ensureSm4Key(vmId, 'file'); // ★ 关键：确保有 purpose=file 的缓存

      const formData = new FormData();
      formData.append('vmId', vmId);
      formData.append('purpose', 'file'); // ★ 显式带上 purpose
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

        // ★ 新增：保存资产记录到数据库
        await this.saveAssetRecord();

        this.sendModal.uploadStatus = 'JSON 与 文件均已上传成功！';
        this.setModuleStatus('upload', 'success');
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
  },*/

  async sendFileAndJson() {
  if (!this.sendModal.isKeySent) { 
    this.$message.error('请先完成密钥获取步骤'); 
    this.setModuleStatus('upload', 'error');
    return; 
  }
  if (this.isUploadingFile) return;

  const transaction = this.sendModal.selectedTransaction;
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
    
    // —— 生成交易 JSON（保持你原逻辑）——
    this.sendModal.uploadStatus = '正在生成交易JSON...';
    const transactionId = transaction.transaction_id;
    if (!transactionId) throw new Error('缺少 transaction_id，无法生成JSON');

    const txDetailRes = await axios.get(`http://10.112.47.214:3000/api/get-transaction-detail/${transactionId}`);
    const tx = txDetailRes?.data?.transaction;
    if (!tx) throw new Error('未获取到交易详情');

    const assetId = tx.asset_id || transaction.file_hash;
    const assetRes = await axios.get(`http://10.112.47.214:3000/api/asset/${assetId}`);
    const assetInfo = assetRes?.data || {};

    const ops = (tx.quality || '').split(',').map(s => s.trim()).filter(Boolean).map(s => (s === '所有权' ? '所有' : s));

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
    const jsonString = JSON.stringify(contractObj);

    // ★ 新增：显示合约信息
    this.showContractInfo(contractObj);

    // —— 阶段1：预热 purpose=json 的密钥 + 发送 JSON —— 
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

    // —— 阶段2：预热 purpose=file 的密钥 + 发送文件 —— 
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

      // ★ 新增：保存资产记录到数据库
      await this.saveAssetRecord();

      // ★ 关键修改：上传成功后，自动点亮管理和计算模块
      this.setModuleStatus('upload', 'success');
      this.setModuleStatus('manage', 'success');
      this.setModuleStatus('compute', 'success');

      this.sendModal.uploadStatus = 'JSON 与 文件均已上传成功！';
      this.$message.success('交易JSON与文件已分别加密并上传成功');

      setTimeout(() => {
        this.sendModal.open = false;
        this.resetUploadState();
        // 上传完成后关闭合约信息弹窗
        //this.contractInfo.visible = false;
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



  // 修改管理资产方法
  /*async mountAssets() {
    try {
      this.setModuleStatus('manage', 'processing');
      const payload = {
        vmId: this.activeVmId,
        assets: this.pickedAssets.map(a => a.file_hash)
      }
      await axios.post('http://10.112.47.214:3000/api/vm/mount-assets', payload)
      this.setModuleStatus('manage', 'success');
      this.$message?.success('已挂载到虚机')
      this.assetModal.open = false
    } catch (e) {
      this.setModuleStatus('manage', 'error');
      console.error('挂载资产失败', e)
      this.$message?.error('挂载资产失败')
    }
  },


  // 修改计算方法
  async runCompute() {
    try {
      this.setModuleStatus('compute', 'processing');
      const payload = {
        vmId: this.activeVmId,
        model: this.computeForm.model,
        params: this.computeForm.params
      }
      await axios.post('http://10.112.47.214:3000/api/vm/compute', payload)
      this.setModuleStatus('compute', 'success');
      this.$message?.success('计算任务已提交')
      this.computeModal.open = false
    } catch (e) {
      this.setModuleStatus('compute', 'error');
      console.error('提交计算失败', e)
      this.$message?.error('提交计算失败')
    }
  },*/

  // 修改管理资产方法（移除状态更新）
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

// 修改计算方法（移除状态更新）
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

  // 修改导出方法
  /*async exportResult() {
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
  },*/

  // 开始导出操作
startExportOperation() {
  this.exportModal.open = true;
  this.openExportModal();
},

async exportResult() {
  try {
    // 开始导出时设置导出状态为处理中
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
    
    // 导出成功
    this.setModuleStatus('export', 'success');
    this.$message?.success('导出成功')
    this.exportModal.open = false
  } catch (e) {
    // 导出失败
    this.setModuleStatus('export', 'error');
    console.error('导出失败', e)
    this.$message?.error('导出失败')
  }
},

// 管理资产点击事件（无实际操作，只打开弹窗）
startManageOperation() {
  this.assetModal.open = true;
},

// 计算点击事件（无实际操作，只打开弹窗）
startComputeOperation() {
  this.computeModal.open = true;
},

// 显示合约信息
showContractInfo(contractData) {
  this.contractInfo.data = contractData;
  this.contractInfo.visible = true;
  
  
  /*setTimeout(() => {
    this.contractInfo.visible = false;
  }, 5000);*/

},

// 关闭合约信息
closeContractInfo() {
  this.contractInfo.visible = false;
},

// 日期格式化方法
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

  async mounted() {
  await this.initUser()
  this.refreshVmStatus()
}
}
}

</script>

<style scoped>

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

/* 响应式调整 */
@media (max-width: 768px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
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

/* 响应式设计 */
@media (max-width: 768px) {
  .vm-grid {
    grid-template-columns: 1fr;
    grid-template-rows: repeat(4, 1fr);
    gap: 12px;
  }
  
  .vm-op {
    min-height: 100px;
    padding: 16px;
  }
  
  .vm-op-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .progress-indicator {
    margin-left: 0;
    margin-top: 4px;
  }
}

/* 保留原有交付界面布局和风格 */
.content { padding: 20px; }
.title { margin: 0; padding: 10px 0 0 30px; font-size: 24px; color: #333; }
.actions { display:flex; gap:12px; margin: 20px 30px; }
.action-btn {
  padding: 10px 18px;
  border: 1px solid #ddd;
  background:#f5f6fa;
  border-radius: 6px;
  cursor: pointer;
}
.action-btn.primary { background:#007bff; color:#fff; border-color:#007bff; }
.card {
  background:#fff;
  border-radius:8px;
  margin: 20px 30px;
  padding: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,.06);
}

.vm-header { display:flex; justify-content: space-between; align-items:center; margin-bottom: 10px; }

.toolbar { display:flex; align-items:center; gap:8px; margin:10px 0 14px; }
.table-hover-row tbody tr:hover { background-color:#eef5ff; }

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
}
.wide-modal { width: 720px; }
.form-row { display:flex; gap:16px; margin: 12px 0; }
.form-group { flex:1; display:flex; flex-direction:column; }
.form-group label { margin-bottom:6px; color:#333; }
.form-group input, .form-group textarea {
  padding:10px;
  border:1px solid #ddd;
  border-radius:6px;
}
.form-group textarea { min-height: 90px; resize: vertical; }

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
}
.cancel-button {
  background:#f5f6fa;
  color:#333;
  border:1px solid #ddd;
  padding:10px 16px;
  border-radius:6px;
  cursor:pointer;
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
@keyframes spin { to { transform: rotate(360deg); } }

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

.content {
  flex: 1;
  padding: 20px;
  background: #F5F6FA;
}

:global(html, body, #app) {
  height: 100%;
}

.action-btn {
  padding: 10px 18px;
  border: 1px solid #ddd;
  background:#fff;
  border-radius: 6px;
  cursor: pointer;
  color: #333;
  transition: all 0.2s ease;
}
.action-btn:hover {
  background: #f0f0f0;
}
.action-btn.active {
  background:#007bff;
  color:#fff;
  border-color:#007bff;
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
  content: '✓';
}
.icon-loading {
  color: #1890ff;
  content: '⟳';
  animation: spin 1.5s linear infinite;
}
.icon-error {
  color: #f5222d;
  content: '✗';
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

/* 按钮样式优化 */
.button-container {
  margin-top: 20px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
.confirm-button:disabled, .cancel-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 加载动画 */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.progress-steps { margin-top: 8px; display: grid; gap: 6px; }
.progress-step { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.progress-step .label { font-weight: 500; }
.progress-step .detail { margin-left: 26px; color: #666; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.progress-step.doing  { color: #8a6d3b; }
.progress-step.done   { color: #3c763d; }
.progress-step.error  { color: #a94442; }
.icon.ok { color: #3c763d; }
.icon.spin { animation: spin 1s linear infinite; }

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
</style>