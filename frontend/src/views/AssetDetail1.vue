<template>
  <div class="asset-detail-page">
    <!-- 顶部导航栏 -->
    <AppHeader />

    <div class="main-content">
      <!-- 左侧边栏 -->
      <AppSidebar />

      <!-- 右侧内容区域 -->
      <div class="detail-content">
  <!-- 顶部主体区域 -->
  <div class="asset-top-section">
    <!-- 左侧图片 -->
    <div class="asset-cover-panel">
      <img
        :src="`data:image/jpeg;base64,${asset.picture}`"
        alt="Asset Image"
        class="asset-image"
      />
    </div>

    <!-- 中间产品信息 -->
    <div class="asset-info-panel">
      <div class="asset-title-row">
        <h1 class="asset-title">{{ asset.asset_name }}</h1>
      </div>

      <p class="asset-subtitle">
        {{ asset.description || '暂无简介' }}
      </p>

      <div class="asset-meta-row">
        <span class="meta-label">行业领域：</span>
        <span class="meta-value">{{ asset.industry_raw_name || industryMap[asset.industry] }}</span>
      </div>

      <div class="asset-meta-row">
        <span class="meta-label">资产ID：</span>
        <span class="meta-value hash-text">{{ asset.file_hash }}</span>
      </div>

      <div class="asset-meta-row">
        <span class="meta-label">创建者ID：</span>
        <span class="meta-value">{{ asset.user_id }}</span>
      </div>

      <div class="asset-meta-row">
        <span class="meta-label">创建者地址：</span>
        <span class="meta-value hash-text">{{ asset.owner_address || '暂无' }}</span>
      </div>

      <div class="asset-meta-row">
        <span class="meta-label">当前拥有者：</span>
        <span class="meta-value hash-text">{{ asset.current_owner_address || '暂无' }}</span>
      </div>

      <div class="asset-price-row">
        <span class="price-label">参考定价：</span>
        <span class="price-value">{{ asset.price || 1200 }} RMB</span>
      </div>

      <div class="action-buttons">
        <button class="share-button">分享</button>
        <button class="buy-button" @click="openPurchaseModal">申请购买</button>
        <button class="follow-button">收藏</button>
      </div>
    </div>

    <!-- 右侧联系方式 -->
    <div class="contact-panel">
      <div class="contact-card">
  <div class="contact-header">联系方式</div>

  <div class="contact-item">
    <span class="contact-label">联系方式：</span>
    <span class="contact-value">{{ asset.email || '暂无' }}</span>
  </div>



  <div class="contact-item">
    <span class="contact-label">联系地址：</span>
    <span class="contact-value">{{ asset.address || '暂无' }}</span>
  </div>
</div>
    </div>
  </div>

  <!-- 下方标签页 -->
  <div class="asset-tabs-card">
    <div class="tab-header">
      <div
        class="tab-item"
        :class="{ active: activeTab === 'detail' }"
        @click="activeTab = 'detail'"
      >
        产品详情
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'dataItems' }"
        @click="activeTab = 'dataItems'"
      >
        数据项
      </div>
      <div
        class="tab-item"
        :class="{ active: activeTab === 'usageLimit' }"
        @click="activeTab = 'usageLimit'"
      >
        使用限制说明
      </div>
      <!--<div
        class="tab-item"
        :class="{ active: activeTab === 'guide' }"
        @click="activeTab = 'guide'"
      >
        用户指南
      </div>-->
      <div
        class="tab-item"
        :class="{ active: activeTab === 'portrait' }"
        @click="activeTab = 'portrait'"
      >
        产品画像
      </div>
    </div>

    <div class="tab-body">
      <div v-if="activeTab === 'detail'">
        <p class="tab-text">{{ asset.description || '暂无产品详情' }}</p>
      </div>

      <div v-else-if="activeTab === 'dataItems'">
        <p class="tab-text">
          资产名称：{{ asset.asset_name || '暂无' }}
        </p>
        <p class="tab-text">
          资产类型：{{ asset.asset_type || '暂无' }}
        </p>
        <p class="tab-text">
          行业领域：{{ asset.industry_raw_name || industryMap[asset.industry] || '暂无' }}
        </p>
        <p class="tab-text">
          算法信息：{{ asset.algorithm || '无' }}
        </p>
        <p class="tab-text">
          自定义算法：{{ asset.custom_algorithm || '无' }}
        </p>
        <p class="tab-text">
          可售所有权：{{ asset.can_sell_asset ? '是' : '否' }}
        </p>
        <p class="tab-text">
          可售经营权：{{ asset.can_sell_view ? '是' : '否' }}
        </p>
        <p class="tab-text">
          可售加工使用权：{{ asset.can_sell_process ? '是' : '否' }}
        </p>
      </div>

      <div v-else-if="activeTab === 'usageLimit'">
        <p class="tab-text">是否允许转售：{{ asset.allow_resale ? '允许' : '不允许' }}</p>
        <!--<p class="tab-text">是否允许授权：{{ asset.allow_authorize ? '允许' : '不允许' }}</p>
        <p class="tab-text">是否允许监管：{{ asset.allow_supervision ? '允许' : '不允许' }}</p>-->
        <p class="tab-text">
          交易地点：{{ asset.trade_location || '暂无限制' }}
        </p>
        <p class="tab-text">
          交易时间范围：
          {{ asset.trade_start_ts || '暂无限制' }} <!--- {{ asset.trade_end_ts || '暂无' }}-->
        </p>
      </div>

      <div v-else-if="activeTab === 'guide'">
        <p class="tab-text">
          用户可通过本页面查看资产详情、选择相应权益并提交购买申请。购买前请确认所选证书、购买数量、权益类型以及模型信息无误。
        </p>
      </div>

      <div v-else-if="activeTab === 'portrait'">
        <div class="portrait-box">
          <img
            :src="`data:image/jpeg;base64,${asset.picture}`"
            alt="产品画像"
            class="portrait-image"
          />
        </div>
      </div>
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




 <!-- 选择模型（来自 model_type 非空的资产） -->
<div class="form-row">
  <label for="model-select"><strong>选择模型：</strong></label>
  <select id="model-select" v-model="selectedModelHash">
    <option value="">请选择模型</option>
    <option v-for="m in modelOptions" :key="m.file_hash" :value="m.file_hash">
      {{ m.asset_name }}（{{ m.model_type }}）
    </option>
  </select>

  <small v-if="loadingModels">正在加载模型列表...</small>
  <small v-if="!loadingModels && modelOptions.length === 0" class="text-danger">
    暂无可选模型（model_type 为空的不会出现在此处）
  </small>
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
      activeTab: 'detail',
      username: '',
      userId: '',
      expirationTime: '', // 权限过期时间

      processingChoice: null,

      asset: {
         asset_name: '',
  asset_type: '',
  file_hash: '',
  user_id: '',
  industry: '',
  industry_raw_name: '',
  picture: '',
  price: 1200,
  description: '',
  algorithm: '',
  custom_algorithm: null,
  owner_address: '',
  current_owner_address: '',
  email: '',
  address: '',
  contact_phone: '',   // 目前数据库没有这个字段，先占位
  can_sell_asset: 0,
  can_sell_view: 0,
  can_sell_process: 0,
  allow_resale: 0,
  allow_authorize: 0,
  allow_supervision: 0,
  trade_location: '',
  trade_start_ts: '',
  trade_end_ts: ''
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

       modelOptions: [],          // 下拉模型列表
  selectedModelHash: '',     // 选中的模型 file_hash
  loadingModels: false,
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

    async fetchModelOptions() {
  try {
    this.loadingModels = true;
    const resp = await axios.get('http://10.112.47.214:3000/api/model-options');

    if (resp.status === 200 && resp.data.models) {
      this.modelOptions = resp.data.models;
    } else {
      this.modelOptions = [];
    }
  } catch (e) {
    console.error('获取模型列表失败:', e);
    this.modelOptions = [];
  } finally {
    this.loadingModels = false;
  }
},


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

    /*async fetchAssetDetails(id) {
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
    },*/

    async fetchAssetDetails(id) {
  try {
    const response = await axios.get(`http://10.112.47.214:3000/api/asset/${id}`);
    this.asset = response.data;
    console.log('asset detail response:', response.data);

    // 兜底：如果接口没返回 current_owner_address，就用 owner_address
    if (!this.asset.current_owner_address) {
      this.asset.current_owner_address = this.asset.owner_address;
    }

    // 兜底：如果接口没返回 permissions，就根据平铺字段生成
    if (!this.asset.permissions) {
      this.asset.permissions = {
        canSellAsset: !!this.asset.can_sell_asset,
        canSellView: !!this.asset.can_sell_view,
        canSellProcess: !!this.asset.can_sell_process
      };
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
  /*async openPurchaseModal() {
  this.insufficientBalance = (this.asset.price || 1200) > this.userBalance;
  this.selectedPermissions = []; // 重置已选权限
   this.processingChoice = null;  // 👈 每次打开弹窗重置处理类型
  this.showPurchaseModal = true;

  // 显示所有权限，并根据后端返回的权限信息禁用不可出售的权限
  this.permissions = [
  { name: "所有权", canSell: !!this.asset.can_sell_asset },
  { name: "经营权", canSell: !!this.asset.can_sell_view },
  { name: "加工使用权", canSell: !!this.asset.can_sell_process }
];
   // ✅ 模型选择初始化
  this.selectedModelHash = '';
  this.modelOptions = [];

  // ✅ 拉模型列表
  await this.fetchModelOptions();
},*/


async openPurchaseModal() {
  this.insufficientBalance = (this.asset.price || 1200) > this.userBalance;
  this.selectedPermissions = [];
  this.processingChoice = null;
  this.expirationTime = '';
  this.purchaseQuantity = 1;
  this.errorMessage = '';

  // 优先读 permissions；没有的话再读平铺字段
  const canSellAsset = this.asset.permissions
    ? !!this.asset.permissions.canSellAsset
    : !!this.asset.can_sell_asset;

  const canSellView = this.asset.permissions
    ? !!this.asset.permissions.canSellView
    : !!this.asset.can_sell_view;

  const canSellProcess = this.asset.permissions
    ? !!this.asset.permissions.canSellProcess
    : !!this.asset.can_sell_process;

  this.permissions = [
    { name: '所有权', canSell: canSellAsset },
    { name: '经营权', canSell: canSellView },
    { name: '加工使用权', canSell: canSellProcess }
  ];

  // 模型选择初始化
  this.selectedModelHash = '';
  this.modelOptions = [];

  // 先显示弹窗
  this.showPurchaseModal = true;

  // 再加载模型列表
  await this.fetchModelOptions();
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
     // ✅ 新增：选择的模型（用 file_hash 最稳）
    model_file_hash: this.selectedModelHash || null,
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
  min-height: 100vh;
  background: #eef4fb;
  overflow-y: auto;
}

.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
}

.detail-content {
  flex: 1;
  padding: 28px 34px;
  max-width: 1400px;
  margin: 0 auto;
}

/* ===== 顶部主体区域：更协调，靠近图二风格 ===== */
.asset-top-section {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 280px;
  gap: 24px;
  align-items: start;
  margin-bottom: 28px;
  padding-left: 80px;
}

.asset-cover-panel {
  background: transparent;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.asset-image {
  width: 240px;
  height: 240px;
  object-fit: cover;
  border-radius: 10px;
  display: block;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

/* ===== 中间产品信息区 ===== */
.asset-info-panel {
  background: transparent;
  border-radius: 0;
  padding: 6px 8px 0 8px;
  box-shadow: none;
  min-height: auto;
}

.asset-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.asset-title {
  margin: 0;
  font-size: 34px;
  font-weight: 700;
  color: #1f2d3d;
  line-height: 1.2;
}

.asset-subtitle {
  margin: 0 0 18px 0;
  font-size: 17px;
  color: #7b8794;
  line-height: 1.8;
}

.asset-meta-row {
  margin-bottom: 14px;
  font-size: 16px;
  line-height: 1.8;
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
}

.meta-label {
  color: #5b6675;
  font-weight: 600;
  min-width: 96px;
  flex-shrink: 0;
}

.meta-value {
  color: #1f2937;
  word-break: break-all;
}

.hash-text {
  font-family: "Courier New", monospace;
  font-size: 14px;
  color: #6b7280;
}

.asset-price-row {
  margin: 26px 0 18px 0;
  font-size: 18px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.price-label {
  color: #5b6675;
  font-weight: 600;
}

.price-value {
  color: #193a8a;
  font-size: 30px;
  font-weight: 700;
}

.action-buttons {
  display: flex;
  gap: 14px;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid #dbe3ef;
  flex-wrap: wrap;
}

.share-button,
.buy-button,
.follow-button {
  min-width: 124px;
  height: 48px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
}

.share-button {
  background: #fff;
  color: #2a5bd7;
  border: 1px solid #2a5bd7;
}

.share-button:hover {
  background: #eef4ff;
}

.buy-button {
  background: #2a5bd7;
  color: #fff;
}

.buy-button:hover {
  background: #2048b0;
}

.follow-button {
  background: #efbf4f;
  color: #fff;
}

.follow-button:hover {
  background: #dfa936;
}

/* ===== 右侧联系方式区域 ===== */
.contact-panel {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.contact-card {
  width: 100%;
  background: #fff;
  border-radius: 10px;
  padding: 22px 22px 18px;
  box-shadow: 0 6px 18px rgba(31, 45, 61, 0.08);
  border: 1px solid #edf1f7;
}

.contact-header {
  font-size: 22px;
  font-weight: 700;
  color: #1f2d3d;
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e9eef5;
}

.contact-item {
  margin-bottom: 14px;
  font-size: 15px;
  line-height: 1.8;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.contact-label {
  color: #5b6675;
  font-weight: 600;
  white-space: nowrap;
}

.contact-value {
  color: #334155;
  word-break: break-all;
}

/* ===== 下方标签页区域：保留不大改，只做风格统一 ===== */
.asset-tabs-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(31, 45, 61, 0.08);
  overflow: hidden;
  border: 1px solid #edf1f7;
}

.tab-header {
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  padding: 0 24px;
  gap: 36px;
  min-height: 68px;
  background: #fff;
  flex-wrap: wrap;
}

.tab-item {
  position: relative;
  font-size: 17px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  padding: 20px 0 16px 0;
  transition: color 0.2s ease;
}

.tab-item:hover {
  color: #2563eb;
}

.tab-item.active {
  color: #2563eb;
}

.tab-item.active::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -1px;
  width: 100%;
  height: 3px;
  background: #2563eb;
  border-radius: 2px;
}

.tab-body {
  padding: 28px 30px 36px;
  min-height: 220px;
  background: #fff;
}

.tab-text {
  font-size: 17px;
  color: #374151;
  line-height: 1.9;
  margin-bottom: 14px;
}

.portrait-box {
  display: flex;
  justify-content: flex-start;
  align-items: center;
}

.portrait-image {
  width: 320px;
  max-width: 100%;
  border-radius: 8px;
  object-fit: cover;
}

/* ===== 弹窗遮罩 ===== */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

/* ===== 购买弹窗主体 ===== */
.modal-content {
  background: #fff;
  border-radius: 14px;
  padding: 26px 26px 22px;
  width: 620px;
  max-width: 92%;
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.18);
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.96);
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
  margin-bottom: 22px;
}

.modal-header h2 {
  margin: 0;
  font-size: 22px;
  color: #1f2d3d;
  font-weight: 700;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #9aa4b2;
  line-height: 1;
}

.close-btn:hover {
  color: #4b5563;
}

.modal-body {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}

.modal-asset-image {
  width: 150px;
  height: 150px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.modal-info {
  flex: 1;
}

.modal-info p {
  margin: 6px 0 10px 0;
  font-size: 15px;
  line-height: 1.7;
  color: #374151;
}

/* ===== 表单项 ===== */
.form-row {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row label {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.form-row select,
.form-row input,
.form-control {
  width: 100%;
  min-height: 42px;
  padding: 8px 12px;
  border: 1px solid #d4dbe6;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
  outline: none;
  background: #fff;
}

.form-row select:focus,
.form-row input:focus,
.form-control:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

/* ===== 权益勾选：改小、紧凑一些 ===== */
.permission-list {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 22px;
  margin-top: 8px;
}

.permission-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #374151;
  font-weight: 500;
}

.permission-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  margin: 0;
  cursor: pointer;
  accent-color: #2563eb;
}

.disabled-checkbox {
  cursor: not-allowed;
  opacity: 0.45;
}

.no-permissions {
  color: #9ca3af;
  font-size: 14px;
}

.text-danger {
  color: #ef4444;
  font-size: 13px;
  margin-top: 4px;
  display: block;
}

/* ===== 弹窗底部按钮 ===== */
.modal-buttons {
  display: flex;
  justify-content: space-between;
  margin-top: 22px;
  gap: 14px;
}

.modal-buttons button {
  flex: 1;
  height: 46px;
  border-radius: 8px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.modal-buttons button:disabled {
  background-color: #d1d5db;
  cursor: not-allowed;
}

.modal-buttons button:first-child {
  background-color: #2563eb;
  color: #fff;
}

.modal-buttons button:first-child:hover:not(:disabled) {
  background-color: #1d4ed8;
}

.modal-buttons button:last-child {
  background-color: #f3f4f6;
  color: #374151;
}

.modal-buttons button:last-child:hover {
  background-color: #e5e7eb;
}

/* ===== 响应式 ===== */
@media (max-width: 1200px) {
  .asset-top-section {
    grid-template-columns: 1fr;
  }

  .asset-cover-panel {
    justify-content: flex-start;
  }

  .contact-panel {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .detail-content {
    padding: 18px 16px;
  }

  .asset-image {
    width: 200px;
    height: 200px;
  }

  .asset-title {
    font-size: 28px;
  }

  .asset-subtitle {
    font-size: 16px;
  }

  .asset-meta-row {
    flex-direction: column;
    gap: 4px;
    font-size: 16px;
  }

  .meta-label {
    min-width: auto;
  }

  .price-value {
    font-size: 28px;
  }

  .tab-header {
    gap: 20px;
    padding: 0 16px;
  }

  .tab-body {
    padding: 22px 18px 28px;
  }

  .modal-body {
    flex-direction: column;
    align-items: center;
  }

  .modal-asset-image {
    width: 180px;
    height: 180px;
  }

  .modal-buttons {
    flex-direction: column;
  }
}
</style>
<!--<style scoped>
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
-->