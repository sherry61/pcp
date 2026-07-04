<template>
  <div class="delivery">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />

      <div class="content">
        <div class="page-header">
          <div>
            <h2 class="title">资产交付</h2>
          </div>
          <el-button type="primary" plain @click="fetchRequestedAssets" :loading="isLoadingTransactions">
            刷新交付状态
          </el-button>
        </div>

        <div class="asset-upload-container">
          <el-table class="delivery-table" :data="pagedRequestedAssets" border v-loading="isLoadingTransactions" style="width: 100%">
            <el-table-column
              prop="transaction_id"
              label="交易ID"
              width="250"
              align="center"
              header-align="center"
              show-overflow-tooltip
            />

            <el-table-column label="交付状态" width="250" align="center" header-align="center">
              <template #default="{ row }">
                <el-tag :class="['status-pill', getStatusPillClass(row)]" effect="plain">
                  {{ getStatusText(row) }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column label="数字合约" width="250" align="center" header-align="center">
              <template #default="{ row }">
                <el-button size="small" text class="contract-link" @click="viewContract(row)">
                  <span>查看合约</span>
                </el-button>
              </template>
            </el-table-column>

            <el-table-column label="操作" min-width="432" align="center" header-align="center">
              <template #default="{ row }">
                <div class="action-cell">
                  <el-button
                    v-if="isHeRow(row)"
                    size="small"
                    type="primary"
                    :class="['action-btn-primary', { 'action-btn-disabled-primary': isSellerHeDeliveryDisabled(row) }]"
                    :loading="row.checkingHe"
                    :disabled="isSellerHeDeliveryDisabled(row)"
                    @click="openHeDelivery(row)"
                  >
                    {{ getSellerHeActionLabel(row) }}
                  </el-button>
                  <el-button
                    v-if="isFlRow(row)"
                    size="small"
                    type="primary"
                    :class="['action-btn-primary', { 'action-btn-disabled-primary': isSellerFlDeliveryDisabled(row) }]"
                    :loading="row.processingFl || row.uploadingFlBatch || row.checkingFl"
                    :disabled="isSellerFlDeliveryDisabled(row)"
                    @click="openFlDeliveryDialog(row)"
                  >
                    {{ getSellerFlDeliveryActionLabel(row) }}
                  </el-button>
                  <el-button v-if="isPreRow(row)" size="small" type="warning" class="action-btn-primary" :loading="row.processingPre || row.checkingPre" @click="openPreDelivery(row)">
                    执行交付
                  </el-button>
                  <el-button
                    v-if="isMpcRow(row)"
                    size="small"
                    type="primary"
                    :class="['action-btn-primary', { 'action-btn-disabled-primary': !canOpenMpcSellerDialog(row) }]"
                    :disabled="!canOpenMpcSellerDialog(row)"
                    @click="openMpcSellerDialog(row)"
                  >
                    {{ getSellerMpcActionLabel(row) }}
                  </el-button>
                  <el-button
                    v-if="isFlRow(row)"
                    size="small"
                    type="warning"
                    class="action-btn-secondary"
                    :loading="row.downloadingFlGradient"
                    :disabled="!getLatestSellerGradientPackage(row)"
                    @click="downloadFlSellerGradient(row)"
                  >
                    下载结果
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="requestedAssets.length" class="pagination-bar">
            <el-pagination
              background
              layout="prev, pager, next"
              :current-page="pagination.page"
              :page-size="pagination.pageSize"
              :total="requestedAssets.length"
              @current-change="handleSellerPageChange"
            />
          </div>
        </div>

        <el-dialog v-model="heDialog.visible" title="交付 - 同态加密" width="620px">
          <div v-if="heDialog.asset" class="dialog-body">
            <div class="dialog-grid dialog-grid-single">
              <div class="dialog-field">
                <span class="dialog-label">交付算法</span>
                <el-select v-model="heDialog.operation" placeholder="请选择交付算法">
                  <el-option
                    v-for="item in heOperationDisplayOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </div>
            </div>

            <div class="dialog-grid">
              <div class="dialog-field">
                <span class="dialog-label">文件1</span>
                <div class="file-action-group">
                  <input ref="heCsvFile1Input" class="hidden-file-input" type="file" accept=".csv" @change="onDialogFileChange('file1', $event)" />
                  <el-button size="small" plain @click="openFileSelector('heCsvFile1Input')">
                    选择文件
                  </el-button>
                </div>
                <div v-if="heDialog.file1" class="file-name inline-file-name">{{ heDialog.file1.name }}</div>
              </div>

              <div class="dialog-field">
                <span class="dialog-label">文件2</span>
                <div class="file-action-group">
                  <input ref="heCsvFile2Input" class="hidden-file-input" type="file" accept=".csv" @change="onDialogFileChange('file2', $event)" />
                  <el-button size="small" plain @click="openFileSelector('heCsvFile2Input')">
                    选择文件
                  </el-button>
                </div>
                <div v-if="heDialog.file2" class="file-name inline-file-name">{{ heDialog.file2.name }}</div>
              </div>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeHeDialog">取消</el-button>
            <el-button type="primary" :loading="heDialog.submitting" @click="submitHeDelivery">
              执行交付
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="preDialog.visible" title="发起 PRE 重加密" width="620px">
          <div v-if="preDialog.asset" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span class="dialog-value">{{ preDialog.asset.transaction_id }}</span>
            </div>

            <div class="dialog-field">
              <span class="dialog-label">原始压缩包</span>
              <div class="file-action-group">
                <input
                  ref="preSourceArchiveInput"
                  class="hidden-file-input"
                  type="file"
                  accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/x-tar,application/gzip"
                  @change="onPreFileChange"
                />
                <el-button size="small" plain @click="openFileSelector('preSourceArchiveInput')">
                  选择文件
                </el-button>
              </div>
            </div>
            <div v-if="preDialog.file" class="file-name inline-file-name">{{ preDialog.file.name }}</div>

            <div class="dialog-hint compact-hint">
              <span>请选择卖方原始压缩包。浏览器会在本地逐文件生成 PRE source ciphertext ZIP，再提交到 PCC attempt 流程。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closePreDialog">取消</el-button>
            <el-button type="primary" :loading="preDialog.submitting" @click="submitPreDelivery">
              发起重加密
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="flDeliveryDialog.visible" title="执行交付" width="620px">
          <div v-if="flDeliveryDialog.asset" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ flDeliveryDialog.asset.transaction_id }}</span>
            </div>

            <div class="dialog-row file-row">
              <span class="dialog-label">训练结果压缩包</span>
              <div class="file-action-group">
                <input
                  ref="flBatchZipInput"
                  class="hidden-file-input"
                  type="file"
                  accept=".zip,application/zip"
                  @change="onFlZipFileChange"
                />
                <el-button size="small" plain @click="openFileSelector('flBatchZipInput')">
                  选择文件
                </el-button>
              </div>
            </div>
            <div v-if="flDeliveryDialog.file" class="file-name">{{ flDeliveryDialog.file.name }}</div>

            <div class="dialog-hint compact-hint">
              <span>卖方私钥文件和底层模型会在执行交付前自动下载。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeFlDeliveryDialog">取消</el-button>
            <el-button type="primary" :loading="flDeliveryDialog.submitting" @click="submitFlDelivery">
              提交
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="flDecryptDialog.visible" title="下载结果" width="620px">
          <div v-if="flDecryptDialog.row" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ flDecryptDialog.row.transaction_id }}</span>
            </div>
            <div class="dialog-row file-row">
              <span class="dialog-label">私钥文件</span>
              <div class="file-action-group">
                <input ref="sellerFlPrivateKeyInput" class="hidden-file-input" type="file" accept=".json" @change="onFlPrivateKeyFileChange" />
                <el-button size="small" plain @click="openFileSelector('sellerFlPrivateKeyInput')">
                  选择文件
                </el-button>
              </div>
            </div>
            <div v-if="flDecryptDialog.privateKeyFile" class="file-name">
              {{ flDecryptDialog.privateKeyFile.name }}
            </div>
            <div class="dialog-hint">
              <span>请选择私钥文件，浏览器会在本地解密结果并直接导出原始文件。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeFlDecryptDialog">取消</el-button>
            <el-button type="primary" :loading="flDecryptDialog.processing" @click="confirmDecryptFlResult">
              解密并导出
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="mpcDialog.visible" title="执行交付" width="560px">
          <div v-if="mpcDialog.row" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ mpcDialog.row.transaction_id }}</span>
            </div>

            <div class="dialog-field">
              <span class="dialog-label">资产数据文件</span>
              <div class="file-action-group">
                <input ref="mpcSellerCsvInput" class="hidden-file-input" type="file" accept=".csv,text/csv" multiple @change="onMpcFileChange" />
                <el-button size="small" plain @click="openFileSelector('mpcSellerCsvInput')">
                  选择文件
                </el-button>
              </div>
              <div v-if="mpcDialog.files.length" class="file-name inline-file-name">
                {{ mpcDialog.files.map((file) => file.name).join('，') }}
              </div>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeMpcSellerDialog">取消</el-button>
            <el-button type="primary" :loading="mpcDialog.submitting" @click="submitMpcSellerData">
              执行交付
            </el-button>
          </template>
        </el-dialog>

        <el-dialog
          v-model="mpcNoticeDialog.visible"
          title="提示"
          width="460px"
          :close-on-click-modal="false"
        >
          <div class="dialog-body">
            <div class="dialog-hint compact-hint">
              <span>{{ mpcNoticeDialog.message }}</span>
            </div>
          </div>

          <template #footer>
            <el-button type="primary" @click="closeMpcNoticeDialog">
              我知道了
            </el-button>
          </template>
        </el-dialog>

        <div v-if="contractInfo.visible" class="modal" @click.self="closeContractInfo">
          <div class="modal-content wide-modal">
            <h3>数字合约</h3>

            <div class="contract-info" v-if="contractInfo.data">
              <div class="contract-grid">
                <div class="contract-item">
                  <label>合约ID</label>
                  <span class="value code">{{ contractInfo.data.contract_id }}</span>
                </div>
                <div class="contract-item">
                  <label>合约名称</label>
                  <span class="value">{{ contractInfo.data.contract_name }}</span>
                </div>
                <div class="contract-item">
                  <label>创建时间</label>
                  <span class="value">{{ formatDate(contractInfo.data.created_at) }}</span>
                </div>
                <div class="contract-item">
                  <label>交付方法</label>
                  <span class="value">{{ contractInfo.data.delivery_method_label }}</span>
                </div>
                <div class="contract-item">
                  <label>产品名称</label>
                  <span class="value">{{ contractInfo.data.product_name }}</span>
                </div>
                <div class="contract-item">
                  <label>产品描述</label>
                  <span class="value description">{{ contractInfo.data.contract_description }}</span>
                </div>
                <div class="contract-item">
                  <label>买家名称</label>
                  <span class="value">{{ contractInfo.data.buyer_name }}</span>
                </div>
                <div class="contract-item">
                  <label>卖家名称</label>
                  <span class="value">{{ contractInfo.data.seller_name }}</span>
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
      </div>
    </div>
  </div>
</template>

<script>
/* eslint-disable vue/multi-word-component-names */
import axios from 'axios'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import heConfig from '@/utils/heDeliveryConfig'
import heCrypto from '@/utils/heCrypto'
import heCsv from '@/utils/heCsv'
import flCrypto from '@/utils/flCrypto'
import preCrypto from '@/utils/preCrypto'

const API_BASE = 'http://10.112.47.214:3000'

export default {
  name: 'DeliverySellerPage',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      username: '',
      userId: '',
      requestedAssets: [],
      pagination: {
        page: 1,
        pageSize: 10
      },
      isLoadingTransactions: false,
      contractInfo: { visible: false, data: null },
      heDialog: {
        visible: false,
        asset: null,
        encType: heConfig.HE_ENC_TYPE_OPTIONS[0],
        operation: 'ADD',
        file1: null,
        file2: null,
        submitting: false
      },
      preDialog: {
        visible: false,
        asset: null,
        file: null,
        submitting: false
      },
      flDeliveryDialog: {
        visible: false,
        asset: null,
        file: null,
        submitting: false
      },
      flDecryptDialog: {
        visible: false,
        row: null,
        encryptedBlob: null,
        privateKeyFile: null,
        processing: false,
        resultRole: '',
        filename: ''
      },
      mpcDialog: {
        visible: false,
        row: null,
        files: [],
        submitting: false
      },
      mpcNoticeDialog: {
        visible: false,
        message: ''
      },
      statusPollTimer: null,
      contractVerified: false,

    contractVerifyLoading: false,

    contractVerifyMsg: '',

    contractVerifyTime: ''
    }
  },
  computed: {
    heOperationDisplayOptions() {
      return [
        { label: '加法', value: 'ADD' },
        { label: '乘法', value: 'MUL' }
      ]
    },
    pagedRequestedAssets() {
      const start = (this.pagination.page - 1) * this.pagination.pageSize
      return this.requestedAssets.slice(start, start + this.pagination.pageSize)
    }
  },
  async mounted() {
    await this.initUser()
    await this.fetchRequestedAssets()
    this.startStatusPolling()
  },
  beforeUnmount() {
    this.stopStatusPolling()
  },
  methods: {
    parseJwt(token) {
      const base64Url = token.split('.')[1]
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
          .join('')
      )
      return JSON.parse(jsonPayload)
    },

    async initUser() {
      const token = localStorage.getItem('token')
      if (!token) return

      const payload = this.parseJwt(token)
      this.username = decodeURIComponent(payload.username)
      const response = await axios.post(`${API_BASE}/api/get-user-id`, {
        username: this.username
      })
      this.userId = String(response.data.id || '')
    },

    async getSellerAddresses() {
      const certLists = []

      const sources = [
        { api: 'get-certificates', org: 'wx-org1.chainmaker.org' },
        { api: 'get-certificates2', org: 'wx-org2.chainmaker.org' }
      ]

      for (const source of sources) {
        try {
          const response = await axios.post(`${API_BASE}/api/${source.api}`, { userId: this.userId })
          const certs = Array.isArray(response.data.certificates) ? response.data.certificates : []
          certs.forEach((cert) => {
            certLists.push({ org: source.org, cert: cert.cert, address: cert.address || '' })
          })
        } catch (error) {
          console.error(`获取 ${source.api} 失败:`, error)
        }
      }

      const addresses = []
      for (const item of certLists) {
        try {
          const address = item.address
          if (address) addresses.push(address)
        } catch (error) {
          console.error(`解析证书地址失败: ${item.cert}`, error)
        }
      }

      return [...new Set(addresses)]
    },

    async fetchRequestedAssets() {
      if (!this.userId) {
        await this.initUser()
      }

      this.isLoadingTransactions = true
      try {
        const addresses = await this.getSellerAddresses()
        const rows = []

        for (const address of addresses) {
          try {
            const response = await axios.get(`${API_BASE}/api/seller-transaction-status/${address}`)
            const transactions = Array.isArray(response.data.transactions) ? response.data.transactions : []

            transactions
              .filter((item) => item.status === '已确认' && this.normalizePcType(item.pc_type))
              .forEach((item) => {
                rows.push({
                  transaction_id: item.transaction_id,
                  pc_type: this.normalizePcType(item.pc_type),
                  file_hash: item.asset_id,
                  seller_address: item.seller_address,
                  buyer_address: item.buyer_address,
                  quantity: item.quantity,
                  flRecord: null,
                  heRecord: null,
                  preRecord: null,
                  mpcRecord: null,
                  checkingHe: false,
                  checkingFl: false,
                  syncingHe: false,
                  syncingFl: false,
                  syncingPre: false,
                  syncingMpc: false,
                  processingPre: false,
                  processingFl: false,
                  uploadingFlBatch: false,
                  flBottomModelDownloaded: false,
                  downloadingFlBottom: false,
                  downloadingFlGradient: false
                })
              })
          } catch (error) {
            console.error(`加载卖家交易失败: ${address}`, error)
          }
        }

        this.requestedAssets = rows.sort((left, right) => this.compareTransactionIdDesc(left, right))
        this.ensureSellerPageInRange()
        await this.syncSellerPageStatus()
      } finally {
        this.isLoadingTransactions = false
      }
    },

    compareTransactionIdDesc(left, right) {
      const leftId = String(left?.transaction_id || '')
      const rightId = String(right?.transaction_id || '')
      const leftNumber = Number.parseInt(leftId, 10)
      const rightNumber = Number.parseInt(rightId, 10)

      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
        return rightNumber - leftNumber
      }

      return rightId.localeCompare(leftId, 'zh-CN')
    },

    ensureSellerPageInRange() {
      const totalPages = Math.max(1, Math.ceil(this.requestedAssets.length / this.pagination.pageSize))
      this.pagination.page = Math.min(Math.max(this.pagination.page, 1), totalPages)
    },

    async syncSellerPageStatus() {
      await Promise.all(this.pagedRequestedAssets.map((row) => (
        this.isHeRow(row)
          ? this.refreshHeStatus(row, false)
          : (this.isFlRow(row)
            ? this.refreshFlStatus(row, false)
            : (this.isPreRow(row)
              ? this.refreshPreStatus(row, false)
              : this.refreshMpcStatus(row, false)))
      )))
    },

    async handleSellerPageChange(page) {
      this.pagination.page = page
      await this.syncSellerPageStatus()
    },

    startStatusPolling() {
      this.stopStatusPolling()
      this.statusPollTimer = window.setInterval(() => {
        this.pollCurrentPageStatus()
      }, 5000)
    },

    stopStatusPolling() {
      if (this.statusPollTimer) {
        window.clearInterval(this.statusPollTimer)
        this.statusPollTimer = null
      }
    },

    async pollCurrentPageStatus() {
      if (this.isLoadingTransactions) {
        return
      }

      const rows = this.pagedRequestedAssets.filter((row) => row?.transaction_id)
      if (!rows.length) {
        return
      }

      await Promise.all(rows.map((row) => (
        this.isHeRow(row)
          ? this.refreshHeStatus(row, false)
          : (this.isFlRow(row)
            ? this.refreshFlStatus(row, false)
            : (this.isPreRow(row)
              ? this.refreshPreStatus(row, false)
              : this.refreshMpcStatus(row, false)))
      )))
    },

    normalizePcType(value) {
      return String(value || '').trim().toUpperCase()
    },

    isHeRow(row) {
      return this.normalizePcType(row?.pc_type) === 'HE'
    },

    isPreRow(row) {
      return this.normalizePcType(row?.pc_type) === 'PRE'
    },

    isFlRow(row) {
      return this.normalizePcType(row?.pc_type) === 'FL'
    },

    isMpcRow(row) {
      return this.normalizePcType(row?.pc_type) === 'MPC'
    },

    getDeliveryMethodLabel(row) {
      if (this.isPreRow(row)) {
        return heConfig.getDeliveryMethodLabel(heConfig.DELIVERY_METHOD_PRE)
      }

      if (this.isFlRow(row)) {
        return heConfig.getDeliveryMethodLabel(heConfig.DELIVERY_METHOD_FL)
      }

      if (this.isMpcRow(row)) {
        return heConfig.getDeliveryMethodLabel(heConfig.DELIVERY_METHOD_MPC)
      }

      return heConfig.getDeliveryMethodLabel(heConfig.DELIVERY_METHOD_HE)
    },

    getDeliveryMethodClass(row) {
      if (this.isHeRow(row)) {
        return 'method-pill-he'
      }

      if (this.isFlRow(row)) {
        return 'method-pill-fl'
      }

      if (this.isPreRow(row)) {
        return 'method-pill-pre'
      }

      if (this.isMpcRow(row)) {
        return 'method-pill-mpc'
      }

      return ''
    },

    async refreshHeStatus(row, showMessage = true) {
      if (!row?.transaction_id) return
      row.syncingHe = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/he/status`, {
          params: { transactionId: row.transaction_id }
        })
        row.heRecord = response.data?.item || null
        if (showMessage) {
          this.$message?.success('HE 状态已刷新')
        }
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || '状态刷新失败'
        if (showMessage) {
          this.$message?.error(message)
        }
      } finally {
        row.syncingHe = false
      }
    },

    getStatusText(rowOrStatus) {
      if (typeof rowOrStatus === 'object' && rowOrStatus !== null) {
        const businessStatus = this.getSellerDeliveryStatus(rowOrStatus)
        const currentStatus = String(this.getCurrentStatus(rowOrStatus) || '').toUpperCase()
        const labelMap = {
          WAIT_BUYER: '待买方操作',
          WAIT_SELLER: '待卖方交付',
          PROCESSING: currentStatus === 'PAMING' ? '审计中' : '计算中',
          COMPLETED: '已完成',
          FAILED: '失败'
        }
        return labelMap[businessStatus] || '计算中'
      }

      return heConfig.getPcpStatusText(rowOrStatus)
    },

    getCurrentStatus(row) {
      if (this.isMpcRow(row)) {
        return row.mpcRecord?.task_status || 'not_created'
      }

      if (this.isPreRow(row)) {
        return row.preRecord?.pcp_status || 'NOT_EXIST'
      }

      if (this.isFlRow(row)) {
        return row.flRecord?.pcp_status || 'NOT_EXIST'
      }

      return row.heRecord?.pcp_status || 'NOT_EXIST'
    },

    getSellerDeliveryStatus(row) {
      if (this.isMpcRow(row)) {
        const currentStatus = String(this.getCurrentStatus(row) || '').toLowerCase()

        if (!row?.mpcRecord?.remote_task_id) {
          return 'WAIT_BUYER'
        }

        if (currentStatus === 'pending' || currentStatus === 'waiting_seller_data' || currentStatus === 'failed') {
          return 'WAIT_SELLER'
        }

        if (currentStatus === 'ready' || currentStatus === 'computing') {
          return 'PROCESSING'
        }

        if (currentStatus === 'done') {
          return 'COMPLETED'
        }

        return 'PROCESSING'
      }

      const currentStatus = String(this.getCurrentStatus(row) || '').toUpperCase()

      if (this.isFlRow(row) && !row?.flRecord?.pcp_contract_id) {
        return 'WAIT_BUYER'
      }

      if (this.isPreRow(row) && !row?.preRecord?.pcp_contract_id) {
        return 'WAIT_SELLER'
      }

      if (this.isHeRow(row) && row?.heRecord?.public_keys_ready === false) {
        return 'WAIT_BUYER'
      }

      if (
        currentStatus === 'NOT_EXIST' ||
        currentStatus === 'ACTIVE' ||
        currentStatus === 'CREATED' ||
        currentStatus === 'WAITING_INPUT' ||
        currentStatus === 'WAITING_EPOCH_INPUT' ||
        currentStatus === 'JOINED'
      ) {
        return 'WAIT_SELLER'
      }

      if (
        currentStatus === 'QUEUED' ||
        currentStatus === 'RUNNING' ||
        currentStatus === 'COMPUTED' ||
        currentStatus === 'PAMING'
      ) {
        return 'PROCESSING'
      }

      if (currentStatus === 'PAM_PASSED' || currentStatus === 'COMPLETED') {
        return 'COMPLETED'
      }

      if (
        currentStatus === 'PAM_FAILED' ||
        currentStatus === 'FAILED' ||
        currentStatus === 'AUDIT_FAILED'
      ) {
        return 'FAILED'
      }

      return 'PROCESSING'
    },

    getStatusTagType(rowOrStatus) {
      const normalizedStatus =
        typeof rowOrStatus === 'object' && rowOrStatus !== null
          ? this.getSellerDeliveryStatus(rowOrStatus)
          : String(rowOrStatus || '').toUpperCase()

      switch (normalizedStatus) {
        case 'COMPLETED':
          return 'success'
        case 'FAILED':
        case 'AUDIT_FAILED':
          return 'danger'
        case 'PROCESSING':
          return 'warning'
        case 'WAIT_BUYER':
        case 'WAIT_SELLER':
        default:
          return 'info'
      }
    },

    getStatusPillClass(rowOrStatus) {
      const normalizedStatus =
        typeof rowOrStatus === 'object' && rowOrStatus !== null
          ? this.getSellerDeliveryStatus(rowOrStatus)
          : String(rowOrStatus || '').toUpperCase()

      switch (normalizedStatus) {
        case 'COMPLETED':
          return 'status-pill-success'
        case 'FAILED':
        case 'AUDIT_FAILED':
          return 'status-pill-danger'
        case 'PROCESSING':
          return 'status-pill-primary'
        case 'WAIT_BUYER':
        case 'WAIT_SELLER':
        default:
          return 'status-pill-warning'
      }
    },

    async refreshPreStatus(row, showMessage = true) {
      if (!row?.transaction_id) return
      row.syncingPre = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/pre/status`, {
          params: { transactionId: row.transaction_id }
        })
        row.preRecord = response.data?.item || null
        if (showMessage) {
          this.$message?.success('PRE 状态已刷新')
        }
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'PRE 状态刷新失败'
        if (showMessage) {
          this.$message?.error(message)
        }
      } finally {
        row.syncingPre = false
      }
    },

    async refreshFlStatus(row, showMessage = true) {
      if (!row?.transaction_id) return
      row.syncingFl = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/fl/status`, {
          params: {
            transactionId: row.transaction_id,
            entityId: row.seller_address
          }
        })
        row.flRecord = response.data?.item || null
        this.syncFlBottomModelDownloadedState(row)
        if (showMessage) {
          this.$message?.success('FL 状态已刷新')
        }
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'FL 状态刷新失败'
        if (showMessage) {
          this.$message?.error(message)
        }
      } finally {
        row.syncingFl = false
      }
    },

    async refreshMpcStatus(row, showMessage = true) {
      if (!row?.transaction_id) return
      row.syncingMpc = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/mpc/status`, {
          params: { transaction_id: row.transaction_id }
        })
        row.mpcRecord = response.data?.data || null
        if (showMessage) {
          this.$message?.success('MPC 状态已刷新')
        }
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'MPC 状态刷新失败'
        if (showMessage) {
          this.$message?.error(message)
        }
      } finally {
        row.syncingMpc = false
      }
    },

    getSellerMpcActionLabel(row) {
      if (!row?.mpcRecord?.remote_task_id) {
        return '执行交付'
      }

      switch (String(row?.mpcRecord?.task_status || '').toLowerCase()) {
        case 'failed':
          return '执行交付'
        case 'pending':
        case 'waiting_seller_data':
          return '执行交付'
        case 'ready':
        case 'computing':
        case 'done':
          return '已完成'
        default:
          return '处理中'
      }
    },

    getSellerHeActionLabel(row) {
      const status = String(row?.heRecord?.pcp_status || '').toUpperCase()
      if (
        status === 'QUEUED' ||
        status === 'RUNNING' ||
        status === 'COMPUTED' ||
        status === 'PAMING' ||
        status === 'PAM_PASSED' ||
        status === 'COMPLETED'
      ) {
        return '已执行'
      }

      return '执行交付'
    },

    isSellerHeDeliveryDisabled(row) {
      const status = String(row?.heRecord?.pcp_status || '').toUpperCase()
      if (!row?.heRecord?.public_keys_ready) {
        return true
      }

      return (
        status === 'QUEUED' ||
        status === 'RUNNING' ||
        status === 'COMPUTED' ||
        status === 'PAMING' ||
        status === 'PAM_PASSED' ||
        status === 'COMPLETED'
      )
    },

async verifyContract(assetRow) {

  this.contractVerifyLoading = true;

  try {

    const resp = await axios.post(
      `${API_BASE}/api/digital-contract/verify`,
      {
        transactionId:
          assetRow.transaction_id,

        vmId:
          `vm-tx-${assetRow.transaction_id}`,

        fileHash:
          assetRow.file_hash,

        deliveredCnt: '0',

        deliveryCnt: '2000',

        expireTime:
          new Date(
            Date.now() +
            24 * 3600 * 1000
          ).toISOString()
      }
    );

    if (
      resp.data &&
      resp.data.success
    ) {

      this.contractVerified = true;

      this.contractVerifyMsg =
        '数字合约校验通过';

      this.contractVerifyTime =
        new Date()
          .toLocaleString();

      this.$message.success(
        '数字合约校验通过'
      );

    } else {

      throw new Error(
        resp.data?.message
      );
    }

  } catch (e) {

    this.contractVerified = false;

    this.contractVerifyMsg =
      e.message ||
      '数字合约校验失败';

    this.$message.error(
      this.contractVerifyMsg
    );
  }

  finally {

    this.contractVerifyLoading = false;
  }
},
    canOpenMpcSellerDialog(row) {
      if (!row?.transaction_id) {
        return false
      }

      if (!row?.mpcRecord?.remote_task_id) {
        return false
      }

      const status = String(row?.mpcRecord?.task_status || '').toLowerCase()
      return status === 'pending' || status === 'waiting_seller_data' || status === 'failed'
    },

    getHiddenHePrivateKeyStorageKey(transactionId) {
      return `mpcHiddenHePrivateKey:${String(transactionId || '')}`
    },

    loadHiddenHePrivateKeyText(transactionId) {
      return localStorage.getItem(this.getHiddenHePrivateKeyStorageKey(transactionId)) || ''
    },

    saveHiddenHePrivateKeyText(transactionId, privateKeyText) {
      localStorage.setItem(this.getHiddenHePrivateKeyStorageKey(transactionId), String(privateKeyText || ''))
    },

    parseAssetCsvText(csvText, filename = '') {
      const lines = String(csvText || '')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      if (lines.length < 2) {
        throw new Error(`${filename || 'CSV 文件'} 至少需要表头和一行数据`)
      }

      const headers = lines[0].split(',').map((item) => item.trim())
      const userIdIndex = headers.indexOf('user_id')
      const valueField = ['total_assets', 'asset_value', 'amount', 'balance', 'value']
        .find((field) => headers.includes(field))
      const valueIndex = valueField ? headers.indexOf(valueField) : -1

      if (userIdIndex < 0 || valueIndex < 0) {
        throw new Error(`${filename || 'CSV 文件'} 必须包含 user_id 和 total_assets/asset_value/amount/balance/value 之一`)
      }

      const totalsByUser = new Map()
      const userOrder = []

      for (let i = 1; i < lines.length; i += 1) {
        const columns = lines[i].split(',').map((item) => item.trim())
        const userId = columns[userIdIndex]
        const rawValue = columns[valueIndex]
        const value = Number(rawValue)

        if (!userId) {
          throw new Error(`${filename || 'CSV 文件'} 第 ${i + 1} 行缺少 user_id`)
        }

        if (!Number.isFinite(value) || value < 0) {
          throw new Error(`${filename || 'CSV 文件'} 第 ${i + 1} 行资产值不是合法非负数字`)
        }

        if (!totalsByUser.has(userId)) {
          userOrder.push(userId)
          totalsByUser.set(userId, 0)
        }

        totalsByUser.set(userId, totalsByUser.get(userId) + value)
      }

      return {
        userOrder,
        totalsByUser
      }
    },

    async buildHiddenHeBatchPayload(files) {
      const parsedFiles = await Promise.all(files.map(async (file) => ({
        file,
        parsed: this.parseAssetCsvText(await file.text(), file.name)
      })))

      const userIds = []
      const seenUsers = new Set()

      parsedFiles.forEach(({ parsed }) => {
        parsed.userOrder.forEach((userId) => {
          if (!seenUsers.has(userId)) {
            seenUsers.add(userId)
            userIds.push(userId)
          }
        })
      })

      if (!userIds.length) {
        throw new Error('没有可用于聚合的用户资产数据')
      }

      const heFiles = parsedFiles.map(({ file, parsed }, fileIndex) => {
        const rows = ['value']
        userIds.forEach((userId) => {
          const value = parsed.totalsByUser.get(userId) ?? 0
          rows.push(String(Math.round(value)))
        })

        return new File(
          [rows.join('\n')],
          `he-hidden-${fileIndex + 1}-${file.name.replace(/\.csv$/i, '')}.csv`,
          { type: 'text/csv' }
        )
      })

      return {
        userIds,
        heFiles
      }
    },

    async ensureHiddenHeContext(transactionId) {
      const statusResponse = await axios.get(`${API_BASE}/api/privacy/he/public-key-status`, {
        params: { transactionId }
      })
      const heRecord = statusResponse.data?.item || null
      let privateKeyText = this.loadHiddenHePrivateKeyText(transactionId)

      if (heRecord?.public_keys_ready && privateKeyText) {
        return { heRecord, privateKeyText }
      }

      if (heRecord?.pcp_contract_id && !privateKeyText) {
        throw new Error('当前交易已存在旧的 HE 公钥，但浏览器没有对应私钥，无法继续隐藏聚合。请使用新的交易重新发起。')
      }

      const keyPairs = await heCrypto.generateHeKeyPairs()
      privateKeyText = heCrypto.serializeHeKeyMaterial({
        algorithm: 'Paillier',
        transactionId,
        keyType: heCrypto.HE_PRIVATE_KEY_TYPE,
        keyMaterial: keyPairs.paillier.privateKey
      })

      await axios.post(`${API_BASE}/api/privacy/he/public-keys`, {
        transactionId,
        ...heCrypto.buildHePublicKeyPayload(keyPairs)
      })

      this.saveHiddenHePrivateKeyText(transactionId, privateKeyText)

      const refreshedStatus = await axios.get(`${API_BASE}/api/privacy/he/public-key-status`, {
        params: { transactionId }
      })

      return {
        heRecord: refreshedStatus.data?.item || heRecord,
        privateKeyText
      }
    },

    async pollHiddenHeUntilReady(transactionId, timeoutMs = 180000, intervalMs = 3000) {
      const startAt = Date.now()

      while (Date.now() - startAt < timeoutMs) {
        const response = await axios.get(`${API_BASE}/api/privacy/he/status`, {
          params: { transactionId }
        })
        const item = response.data?.item || null
        const status = String(item?.pcp_status || '').toUpperCase()

        if (status === 'PAM_PASSED' || status === 'COMPLETED') {
          return item
        }

        if (['FAILED', 'PAM_FAILED', 'AUDIT_FAILED'].includes(status)) {
          throw new Error(item?.last_error || `HE 聚合失败，当前状态 ${status}`)
        }

        await new Promise((resolve) => window.setTimeout(resolve, intervalMs))
      }

      throw new Error('HE 聚合超时，请稍后刷新状态重试')
    },

    async runHiddenHeAggregation(transactionId, files) {
      const { userIds, heFiles } = await this.buildHiddenHeBatchPayload(files)
      const { heRecord, privateKeyText } = await this.ensureHiddenHeContext(transactionId)
      const publicKey = heCrypto.selectHePublicKey(heRecord, 'Paillier')

      if (!publicKey) {
        throw new Error('隐藏 HE 聚合缺少 Paillier 公钥')
      }

      const encryptedFiles = await Promise.all(heFiles.map(async (file) => {
        const encryptedCsvText = await heCrypto.encryptHeCsv({
          algorithm: 'Paillier',
          csvText: await file.text(),
          publicKey
        })
        return new File([encryptedCsvText], file.name, { type: 'text/csv' })
      }))

      const formData = new FormData()
      formData.append('transactionId', transactionId)
      formData.append('encType', 'Paillier')
      formData.append('operation', 'ADD')
      encryptedFiles.forEach((file, index) => {
        formData.append(`file${index + 1}`, file, file.name)
      })

      await axios.post(`${API_BASE}/api/privacy/he/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      await this.pollHiddenHeUntilReady(transactionId)

      const resultResponse = await axios.get(`${API_BASE}/api/privacy/he/result`, {
        params: { transactionId },
        responseType: 'text'
      })
      const decryptedCsvText = await heCrypto.decryptHeResultCsv({
        algorithm: 'Paillier',
        encryptedCsvText: resultResponse.data,
        privateKeyText
      })
      const resultLines = String(decryptedCsvText || '')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      if (resultLines.length !== userIds.length + 1) {
        throw new Error('HE 聚合结果行数与用户列表不一致')
      }

      const rows = ['user_id,total_assets']
      userIds.forEach((userId, index) => {
        const value = Number(resultLines[index + 1])
        if (!Number.isFinite(value) || value < 0) {
          throw new Error(`HE 聚合结果第 ${index + 1} 行不是合法非负数字`)
        }
        rows.push(`${userId},${Math.round(value)}`)
      })

      return new File(
        [rows.join('\n')],
        `asset-threshold-aggregated-${transactionId}.csv`,
        { type: 'text/csv' }
      )
    },

    async openMpcSellerDialog(row) {
      if (!row?.transaction_id) return

      await this.refreshMpcStatus(row, false)

      if (!row?.mpcRecord?.remote_task_id) {
        this.$message?.warning('请等待买方先创建 MPC 任务')
        return
      }

      if (!this.canOpenMpcSellerDialog(row)) {
        this.$message?.warning('当前状态无需重复提交卖方材料')
        return
      }

      this.mpcDialog.visible = true
      this.mpcDialog.row = row
      this.mpcDialog.files = []
      this.mpcDialog.submitting = false
    },

    onMpcFileChange(event) {
      this.mpcDialog.files = Array.from(event.target.files || [])
      event.target.value = ''
    },

    async submitMpcSellerData() {
      const row = this.mpcDialog.row
      if (!row?.transaction_id) return
      if (!this.mpcDialog.files.length) {
        this.$message?.warning('请先选择 CSV 文件')
        return
      }

      if (this.mpcDialog.files.some((file) => !String(file.name || '').toLowerCase().endsWith('.csv'))) {
        this.$message?.warning('仅支持上传 CSV 文件')
        return
      }

      const transactionId = row.transaction_id
      const files = [...this.mpcDialog.files]

      this.closeMpcSellerDialog()
      this.mpcNoticeDialog.message = '资产交付正在进行中，请勿退出账户或关闭浏览器。'
      this.mpcNoticeDialog.visible = true

      ;(async () => {
        try {
          const aggregatedFile = await this.runHiddenHeAggregation(transactionId, files)
          const formData = new FormData()
          formData.append('transaction_id', transactionId)
          formData.append('files', aggregatedFile, aggregatedFile.name)

          await axios.post(`${API_BASE}/api/privacy/mpc/upload-seller-data`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })

          await this.refreshMpcStatus(row, false)
          this.mpcNoticeDialog.message = '交付材料已提交，后续计算将在后台继续，现在可以关闭浏览器或退出账户。'
          this.mpcNoticeDialog.visible = true
        } catch (error) {
          const message = error?.response?.data?.message || error?.message || 'MPC 材料提交失败'
          this.$message?.error(message)
          await this.refreshMpcStatus(row, false)
        }
      })()
    },

    getSellerJoinPackage(row) {
      return row?.flRecord?.seller_join_packages?.[row?.seller_address] || null
    },

    getSellerBottomModelPackage(row) {
      const joinPackage = this.getSellerJoinPackage(row)
      return joinPackage?.download_token ? joinPackage : null
    },

    hasSellerJoinedFl(row) {
      const joinPackage = this.getSellerJoinPackage(row)
      return Boolean(joinPackage && (joinPackage.status || joinPackage.token_status || joinPackage.seller_public_key))
    },

    getFlBottomModelDownloadKey(row) {
      return `flBottomDownloaded:${row?.transaction_id || ''}:${row?.seller_address || ''}`
    },

    hasDownloadedFlBottomModel(row) {
      if (!row?.transaction_id || !row?.seller_address) return false
      if (typeof row?.flBottomModelDownloaded === 'boolean') {
        return row.flBottomModelDownloaded
      }
      return localStorage.getItem(this.getFlBottomModelDownloadKey(row)) === '1'
    },

    markFlBottomModelDownloaded(row) {
      if (!row?.transaction_id || !row?.seller_address) return
      localStorage.setItem(this.getFlBottomModelDownloadKey(row), '1')
      row.flBottomModelDownloaded = true
    },

    syncFlBottomModelDownloadedState(row) {
      if (!row?.transaction_id || !row?.seller_address) return
      row.flBottomModelDownloaded = localStorage.getItem(this.getFlBottomModelDownloadKey(row)) === '1'
    },

    getSellerFlDeliveryActionLabel(row) {
      const status = String(row?.flRecord?.pcp_status || '').toUpperCase()
      if (
        status === 'QUEUED' ||
        status === 'RUNNING' ||
        status === 'COMPUTED' ||
        status === 'PAMING' ||
        status === 'PAM_PASSED' ||
        status === 'COMPLETED'
      ) {
        return '已执行'
      }

      return '执行交付'
    },

    isSellerFlDeliveryDisabled(row) {
      const status = String(row?.flRecord?.pcp_status || '').toUpperCase()
      if (!row?.flRecord?.pcp_contract_id) {
        return true
      }

      return (
        status === 'QUEUED' ||
        status === 'RUNNING' ||
        status === 'COMPUTED' ||
        status === 'PAMING' ||
        status === 'PAM_PASSED' ||
        status === 'COMPLETED'
      )
    },

    getLatestSellerGradientPackage(row) {
      const packages = Object.values(row?.flRecord?.seller_result_packages || {})
        .filter((item) => (
          item?.seller_id === row?.seller_address &&
          ['fl_gradient', 'fl_gradient_epoch_bundle'].includes(item?.result_role)
        ))
        .sort((a, b) => Number(b?.batch_index ?? -1) - Number(a?.batch_index ?? -1))
      return packages[0] || null
    },

    async openHeDelivery(row) {
      if (!row?.transaction_id) return

      row.checkingHe = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/he/public-key-status`, {
          params: { transactionId: row.transaction_id }
        })
        row.heRecord = response.data?.item || null

        if (!row.heRecord?.public_keys_ready) {
          this.$message?.warning('需要买方先上传 HE 公钥')
          return
        }

        this.heDialog.visible = true
        this.heDialog.asset = row
        this.heDialog.encType = this.resolveHeEncTypeByOperation(row.heRecord?.selected_operation || 'ADD')
        this.heDialog.operation = row.heRecord?.selected_operation || 'ADD'
        this.heDialog.file1 = null
        this.heDialog.file2 = null
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'HE 公钥状态查询失败'
        this.$message?.error(message)
      } finally {
        row.checkingHe = false
      }
    },

    resolveHeEncTypeByOperation(operation) {
      return String(operation || '').trim().toUpperCase() === 'MUL' ? 'ElGamal' : 'Paillier'
    },

    onDialogFileChange(field, event) {
      this.heDialog[field] = event.target.files?.[0] || null
      event.target.value = ''
    },

    async submitHeDelivery() {
      if (!this.heDialog.asset) return
      if (!this.heDialog.file1 || !this.heDialog.file2) {
        this.$message?.warning('请先选择文件1和文件2')
        return
      }

      this.heDialog.submitting = true
      try {
        const encType = this.resolveHeEncTypeByOperation(this.heDialog.operation)
        this.heDialog.encType = encType

        const publicKey = heCrypto.selectHePublicKey(this.heDialog.asset.heRecord, encType)
        if (!publicKey) {
          throw new Error(`缺少 ${encType} 对应的公钥`)
        }

        const [file1Text, file2Text] = await Promise.all([
          this.heDialog.file1.text(),
          this.heDialog.file2.text()
        ])
        const [encryptedFile1Text, encryptedFile2Text] = await Promise.all([
          heCrypto.encryptHeCsv({
            algorithm: encType,
            csvText: file1Text,
            publicKey
          }),
          heCrypto.encryptHeCsv({
            algorithm: encType,
            csvText: file2Text,
            publicKey
          })
        ])

        const formData = new FormData()
        formData.append('transactionId', this.heDialog.asset.transaction_id)
        formData.append('encType', encType)
        formData.append('operation', this.heDialog.operation)
        formData.append(
          'file1',
          new Blob([encryptedFile1Text], { type: 'text/csv' }),
          this.heDialog.file1.name
        )
        formData.append(
          'file2',
          new Blob([encryptedFile2Text], { type: 'text/csv' }),
          this.heDialog.file2.name
        )

        const response = await axios.post(`${API_BASE}/api/privacy/he/submit`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        this.heDialog.asset.heRecord = response.data?.item || this.heDialog.asset.heRecord
        this.$message?.success(response.data?.message || 'HE 计算已发起')
        this.closeHeDialog()
      } catch (error) {
        const responseMessage = error?.response?.data?.message || ''
        const responseError = error?.response?.data?.error || ''
        const message = responseMessage
          ? (responseMessage === 'HE 路由处理失败' && responseError
            ? `${responseMessage}: ${responseError}`
            : responseMessage)
          : (error?.message || 'HE 提交失败')
        this.$message?.error(message)
      } finally {
        this.heDialog.submitting = false
      }
    },

    async openPreDelivery(row) {
      if (!row?.transaction_id) return

      row.checkingPre = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/pre/status`, {
          params: { transactionId: row.transaction_id }
        })
        row.preRecord = response.data?.item || null

        if (!row.preRecord?.buyer_public_key_ready) {
          this.$message?.warning('买方尚未提交 PRE 材料，请等待买方先上传公钥')
          return
        }

        this.preDialog.visible = true
        this.preDialog.asset = row
        this.preDialog.file = null
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'PRE 状态查询失败'
        this.$message?.error(message)
      } finally {
        row.checkingPre = false
      }
    },

    onPreFileChange(event) {
      this.preDialog.file = event.target.files?.[0] || null
      event.target.value = ''
    },

    async openFlDeliveryDialog(row) {
      if (!row?.transaction_id) return

      row.checkingFl = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/fl/status`, {
          params: {
            transactionId: row.transaction_id,
            entityId: row.seller_address
          }
        })
        row.flRecord = response.data?.item || null
        this.syncFlBottomModelDownloadedState(row)

        if (!row.flRecord?.pcp_contract_id) {
          this.$message?.warning('请等待买方先请求交付')
          return
        }

        if (!this.hasSellerJoinedFl(row)) {
          row.processingFl = true
          const keyMaterial = await flCrypto.generateFlKeyPair()

          await axios.post(`${API_BASE}/api/privacy/fl/join`, {
            transactionId: row.transaction_id,
            sellerId: row.seller_address,
            sellerPublicKey: keyMaterial.publicKeyHex
          })

          const privateKeyText = flCrypto.serializeFlPrivateKeyMaterial({
            role: 'seller',
            transactionId: row.transaction_id,
            privateKeyPem: keyMaterial.privateKeyPem
          })

          flCrypto.downloadFlPrivateKeyFile({
            role: 'seller',
            transactionId: row.transaction_id,
            privateKeyPem: keyMaterial.privateKeyPem
          })

          await this.refreshFlStatus(row, false)
          await this.autoDownloadFlSellerBottomModel(row, privateKeyText)
        }

        this.flDeliveryDialog.visible = true
        this.flDeliveryDialog.asset = row
        this.flDeliveryDialog.file = null
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'FL 交付准备失败'
        this.$message?.error(message)
      } finally {
        row.processingFl = false
        row.checkingFl = false
      }
    },

    onFlZipFileChange(event) {
      this.flDeliveryDialog.file = event.target.files?.[0] || null
      event.target.value = ''
    },

    openFileSelector(refName) {
      this.$refs[refName]?.click?.()
    },

    async submitFlDelivery() {
      if (!this.flDeliveryDialog.asset) return
      if (!this.flDeliveryDialog.file) {
        this.$message?.warning('请先选择压缩包')
        return
      }

      const assetRow = this.flDeliveryDialog.asset
      if (!assetRow.flRecord?.pcp_contract_id) {
        this.$message?.warning('买方尚未请求交付')
        return
      }

      if (!this.hasSellerJoinedFl(assetRow)) {
        this.$message?.warning('请重新点击执行交付')
        return
      }

      this.flDeliveryDialog.submitting = true
      assetRow.uploadingFlBatch = true

      try {
        if (!String(this.flDeliveryDialog.file.name || '').toLowerCase().endsWith('.zip')) {
          throw new Error('仅支持上传 zip 压缩包')
        }

        const formData = new FormData()
        formData.append('transactionId', assetRow.transaction_id)
        formData.append('sellerId', assetRow.seller_address)
        formData.append('batch_zip', this.flDeliveryDialog.file, this.flDeliveryDialog.file.name)

        const response = await axios.post(`${API_BASE}/api/privacy/fl/upload-batch`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        assetRow.flRecord = response.data?.item || assetRow.flRecord
        await this.refreshFlStatus(assetRow, false)
        this.$message?.success(response.data?.message || '交付已提交')
        this.closeFlDeliveryDialog()
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'FL 提交失败'
        this.$message?.error(message)
      } finally {
        this.flDeliveryDialog.submitting = false
        assetRow.uploadingFlBatch = false
      }
    },

    async submitPreDelivery() {
      if (!this.preDialog.asset) return
      if (!this.preDialog.file) {
        this.$message?.warning('请先选择原始压缩包')
        return
      }

      const assetRow = this.preDialog.asset
      this.preDialog.submitting = true
      assetRow.processingPre = true
      try {
        preCrypto.ensureAllowedPreSourceFile(this.preDialog.file)
        const payload = await preCrypto.createPrePublishPayload({
          file: this.preDialog.file,
          buyerPublicKey: assetRow.preRecord?.buyer_public_key,
          transactionId: assetRow.transaction_id,
          sellerId: assetRow.seller_address
        })

        const formData = new FormData()
        formData.append('transactionId', assetRow.transaction_id)
        formData.append('sellerSourcePublicKey', JSON.stringify(payload.sourcePublicKey))
        formData.append('reencryptionKey', JSON.stringify(payload.reencryptionKey))
        formData.append('source_cipher_zip', payload.sourceCipherZipFile, payload.sourceCipherZipFile.name)

        const response = await axios.post(`${API_BASE}/api/privacy/pre/publish`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        assetRow.preRecord = response.data?.item || assetRow.preRecord
        this.$message?.success(response.data?.message || 'PRE attempt 已提交')
        this.closePreDialog()
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'PRE 提交失败'
        this.$message?.error(message)
      } finally {
        this.preDialog.submitting = false
        assetRow.processingPre = false
      }
    },

    closeHeDialog() {
      this.heDialog.visible = false
      this.heDialog.asset = null
      this.heDialog.file1 = null
      this.heDialog.file2 = null
      this.heDialog.submitting = false
    },

    closePreDialog() {
      this.preDialog.visible = false
      this.preDialog.asset = null
      this.preDialog.file = null
      this.preDialog.submitting = false
    },

    closeFlDeliveryDialog() {
      this.flDeliveryDialog.visible = false
      this.flDeliveryDialog.asset = null
      this.flDeliveryDialog.file = null
      this.flDeliveryDialog.submitting = false
    },

    closeMpcSellerDialog() {
      this.mpcDialog.visible = false
      this.mpcDialog.row = null
      this.mpcDialog.files = []
      this.mpcDialog.submitting = false
    },

    closeMpcNoticeDialog() {
      this.mpcNoticeDialog.visible = false
      this.mpcNoticeDialog.message = ''
    },

    async downloadFlSellerGradient(row) {
      await this.downloadFlSellerResult(row, {
        resultRole: 'fl_gradient_epoch_bundle',
        batchIndex: null,
        rowLoadingKey: 'downloadingFlGradient',
        filename: ''
      })
    },

    async autoDownloadFlSellerBottomModel(row, privateKeyText) {
      const joinPackage = this.getSellerBottomModelPackage(row)
      if (!joinPackage?.download_token) {
        throw new Error('底层模型暂未就绪，请稍后刷新后重试')
      }

      row.downloadingFlBottom = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/fl/result`, {
          params: {
            transactionId: row.transaction_id,
            receiverRole: 'seller',
            sellerId: row.seller_address,
            resultRole: 'fl_bottom_model'
          },
          responseType: 'blob'
        })

        await flCrypto.downloadDecryptedFlResult({
          encryptedTarBuffer: await response.data.arrayBuffer(),
          privateKeyText,
          filename: '',
          resultRole: 'fl_bottom_model',
          transactionId: row.transaction_id,
          batchIndex: null
        })
        this.markFlBottomModelDownloaded(row)
      } finally {
        row.downloadingFlBottom = false
      }
    },

    async downloadFlSellerResult(row, {
      resultRole,
      batchIndex = null,
      rowLoadingKey,
      filename
    }) {
      row[rowLoadingKey] = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/fl/result`, {
          params: {
            transactionId: row.transaction_id,
            receiverRole: 'seller',
            sellerId: row.seller_address,
            resultRole,
            batchIndex
          },
          responseType: 'blob'
        })

        this.flDecryptDialog.visible = true
        this.flDecryptDialog.row = row
        this.flDecryptDialog.encryptedBlob = response.data
        this.flDecryptDialog.privateKeyFile = null
        this.flDecryptDialog.processing = false
        this.flDecryptDialog.resultRole = resultRole
        this.flDecryptDialog.filename = filename
      } catch (error) {
        const message = await this.resolveBlobErrorMessage(error, '下载 FL 结果失败')
        this.$message?.error(message)
      } finally {
        row[rowLoadingKey] = false
      }
    },

    onFlPrivateKeyFileChange(event) {
      this.flDecryptDialog.privateKeyFile = event.target.files?.[0] || null
      event.target.value = ''
    },

    async confirmDecryptFlResult() {
      if (!this.flDecryptDialog.privateKeyFile || !this.flDecryptDialog.encryptedBlob) {
        this.$message?.warning('请先选择私钥文件')
        return
      }

      this.flDecryptDialog.processing = true
      try {
        const [privateKeyText, encryptedTarBuffer] = await Promise.all([
          this.flDecryptDialog.privateKeyFile.text(),
          this.flDecryptDialog.encryptedBlob.arrayBuffer()
        ])

        await flCrypto.downloadDecryptedFlResult({
          encryptedTarBuffer,
          privateKeyText,
          filename: this.flDecryptDialog.filename,
          resultRole: this.flDecryptDialog.resultRole,
          transactionId: this.flDecryptDialog.row?.transaction_id,
          batchIndex: this.getLatestSellerGradientPackage(this.flDecryptDialog.row)?.batch_index ?? null
        })

        if (this.flDecryptDialog.resultRole === 'fl_bottom_model') {
          this.markFlBottomModelDownloaded(this.flDecryptDialog.row)
        }

        this.$message?.success('FL 结果已在浏览器内解密并导出')
        this.closeFlDecryptDialog()
      } catch (error) {
        this.$message?.error(error?.message || 'FL 本地解密失败')
      } finally {
        this.flDecryptDialog.processing = false
      }
    },

    async resolveBlobErrorMessage(error, fallbackMessage) {
      const blobPayload = error?.response?.data
      if (!blobPayload || typeof Blob === 'undefined' || !(blobPayload instanceof Blob)) {
        return error?.response?.data?.message || error?.message || fallbackMessage
      }

      try {
        const text = await heCsv.blobToText(blobPayload)
        if (!text) {
          return fallbackMessage
        }

        try {
          const parsed = JSON.parse(text)
          return parsed?.message || fallbackMessage
        } catch (parseError) {
          return text
        }
      } catch (blobError) {
        return fallbackMessage
      }
    },

    closeFlDecryptDialog() {
      this.flDecryptDialog.visible = false
      this.flDecryptDialog.row = null
      this.flDecryptDialog.encryptedBlob = null
      this.flDecryptDialog.privateKeyFile = null
      this.flDecryptDialog.processing = false
      this.flDecryptDialog.resultRole = ''
      this.flDecryptDialog.filename = ''
    },

    async generateContractInfo(transaction) {
      try {
        const transactionId = transaction.transaction_id
        if (!transactionId) throw new Error('缺少 transaction_id')

        const txDetailRes = await axios.get(`${API_BASE}/api/get-transaction-detail/${transactionId}`)
        const tx = txDetailRes?.data?.transaction
        if (!tx) throw new Error('未获取到交易详情')

        const assetId = tx.asset_id || transaction.file_hash
        const assetRes = await axios.get(`${API_BASE}/api/asset/${assetId}`)
        const assetInfo = assetRes?.data || {}

        return {
          contract_id: `CONTRACT-${transactionId}`,
          contract_name: `${assetInfo.asset_name || '数字产品'}-数字合约`,
          contract_description: assetInfo.description || '该数字合约依据平台交易信息自动生成，用于界定交易双方权责与限制条件',
          created_at: (tx.created_at && new Date(tx.created_at.replace(' ', 'T')).toISOString()) || new Date().toISOString(),
          token_id: assetId,
          product_name: assetInfo.asset_name || '未知产品',
          delivery_method_label: this.getDeliveryMethodLabel(transaction),
          seller_name: tx.seller_name || tx.seller_username || tx.seller_address || '未知卖家',
          buyer_name: tx.buyer_name || tx.buyer_username || tx.buyer_address || '未知买家',
          seller_id: tx.seller_address ?? 'unknown-seller',
          buyer_id: tx.buyer_address ?? 'unknown-buyer',
          operations: ['所有'],
          constraints: {
            expiration_time: tx.expiration_time ? new Date(tx.expiration_time.replace(' ', 'T')).toISOString() : null,
            quantity: transaction.quantity ?? tx.quantity ?? null
          }
        }
      } catch (error) {
        console.error('生成合约信息失败:', error)
        this.$message?.error('生成合约信息失败')
        return null
      }
    },

    async viewContract(row) {
      const info = await this.generateContractInfo(row)
      if (!info) return
      this.contractInfo.data = info
      this.contractInfo.visible = true
    },

    closeContractInfo() {
      this.contractInfo.visible = false
      this.contractInfo.data = null
    },

    formatDate(dateString) {
      if (!dateString) return '-'
      try {
        return new Date(dateString).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch (error) {
        return String(dateString)
      }
    }
  }
}
</script>

<style scoped>
.delivery {
  --page-bg: #ffffff;
  --surface: #ffffff;
  --surface-soft: #f5f7fa;
  --border-soft: #ebeef5;
  --border-strong: #dcdfe6;
  --text-main: #303133;
  --text-muted: #606266;
  --accent-primary: #409eff;
  --accent-primary-hover: #66b1ff;
  --accent-he: #f4f4f5;
  --accent-fl: #f0f9eb;
  --accent-pre: #fdf6ec;
  --status-warning-bg: #fdf6ec;
  --status-warning-text: #e6a23c;
  --status-primary-bg: #ecf5ff;
  --status-primary-text: #409eff;
  --status-success-bg: #f0f9eb;
  --status-success-text: #67c23a;
  --status-danger-bg: #fef0f0;
  --status-danger-text: #f56c6c;
  --shadow-soft: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f7fa;
}

.main-content {
  display: flex;
  flex: 1;
}

.content {
  flex: 1;
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 12px 16px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.title {
  margin: 0;
  font-size: 24px;
  color: var(--text-main);
  letter-spacing: 0;
  line-height: 1.33;
  font-weight: 600;
}

.title-note {
  margin-left: 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 400;
}

.subtitle {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.asset-upload-container {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 0;
  margin: 0 12px 20px;
  box-shadow: var(--shadow-soft);
}

.method-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: auto;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}

.method-pill-he {
  background: #f4f4f5;
  color: #909399;
  border-color: rgba(144, 147, 153, 0.2);
}

.method-pill-fl {
  background: #f4f4f5;
  color: #909399;
  border-color: rgba(144, 147, 153, 0.2);
}

.method-pill-pre {
  background: #f4f4f5;
  color: #909399;
  border-color: rgba(144, 147, 153, 0.2);
}

.method-pill-mpc {
  background: #f4f4f5;
  color: #909399;
  border-color: rgba(144, 147, 153, 0.2);
}

.action-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.action-cell :deep(.el-button) {
  min-height: 32px;
  padding: 8px 12px;
  border-radius: 4px;
  font-weight: 500;
  font-size: 12px;
}

.action-cell :deep(.el-button--primary) {
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--text-main);
}

.action-cell :deep(.action-btn-primary) {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #fff;
}

.action-cell :deep(.el-button--primary:hover) {
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--text-main);
}

.action-cell :deep(.action-btn-primary:hover) {
  background: var(--accent-primary-hover);
  border-color: var(--accent-primary-hover);
  color: #fff;
}

.action-cell :deep(.action-btn-secondary) {
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--text-main);
}

.action-cell :deep(.action-btn-secondary:hover) {
  color: var(--accent-primary);
  border-color: #c6e2ff;
  background: #ecf5ff;
}

.action-cell :deep(.el-button.is-disabled) {
  border-color: var(--border-soft);
}

.action-cell :deep(.action-btn-disabled-primary.el-button.is-disabled) {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #fff;
  opacity: 0.65;
}

.action-cell :deep(.action-btn-disabled-primary.el-button.is-disabled:hover) {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #fff;
}

.page-header :deep(.el-button--primary.is-plain) {
  border-color: var(--border-strong);
  background: var(--surface);
  color: var(--text-main);
  border-radius: 4px;
}

.page-header :deep(.el-button--primary.is-plain:hover) {
  color: var(--accent-primary);
  border-color: #c6e2ff;
  background: #ecf5ff;
}

.asset-upload-container :deep(.el-table) {
  border-radius: 4px;
}

.asset-upload-container :deep(.el-table th.el-table__cell) {
  background: var(--surface-soft);
  color: var(--text-muted);
  font-weight: 500;
  height: 40px;
}

.asset-upload-container :deep(.el-table td.el-table__cell),
.asset-upload-container :deep(.el-table th.el-table__cell) {
  border-bottom-color: var(--border-soft);
  padding-top: 12px;
  padding-bottom: 12px;
}

.asset-upload-container :deep(.el-table--border::before),
.asset-upload-container :deep(.el-table--group::after),
.asset-upload-container :deep(.el-table::before) {
  background-color: var(--border-soft);
}

.asset-upload-container :deep(.el-table td.el-table__cell .cell),
.asset-upload-container :deep(.el-table th.el-table__cell .cell) {
  padding-left: 16px;
  padding-right: 16px;
}

.delivery-table :deep(.el-table__row:hover > td.el-table__cell) {
  background: #fff;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  border-width: 1px;
  border-style: solid;
  font-size: 12px;
  font-weight: 500;
  line-height: 22px;
}

.status-pill-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning-text);
  border-color: rgba(230, 162, 60, 0.2);
}

.status-pill-primary {
  background: var(--status-primary-bg);
  color: var(--status-primary-text);
  border-color: rgba(64, 158, 255, 0.2);
}

.status-pill-success {
  background: var(--status-success-bg);
  color: var(--status-success-text);
  border-color: rgba(103, 194, 58, 0.2);
}

.status-pill-danger {
  background: var(--status-danger-bg);
  color: var(--status-danger-text);
  border-color: rgba(245, 108, 108, 0.2);
}

.asset-upload-container :deep(.contract-link.el-button),
.asset-upload-container :deep(.contract-link.el-button.is-text) {
  display: inline-flex;
  align-items: center;
  padding: 0;
  color: var(--text-main);
  font-size: 13px;
  font-weight: 400;
  transition: color 0.2s ease;
}

.asset-upload-container :deep(.contract-link.el-button:hover),
.asset-upload-container :deep(.contract-link.el-button.is-text:hover) {
  color: var(--text-muted);
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.dialog-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dialog-label {
  color: #4b5563;
  font-size: 13px;
  font-weight: 500;
}

.dialog-value {
  color: var(--text-main);
  font-size: 14px;
}

.file-row {
  align-items: flex-start;
}

.hidden-file-input {
  display: none;
}

.file-action-group {
  display: flex;
  align-items: center;
}

.inline-file-name {
  margin-left: 0;
}

.file-name,
.dialog-hint {
  margin-left: 100px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.compact-hint {
  margin-left: 0;
}

.modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  width: min(840px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
}

.contract-info {
  margin-top: 16px;
}

.contract-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.contract-item {
  padding: 14px 16px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--surface-soft);
}

.contract-item label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}

.contract-item .value {
  display: block;
  color: var(--text-main);
  font-size: 14px;
  line-height: 1.5;
}

.contract-item .code,
.contract-item .description {
  word-break: break-all;
}

.button-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.confirm-button {
  border: none;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  padding: 10px 18px;
  cursor: pointer;
}

@media (max-width: 900px) {
  .page-header,
  .asset-upload-container {
    margin-left: 16px;
    margin-right: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .contract-grid {
    grid-template-columns: 1fr;
  }

  .dialog-grid {
    grid-template-columns: 1fr;
  }

  .dialog-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .file-name,
  .dialog-hint {
    margin-left: 0;
  }
}
</style>
