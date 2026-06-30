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
          <el-table class="delivery-table" :data="requestedAssets" border v-loading="isLoadingTransactions" style="width: 100%">
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
                <!--
                临时隐藏校验合约入口。
                DeliverySeller2 当前未按行维护 contractVerified / verifyingContract，
                先去掉按钮和状态展示，避免误导用户。
                <el-button
                  size="small"
                  type="primary"
                  :loading="row.verifyingContract"
                  @click="verifyContract(row)"
                >
                  校验合约
                </el-button>

                <el-tag
                  v-if="row.contractVerified"
                  type="success"
                  size="small"
                >
                  已校验
                </el-tag>

                <el-tag
                  v-else
                  type="info"
                  size="small"
                >
                  未校验
                </el-tag>
                -->
              </template>
            </el-table-column>

            <el-table-column label="操作" min-width="432" align="center" header-align="center">
              <template #default="{ row }">
                <div class="action-cell">
                  <el-button v-if="isHeRow(row)" size="small" type="primary" class="action-btn-primary" :loading="row.checkingHe" @click="openHeDelivery(row)">
                    执行交付
                  </el-button>
                  <el-button
                    v-if="isFlRow(row) && !hasSellerJoinedFl(row)"
                    size="small"
                    type="primary"
                    class="action-btn-primary"
                    :loading="row.processingFl || row.checkingFl"
                    @click="openFlJoinDialog(row)"

                  >
                    {{ getSellerFlJoinActionLabel(row) }}
                  </el-button>
                  <el-button
                    v-else-if="isFlRow(row)"
                    size="small"
                    type="primary"
                    class="action-btn-primary action-btn-disabled-primary"
                    disabled
                  >
                    {{ getSellerFlJoinedLabel(row) }}
                  </el-button>
                  <el-button
                    v-if="isFlRow(row)"
                    size="small"
                    type="success"
                    class="action-btn-primary"
                    :loading="row.uploadingFlBatch || row.checkingFlBatch"
                    :disabled="!canOpenFlBatchDialog(row)"
                    @click="openFlBatchDialog(row)"
                  >
                    {{ getSellerFlBatchActionLabel(row) }}
                  </el-button>
                  <el-button v-if="isPreRow(row)" size="small" type="warning" class="action-btn-primary" :loading="row.processingPre || row.checkingPre" @click="openPreDelivery(row)">
                    执行交付
                  </el-button>
                  <el-button
                    v-if="isMpcRow(row)"
                    size="small"
                    type="primary"
                    :class="['action-btn-primary', { 'action-btn-disabled-primary': !canOpenMpcSellerDialog(row) }]"
                    :loading="row.uploadingMpc"
                    :disabled="!canOpenMpcSellerDialog(row)"
                    @click="openMpcSellerDialog(row)"
                  >
                    {{ getSellerMpcActionLabel(row) }}
                  </el-button>
                  <el-button
                    v-if="isFlRow(row)"
                    size="small"
                    type="primary"
                    class="action-btn-secondary"
                    :loading="row.downloadingFlBottom"
                    :disabled="!getSellerBottomModelPackage(row)"
                    @click="downloadFlSellerBottomModel(row)"
                  >
                    {{ getSellerFlBottomModelLabel(row) }}
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
                    {{ getSellerFlGradientLabel(row) }}
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>
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

        <el-dialog v-model="flJoinDialog.visible" title="提交 FL 材料" width="620px">
          <div v-if="flJoinDialog.asset" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ flJoinDialog.asset.transaction_id }}</span>
            </div>

            <div class="dialog-hint compact-hint">
              <span>提交后将为当前卖方在浏览器本地生成 FL RSA 密钥，并把公钥上传到 PCC 完成 seller join。</span>
            </div>

            <div class="dialog-hint compact-hint">
              <span>提交成功后，请立即下载并妥善保存卖方私钥文件，后续解密底模和梯度结果都要使用。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeFlJoinDialog">取消</el-button>
            <el-button type="primary" :loading="flJoinDialog.submitting" @click="submitFlJoin">
              提交材料
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="flBatchDialog.visible" title="发起 FL 训练" width="620px">
          <div v-if="flBatchDialog.asset" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ flBatchDialog.asset.transaction_id }}</span>
            </div>

            <div class="dialog-row file-row">
              <span class="dialog-label">Seller Batch ZIP</span>
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
            <div v-if="flBatchDialog.file" class="file-name">{{ flBatchDialog.file.name }}</div>

            <div class="dialog-hint compact-hint">
              <span>请上传卖方本地封装好的 batch ZIP。系统会将其转换为 PCC 所需的 epoch input bundle 并提交训练。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeFlBatchDialog">取消</el-button>
            <el-button type="primary" :loading="flBatchDialog.submitting" @click="submitFlBatch">
              发起训练
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="flDecryptDialog.visible" title="本地解密 FL 结果" width="620px">
          <div v-if="flDecryptDialog.row" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ flDecryptDialog.row.transaction_id }}</span>
            </div>
            <div class="dialog-row">
              <span class="dialog-label">结果类型</span>
              <span>{{ flDecryptDialog.resultRole }}</span>
            </div>
            <div class="dialog-row file-row">
              <span class="dialog-label">FL 私钥文件</span>
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
              <span>请选择 `.json` 私钥文件，浏览器会在本地解密 FL 结果，并直接导出原始文件。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeFlDecryptDialog">取消</el-button>
            <el-button type="primary" :loading="flDecryptDialog.processing" @click="confirmDecryptFlResult">
              解密并导出
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="mpcDialog.visible" title="提交材料" width="560px">
          <div v-if="mpcDialog.row" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ mpcDialog.row.transaction_id }}</span>
            </div>

            <div class="dialog-field">
              <span class="dialog-label">卖方 JSON 文件</span>
              <div class="file-action-group">
                <input ref="mpcSellerJsonInput" class="hidden-file-input" type="file" accept=".json,application/json" @change="onMpcFileChange" />
                <el-button size="small" plain @click="openFileSelector('mpcSellerJsonInput')">
                  选择文件
                </el-button>
              </div>
              <div v-if="mpcDialog.file" class="file-name inline-file-name">{{ mpcDialog.file.name }}</div>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeMpcSellerDialog">取消</el-button>
            <el-button type="primary" :loading="mpcDialog.submitting" @click="submitMpcSellerData">
              提交材料
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
      flJoinDialog: {
        visible: false,
        asset: null,
        submitting: false
      },
      flBatchDialog: {
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
        file: null,
        submitting: false
      },
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
                  syncingHe: false,
                  syncingFl: false,
                  syncingPre: false,
                  syncingMpc: false,
                  processingPre: false,
                  processingFl: false,
                  uploadingMpc: false,
                  flBottomModelDownloaded: false,
                  downloadingFlBottom: false,
                  downloadingFlGradient: false
                })
              })
          } catch (error) {
            console.error(`加载卖家交易失败: ${address}`, error)
          }
        }

        this.requestedAssets = rows
        await Promise.all(this.requestedAssets.map((row) => (
          this.isHeRow(row)
            ? this.refreshHeStatus(row, false)
            : (this.isFlRow(row)
              ? this.refreshFlStatus(row, false)
              : (this.isPreRow(row)
                ? this.refreshPreStatus(row, false)
                : this.refreshMpcStatus(row, false)))
        )))
      } finally {
        this.isLoadingTransactions = false
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
        const labelMap = {
          WAIT_BUYER: '待买方创建',
          WAIT_SELLER: '待卖方交付',
          PROCESSING: '处理中',
          COMPLETED: '已完成',
          FAILED: '失败'
        }
        let baseLabel = labelMap[businessStatus] || '处理中'
        if (!this.isFlRow(rowOrStatus)) {
          return baseLabel
        }

        const flStatus = String(rowOrStatus?.flRecord?.pcp_status || '').toUpperCase()
        if (baseLabel === '待卖方交付' && flStatus === 'ACTIVE') {
          baseLabel = '等待 seller join'
        } else if (baseLabel === '待卖方交付' && flStatus === 'WAITING_EPOCH_INPUT') {
          baseLabel = '等待提交 Epoch'
        } else if (baseLabel === '处理中' && flStatus === 'PAMING') {
          baseLabel = '审计中'
        }

        const extras = []
        const hasActiveAttempt = Boolean(rowOrStatus?.flRecord?.current_attempt_id)
        if (hasActiveAttempt) {
          extras.push(`Attempt ${rowOrStatus.flRecord.current_attempt_id}`)
        }
        if (
          hasActiveAttempt &&
          Number.isFinite(Number(rowOrStatus?.flRecord?.current_epoch)) &&
          Number(rowOrStatus.flRecord.current_epoch) > 0
        ) {
          extras.push(`Epoch ${Number(rowOrStatus.flRecord.current_epoch)}`)
        }
        if (rowOrStatus?.flRecord?.summary?.seller_bottom_model_ready_count) {
          extras.push(`Bottom Ready ${rowOrStatus.flRecord.summary.seller_bottom_model_ready_count}`)
        }
        if (rowOrStatus?.flRecord?.summary?.seller_gradient_ready_count) {
          extras.push(`Gradient Ready ${rowOrStatus.flRecord.summary.seller_gradient_ready_count}`)
        }

        return extras.length ? `${baseLabel} · ${extras.join(' · ')}` : baseLabel
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
        return '等待买方创建'
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
      if (!row?.mpcRecord?.remote_task_id) {
        return false
      }

      const status = String(row?.mpcRecord?.task_status || '').toLowerCase()
      return status === 'pending' || status === 'waiting_seller_data' || status === 'failed'
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
      this.mpcDialog.file = null
      this.mpcDialog.submitting = false
    },

    onMpcFileChange(event) {
      this.mpcDialog.file = event.target.files?.[0] || null
      event.target.value = ''
    },

    async submitMpcSellerData() {
      const row = this.mpcDialog.row
      if (!row?.transaction_id) return
      if (!this.mpcDialog.file) {
        this.$message?.warning('请先选择 JSON 文件')
        return
      }

      if (!String(this.mpcDialog.file.name || '').toLowerCase().endsWith('.json')) {
        this.$message?.warning('仅支持上传 JSON 文件')
        return
      }

      row.uploadingMpc = true
      this.mpcDialog.submitting = true
      try {
        const formData = new FormData()
        formData.append('transaction_id', row.transaction_id)
        formData.append('file', this.mpcDialog.file, this.mpcDialog.file.name)

        await axios.post(`${API_BASE}/api/privacy/mpc/upload-seller-data`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        await this.refreshMpcStatus(row, false)
        this.$message?.success('MPC 卖方材料已提交')
        this.closeMpcSellerDialog()
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'MPC 材料提交失败'
        this.$message?.error(message)
      } finally {
        row.uploadingMpc = false
        this.mpcDialog.submitting = false
      }
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

    canOpenFlBatchDialog(row) {
      return Boolean(this.hasSellerJoinedFl(row) && this.hasDownloadedFlBottomModel(row))
    },

    getSellerFlJoinActionLabel(row) {
      const status = String(row?.flRecord?.pcp_status || '').toUpperCase()
      if (!row?.flRecord?.pcp_contract_id) {
        return '等待合同'
      }
      if (status === 'ACTIVE' || status === 'CREATED') {
        return '加入训练'
      }
      return '加入训练'
    },

    getSellerFlJoinedLabel(row) {
      const joinPackage = this.getSellerJoinPackage(row)
      if (joinPackage?.download_token) {
        return '已加入'
      }
      if (joinPackage?.token_status) {
        return '已加入待回写'
      }
      return '已加入'
    },

    getSellerFlBatchActionLabel(row) {
      const status = String(row?.flRecord?.pcp_status || '').toUpperCase()
      if (!this.hasSellerJoinedFl(row)) {
        return '先完成 Join'
      }
      if (!this.hasDownloadedFlBottomModel(row)) {
        return '先下载底模'
      }
      if (status === 'WAITING_EPOCH_INPUT') {
        return '提交 Epoch 输入'
      }
      if (status === 'PAMING') {
        return '审计中'
      }
      if (status === 'PAM_PASSED' || status === 'COMPLETED') {
        return '训练完成'
      }
      return '提交 Epoch 输入'
    },

    getSellerFlBottomModelLabel(row) {
      const joinPackage = this.getSellerJoinPackage(row)
      if (!joinPackage) {
        return '等待 Join'
      }
      if (!joinPackage.download_token) {
        return '等待底模回写'
      }
      return this.hasDownloadedFlBottomModel(row) ? '重新下载底模' : '下载底模'
    },

    getSellerFlGradientLabel(row) {
      const gradientPackage = this.getLatestSellerGradientPackage(row)
      if (!gradientPackage?.download_token) {
        return '等待梯度回写'
      }
      return '下载梯度包'
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

    async openFlJoinDialog(row) {
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

        if (!row.flRecord?.pcp_contract_id) {
          this.$message?.warning('买方尚未提交 FL 材料，请等待买方先创建合同')
          return
        }

        if (this.hasSellerJoinedFl(row)) {
          this.$message?.warning('当前卖方已完成 join，可直接下载底模')
          return
        }

        this.flJoinDialog.visible = true
        this.flJoinDialog.asset = row
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'FL 状态查询失败'
        this.$message?.error(message)
      } finally {
        row.checkingFl = false
      }
    },

    async openFlBatchDialog(row) {
      if (!row?.transaction_id) return

      row.checkingFlBatch = true
      try {
        const response = await axios.get(`${API_BASE}/api/privacy/fl/status`, {
          params: {
            transactionId: row.transaction_id,
            entityId: row.seller_address
          }
        })
        row.flRecord = response.data?.item || null

        if (!row.flRecord?.pcp_contract_id) {
          this.$message?.warning('买方尚未提交 FL 材料，请等待买方先创建合同')
          return
        }

        if (!this.hasSellerJoinedFl(row)) {
          this.$message?.warning('请先完成 seller join')
          return
        }

        if (!this.hasDownloadedFlBottomModel(row)) {
          this.$message?.warning('请先下载底模，再发起训练')
          return
        }

        this.flBatchDialog.visible = true
        this.flBatchDialog.asset = row
        this.flBatchDialog.file = null
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'FL 状态查询失败'
        this.$message?.error(message)
      } finally {
        row.checkingFlBatch = false
      }
    },

    onFlZipFileChange(event) {
      this.flBatchDialog.file = event.target.files?.[0] || null
      event.target.value = ''
    },

    openFileSelector(refName) {
      this.$refs[refName]?.click?.()
    },

    async submitFlJoin() {
      if (!this.flJoinDialog.asset) return

      const assetRow = this.flJoinDialog.asset
      if (!assetRow.flRecord?.pcp_contract_id) {
        this.$message?.warning('买方尚未创建 FL 合同')
        return
      }

      this.flJoinDialog.submitting = true
      assetRow.processingFl = true
      try {
        const keyMaterial = await flCrypto.generateFlKeyPair()
        await axios.post(`${API_BASE}/api/privacy/fl/join`, {
          transactionId: assetRow.transaction_id,
          sellerId: assetRow.seller_address,
          sellerPublicKey: keyMaterial.publicKeyHex
        })
        flCrypto.downloadFlPrivateKeyFile({
          role: 'seller',
          transactionId: assetRow.transaction_id,
          privateKeyPem: keyMaterial.privateKeyPem
        })
        await this.refreshFlStatus(assetRow, false)
        this.$message?.success('FL seller join 已提交，请先下载底模')
        this.closeFlJoinDialog()
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'FL 提交失败'
        this.$message?.error(message)
      } finally {
        this.flJoinDialog.submitting = false
        assetRow.processingFl = false
      }
    },

    async submitFlBatch() {
      if (!this.flBatchDialog.asset) return
      if (!this.flBatchDialog.file) {
        this.$message?.warning('请先选择 seller batch ZIP')
        return
      }

      const assetRow = this.flBatchDialog.asset
      if (!assetRow.flRecord?.pcp_contract_id) {
        this.$message?.warning('买方尚未创建 FL 合同')
        return
      }

      if (!this.hasSellerJoinedFl(assetRow)) {
        this.$message?.warning('请先完成 seller join')
        return
      }

      if (!this.hasDownloadedFlBottomModel(assetRow)) {
        this.$message?.warning('请先下载底模，再发起训练')
        return
      }

      this.flBatchDialog.submitting = true
      assetRow.uploadingFlBatch = true

      try {
        if (!String(this.flBatchDialog.file.name || '').toLowerCase().endsWith('.zip')) {
          throw new Error('仅支持上传 zip 压缩包')
        }

        const formData = new FormData()
        formData.append('transactionId', assetRow.transaction_id)
        formData.append('sellerId', assetRow.seller_address)
        formData.append('batch_zip', this.flBatchDialog.file, this.flBatchDialog.file.name)

        const response = await axios.post(`${API_BASE}/api/privacy/fl/upload-batch`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        assetRow.flRecord = response.data?.item || assetRow.flRecord
        await this.refreshFlStatus(assetRow, false)
        this.$message?.success(response.data?.message || 'FL Epoch 输入已提交')
        this.closeFlBatchDialog()
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'FL 提交失败'
        this.$message?.error(message)
      } finally {
        this.flBatchDialog.submitting = false
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

    closeFlJoinDialog() {
      this.flJoinDialog.visible = false
      this.flJoinDialog.asset = null
      this.flJoinDialog.submitting = false
    },

    closeFlBatchDialog() {
      this.flBatchDialog.visible = false
      this.flBatchDialog.asset = null
      this.flBatchDialog.file = null
      this.flBatchDialog.submitting = false
    },

    closeMpcSellerDialog() {
      this.mpcDialog.visible = false
      this.mpcDialog.row = null
      this.mpcDialog.file = null
      this.mpcDialog.submitting = false
    },

    async downloadFlSellerBottomModel(row) {
      await this.downloadFlSellerResult(row, {
        resultRole: 'fl_bottom_model',
        rowLoadingKey: 'downloadingFlBottom',
        filename: ''
      })
    },

    async downloadFlSellerGradient(row) {
      await this.downloadFlSellerResult(row, {
        resultRole: 'fl_gradient_epoch_bundle',
        batchIndex: null,
        rowLoadingKey: 'downloadingFlGradient',
        filename: ''
      })
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
  },
  async mounted() {
    await this.initUser()
    await this.fetchRequestedAssets()
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
