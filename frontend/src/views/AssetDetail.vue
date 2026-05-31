<template>
  <div class="asset-detail-page">
    <!-- 顶部导航栏 -->
    <AppHeader />

    <div class="main-content">
      <!-- 左侧边栏 -->
      <AppSidebar />

      <!-- 右侧内容区域 -->
      <div class="detail-content">
        <div class="asset-main">
          <!-- 左侧：图片模块 -->
          <div class="left-section">
            <img :src="`data:image/jpeg;base64,${asset.picture}`" alt="Asset Image" class="asset-image" />
            <div class="card description-section">
              <h2>资产描述</h2>
              <p>{{ asset.description }}</p>
              <h3>算法信息</h3>
              <p><strong>算法:</strong> {{ asset.algorithm || '无' }}</p>
              <p><strong>自定义算法:</strong> {{ asset.custom_algorithm || '无' }}</p>
            </div>
          </div>

          <!-- 右侧：资产详细信息和价格 -->
          <div class="right-section">
            <h1>{{ asset.asset_name }}</h1>
            <p><strong>资产ID:</strong> {{ asset.file_hash }}</p>
            <p><strong>所属领域:</strong> {{ asset.industry_raw_name }}</p>
            <p><strong>创建者ID:</strong> {{ asset.user_id }}</p>
            <p><strong>创建者地址:</strong>{{ asset.owner_address }}</p>
            <p><strong>当前拥有者:</strong> {{ asset.current_owner_address }}</p>


            <!-- 价格和购买模块 -->
            <div class="card price-section">
              <h3>当前价格</h3>
              <p class="price">{{ asset.price || 1200 }} RMB</p>
              <div class="button-control">
                <button class="buy-button" @click="openPurchaseModal">申请购买</button>
                <button class="follow-button">关注</button>
              </div>
            </div>

            <!-- 价格历史图表 -->
            <div class="card price-history-section">
              <h3>价格历史</h3>
              <canvas id="price-history-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- 交易历史表格 -->
        <div class="card history-section">
          <h3>交易历史</h3>
          <div class="transaction-table-container">
            <table class="transaction-table">
              <thead>
                <tr>
                  <th>事件</th>
                  <th>价格 (RMB)</th>
                  <th>卖家</th>
                  <th>买家</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="transaction in transactionHistory" :key="transaction.id">
                  <td>{{ transaction.event }}</td>
                  <td>{{ transaction.price }}</td>
                  <td>{{ transaction.seller }}</td>
                  <td>{{ transaction.buyer }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showPurchaseModal" class="modal" @click.self="closePurchaseModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>确认购买</h2>
          <button class="close-btn" @click="closePurchaseModal">✕</button>
        </div>
        <div class="modal-body">
          <img :src="`data:image/jpeg;base64,${asset.picture}`" alt="Asset Image" class="modal-asset-image" />
          <div class="modal-info">
            <p><strong>资产名称:</strong> {{ asset.asset_name }}</p>
            <p><strong>价格:</strong> {{ asset.price || 1200 }} RMB</p>
            <p><strong>账户余额:</strong> {{ userBalance }} RMB</p>
            <p v-if="insufficientBalance" style="color: red;">余额不足，无法完成购买。</p>
            <!-- 证书选择 -->
            <div class="form-row">
              <label for="certificate-select"><strong>选择证书:</strong></label>
              <select id="certificate-select" v-model="selectedCertificate" required>
                <option value="">请选择证书</option>
                <option v-for="certificate in certificates" :key="certificate" :value="certificate">
                  {{ certificate }}
                </option>
              </select>
            </div>
            <!-- 添加勾选，查阅权，加工权，所有权 -->
            <div class="form-row">
              <!-- 权限勾选列表 -->
           <!-- 权限勾选列表 -->
<!-- 权限勾选列表 -->
<div v-if="permissions.length > 0" class="permission-list">
  <label v-for="(permission, index) in permissions" :key="index" class="permission-item">
    <input type="checkbox" 
           :value="permission.name" 
           v-model="selectedPermissions" 
           :disabled="!permission.canSell" 
           :class="{'disabled-checkbox': !permission.canSell}" />
    {{ permission.name }}
  </label>
</div>


              <div v-else class="no-permissions">暂无权限可选</div>
            </div>


            <!-- 过期时间输入框（当选择非“所有权”的权限时显示） -->
<div class="form-row" v-if="showExpirationInput">
  <label for="expiration">权限过期时间：</label>
  <input id="expiration" type="datetime-local" class="form-control" v-model="expirationTime" />
</div>

            <div class="form-row">
              <!-- 购买数量输入框 -->
              <label for="purchase-quantity">购买数量：</label>
              <input id="purchase-quantity" type="number" class="form-control" v-model.number="purchaseQuantity" min="1"
                placeholder="请输入购买数量" @input="validateInput">
              <!-- 提示信息 -->
              <small v-if="errorMessage" class="text-danger">{{ errorMessage }}</small>
            </div>


            <!-- 使用文件类型处理当前资产（模型 / 数据） -->
<div class="form-row">
  <label><strong>资产类型：</strong></label>
  <div style="display: flex; flex-direction: column; gap: 4px; margin-left: 8px;">
    <label>
      <input
        type="checkbox"
        :checked="processingChoice === 'model'"
        @change="toggleProcessingChoice('model')"
      />
      使用模型类型文件处理当前资产
    </label>
    <label>
      <input
        type="checkbox"
        :checked="processingChoice === 'data'"
        @change="toggleProcessingChoice('data')"
      />
      使用数据类型文件处理当前资产
    </label>
    <label>
      <input
        type="checkbox"
        :checked="processingChoice === 'api'"
        @change="toggleProcessingChoice('api')"
      />
      使用api类型文件处理当前资产
    </label>
    <label>
      <input
        type="checkbox"
        :checked="processingChoice === 'dynamic'"
        @change="toggleProcessingChoice('dynamic')"
      />
      使用动态数据库类型文件处理当前资产
    </label>
  </div>
</div>

 <div class="form-row">
              <label for="certificate-select"><strong>选择模型</strong></label>
              <select id="certificate-select" v-model="selectedCertificate" required>
                <option value="">请选择模型</option>
                <option v-for="certificate in certificates" :key="certificate" :value="certificate">
                  {{ certificate }}
                </option>
              </select>
            </div>


          </div>

        </div>
        <div class="modal-buttons">
          <button @click="confirmPurchase">确认申请</button>
          <button @click="closePurchaseModal">取消</button>
        </div>
      </div>
    </div>

    <!-- 申请成功弹窗 -->
    <div v-if="showConfirmModal" class="modal" @click.self="closeConfirmModal">
      <div class="modal-content" style="width: 400px; padding: 20px; text-align: center;">
        <div class="modal-body">
          <div class="modal-info">
            <p><strong>申请成功，等待卖家确认</strong></p>
          </div>
        </div>
      </div>
    </div>


  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';
import Chart from 'chart.js/auto';
import axios from 'axios';

export default {
  name: 'AssetDetail',
  components: {
    AppHeader,
    AppSidebar,
  },
  data() {
    return {
      username: '',
      userId: '',
      expirationTime: '', // 权限过期时间

      processingChoice: null,

      asset: {
        asset_name: '',
        file_hash: '',
        user_id: '',
        industry: '',
        industry_raw_name: '',
        picture: '',
        price: 1200,
        description: '',
        algorithm: '',
        custom_algorithm: null,
        owner_address: '', // 当前资产的证书地址
        current_owner_address: '', // 当前拥有者的证书地址
      },
      // 权限列表，可动态扩展
      permissions: [],
      // 已选中的权限
      selectedPermissions: [],
      //selectedPermissions:'',
      purchaseQuantity: 1, // 默认购买数量为1
      errorMessage: '',      // 错误提示信息
      transactionHistory: [
        { id: 1, event: 'Sale', price: '48 rmb', seller: 'user1', buyer: 'user2' },
        { id: 2, event: 'Transfer', price: '0 rmb', seller: 'user1', buyer: 'user2' },
        { id: 3, event: 'Sale', price: '63 rmb', seller: 'user3', buyer: 'user4' },
        { id: 4, event: 'Transfer', price: '0 rmb', seller: 'user3', buyer: 'user4' }
      ],
      userBalance: 2000, // 用户余额
      showPurchaseModal: false, // 控制购买弹窗
      showConfirmModal: false,//控制申请成功弹窗
      insufficientBalance: false,
      certificates: [],
      selectedCertificate: '', // 用户选择的证书
      transactionId: null, // 保存返回的交易ID

     
    };
  },
  computed: {
    industryMap() {
      return {
        'NY': '能源',
        'DL': '电力',
        'TZ': '碳证',
        'JT': '交通出行',
        'YL': '医疗健康',
        'ZX': '征信',
        'JR': '金融',
        'SZ': '数字版权',
        'ZD': '自动驾驶',
        'CL': '车联网',
        'WH': '文化',
        'FL': '法律',
      };
    },

    
  showExpirationInput() {
    return this.selectedPermissions.some(p => p !== '所有权');
  }

  },

 async mounted() {
  const token = localStorage.getItem('token');
  if (token) {
      try {
        console.log('开始初始化页面...');
        
        // 1. 解析 token 获取用户名
        const payload = this.parseJwt(token);
        this.username = decodeURIComponent(payload.username);
        console.log('当前登录用户名:', this.username);

        // 2. 获取用户ID
        await this.fetchUserId(this.username);
        console.log('获取到的用户ID:', this.userId);

        // 3. 获取资产详情
        const assetId = this.$route.params.id;
        console.log('资产ID:', assetId);
        await this.fetchAssetDetails(assetId);

        // 4. 获取证书（现在 userId 已经有值了）
        await this.fetchCertificates();

        this.drawPriceHistoryChart();
        console.log('页面初始化完成');
      } catch (error) {
        console.error('初始化失败:', error);
      }
    } else {
      console.error('未找到token');
    }
},

  methods: {

  // 互斥选择：'model' / 'data' / 取消
  toggleProcessingChoice(option) {
    if (this.processingChoice === option) {
      // 再次点击同一个选项 -> 取消选择
      this.processingChoice = null;
    } else {
      // 选择新的选项
      this.processingChoice = option;
    }
  },

     isDivisibleIndustry(industry) {
    const indivisibleIndustries = ['WH']; // 不可分割的行业
    return !indivisibleIndustries.includes(industry);  // 如果不在不可分割列表中，则为可分割
  },

    async fetchAssetDetails(id) {
      try {
        const response = await axios.get(`http://10.112.47.214:3000/api/asset/${id}`);
        this.asset = response.data;
        console.log("asset detail response:", response.data);

        // 如果 current_owner_address 已经有值，就不覆盖
        if (!this.current_owner_address) {
          this.current_owner_address = this.asset.owner_address;
        }
      } catch (error) {
        console.error('获取资产详情失败:', error);
      }
    },

    validateInput() {
      // 清除之前的错误提示
      this.errorMessage = '';

      // 验证输入是否为有效数字且大于0
      if (this.purchaseQuantity < 0) {
        this.errorMessage = '购买数量必须大于等于0';
        this.purchaseQuantity = 1; // 自动修正为最小值
      }
    },

    drawPriceHistoryChart() {
      const ctx = document.getElementById('price-history-chart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            label: '价格历史',
            data: [0.04, 0.05, 0.06, 0.055, 0.06, 0.048],
            borderColor: 'rgba(75, 192, 192, 1)',
            fill: false
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true }
          }
        }
      });
    },
  async openPurchaseModal() {
  this.insufficientBalance = (this.asset.price || 1200) > this.userBalance;
  this.selectedPermissions = []; // 重置已选权限
   this.processingChoice = null;  // 👈 每次打开弹窗重置处理类型
  this.showPurchaseModal = true;

  // 显示所有权限，并根据后端返回的权限信息禁用不可出售的权限
  this.permissions = [
    { name: "所有权", canSell: this.asset.permissions.canSellAsset },
    { name: "查阅权", canSell: this.asset.permissions.canSellView },
    { name: "加工权", canSell: this.asset.permissions.canSellProcess }
  ];
},



    closePurchaseModal() {
      this.showPurchaseModal = false;
    },
    openConfirmModal() {
      this.showConfirmModal = true;
    },
    closeConfirmModal() {
      this.showConfirmModal = false;
    },

    async fetchCertificates() {
      if (!this.userId) {
        console.error('userId 为空，无法请求证书');
        return; // 如果 userId 为空，直接返回
      }

      try {
        console.log('资产领域是:', this.asset.industry);
        let response;
        if(this.isDivisibleIndustry(this.asset.industry)){
          console.log('调用2接口');
            response = await axios.post('http://10.112.47.214:3000/api/get-certificates2', {
          userId: this.userId,
        });
        }else{
          console.log('调用1接口');
          response = await axios.post('http://10.112.47.214:3000/api/get-certificates', {
          userId: this.userId,
        });
        }
     
        if (response.status === 200 && response.data.certificates) {
          this.certificates = response.data.certificates.map(item => item.cert || '未知证书');
        } else {
          console.error('获取证书失败:', response.data);
          this.certificates = [];
        }
      } catch (error) {
        console.error('请求证书时发生错误:', error);
        this.certificates = [];
      }
    }
    ,
    async confirmPurchase() {
  if (this.insufficientBalance) return;

  const certAddr = await this.getCertAddr(this.selectedCertificate);
  if (!certAddr) {
    alert("请选择有效的证书！");
    return;
  }

  // 如果未选择任何权限，则默认选择所有权
  if (!this.selectedPermissions || this.selectedPermissions.length === 0) {
    alert("请至少选择一种购买权益！");
    return;
  }

  // 👇 打印请求体内容，调试用
  const requestBody = {
    asset_id: this.asset.file_hash,
    buyer_address: certAddr,
    seller_address: this.asset.owner_address,
    quantity: this.purchaseQuantity,
    quality: this.selectedPermissions.join(','),
     // 可能值：'model'、'data'，或者 null（两个都不选）
    processing_type: this.processingChoice,
    expiration_time: this.expirationTime,
  };
  console.log('用户选择的 expirationTime 是：', this.expirationTime);

  console.log('即将发送的请求体:', JSON.stringify(requestBody, null, 2)); // ⭐⭐

  try {
    const response = await axios.post('http://10.112.47.214:3000/api/save-transaction', requestBody);

    if (response.status === 201 && response.data.message === '交易已成功创建') {
      this.transactionId = response.data.transactionId;
      this.openConfirmModal();
    } else {
      alert('申请失败，请重试。');
    }
  } catch (error) {
    console.error('申请失败:', error);
    alert('网络错误，请稍后重试。');
  }

  this.closePurchaseModal();
}
,

    async transferAsset() {
      try {
        const certAddr = await this.getCertAddr(this.selectedCertificate);
        if (!certAddr) {
          alert("请选择有效的证书！");
          return;
        }

        // 打印传递给 TransferFrom 的参数
        console.log("Transferring Asset:");
        console.log("From (Asset's owner address):", this.asset.owner_address);  // 当前资产的证书地址
        console.log("To (Selected certificate address):", certAddr);  // 用户选择的证书地址
        console.log("TokenId (Asset's file hash):", this.asset.file_hash);  // 使用资产的哈希值作为 tokenId

        const response = await axios.post('http://10.112.47.214:8848/pre/TransferFrom', {
          from: this.asset.owner_address,
          to: certAddr,
          tokenId: this.asset.file_hash,
        });

        if (response.status === 200 && response.data.code === 0) {
          console.log('资产转移成功', response.data);

          // 更新当前拥有者的证书地址为新拥有者
          this.current_owner_address = certAddr;
          await axios.post('http://10.112.47.214:3000/api/update-owner', {
            assetId: this.asset.file_hash,
            newOwner: certAddr
          })
            .then(response => {
              console.log('成功更新当前拥有者:', response.data);
            })
            .catch(error => {
              console.error('更新当前拥有者失败:', error);
            });

        } else {
          throw new Error('资产转移失败');
        }
      } catch (error) {
        console.error('资产转移失败:', error);
        alert('资产转移失败，请重试。');
      }
    },

    async getCertAddr(selectedCert) {
      try {
        let certPath;
        if (this.isDivisibleIndustry(this.asset.industry)) {
      // 可分割资产，使用 wx-org2
      certPath = `/home/super/r/GoSDK/crypto-config/wx-org2.chainmaker.org/user/${selectedCert}/${selectedCert}.sign.crt`;
      console.log("使用可分割资产证书路径:", certPath);
    } else {
      // 不可分割资产，使用 wx-org1
      certPath = `/home/super/r/GoSDK/crypto-config/wx-org1.chainmaker.org/user/${selectedCert}/${selectedCert}.sign.crt`;
      console.log("使用不可分割资产证书路径:", certPath);
    }
       
        const response = await axios.post('http://10.112.47.214:9092/cert-to-addr', { cert_path: certPath });

        if (response.status === 200 && response.data.ethereum.address) {
          return response.data.ethereum.address;
        } else {
          throw new Error('证书地址获取失败');
        }
      } catch (error) {
        console.error('请求地址时发生错误:', error);
        throw new Error('证书地址获取失败，请检查网络连接或服务器状态');
      }
    },
    async fetchUserId(username) {
      try {
        const response = await axios.post('http://10.112.47.214:3000/api/get-user-id', { username });
        if (response.status === 200 && response.data.id) {
          this.userId = response.data.id;  // 成功获取 userId
          console.log('获取的用户ID:', this.userId);
        } else {
          console.error('获取用户ID失败:', response.data);
        }
      } catch (error) {
        console.error('请求用户ID时发生错误:', error);
      }
    },
    parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
     }).join(''));
    return JSON.parse(jsonPayload);
    }
  }
};
</script>

<style scoped>
html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
}

.asset-detail-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  background: #f5f6fa;
  overflow-y: auto;
  padding-bottom: 50px;
  /* 增加底部的空间 */
}

.main-content {
  display: flex;
  height: 100%;
  /* 让主内容区域占满父容器 */
  flex: 1;
  overflow-y: auto;
}

.AppSidebar {
  height: 100vh;
  /* 使侧边栏占满整个视口高度 */
  position: sticky;
  top: 0;
  background-color: #333;
  /* 如果需要，可以更改背景颜色 */
  color: #fff;
}


.detail-content {
  flex: 1;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.asset-main {
  display: flex;
  gap: 30px;
}

.left-section,
.right-section {
  flex: 1;
}

.card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;

}

.asset-image {
  width: 600px;
  /* 设置固定宽度 */
  height: 600px;
  /* 设置固定高度 */
  border-radius: 8px;
  object-fit: cover;
  /* 保持图片比例，裁剪溢出的部分 */
  margin-bottom: 20px;

}


.price-section {
  text-align: left;
}

.price {
  font-size: 24px;
  color: #333;
}

.button-control {
  text-align: center;
}

.buy-button {
  padding: 10px 50px;
  margin: 10px;
  background-color: #007bff;
  border-color: #007bff;
  color: #fff;
  cursor: pointer;
}

.follow-button {
  padding: 10px 50px;
  margin: 10px;
}

.transaction-table-container {
  max-height: 150px;
  /* 设置最大高度 */
  overflow-y: auto;
  /* 启用垂直滚动 */
}

.transaction-table {
  width: 100%;
  border-collapse: collapse;
}

.transaction-table th,
.transaction-table td {
  padding: 8px;
  border: 1px solid #ddd;
  text-align: center;
}

.history-section {
  margin-bottom: 50px;
  /* 为底部留出空间 */
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  /* 让背景稍微变暗 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  width: 450px;
  max-width: 90%;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-header h2 {
  margin: 0;
  font-size: 22px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #888;
}

.modal-body {
  display: flex;
  align-items: center;
  gap: 15px;
}

.modal-asset-image {
  width: 150px;
  height: 150px;
  border-radius: 8px;
  object-fit: cover;
}

.modal-info {
  flex: 1;
}

.modal-info p {
  margin: 6px 0;
  font-size: 16px;
}

.modal-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
}

.modal-buttons button {
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  font-size: 16px;
  cursor: pointer;
}

.modal-buttons button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.modal-buttons button:first-child {
  background-color: #007bff;
  color: #fff;
}

.modal-buttons button:last-child {
  background-color: #f0f0f0;
  color: #333;
}
.disabled-checkbox {
  cursor: not-allowed;
  opacity: 0.5;
}

</style>
