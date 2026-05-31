<template>
  <div class="delivery">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />

      <div class="content">
        <div class="page-header">
          <div>
            <h2 class="title">资产交付</h2>
            <p class="subtitle">按数字合约约定的隐私计算方式进行交付</p>
          </div>
          <el-button type="primary" plain @click="fetchRequestedAssets" :loading="isLoadingTransactions">
            刷新交易列表
          </el-button>
        </div>

        <div class="asset-upload-container">
          <el-table :data="requestedAssets" border stripe v-loading="isLoadingTransactions" style="width: 100%">
            <el-table-column prop="transaction_id" label="交易ID" min-width="180" />

            <el-table-column label="交付状态" width="180">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(getCurrentStatus(row))">
                  {{ getStatusText(getCurrentStatus(row)) }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column label="交付方法" width="120">
              <template #default="{ row }">
                <span class="method-pill">{{ getDeliveryMethodLabel(row) }}</span>
              </template>
            </el-table-column>

            <el-table-column label="数字合约" width="140">
              <template #default="{ row }">
                <el-button size="small" @click="viewContract(row)">查看合约</el-button>
              </template>
            </el-table-column>

            <el-table-column label="交付" min-width="420">
              <template #default="{ row }">
                <div class="action-cell">
                  <el-button v-if="isHeRow(row)" size="small" type="primary" :loading="row.checkingHe" @click="openHeDelivery(row)">
                    HE 交付
                  </el-button>
                  <el-button v-if="isPreRow(row)" size="small" type="warning" :loading="row.processingPre" @click="openPreDelivery(row)">
                    PRE 交付
                  </el-button>
                  <el-button v-if="isHeRow(row)" size="small" @click="refreshHeStatus(row)" :loading="row.syncingHe">
                    刷新 HE
                  </el-button>
                  <el-button v-if="isPreRow(row)" size="small" @click="refreshPreStatus(row)" :loading="row.syncingPre">
                    刷新 PRE
                  </el-button>
                  <span class="helper-text" v-if="isHeRow(row) && row.heRecord?.public_keys_ready === false">
                    等待买方上传 HE 公钥
                  </span>
                  <span class="helper-text" v-else-if="isHeRow(row) && row.heRecord?.selected_enc_type">
                    {{ row.heRecord.selected_enc_type }} / {{ row.heRecord.selected_operation || '-' }}
                  </span>
                  <span class="helper-text" v-if="isPreRow(row) && row.preRecord?.pcp_status">
                    PRE: {{ getStatusText(row.preRecord.pcp_status) }}
                  </span>
                </div>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-dialog v-model="heDialog.visible" title="HE 交付" width="620px">
          <div v-if="heDialog.asset" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ heDialog.asset.transaction_id }}</span>
            </div>

            <div class="dialog-row">
              <span class="dialog-label">加密算法</span>
              <el-select v-model="heDialog.encType" placeholder="请选择算法" @change="handleEncTypeChange">
                <el-option
                  v-for="item in heEncTypeOptions"
                  :key="item"
                  :label="item"
                  :value="item"
                />
              </el-select>
            </div>

            <div class="dialog-row">
              <span class="dialog-label">操作符</span>
              <el-select v-model="heDialog.operation" placeholder="请选择操作符">
                <el-option
                  v-for="item in heOperationOptions"
                  :key="item"
                  :label="item"
                  :value="item"
                />
              </el-select>
            </div>

            <div class="dialog-row file-row">
              <span class="dialog-label">CSV 文件 1</span>
              <input type="file" accept=".csv" @change="onDialogFileChange('file1', $event)" />
            </div>
            <div v-if="heDialog.file1" class="file-name">{{ heDialog.file1.name }}</div>

            <div class="dialog-row file-row">
              <span class="dialog-label">CSV 文件 2</span>
              <input type="file" accept=".csv" @change="onDialogFileChange('file2', $event)" />
            </div>
            <div v-if="heDialog.file2" class="file-name">{{ heDialog.file2.name }}</div>

            <div class="dialog-hint">
              <span>上传原始数字 CSV，浏览器会使用当前交易绑定的 HE 公钥先加密，再提交交付。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closeHeDialog">取消</el-button>
            <el-button type="primary" :loading="heDialog.submitting" @click="submitHeDelivery">
              提交交付
            </el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="preDialog.visible" title="PRE 交付" width="620px">
          <div v-if="preDialog.asset" class="dialog-body">
            <div class="dialog-row">
              <span class="dialog-label">交易ID</span>
              <span>{{ preDialog.asset.transaction_id }}</span>
            </div>

            <div class="dialog-row file-row">
              <span class="dialog-label">原始压缩包</span>
              <input
                type="file"
                accept=".zip,.tar,.tar.gz,.tgz,application/zip,application/x-tar,application/gzip"
                @change="onPreFileChange"
              />
            </div>
            <div v-if="preDialog.file" class="file-name">{{ preDialog.file.name }}</div>

            <div class="dialog-hint">
              <span>浏览器会在本地生成 PRE 三件套和 key package，再通过后端转发 PCP。</span>
            </div>
          </div>

          <template #footer>
            <el-button @click="closePreDialog">取消</el-button>
            <el-button type="primary" :loading="preDialog.submitting" @click="submitPreDelivery">
              提交 PRE 交付
            </el-button>
          </template>
        </el-dialog>

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
      }
    }
  },
  computed: {
    heEncTypeOptions() {
      return heConfig.HE_ENC_TYPE_OPTIONS
    },
    heOperationOptions() {
      return heCrypto.resolveOperationOptions(this.heDialog.encType)
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
            certLists.push({ org: source.org, cert: cert.cert })
          })
        } catch (error) {
          console.error(`获取 ${source.api} 失败:`, error)
        }
      }

      const addresses = []
      for (const item of certLists) {
        try {
          const certPath = `/home/super/r/GoSDK/crypto-config/${item.org}/user/${item.cert}/${item.cert}.sign.crt`
          const response = await axios.post('http://10.112.47.214:9092/cert-to-addr', {
            cert_path: certPath
          })
          const address = response?.data?.ethereum?.address
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
                  heRecord: null,
                  preRecord: null,
                  checkingHe: false,
                  syncingHe: false,
                  syncingPre: false,
                  processingPre: false
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
            : this.refreshPreStatus(row, false)
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

    getDeliveryMethodLabel(row) {
      return heConfig.getDeliveryMethodLabel(this.isPreRow(row) ? heConfig.DELIVERY_METHOD_PRE : heConfig.DELIVERY_METHOD_HE)
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

    getStatusText(status) {
      return heConfig.getPcpStatusText(status)
    },

    getCurrentStatus(row) {
      return this.isPreRow(row)
        ? row.preRecord?.pcp_status || 'NOT_EXIST'
        : row.heRecord?.pcp_status || 'NOT_EXIST'
    },

    getStatusTagType(status) {
      switch (String(status || '').toUpperCase()) {
        case 'COMPLETED':
          return 'success'
        case 'FAILED':
        case 'AUDIT_FAILED':
          return 'danger'
        case 'RUNNING':
        case 'QUEUED':
        case 'WAITING_INPUT':
          return 'warning'
        default:
          return 'info'
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
        this.heDialog.encType = row.heRecord?.selected_enc_type || heConfig.HE_ENC_TYPE_OPTIONS[0]
        this.heDialog.operation = row.heRecord?.selected_operation || heCrypto.resolveOperationOptions(this.heDialog.encType)[0]
        this.heDialog.file1 = null
        this.heDialog.file2 = null
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'HE 公钥状态查询失败'
        this.$message?.error(message)
      } finally {
        row.checkingHe = false
      }
    },

    handleEncTypeChange() {
      const allowedOperations = heCrypto.resolveOperationOptions(this.heDialog.encType)
      if (!allowedOperations.includes(this.heDialog.operation)) {
        [this.heDialog.operation] = allowedOperations
      }
    },

    onDialogFileChange(field, event) {
      this.heDialog[field] = event.target.files?.[0] || null
      event.target.value = ''
    },

    async submitHeDelivery() {
      if (!this.heDialog.asset) return
      if (!this.heDialog.file1 || !this.heDialog.file2) {
        this.$message?.warning('请先选择两个 CSV 文件')
        return
      }

      this.heDialog.submitting = true
      try {
        const publicKey = heCrypto.selectHePublicKey(this.heDialog.asset.heRecord, this.heDialog.encType)
        if (!publicKey) {
          throw new Error(`缺少 ${this.heDialog.encType} 对应的公钥`)
        }

        const [file1Text, file2Text] = await Promise.all([
          this.heDialog.file1.text(),
          this.heDialog.file2.text()
        ])
        const [encryptedFile1Text, encryptedFile2Text] = await Promise.all([
          heCrypto.encryptHeCsv({
            algorithm: this.heDialog.encType,
            csvText: file1Text,
            publicKey
          }),
          heCrypto.encryptHeCsv({
            algorithm: this.heDialog.encType,
            csvText: file2Text,
            publicKey
          })
        ])

        const formData = new FormData()
        formData.append('transactionId', this.heDialog.asset.transaction_id)
        formData.append('encType', this.heDialog.encType)
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
        this.$message?.success(response.data?.message || 'HE 交付已提交')
        this.closeHeDialog()
      } catch (error) {
        const message = error?.response?.data?.message || error?.message || 'HE 提交失败'
        this.$message?.error(message)
      } finally {
        this.heDialog.submitting = false
      }
    },

    openPreDelivery(row) {
      if (!row?.transaction_id) return
      this.preDialog.visible = true
      this.preDialog.asset = row
      this.preDialog.file = null
    },

    onPreFileChange(event) {
      this.preDialog.file = event.target.files?.[0] || null
      event.target.value = ''
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
        const teeResp = await axios.get(`${API_BASE}/api/privacy/pre/tee-materials`, {
          params: { sellerId: assetRow.seller_address }
        })
        const teeMaterials = teeResp.data?.item || {}
        if (!teeMaterials.public_key || !teeMaterials.key_id) {
          throw new Error('TEE 材料返回不完整')
        }

        const payload = await preCrypto.createPrePublishPayload({
          file: this.preDialog.file,
          teePublicKeyHex: teeMaterials.public_key,
          teeKeyId: teeMaterials.key_id,
          producerId: assetRow.seller_address,
          taskId: `CONTRACT-${assetRow.transaction_id}`,
          contentType: 'archive'
        })

        const formData = new FormData()
        formData.append('transactionId', assetRow.transaction_id)
        formData.append('teeKeyId', teeMaterials.key_id)
        formData.append('key_package', payload.keyPackageHex)
        formData.append('source_cipher_file', payload.sourceCipherFile, payload.filenames.sourceCipherFile)
        formData.append('source_wrapped_key_file', payload.sourceWrappedKeyFile, payload.filenames.sourceWrappedKeyFile)
        formData.append('source_meta_file', payload.sourceMetaFile, payload.filenames.sourceMetaFile)

        const response = await axios.post(`${API_BASE}/api/privacy/pre/publish`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })

        assetRow.preRecord = response.data?.item || assetRow.preRecord
        this.$message?.success(response.data?.message || 'PRE 交付已提交')
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
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: #f5f6fa;
}

.main-content {
  display: flex;
  flex: 1;
}

.content {
  flex: 1;
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin: 0 30px 16px;
}

.title {
  margin: 0;
  font-size: 22px;
  color: #1f2329;
}

.subtitle {
  margin: 6px 0 0;
  color: #7a7f87;
  font-size: 13px;
}

.asset-upload-container {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  margin: 0 30px 20px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}

.method-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #edf7ee;
  color: #217a3c;
  font-size: 12px;
  font-weight: 600;
}

.status-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.action-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.helper-text {
  font-size: 12px;
  color: #7a7f87;
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

.dialog-label {
  min-width: 86px;
  color: #4b5563;
  font-size: 13px;
}

.file-row {
  align-items: flex-start;
}

.file-name,
.dialog-hint {
  margin-left: 100px;
  color: #6b7280;
  font-size: 12px;
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

.info-section + .info-section {
  margin-top: 18px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-item label {
  display: block;
  margin-bottom: 4px;
  color: #6b7280;
  font-size: 12px;
}

.description,
.address {
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

  .info-grid {
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
