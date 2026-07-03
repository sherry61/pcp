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
          <el-button type="primary" plain @click="refreshResults" :loading="isLoading">
            刷新交付状态
          </el-button>
        </div>

        <div class="asset-upload-container">
          <el-table
            class="delivery-table"
            :data="pagedResultList"
            border
            v-loading="isLoading"
            style="width: 100%"
          >
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
                  {{ getCurrentStatusText(row) }}
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
                    class="action-btn-primary"
                    :loading="row.uploadingKeys"
                    :disabled="row.heRecord?.public_keys_ready"
                    @click="uploadHePublicKeys(row)"
                  >
                    {{ row.heRecord?.public_keys_ready ? '已请求' : '请求交付' }}
                  </el-button>
                  <el-button
                    v-if="isHeRow(row)"
                    size="small"
                    type="success"
                    class="action-btn-secondary"
                    :loading="row.downloading"
                    :disabled="!canDownloadHeResult(row)"
                    @click="downloadResult(row)"
                  >
                    下载结果
                  </el-button>
                  <el-button
                    v-if="isFlRow(row)"
                    size="small"
                    type="primary"
                    class="action-btn-primary"
                    :loading="row.requestingFlDelivery"
                    :disabled="Boolean(row.flRecord?.pcp_contract_id)"
                    @click="openFlRequestDialog(row)"
                  >
                    {{ getBuyerFlActionLabel(row) }}
                  </el-button>
                  <el-button
                    v-if="isFlRow(row)"
                    size="small"
                    type="success"
                    class="action-btn-secondary"
                    :loading="row.downloadingFl"
                    :disabled="!canDownloadFlBuyerResult(row)"
                    @click="downloadFlResult(row)"
                  >
                    下载结果
                  </el-button>
                  <el-button
                    v-if="isPreRow(row)"
                    size="small"
                    type="primary"
                    class="action-btn-primary"
                    :loading="row.uploadingPreKey"
                    :disabled="row.preRecord?.buyer_public_key_ready"
                    @click="uploadPrePublicKey(row)"
                  >
                    {{ row.preRecord?.buyer_public_key_ready ? '已完成' : '请求交付' }}
                  </el-button>
                  <el-button
                    v-if="isPreRow(row)"
                    size="small"
                    type="success"
                    class="action-btn-secondary"
                    :loading="row.downloadingPre"
                    :disabled="!canDownloadPreResult(row)"
                    @click="downloadPreResult(row)"
                  >
                    下载结果
                  </el-button>
                  <el-button
                    v-if="isMpcRow(row)"
                    size="small"
                    type="primary"
                    class="action-btn-primary"
                    :loading="row.processingMpc"
                    :disabled="!canTriggerMpcBuyerAction(row)"
                    @click="openMpcDialog(row)"
                  >
                    {{ getBuyerMpcActionLabel(row) }}
                  </el-button>
                  <el-button
                    v-if="isMpcRow(row)"
                    size="small"
                    type="success"
                    class="action-btn-secondary"
                    :loading="row.viewingMpcResult"
                    :disabled="row.mpcRecord?.task_status !== 'done'"
                    @click="viewMpcResult(row)"
                  >
                    查看结果
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="resultList.length" class="pagination-bar">
            <el-pagination
              background
              layout="prev, pager, next"
              :current-page="pagination.page"
              :page-size="pagination.pageSize"
              :total="resultList.length"
              @current-change="handleBuyerPageChange"
            />
          </div>
        </div>

        <el-dialog v-model="flDialog.visible" title="请求交付" width="680px">
          <div v-if="flDialog.row" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span class="dialog-value">{{ flDialog.row.transaction_id }}</span>
            </div>
            <div class="dialog-grid">
              <div class="dialog-field">
                <span class="dialog-label">顶层模型初始包</span>
                <div class="file-action-group">
                  <input ref="buyerFlTopModelInput" class="hidden-file-input" type="file" accept=".zip,application/zip" @change="onFlBuyerFileChange('topModelFile', $event)" />
                  <el-button size="small" plain @click="openFileSelector('buyerFlTopModelInput')">
                    选择文件
                  </el-button>
                </div>
                <div v-if="flDialog.topModelFile" class="file-name inline-file-name">{{ flDialog.topModelFile.name }}</div>
              </div>

              <div class="dialog-field">
                <span class="dialog-label">底层模型初始包</span>
                <div class="file-action-group">
                  <input ref="buyerFlBottomModelInput" class="hidden-file-input" type="file" accept=".zip,application/zip" @change="onFlBuyerFileChange('bottomModelFile', $event)" />
                  <el-button size="small" plain @click="openFileSelector('buyerFlBottomModelInput')">
                    选择文件
                  </el-button>
                </div>
                <div v-if="flDialog.bottomModelFile" class="file-name inline-file-name">{{ flDialog.bottomModelFile.name }}</div>
              </div>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeFlRequestDialog">取消</el-button>
            <el-button type="primary" :loading="flDialog.submitting" @click="submitFlRequest">
              请求交付
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="decryptDialog.visible" title="下载交付结果" width="620px">
          <div v-if="decryptDialog.row" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交付算法</span>
              <span>{{ getHeOperationLabel(decryptDialog.operation) }}</span>
            </div>
            <div class="dialog-row file-row">
              <span class="dialog-label">解密文件</span>
              <div class="file-action-group">
                <input ref="hePrivateKeyInput" class="hidden-file-input" type="file" accept=".json" @change="onPrivateKeyFileChange" />
                <el-button size="small" plain @click="openFileSelector('hePrivateKeyInput')">
                  选择文件
                </el-button>
              </div>
            </div>
            <div v-if="decryptDialog.privateKeyFile" class="file-name">
              {{ decryptDialog.privateKeyFile.name }}
            </div>
            <div class="dialog-hint">
              <span>请选择交付时下载的解密文件，系统会在本地解密并下载结果。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeDecryptDialog">取消</el-button>
            <el-button type="primary" :loading="decryptDialog.processing" @click="confirmDecryptResult">
              解密并下载
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="preDecryptDialog.visible" title="本地解密 PRE 结果" width="620px">
          <div v-if="preDecryptDialog.row" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ preDecryptDialog.row.transaction_id }}</span>
            </div>
            <div class="dialog-row file-row">
              <span class="dialog-label">PRE 私钥文件</span>
              <div class="file-action-group">
                <input ref="prePrivateKeyInput" class="hidden-file-input" type="file" accept=".json" @change="onPrePrivateKeyFileChange" />
                <el-button size="small" plain @click="openFileSelector('prePrivateKeyInput')">
                  选择文件
                </el-button>
              </div>
            </div>
            <div v-if="preDecryptDialog.privateKeyFile" class="file-name">
              {{ preDecryptDialog.privateKeyFile.name }}
            </div>
            <div class="dialog-hint">
              <span>请选择 `.json` 私钥文件，浏览器会在本地解密 PRE 结果，并直接导出原始压缩包。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closePreDecryptDialog">取消</el-button>
            <el-button type="primary" :loading="preDecryptDialog.processing" @click="confirmDecryptPreResult">
              解密并导出压缩包
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
                <input ref="flPrivateKeyInput" class="hidden-file-input" type="file" accept=".json" @change="onFlPrivateKeyFileChange" />
                <el-button size="small" plain @click="openFileSelector('flPrivateKeyInput')">
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

        <el-dialog v-model="mpcDialog.visible" title="发起 MPC 计算" width="520px">
          <div v-if="mpcDialog.row" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ mpcDialog.row.transaction_id }}</span>
            </div>
            <div class="dialog-field">
              <span class="dialog-label">目标阈值</span>
              <el-input v-model="mpcDialog.threshold" placeholder="请输入本次比较的目标阈值" />
            </div>
            <div class="dialog-hint compact-hint">
              <span>买方设置比较门槛，卖方提交待比较数据后系统会自动完成计算并返回是否达到要求。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeMpcDialog">取消</el-button>
            <el-button type="primary" :loading="mpcDialog.submitting" @click="submitMpcTask()">
              请求交付
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="mpcResultDialog.visible" title="计算结果" width="720px">
          <div v-if="mpcResultDialog.row && mpcResultDialog.result" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">比较结果</span>
              <span>{{ getMpcResultText(mpcResultDialog.result.output_value) }}</span>
            </div>
            <div class="dialog-row">
              <span class="dialog-label">目标阈值</span>
              <span>{{ formatMpcThreshold(mpcResultDialog.row) }}</span>
            </div>
            <div class="dialog-hint compact-hint">
              <span>系统已基于卖方提交的数据完成隐私计算，返回本次比较是否达到要求，过程中不会展示对方原始值。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeMpcResultDialog">关闭</el-button>
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
              <button class="confirm-button" @click="closeContractInfo">确认</button>
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
import flCrypto from '@/utils/flCrypto'
import heCrypto from '@/utils/heCrypto'
import heCsv from '@/utils/heCsv'
import preCrypto from '@/utils/preCrypto'

const API_BASE = 'http://10.112.47.214:3000'

export default {
  name: 'DeliveryBuyer',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      userId: '',
      username: '',
      isLoading: false,
      resultList: [],
      pagination: {
        page: 1,
        pageSize: 10
      },
      contractInfo: { visible: false, data: null },
      decryptDialog: {
        visible: false,
        row: null,
        algorithm: '',
        operation: '',
        encryptedText: '',
        privateKeyFile: null,
        processing: false
      },
      preDecryptDialog: {
        visible: false,
        row: null,
        encryptedBlob: null,
        privateKeyFile: null,
        processing: false
      },
      flDialog: {
        visible: false,
        row: null,
        topModelFile: null,
        bottomModelFile: null,
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
        threshold: '',
        submitting: false
      },
      mpcResultDialog: {
        visible: false,
        row: null,
        result: null
      }
    }
  },
  async created() {
    await this.initUser()
    await this.refreshResults()
  },
  computed: {
    pagedResultList() {
      const start = (this.pagination.page - 1) * this.pagination.pageSize
      return this.resultList.slice(start, start + this.pagination.pageSize)
    }
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

    async getAllBuyerAddresses() {
  const addresses = []

  const sources = [
    { org: 'wx-org1.chainmaker.org', api: 'get-certificates' },
    { org: 'wx-org2.chainmaker.org', api: 'get-certificates2' }
  ]

  for (const source of sources) {
    let certs = []

    try {
      const response = await axios.post(`${API_BASE}/api/${source.api}`, {
        userId: this.userId
      })

      certs = Array.isArray(response.data.certificates)
        ? response.data.certificates
        : []
    } catch (error) {
      console.warn(`获取 ${source.api} 失败，跳过该组织:`, error?.response?.data || error.message)
      continue
    }

    for (const cert of certs) {
      const certName = cert.cert

      if (!certName) {
        continue
      }

      try {
        const address = cert.address

        if (address) {
          addresses.push(address)
        }
      } catch (error) {
        console.warn(`跳过无效/过期证书 ${certName}:`, error?.response?.data || error.message)
        continue
      }
    }
  }

  return [...new Set(addresses)]
},

    async refreshResults() {
      this.isLoading = true
      try {
        const buyerAddresses = await this.getAllBuyerAddresses()
        if (!buyerAddresses.length) {
          this.resultList = []
          this.$message?.warning('当前用户未找到可用证书地址')
          return
        }

        const rows = []
        for (const address of buyerAddresses) {
          try {
            const response = await axios.get(`${API_BASE}/api/buyer-transaction-status/${address}`)
            const transactions = Array.isArray(response.data.transactions) ? response.data.transactions : []

            transactions
              .filter((item) => item.status === '已确认' && this.normalizePcType(item.pc_type))
              .forEach((item) => {
                rows.push({
                  transaction_id: item.transaction_id,
                  pc_type: this.normalizePcType(item.pc_type),
                  buyer_address: item.buyer_address,
                  seller_address: item.seller_address,
                  quantity: item.quantity,
                  flRecord: null,
                  heRecord: null,
                  preRecord: null,
                  mpcRecord: null,
                  uploadingKeys: false,
                  requestingFlDelivery: false,
                  downloading: false,
                  downloadingFl: false,
                  downloadingPre: false,
                  uploadingPreKey: false,
                  syncingHe: false,
                  syncingFl: false,
                  syncingPre: false,
                  syncingMpc: false,
                  processingPre: false,
                  processingMpc: false,
                  viewingMpcResult: false
                })
              })
          } catch (error) {
            console.warn('加载买家交易失败:', address, error?.message || error)
          }
        }

        this.resultList = rows.sort((left, right) => this.compareTransactionIdDesc(left, right))
        this.ensureBuyerPageInRange()
        await this.syncBuyerPageStatus()
      } catch (error) {
        console.error('加载结果失败:', error)
        this.$message?.error('加载结果失败')
      } finally {
        this.isLoading = false
      }
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

    ensureBuyerPageInRange() {
      const totalPages = Math.max(1, Math.ceil(this.resultList.length / this.pagination.pageSize))
      this.pagination.page = Math.min(Math.max(this.pagination.page, 1), totalPages)
    },

    async syncBuyerPageStatus() {
      await Promise.all(this.pagedResultList.map((row) => (
        this.isHeRow(row)
          ? this.refreshHeStatus(row, false)
          : (this.isFlRow(row)
            ? this.refreshFlStatus(row, false)
            : (this.isPreRow(row)
              ? this.refreshPreStatus(row, false)
              : this.refreshMpcStatus(row, false)))
      )))
    },

    async handleBuyerPageChange(page) {
      this.pagination.page = page
      await this.syncBuyerPageStatus()
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
        const message = error?.response?.data?.message || error?.message || 'HE 状态刷新失败'
        if (showMessage) {
          this.$message?.error(message)
        }
      } finally {
        row.syncingHe = false
      }
    },

    getRowStatusText(status) {
      return heConfig.getHeStatusText(status || 'NOT_EXIST')
    },

    getPreStatusText(status) {
      return heConfig.getPcpStatusText(status || 'NOT_EXIST')
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

    getBuyerDeliveryStatus(row) {
      if (this.isMpcRow(row)) {
        const currentStatus = String(this.getCurrentStatus(row) || '').toLowerCase()

        if (!row?.mpcRecord?.remote_task_id) {
          return 'WAIT_BUYER'
        }

        if (currentStatus === 'pending' || currentStatus === 'waiting_seller_data') {
          return 'WAIT_SELLER'
        }

        if (currentStatus === 'ready') {
          return 'WAIT_BUYER'
        }

        if (currentStatus === 'computing') {
          return 'PROCESSING'
        }

        if (currentStatus === 'done') {
          return 'COMPLETED'
        }

        if (currentStatus === 'failed') {
          return 'FAILED'
        }

        return 'PROCESSING'
      }

      const currentStatus = String(this.getCurrentStatus(row) || '').toUpperCase()

      if (this.isHeRow(row) && !row?.heRecord?.public_keys_ready) {
        return 'WAIT_BUYER'
      }

      if (this.isFlRow(row) && !row?.flRecord?.pcp_contract_id) {
        return 'WAIT_BUYER'
      }

      if (this.isPreRow(row) && !row?.preRecord?.buyer_public_key_ready) {
        return 'WAIT_BUYER'
      }

      if (
        currentStatus === 'NOT_EXIST' ||
        currentStatus === 'ACTIVE' ||
        currentStatus === 'CREATED' ||
        currentStatus === 'JOINED' ||
        currentStatus === 'WAITING_INPUT' ||
        currentStatus === 'WAITING_EPOCH_INPUT'
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

    getCurrentStatusText(row) {
      const currentStatus = String(this.getCurrentStatus(row) || '').toUpperCase()
      const labelMap = {
        WAIT_BUYER: '待买方操作',
        WAIT_SELLER: '待卖方交付',
        PROCESSING: currentStatus === 'PAMING' ? '审计中' : '计算中',
        COMPLETED: '已完成',
        FAILED: '失败'
      }
      return labelMap[this.getBuyerDeliveryStatus(row)] || '计算中'
    },

    canDownloadHeResult(row) {
      const status = String(row?.heRecord?.pcp_status || '').toUpperCase()
      return Boolean(row?.heRecord?.result_ready || status === 'PAM_PASSED' || status === 'COMPLETED')
    },

    canDownloadPreResult(row) {
      const status = String(row?.preRecord?.pcp_status || '').toUpperCase()
      return Boolean(row?.preRecord?.result_ready || status === 'PAM_PASSED' || status === 'COMPLETED')
    },

    canDownloadFlBuyerResult(row) {
      const status = String(row?.flRecord?.pcp_status || '').toUpperCase()
      return Boolean(row?.flRecord?.buyer_result_ready || status === 'PAM_PASSED' || status === 'COMPLETED')
    },

    getBuyerFlActionLabel(row) {
      if (!row?.flRecord?.pcp_contract_id) {
        return '请求交付'
      }

      return '已请求'
    },

    getStatusPillClass(row) {
      switch (this.getBuyerDeliveryStatus(row)) {
        case 'COMPLETED':
          return 'status-pill-success'
        case 'FAILED':
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
            entityId: row.buyer_address
          }
        })
        row.flRecord = response.data?.item || null
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

    getBuyerMpcActionLabel(row) {
      if (!row?.mpcRecord?.remote_task_id) {
        return '请求交付'
      }

      switch (String(row?.mpcRecord?.task_status || '').toLowerCase()) {
        case 'failed':
          return '请求交付'
        case 'pending':
        case 'waiting_seller_data':
          return '等待卖方'
        case 'ready':
        case 'computing':
          return '处理中'
        case 'done':
          return '已完成'
        default:
          return '处理中'
      }
    },

    canTriggerMpcBuyerAction(row) {
      const status = String(row?.mpcRecord?.task_status || '').toLowerCase()
      return !row?.mpcRecord?.remote_task_id || status === 'failed'
    },

    openMpcDialog(row) {
      if (!row?.transaction_id) return
      this.mpcDialog.visible = true
      this.mpcDialog.row = row
      this.mpcDialog.threshold = row?.mpcRecord?.compute_params?.threshold ?? ''
      this.mpcDialog.submitting = false
    },

    async submitMpcTask() {
      const row = this.mpcDialog.row
      if (!row?.transaction_id) return

      const threshold = Number(this.mpcDialog.threshold)
      if (!Number.isFinite(threshold) || threshold < 0) {
        this.$message?.warning('目标阈值必须是非负数字')
        return
      }

      row.processingMpc = true
      this.mpcDialog.submitting = true
      try {
        const formData = new FormData()
        formData.append('transaction_id', row.transaction_id)
        formData.append('threshold', String(threshold))

        await axios.post(`${API_BASE}/api/privacy/mpc/create-task`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        await this.refreshMpcStatus(row, false)
        this.$message?.success('MPC 任务已创建，等待卖方提交材料')
        this.closeMpcDialog()
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'MPC 任务创建失败'
        this.$message?.error(message)
      } finally {
        row.processingMpc = false
        this.mpcDialog.submitting = false
      }
    },

    async viewMpcResult(row) {
      if (!row?.transaction_id) return

      row.viewingMpcResult = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/mpc/result`, {
          params: { transaction_id: row.transaction_id }
        })
        this.mpcResultDialog.visible = true
        this.mpcResultDialog.row = row
        this.mpcResultDialog.result = response.data?.data?.result || null
        await this.refreshMpcStatus(row, false)
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'MPC 结果查询失败'
        this.$message?.error(message)
      } finally {
        row.viewingMpcResult = false
      }
    },

    formatMpcBoolean(value) {
      if (typeof value === 'boolean') {
        return value ? '是' : '否'
      }
      return '-'
    },

    getMpcResultText(value) {
      if (typeof value === 'boolean') {
        return value ? '达到要求' : '未达到要求'
      }
      return '-'
    },

    getHeOperationLabel(operation) {
      return String(operation || '').trim().toUpperCase() === 'MUL' ? '乘法' : '加法'
    },

    formatMpcThreshold(row) {
      const threshold = row?.mpcRecord?.compute_params?.threshold
      return threshold === undefined || threshold === null || threshold === '' ? '-' : String(threshold)
    },

    async uploadHePublicKeys(row) {
      if (!row?.transaction_id) return
      row.uploadingKeys = true
      try {
        const keyPairs = await heCrypto.generateHeKeyPairs()
        const publicPayload = heCrypto.buildHePublicKeyPayload(keyPairs)

        await axios.post(`${API_BASE}/api/privacy/he/public-keys`, {
          transactionId: row.transaction_id,
          ...publicPayload
        })

        heCrypto.downloadPrivateKeyFile({
          algorithm: 'Paillier',
          transactionId: row.transaction_id,
          keyMaterial: keyPairs.paillier.privateKey
        })
        heCrypto.downloadPrivateKeyFile({
          algorithm: 'ElGamal',
          transactionId: row.transaction_id,
          keyMaterial: keyPairs.elgamal.privateKey
        })

        await this.refreshHeStatus(row, false)
        this.$message?.success('交付申请已提交，解密文件已下载')
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || '交付申请提交失败'
        this.$message?.error(message)
      } finally {
        row.uploadingKeys = false
      }
    },

    openFlRequestDialog(row) {
      if (!row?.transaction_id) return
      this.flDialog.visible = true
      this.flDialog.row = row
      this.flDialog.topModelFile = null
      this.flDialog.bottomModelFile = null
    },

    onFlBuyerFileChange(field, event) {
      this.flDialog[field] = event.target.files?.[0] || null
      event.target.value = ''
    },

    openFileSelector(refName) {
      this.$refs[refName]?.click?.()
    },

    async submitFlRequest() {
      if (!this.flDialog.row) return
      if (!this.flDialog.topModelFile || !this.flDialog.bottomModelFile) {
        this.$message?.warning('请先选择 Top 模型和 Bottom 模型文件')
        return
      }
      if (!String(this.flDialog.topModelFile.name || '').toLowerCase().endsWith('.zip')) {
        this.$message?.warning('Top 模型初始包仅支持 zip 文件')
        return
      }
      if (!String(this.flDialog.bottomModelFile.name || '').toLowerCase().endsWith('.zip')) {
        this.$message?.warning('Bottom 模型初始包仅支持 zip 文件')
        return
      }

      const row = this.flDialog.row
      row.requestingFlDelivery = true
      this.flDialog.submitting = true
      try {
        const keyMaterial = await flCrypto.generateFlKeyPair()

        const formData = new FormData()
        formData.append('transactionId', row.transaction_id)
        formData.append('sellerIds', row.seller_address)
        formData.append('buyerResultPublicKey', keyMaterial.publicKeyHex)
        formData.append('top_model_initial_package', this.flDialog.topModelFile, this.flDialog.topModelFile.name)
        formData.append('bottom_model_initial_package', this.flDialog.bottomModelFile, this.flDialog.bottomModelFile.name)

        const response = await axios.post(`${API_BASE}/api/privacy/fl/create-contract`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        flCrypto.downloadFlPrivateKeyFile({
          role: 'buyer',
          transactionId: row.transaction_id,
          privateKeyPem: keyMaterial.privateKeyPem
        })

        row.flRecord = response.data?.item || row.flRecord
        await this.refreshFlStatus(row, false)
        this.$message?.success(response.data?.message || 'FL 交付请求已提交，私钥已下载到本地')
        this.closeFlRequestDialog()
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'FL 交付请求提交失败'
        this.$message?.error(message)
      } finally {
        row.requestingFlDelivery = false
        this.flDialog.submitting = false
      }
    },

    async downloadResult(row) {
      if (!row?.transaction_id || !this.canDownloadHeResult(row)) {
        this.$message?.warning('当前结果尚不可下载')
        return
      }

      row.downloading = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/he/result`, {
          params: { transactionId: row.transaction_id },
          responseType: 'blob'
        })

        const algorithm = response.headers['x-he-enc-type'] || row.heRecord?.selected_enc_type || ''
        const encryptedText = await heCsv.blobToText(response.data)

        this.decryptDialog.visible = true
        this.decryptDialog.row = row
        this.decryptDialog.algorithm = algorithm
        this.decryptDialog.operation = row.heRecord?.selected_operation || ''
        this.decryptDialog.encryptedText = encryptedText
        this.decryptDialog.privateKeyFile = null
      } catch (error) {
        const message = await this.resolveBlobErrorMessage(error, '下载 HE 结果失败')
        this.$message?.error(message)
      } finally {
        row.downloading = false
      }
    },

    async uploadPrePublicKey(row) {
      if (!row?.transaction_id || row.preRecord?.buyer_public_key_ready) return

      row.uploadingPreKey = true
      try {
        const keyMaterial = await preCrypto.generatePreBuyerKeyPair({
          transactionId: row.transaction_id
        })
        await axios.post(`${API_BASE}/api/privacy/pre/buyer-public-key`, {
          transactionId: row.transaction_id,
          buyerPublicKey: keyMaterial.publicKey
        })
        preCrypto.downloadPrePrivateKeyFile({
          transactionId: row.transaction_id,
          privateScalarHex: keyMaterial.privateScalarHex,
          publicKey: keyMaterial.publicKey
        })

        await this.refreshPreStatus(row, false)
        this.$message?.success('PRE 公钥上传成功，私钥已下载到本地')
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'PRE 公钥上传失败'
        this.$message?.error(message)
      } finally {
        row.uploadingPreKey = false
      }
    },

    async downloadPreResult(row) {
      if (!row?.transaction_id || !this.canDownloadPreResult(row)) {
        this.$message?.warning('当前 PRE 结果尚不可下载')
        return
      }

      row.downloadingPre = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/pre/result`, {
          params: { transactionId: row.transaction_id },
          responseType: 'blob'
        })

        this.preDecryptDialog.visible = true
        this.preDecryptDialog.row = row
        this.preDecryptDialog.encryptedBlob = response.data
        this.preDecryptDialog.privateKeyFile = null
      } catch (error) {
        const message = await this.resolveBlobErrorMessage(error, '下载 PRE 结果失败')
        this.$message?.error(message)
      } finally {
        row.downloadingPre = false
      }
    },

    async downloadFlResult(row) {
      if (!row?.transaction_id || !this.canDownloadFlBuyerResult(row)) {
        this.$message?.warning('当前 Top 模型尚不可下载')
        return
      }

      row.downloadingFl = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/fl/result`, {
          params: {
            transactionId: row.transaction_id,
            receiverRole: 'buyer',
            resultRole: 'fl_top_model'
          },
          responseType: 'blob'
        })

        this.flDecryptDialog.visible = true
        this.flDecryptDialog.row = row
        this.flDecryptDialog.encryptedBlob = response.data
        this.flDecryptDialog.privateKeyFile = null
        this.flDecryptDialog.processing = false
        this.flDecryptDialog.resultRole = 'fl_top_model'
        this.flDecryptDialog.filename = ''
      } catch (error) {
        const message = await this.resolveBlobErrorMessage(error, '下载 Top 模型失败')
        this.$message?.error(message)
      } finally {
        row.downloadingFl = false
      }
    },

    onPrivateKeyFileChange(event) {
      this.decryptDialog.privateKeyFile = event.target.files?.[0] || null
      event.target.value = ''
    },

    onPrePrivateKeyFileChange(event) {
      this.preDecryptDialog.privateKeyFile = event.target.files?.[0] || null
      event.target.value = ''
    },

    onFlPrivateKeyFileChange(event) {
      this.flDecryptDialog.privateKeyFile = event.target.files?.[0] || null
      event.target.value = ''
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

    async confirmDecryptResult() {
      if (!this.decryptDialog.privateKeyFile || !this.decryptDialog.row) {
        this.$message?.warning('请先选择解密文件')
        return
      }

      this.decryptDialog.processing = true
      try {
        const privateKeyText = await this.decryptDialog.privateKeyFile.text()
        const parsedKey = heCrypto.parseHeKeyMaterial(privateKeyText)
        heCrypto.assertHePrivateKeyMatchesRecord({
          parsedKey,
          algorithm: this.decryptDialog.algorithm,
          transactionId: this.decryptDialog.row.transaction_id,
          record: this.decryptDialog.row.heRecord
        })
        const plaintextCsv = await heCrypto.decryptHeResultCsv({
          algorithm: this.decryptDialog.algorithm,
          encryptedCsvText: this.decryptDialog.encryptedText,
          privateKeyText
        })

        heCsv.downloadCsvText({
          csvText: plaintextCsv,
          filename: `he_result_${this.decryptDialog.row.transaction_id}.csv`
        })

        this.$message?.success('交付结果已解密并下载')
        this.closeDecryptDialog()
      } catch (error) {
        const rawMessage = error?.message || ''
        const message = /match|mismatch|private key|Unsupported HE key file algorithm|transactionId/i.test(rawMessage)
          ? '解密文件与当前交易不匹配，请重新选择。'
          : (rawMessage || '结果解密失败')
        this.$message?.error(message)
      } finally {
        this.decryptDialog.processing = false
      }
    },

    closeDecryptDialog() {
      this.decryptDialog.visible = false
      this.decryptDialog.row = null
      this.decryptDialog.algorithm = ''
      this.decryptDialog.operation = ''
      this.decryptDialog.encryptedText = ''
      this.decryptDialog.privateKeyFile = null
      this.decryptDialog.processing = false
    },

    async confirmDecryptPreResult() {
      if (!this.preDecryptDialog.privateKeyFile || !this.preDecryptDialog.row || !this.preDecryptDialog.encryptedBlob) {
        this.$message?.warning('请先选择 PRE 私钥文件')
        return
      }

      this.preDecryptDialog.processing = true
      try {
        const [privateKeyText, encryptedTarBuffer] = await Promise.all([
          this.preDecryptDialog.privateKeyFile.text(),
          this.preDecryptDialog.encryptedBlob.arrayBuffer()
        ])
        const parsedKey = preCrypto.parsePrePrivateKeyMaterial(privateKeyText)
        preCrypto.assertPrePrivateKeyMatchesRecord({
          parsedKey,
          transactionId: this.preDecryptDialog.row.transaction_id,
          record: this.preDecryptDialog.row.preRecord
        })

        await preCrypto.downloadDecryptedPreResultArchive({
          encryptedZipBuffer: encryptedTarBuffer,
          privateKeyText,
          transactionId: this.preDecryptDialog.row.transaction_id
        })

        this.$message?.success('PRE 结果已在浏览器内解密并导出')
        this.closePreDecryptDialog()
      } catch (error) {
        this.$message?.error(error?.message || 'PRE 本地解密失败')
      } finally {
        this.preDecryptDialog.processing = false
      }
    },

    async confirmDecryptFlResult() {
      if (!this.flDecryptDialog.privateKeyFile || !this.flDecryptDialog.encryptedBlob) {
        this.$message?.warning('请先选择 FL 私钥文件')
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
          transactionId: this.flDecryptDialog.row?.transaction_id
        })

        this.$message?.success('FL 结果已在浏览器内解密并导出')
        this.closeFlDecryptDialog()
      } catch (error) {
        this.$message?.error(error?.message || 'FL 本地解密失败')
      } finally {
        this.flDecryptDialog.processing = false
      }
    },

    closePreDecryptDialog() {
      this.preDecryptDialog.visible = false
      this.preDecryptDialog.row = null
      this.preDecryptDialog.encryptedBlob = null
      this.preDecryptDialog.privateKeyFile = null
      this.preDecryptDialog.processing = false
    },

    closeFlRequestDialog() {
      this.flDialog.visible = false
      this.flDialog.row = null
      this.flDialog.topModelFile = null
      this.flDialog.bottomModelFile = null
      this.flDialog.submitting = false
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

    closeMpcDialog() {
      this.mpcDialog.visible = false
      this.mpcDialog.row = null
      this.mpcDialog.threshold = ''
      this.mpcDialog.submitting = false
    },

    closeMpcResultDialog() {
      this.mpcResultDialog.visible = false
      this.mpcResultDialog.row = null
      this.mpcResultDialog.result = null
    },

    async generateContractInfo(row) {
      try {
        const transactionId = row.transaction_id
        if (!transactionId) throw new Error('缺少 transaction_id')

        const txDetailRes = await axios.get(`${API_BASE}/api/get-transaction-detail/${transactionId}`)
        const tx = txDetailRes?.data?.transaction
        if (!tx) throw new Error('未获取到交易详情')

        const assetId = tx.asset_id
        const assetRes = await axios.get(`${API_BASE}/api/asset/${assetId}`)
        const assetInfo = assetRes?.data || {}

        return {
          contract_id: row.contract_id || `CONTRACT-${transactionId}`,
          contract_name: `${assetInfo.asset_name || '数字产品'}-数字合约`,
          contract_description:
            assetInfo.description ||
            '该数字合约依据平台交易信息自动生成，用于界定交易双方权责与限制条件',
          created_at:
            (tx.created_at && new Date(tx.created_at.replace(' ', 'T')).toISOString()) ||
            new Date().toISOString(),
          token_id: assetId,
          product_name: assetInfo.asset_name || '未知产品',
          delivery_method_label: this.getDeliveryMethodLabel(row),
          seller_name: tx.seller_name || tx.seller_username || tx.seller_address || '未知卖家',
          buyer_name: tx.buyer_name || tx.buyer_username || tx.buyer_address || '未知买家',
          seller_id: tx.seller_address ?? 'unknown-seller',
          buyer_id: tx.buyer_address ?? 'unknown-buyer',
          operations: ['所有'],
          constraints: {
            expiration_time: tx.expiration_time
              ? new Date(tx.expiration_time.replace(' ', 'T')).toISOString()
              : null,
            quantity: tx.quantity ?? null
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
      if (info) {
        this.contractInfo.data = info
        this.contractInfo.visible = true
      }
    },

    closeContractInfo() {
      this.contractInfo.visible = false
      this.contractInfo.data = null
    },

    formatDate(dateString) {
      if (!dateString) return '-'
      try {
        const date = new Date(dateString)
        return date.toLocaleString('zh-CN', {
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
  --header-height: 60px;
  --sidebar-width: 280px;
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
  min-height: calc(100vh - var(--header-height));
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

.asset-upload-container {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 0;
  margin: 0 12px 20px;
  box-shadow: var(--shadow-soft);
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
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

.action-cell :deep(.action-btn-primary.el-button.is-disabled) {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #fff;
  opacity: 0.65;
}

.action-cell :deep(.action-btn-primary.el-button.is-disabled:hover) {
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

.dialog-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.dialog-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.file-name {
  margin-left: 94px;
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

  .dialog-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .dialog-grid {
    grid-template-columns: 1fr;
  }

  .file-name {
    margin-left: 0;
  }

  .contract-grid {
    grid-template-columns: 1fr;
  }
}
</style>
