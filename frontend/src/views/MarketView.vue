<template>
  <div class="market">
    <AppHeader :username="username" :userId="userId" />
    
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="title">交易市场</h2>

        <div class="search-section">
          <div class="search-input-container">
           <!--<span class="search-icon">🔍</span>--> 
            <input v-model="searchTerm" placeholder="通过名称搜索" />
          </div>

          <div class="button-container">
            <button @click="searchAssets" class="search-button">搜索</button>
            <button v-if="isSearching" @click="clearSearch" class="clear-button">清除搜索</button>
          </div>

          <button class="cross-search-button" @click="openCrossSearchModal">
            跨链/跨平台检索
          </button>
        </div>

        <!-- 购物车按钮 -->
        <div class="cart-button-container">
          <button class="cart-button" @click="showCartModal = !showCartModal">
            🛒
          </button>
        </div>

        <!-- 筛选按钮 -->
        <!-- 产品市场筛选区 -->
<div class="market-filter-wrap">
  <div class="market-filter-title">产品市场</div>

  <div class="market-filter-panel">
  <!-- 数据产品类型 -->
  <div class="filter-row">
    <div class="filter-row-label">数据产品类型：</div>
    <div class="filter-row-options">
      <button
        v-for="c in assetCategories"
        :key="c.value"
        class="domain-option"
        :class="{ active: selectedAssetCategory === c.value }"
        @click="filterByAssetCategory(c.value)"
        type="button"
      >
        {{ c.label }}
      </button>
    </div>
  </div>

  <!-- 行业领域 -->
  <div class="filter-row">
    <div class="filter-row-label">行业领域：</div>
    <div class="filter-row-options">
      <button
        v-for="d in domains"
        :key="d.value"
        class="domain-option"
        :class="{ active: selectedDomain === d.value }"
        @click="filterByDomain(d.value)"
        type="button"
      >
        {{ d.label }}
      </button>
    </div>
  </div>

  <!-- 数据来源评级 -->
  <div class="filter-row">
    <div class="filter-row-label">数据来源评级：</div>
    <div class="filter-row-options">
      <button
        v-for="t in assetTypes"
        :key="t.value"
        class="domain-option"
        :class="{ active: selectedAssetType === t.value }"
        @click="filterByAssetType(t.value)"
        type="button"
      >
        {{ t.label }}
      </button>
    </div>
  </div>
</div>
</div>

        <!-- 资产展示区域 -->
        
<!-- 资产展示区域 -->
<div class="assets-list">
  <template v-if="isSearching && searchResults.length">
    <div
      class="asset-row"
      v-for="(asset, index) in searchResults"
      :key="asset.file_hash + '-' + index"
      @click="selectAsset(asset)"
    >
      <div class="asset-row-left">
        <img
          :src="`data:image/jpeg;base64,${asset.picture}`"
          alt="资产图片"
          class="asset-row-image"
        />
      </div>

      <div class="asset-row-center">
        <div class="asset-row-title-line">
          <span class="asset-row-title">{{ asset.asset_name }}</span>
        </div>

        <div class="asset-row-desc">
          {{ asset.description || '暂无描述' }}
        </div>

        <div class="asset-row-company">
          {{ asset.address || '暂无提供方信息' }}
        </div>

        <div class="asset-row-tags">
          <span class="asset-row-tag">
            {{ asset.industry_raw_name || '未分类' }}
          </span>
        </div>
      </div>

      <div class="asset-row-right">
        <div class="asset-row-price">
          {{ asset.price || 100 }}
          <span class="asset-row-price-unit">元</span>
        </div>
        <button
          class="asset-row-detail-btn"
          @click.stop="selectAsset(asset)"
        >
          查看详情
        </button>
      </div>
    </div>
  </template>

  <template v-else>
    <div
      class="asset-row"
      v-for="(asset, index) in paginatedAssets"
      :key="asset.file_hash + '-' + index"
      @click="selectAsset(asset)"
    >
      <div class="asset-row-left">
        <img
          :src="`data:image/jpeg;base64,${asset.picture}`"
          alt="资产图片"
          class="asset-row-image"
        />
      </div>

      <div class="asset-row-center">
        <div class="asset-row-title-line">
          <span class="asset-row-title">{{ asset.asset_name }}</span>
        </div>

        <div class="asset-row-desc">
          {{ asset.description || '暂无描述' }}
        </div>

        <div class="asset-row-company">
          {{ asset.address || '暂无提供方信息' }}
        </div>

        <div class="asset-row-tags">
  <span class="asset-row-tag">
    {{ asset.industry_raw_name || industryMap[asset.industry] || '未分类' }}
  </span>

  <span
    v-if="asset.asset_category"
    class="asset-row-tag asset-row-tag-category"
  >
    {{ asset.asset_category }}
  </span>

  <span
    v-if="asset.asset_type"
    class="asset-row-tag asset-row-tag-level"
  >
    {{ asset.asset_type }}
  </span>
</div>
      </div>

      <div class="asset-row-right">
        <div class="asset-row-price">
          {{ asset.price || 100 }}
          <span class="asset-row-price-unit">元</span>
        </div>
        <button
          class="asset-row-detail-btn"
          @click.stop="selectAsset(asset)"
        >
          查看详情
        </button>
      </div>
    </div>
  </template>
</div>
        <!-- 加载动画 -->
        <div v-if="isLoading" class="loading-container">
          <div class="spinner" :style="{ borderTopColor: spinnerColor }"></div>
        </div>

        <div class="pagination-container">
          <el-pagination
            background
            layout="prev, pager, next"
            :total="totalAssets"
            :page-size="itemsPerPage"
            @current-change="handlePageChange"
          />
        </div>

        <!-- 资产详细信息弹窗 -->
        <div v-if="selectedAsset" class="modal" @click.self="closeModal">
          <div class="modal-content">
            <img
              :src="`data:image/jpeg;base64,${selectedAsset.picture}`"
              alt="Asset Image"
              class="modal-image"
            />
            <h2>{{ selectedAsset.asset_name }}</h2>
            <p>拥有方: {{ selectedAsset.user_id }}</p>
            <p>描述: {{ selectedAsset.description }}</p>
            <p>价格: {{ selectedAsset.price || 100 }} ETH</p>
            <p>安全等级: {{ selectedAsset.asset_type }}级</p>
            <div class="modal-buttons">
              <button class="buy-button" @click="openPurchaseModal">购买</button>
              <button class="close-button" @click="closeModal">关闭</button>
            </div>
          </div>
        </div>

        <!-- 购买确认弹窗 -->
        <div v-if="showPurchaseModal" class="modal" @click.self="closePurchaseModal">
          <div class="modal-content">
            <h2>确认购买资产</h2>
            <div class="asset-info">
              <h3>{{ selectedAsset.asset_name }}</h3>
              <p><strong>价格:</strong> {{ selectedAsset.price || 100 }} ETH</p>
            </div>
            <div class="payment-info">
              <p><strong>您的余额:</strong> {{ userBalance }} ETH</p>
              <p><strong>需要支付:</strong> {{ selectedAsset.price || 100 }} ETH</p>
              <p v-if="insufficientBalance" style="color: red;">余额不足，无法完成购买。</p>
            </div>
            <div class="modal-buttons">
              <button class="buy-button" @click="confirmPurchase" :disabled="insufficientBalance">确认购买</button>
              <button class="close-button" @click="closePurchaseModal">取消</button>
            </div>
          </div>
        </div>

        <!-- 购买成功提示 -->
        <div v-if="purchaseSuccess" class="modal">
          <div class="modal-content">
            <h2>购买成功</h2>
            <p>您已成功购买 {{ selectedAsset.asset_name }}！</p>
            <button @click="closeSuccessModal">关闭</button>
          </div>
        </div>

        <!-- 跨平台检索 + 资产跨链调配（与图一致的双栏弹窗） -->
        <div v-if="showCrossSearchModal" class="cc-modal-mask" @click.self="closeCrossSearchModal">
          <div class="cc-modal">
            <!-- 左：跨平台检索 -->
            <div class="cc-left">
              <div class="cc-title">跨平台检索</div>

              <div class="cc-search-wrap">
                <input
                  v-model="crossSearchTerm"
                  class="cc-search-input"
                  placeholder="搜索输入框"
                  @keyup.enter="crossSearchAssets"
                />
                <button class="cc-search-btn" @click="crossSearchAssets" aria-label="search">🔍</button>
              </div>

              <div class="cc-card">
                <div class="cc-card-title">检索结果</div>

                <div class="cc-table">
                  <div class="cc-row cc-head">
                    <div class="cc-col1">资产名称</div>
                    <div class="cc-col2">所在平台（链）</div>
                    <div class="cc-col3">唯一标识</div>
                  </div>

                  <div
                    v-for="(a, idx) in crossSearchResults"
                    :key="(a.file_hash || a.asset_id || idx) + '-' + idx"
                    class="cc-row cc-body"
                    :class="{ selected: selectedCrossAsset && (selectedCrossAsset.file_hash === a.file_hash) }"
                    @click="selectCrossAsset(a)"
                  >
                    <div class="cc-col1 cc-asset">
                      <span class="cc-token-dot">◎</span>
                      <span class="cc-asset-name">{{ a.asset_name || 'Unknown' }}</span>
                    </div>
                    <div class="cc-col2">{{ getCrossPlatform(a) }}</div>
                    <div class="cc-col3 cc-mono">{{ truncateHash(a.file_hash || a.asset_id || '') }}</div>
                  </div>

                  <div v-if="crossSearched && crossSearchResults.length === 0" class="cc-empty">
                    未找到匹配结果
                  </div>
                </div>
              </div>
            </div>

            <!-- 中间分割线 -->
            <div class="cc-divider"></div>

            <!-- 右：资产跨链调配 -->
            <div class="cc-right">
              <div class="cc-title">资产跨链调配</div>

              <!-- ✅ 修改后的整块：转入/转出表单 -->
              <div class="cc-swap-card">
                <!-- 顶部：模式切换 -->
                <div class="cc-bridge-tabs">
                  <button
                    class="cc-tab"
                    :class="{ active: bridgeMode === 'in' }"
                    @click="bridgeMode = 'in'"
                    type="button"
                  >转入</button>

                  <button
                    class="cc-tab"
                    :class="{ active: bridgeMode === 'out' }"
                    @click="bridgeMode = 'out'"
                    type="button"
                  >转出</button>
                </div>

                <!-- 通用：tokenId / amount -->
                <div class="cc-form">
                  <div class="cc-field">
                    <div class="cc-field-label">TokenId（唯一标识）</div>
                    <div class="cc-field-value cc-mono">
                      {{ bridgeTokenId ? truncateHash(bridgeTokenId) : '—（请先在左侧选择资产）' }}
                    </div>
                  </div>

                  <div class="cc-field">
                    <div class="cc-field-label">Amount</div>
                    <input class="cc-input" v-model="bridgeAmount" placeholder="例如 1 / 100" />
                  </div>

                  <!-- 转入：CB-In -->
                  <template v-if="bridgeMode === 'in'">
                    <div class="cc-field">
                      <div class="cc-field-label">To（ChainMaker 地址）</div>
                      <input class="cc-input" v-model="bridgeToChainmaker" placeholder="例如 64b6a0f6..." />
                    </div>

                    <div class="cc-field">
                      <div class="cc-field-label">CategoryName</div>
                      <input class="cc-input" v-model="bridgeCategoryName" placeholder="例如 WH" />
                    </div>

                    <div class="cc-field">
                      <div class="cc-field-label">Metadata.source</div>
                      <input class="cc-input" v-model="bridgeMetaSource" placeholder="peer-burn" />
                    </div>

                    <div class="cc-field">
                      <div class="cc-field-label">Metadata.desc</div>
                      <input class="cc-input" v-model="bridgeMetaDesc" placeholder="mint after peer burn" />
                    </div>
                  </template>

                  <!-- 转出：CB-Out -->
                  <template v-else>
                    <div class="cc-field">
                      <div class="cc-field-label">OwnerAddress（ChainMaker 拥有者地址）</div>
                      <input class="cc-input" v-model="bridgeOwnerAddress" placeholder="例如 64b6a0f6..." />
                    </div>

                    <div class="cc-field">
                      <div class="cc-field-label">To（EVM 接收地址）</div>
                      <input class="cc-input" v-model="bridgeToEvm" placeholder="例如 0x70997970..." />
                    </div>
                  </template>
                </div>

                <!-- 执行按钮 -->
                <button class="cc-connect" @click="submitBridge" :disabled="bridgeSubmitting">
                  <span class="cc-wallet">⚡</span>
                  {{ bridgeSubmitting ? '提交中...' : (bridgeMode === 'in' ? '执行转入' : '执行转出') }}
                </button>

                <!-- 可选：展示返回 -->
                <div v-if="bridgeLastResp" class="cc-resp">
                  <div class="cc-resp-title">返回：</div>
                  <pre class="cc-resp-pre">{{ JSON.stringify(bridgeLastResp, null, 2) }}</pre>
                </div>
              </div>

              <!-- 右下角淡淡小装饰（像图里星星） -->
              <div class="cc-spark">✦</div>
            </div>

            <!-- 右上角关闭 -->
            <button class="cc-close" @click="closeCrossSearchModal" aria-label="close">×</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 购物车弹窗 -->
  <!-- 购物车弹窗 -->
  <div v-if="showCartModal" class="cart-modal">
  <div class="cart-content">
    <h3>购物车</h3>
    
    <!-- 选项卡 -->
    <!--<div class="tabs">
      <button 
        :class="{ active: activeTab === 'requested' }"
        @click="activeTab = 'requested'"
      >
        已申请的资产
      </button>
      <button 
        :class="{ active: activeTab === 'awaiting' }"
        @click="activeTab = 'awaiting'"
      >
        待确认的资产申请
      </button>
    </div>-->
    <div class="tabs">
  <button
    v-if="role === 'buyer'"
    :class="{ active: activeTab === 'requested' }"
    @click="activeTab = 'requested'"
  >
    已申请的资产
  </button>

  <button
    v-if="role === 'seller'"
    :class="{ active: activeTab === 'awaiting' }"
    @click="activeTab = 'awaiting'"
  >
    待确认的资产申请
  </button>
</div>



    <!-- 已申请的资产 -->
    <div v-if="role === 'buyer' && activeTab === 'requested'" class="cart-section">
      <h4>已申请购买的资产</h4>
      <ul>
        <li v-for="asset in requestedAssets" :key="asset.file_hash">
          <div class="cart-item">
            <p><strong>交易ID:</strong> {{ asset.asset_name }}</p>
            <p><strong>价格:</strong> {{ asset.price }} ETH</p>
            <p><strong>资产ID:</strong> {{ asset.file_hash }}</p>
            <p><strong>状态:</strong> {{ asset.status }}</p>
            <p><strong>卖家地址:</strong> {{ asset.seller_address }}</p>
            <p><strong>申请数量:</strong> {{ asset.quantity }}</p>
            <!-- <button
              class="confirm-button"
              v-if="['已确认','已完成','成功'].includes(asset.status)"
              @click.stop="downloadDigitalContract(asset)"
            >下载数字合约</button> -->
          </div>
        </li>
      </ul>
    </div>

    <!-- 待确认的资产 -->
    <div v-if="role === 'seller' && activeTab === 'awaiting'" class="cart-section">
      <h4>待确认的资产申请</h4>
      <ul>
        <li v-for="asset in awaitingAssets" :key="asset.file_hash">
          <div class="cart-item">
            <p><strong>交易ID:</strong> {{ asset.transaction_id }}</p>
            <p><strong>价格:</strong> {{ asset.price }} ETH</p>
            <p><strong>资产ID:</strong> {{ asset.file_hash }}</p>
            <p><strong>状态:</strong> {{ asset.status }}</p>
            <p><strong>卖家地址:</strong> {{ asset.seller_address }}</p>
            <p><strong>买家地址:</strong> {{ asset.buyer_address }}</p>
            <p><strong>申请数量:</strong> {{ asset.quantity }}</p>
            <div class="button-section">
  <button  
    class="confirm-button"
    v-if="asset.status === '待确认'" 
    @click="confirmTransaction(asset)" 
    :disabled="asset.status !== '待确认'"
  >
    确认交易
  </button>
</div>


          </div>
        </li>
      </ul>
    </div>

    <!-- 关闭按钮 -->
    <div class="cart-close">
      <button @click="closeCartModal">关闭</button>
    </div>
  </div>
</div>


  </div>
</template>


<script>
import axios from 'axios';
import AppHeader from '@/components/AppHeader.vue';
import AppSidebar from '@/components/AppSidebar.vue';

export default {
  name: 'MarketPlace',
  components: {
    AppHeader,
    AppSidebar,
  },
  data() {
    return {
      selectedDomain: 'ALL',
    selectedAssetCategory: 'ALL',
    selectedAssetType: 'ALL',

    assetCategories: [
      { value: 'ALL', label: '全部' },
      { value: '数据资产', label: '数据资产' },
      { value: '数字内容和知识产权', label: '数字内容和知识产权' },
      { value: '数字证券', label: '数字证券' },
      { value: '央行数字货币', label: '央行数字货币' },
      { value: '密货币与稳定币', label: '密货币与稳定币' },
      { value: '账户与身份型虚拟资产', label: '账户与身份型虚拟资产' },
      { value: '数字化凭证', label: '数字化凭证' }
    ],

    assetTypes: [
      { value: 'ALL', label: '全部' },
      { value: '一般数据', label: '一般数据' },
      { value: '重要数据', label: '重要数据' },
      { value: '核心数据', label: '核心数据' }
    ],

      catalogBaseUrl: 'http://10.112.47.214:8008',
      username: '',
      userId: '',
      spinnerColor: '#007bff',
      isLoading: true,
      searchResults: [],
      searchTerm: '',
      isSearching: false,
      searchExecuted: false,
      displayedAssets: [], // 初始化为一个空数组
      
      showCrossSearchModal: false,

      bridgeMode: 'in', // 'in' 转入 | 'out' 转出
    bridgeAmount: '1',
    bridgeTokenId: '',

    // CB-In 需要
    bridgeToChainmaker: '',     // CB-In 的 to（示例是 64b6...）
    bridgeCategoryName: 'WH',   // CB-In 的 categoryName
    bridgeMetaSource: 'peer-burn',
    bridgeMetaDesc: 'mint after peer burn',

    // CB-Out 需要
    bridgeToEvm: '',            // CB-Out 的 to（示例是 0x...）
    bridgeOwnerAddress: '',     // CB-Out 的 ownerAddress（示例是 64b6...）

    bridgeSubmitting: false,
    bridgeLastResp: null,

crossSearchTerm: '',
crossSearchResults: [],
crossSearched: false,

// 右侧调配面板需要
selectedCrossAsset: null,
chainOptions: ['Base', 'Arbitrum', 'Ethereum', 'Optimism'],
fromChain: 'Base',
toChain: 'Arbitrum',

fromAmount: '0.00',
toAmount: '0.00',
fromFiat: '$0.00',
toFiat: '$0.00',
fromBalance: '0',
toBalance: '0',


      domains: [
  { value: 'ALL', label: '全部' },
  { value: '碳证交易', label: '碳证交易' },
  { value: '征信', label: '征信' },
  { value: '数字版权', label: '数字版权' },
  { value: '自动驾驶', label: '自动驾驶' },
  { value: '车联网', label: '车联网' },
  { value: '法律', label: '法律' },
  { value: '农、林、牧、渔业', label: '农、林、牧、渔业' },
  { value: '采矿业', label: '采矿业' },
  { value: '制造业', label: '制造业' },
  { value: '电力、热力、燃气及水生产和供应业', label: '电力、热力、燃气及水生产和供应业' },
  { value: '建筑业', label: '建筑业' },
  { value: '批发和零售业', label: '批发和零售业' },
  { value: '交通运输、仓储和邮政业', label: '交通运输、仓储和邮政业' },
  { value: '住宿和餐饮业', label: '住宿和餐饮业' },
  { value: '信息传输、软件和信息技术服务业', label: '信息传输、软件和信息技术服务业' },
  { value: '金融业', label: '金融业' },
  { value: '房地产业', label: '房地产业' },
  { value: '租赁和商务服务业', label: '租赁和商务服务业' },
  { value: '科学研究和技术服务业', label: '科学研究和技术服务业' },
  { value: '水利、环境和公共设施管理业', label: '水利、环境和公共设施管理业' },
  { value: '居民服务、修理和其他服务业', label: '居民服务、修理和其他服务业' },
  { value: '教育', label: '教育' },
  { value: '卫生和社会工作', label: '卫生和社会工作' },
  { value: '文化、体育和娱乐业', label: '文化、体育和娱乐业' },
  { value: '公共管理、社会保障和社会组织', label: '公共管理、社会保障和社会组织' },
  { value: '国际组织', label: '国际组织' }
],

      /*categories: [
        { value: 'ALL', label: '全部' },
        { value: 'NY', label: '能源' },
        { value: 'DL', label: '电力' },
        { value: 'TZ', label: '碳证' },
        { value: 'JT', label: '交通出行' },
        { value: 'YL', label: '医疗健康' },
        { value: 'ZX', label: '征信' },
        { value: 'JR', label: '金融' },
        { value: 'SZ', label: '数字版权' },
        { value: 'ZD', label: '自动驾驶' },
        { value: 'CL', label: '车联网' },
        { value: 'WH', label: '文化' },
        { value: 'FL', label: '法律' },
      ],*/
      industryMap: {
        TZ: '碳证交易',
  ZX: '征信',
  SZ: '数字版权',
  ZD: '自动驾驶',
  CL: '车联网',
  FL: '法律',
  A01: '农、林、牧、渔业',
  B02: '采矿业',
  C03: '制造业',
  D04: '电力、热力、燃气及水生产和供应业',
  E05: '建筑业',
  F06: '批发和零售业',
  G07: '交通运输、仓储和邮政业',
  H08: '住宿和餐饮业',
  I09: '信息传输、软件和信息技术服务业',
  J10: '金融业',
  K11: '房地产业',
  L12: '租赁和商务服务业',
  M13: '科学研究和技术服务业',
  N14: '水利、环境和公共设施管理业',
  O15: '居民服务、修理和其他服务业',
  P16: '教育',
  Q17: '卫生和社会工作',
  R18: '文化、体育和娱乐业',
  S19: '公共管理、社会保障和社会组织',
  T20: '国际组织'
      
      },
      assets: [],
      itemsPerPage: 8,
      currentPage: 1,
      totalAssets: 0,
      selectedAsset: null,
      showPurchaseModal: false,
      userBalance: 500,
      purchaseSuccess: false,
      showCartModal: false,
      activeTab: 'requested', // 默认显示已申请的资产
      requestedAssets: [],
      awaitingAssets: [],
      certificates: [],
      role: 'buyer', // buyer | seller


    };
  },


  async mounted() {
  const token = localStorage.getItem('token');
  if (token) {
    const payload = this.parseJwt(token);
    this.username = decodeURIComponent(payload.username); // 获取并设置用户名
    console.log('当前登录用户名:', this.username);

    // 获取用户ID，并确保其完成
    await this.fetchUserId(this.username);

    await this.fetchCertificates();
this.fetchAssets();

// ✅ 监管方固定使用买方视角，其它身份再走自动判定
if (this.isRegulatorView) {
  this.role = 'buyer';
} else {
  await this.detectRoleByPending();
}

// ✅ 根据角色只加载需要的购物车数据
if (this.role === 'buyer') {
  this.activeTab = 'requested';
  await this.fetchRequestedAssets();
  this.awaitingAssets = [];
} else {
  this.activeTab = 'awaiting';
  await this.fetchPendingAssets();
  this.requestedAssets = [];
}


  }
},

  computed: {
    isRegulatorView() {
      return localStorage.getItem('login_role') === 'regulator';
    },
    paginatedAssets() {
      const start = (this.currentPage - 1) * this.itemsPerPage;
      const end = start + this.itemsPerPage;
      return this.displayedAssets.slice(start, end);
    },
    insufficientBalance() {
      return (this.selectedAsset?.price || 100) > this.userBalance;
    },
  },
  methods: {
    async submitBridge() {
    if (!this.selectedCrossAsset) {
      this.$message?.warning?.('请先在左侧选择一个资产');
      return;
    }
    if (!this.bridgeTokenId) {
      this.$message?.warning?.('缺少 tokenId（资产唯一标识）');
      return;
    }
    if (!this.bridgeAmount || Number(this.bridgeAmount) <= 0) {
      this.$message?.warning?.('请输入有效的 amount');
      return;
    }

    this.bridgeSubmitting = true;
    this.bridgeLastResp = null;

    try {
      if (this.bridgeMode === 'in') {
        // ====== 转入：CB-In ======
        if (!this.bridgeToChainmaker) {
          this.$message?.warning?.('请输入转入地址（to：ChainMaker 地址，如 64b6...）');
          return;
        }

        const payload = {
          amount: String(this.bridgeAmount),
          to: this.bridgeToChainmaker,
          tokenId: this.bridgeTokenId,
          categoryName: this.bridgeCategoryName,
          metadata: {
            source: this.bridgeMetaSource,
            desc: this.bridgeMetaDesc
          }
        };

        console.log('POST /CB-In payload =', payload);

        const resp = await axios.post(
          'http://10.112.47.214:8848/pre/CB-In',
          payload
        );

        this.bridgeLastResp = resp?.data;
        if (resp.status === 200 && resp.data?.code === 0) {
          this.$message?.success?.('✅ 转入成功（CB-In）');
        } else {
          this.$message?.error?.(`❌ 转入失败：${resp.data?.message || 'unknown error'}`);
        }

      } else {
        // ====== 转出：CB-Out ======
        if (!this.bridgeOwnerAddress) {
          this.$message?.warning?.('请输入 ownerAddress（ChainMaker 资产拥有者地址，如 64b6...）');
          return;
        }
        if (!this.bridgeToEvm) {
          this.$message?.warning?.('请输入转出接收地址（to：EVM 地址，如 0x...）');
          return;
        }

        const payload = {
          amount: String(this.bridgeAmount),
          to: this.bridgeToEvm,
          tokenId: this.bridgeTokenId,
          ownerAddress: this.bridgeOwnerAddress
        };

        console.log('POST /CB-Out payload =', payload);

        const resp = await axios.post(
          'http://10.112.47.214:8848/pre/CB-Out',
          payload
        );

        this.bridgeLastResp = resp?.data;
        if (resp.status === 200 && resp.data?.code === 0) {
          this.$message?.success?.('✅ 转出成功（CB-Out）');
        } else {
          this.$message?.error?.(`❌ 转出失败：${resp.data?.message || 'unknown error'}`);
        }
      }
    } catch (e) {
      console.error('跨链调配失败:', e);
      this.$message?.error?.('跨链调配失败：请检查 8848 服务是否正常');
    } finally {
      this.bridgeSubmitting = false;
    }
  },
    openCrossSearchModal() {
    this.showCrossSearchModal = true;
    this.crossSearchTerm = '';
    this.crossSearchResults = [];
    this.crossSearched = false;

    // 右侧初始化
    this.selectedCrossAsset = null;

    this.bridgeMode = 'in';
    this.bridgeAmount = '1';
    this.bridgeTokenId = '';
    this.bridgeLastResp = null;
    this.bridgeSubmitting = false;

    this.bridgeToChainmaker = '';
    this.bridgeToEvm = '';
    this.bridgeOwnerAddress = '';

    // 你原来的 UI 字段如果还要保留也行
    this.fromChain = 'Base';
    this.toChain = 'Arbitrum';
  },

closeCrossSearchModal() {
  this.showCrossSearchModal = false;
},

async crossSearchAssets() {
  // ✅ MOD: 改为调用目录链后端（catalog_contract 对应的服务）
  const kw = (this.crossSearchTerm || '').trim();
  this.crossSearched = true;

  if (!kw) {
    this.crossSearchResults = [];
    return;
  }

  try {
    // ✅ MOD: 调用你文档里的「按 name 在所有 org 中查询」
    const res = await axios.get('/catalogapi/contract/datacatalogs/name/all', {
  params: { name: kw }
});

    // 兼容你文档返回结构：{status, code, message, data:{result:[...]}}
    const list = res?.data?.data?.result || [];

    // ✅ MOD: 后端会返回“所有版本”，前端筛选每个 id 的最新版本（version 最大）
    const latestById = new Map();
    for (const item of list) {
      const id = item?.id;
      if (!id) continue;

      const prev = latestById.get(id);
      if (!prev || (item.version ?? 0) > (prev.version ?? 0)) {
        latestById.set(id, item);
      }
    }

    // ✅ MOD: 统一映射成弹窗表格需要的字段（尽量复用你模板里的字段名）
    this.crossSearchResults = Array.from(latestById.values()).map(dc => ({
      // 你表格里用 a.asset_name / a.file_hash，所以这里映射过去
      asset_name: dc.name,
      file_hash: dc.id,

      // 平台/链展示用
      orgDID: dc.orgDID,
      orgId: dc.orgId,
      chain_name: 'ChainMaker (chain1)',

      // 额外保留：后续右侧调配可能用得上
      code: dc.code,
      remark: dc.remark,
      publishTime: dc.publishTime,
      version: dc.version,
      status: dc.status,
      itemVOList: dc.itemVOList
    }));

  } catch (e) {
    console.error('跨平台检索（目录链）失败:', e);
    this.crossSearchResults = [];
    this.$message?.error?.('跨平台检索失败：请检查目录链后端 http://10.112.47.214:8008 是否已启动');
  }
},

selectCrossAsset(asset) {
    this.selectedCrossAsset = asset;

    this.bridgeTokenId = asset?.file_hash || asset?.asset_id || '';
    this.bridgeCategoryName = asset?.industry || asset?.categoryName || 'WH';

    
    this.fromChain = 'ChainMaker(chain1)';
  },
getCrossPlatform(asset) {
  // ✅ MOD: 优先展示 chain + orgDID（目录链场景更直观）
  const did = asset.orgDID || asset.orgId || '';
  return did ? `ChainMaker(chain1) / ${did}` : 'ChainMaker(chain1)';
},
// getCrossPlatform(asset) {
//   return (
//     asset.chain_name ||
//     asset.platform ||
//     asset.chain ||
//     asset.source ||
//     asset.industry_raw_name ||
//     'Base'
//   );
// },

connectWalletMock() {
  // 仅做 UI 对齐：你后续接钱包逻辑时替换这里
  this.$message?.info?.('此处接入钱包连接逻辑（UI已对齐）');
},

//     openCrossSearchModal() {
//   this.showCrossSearchModal = true;
//   this.crossSearchTerm = '';
//   this.crossSearchResults = [];
//   this.crossSearched = false;
// },

// closeCrossSearchModal() {
//   this.showCrossSearchModal = false;
// },

// crossSearchAssets() {
//   const kw = (this.crossSearchTerm || '').trim().toLowerCase();
//   this.crossSearched = true;

//   if (!kw) {
//     this.crossSearchResults = [];
//     return;
//   }

//   // ✅ 最小改动：先用本地 assets 做“跨平台聚合检索”（你已经合并了 available + resalable）
//   this.crossSearchResults = (this.assets || []).filter(a => {
//     const name = (a.asset_name || '').toLowerCase();
//     return name.includes(kw);
//   });
// },

// getCrossPlatform(asset) {
//   // 你后端字段可能不统一，这里做个兜底映射
//   // 优先：industry_raw_name / chain_name / platform / source / chain
//   return (
//     asset.chain_name ||
//     asset.platform ||
//     asset.chain ||
//     asset.source ||
//     asset.industry_raw_name ||
//     '本平台'
//   );
// },

// selectCrossAsset(asset) {
//   // 跟你原本 selectAsset 逻辑一致：跳转详情页
//   this.selectAsset(asset);
// },

    async detectRoleByPending() {
  try {
    // 复用你 fetchRequestedAssets / fetchPendingAssets 的证书遍历逻辑
    const certLists = [];

    // org1
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
    } catch (e) {
      //
    }

    // org2
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
    } catch (e) {
      //
      }

    // ✅ 只要发现任一地址有 pendingTransactions，就判为 seller
    for (const { cert } of certLists) {
      const certInfo = this.certificates.find(item => item.cert === cert);
      const addr = certInfo?.address;
      if (!addr) continue;

      const pendingRes = await axios.get(`http://10.112.47.214:3000/api/seller-pending-transactions/${addr}`);
      const list = pendingRes?.data?.pendingTransactions || [];
      if (Array.isArray(list) && list.length > 0) {
        this.role = 'seller';
        return;
      }
    }

    // 默认买家
    this.role = 'buyer';
  } catch (e) {
    // 判定失败也默认买家，避免页面空
    this.role = 'buyer';
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
}
,
    parseJwt(token) {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    },

    async fetchCertificates() {
  if (!this.userId) {
    console.error('userId 为空，无法请求证书');
    return; // 如果 userId 为空，直接返回
  }

  try {
    const response = await axios.post('http://10.112.47.214:3000/api/get-certificates', {
      userId: this.userId,
    });
    if (response.status === 200 && response.data.certificates) {
      this.certificates = response.data.certificates.map(item => ({
        cert: item.cert || '未知证书',
        address: item.address || '',
        sign_cert_path: item.sign_cert_path || '',
      }));
    } else {
      console.error('获取证书失败:', response.data);
      this.certificates = [];
    }
  } catch (error) {
    console.error('请求证书时发生错误:', error);
    this.certificates = [];
  }
},


async getCertAddr(selectedCert) {
      try {
        const selected = this.certificates.find(item => item.cert === selectedCert);
        if (selected?.address) {
          return selected.address;
        }
        throw new Error('证书地址获取失败');
      } catch (error) {
        console.error('请求地址时发生错误:', error);
        throw new Error('证书地址获取失败，请检查网络连接或服务器状态');
      }
    },

// 生成并下载数字合约(JSON) —— 无状态/chain_info/version
async downloadDigitalContract(asset) {
  try {
    // 1) 需要 transaction_id
    const transactionId = asset.transaction_id;
    if (!transactionId) {
      this.$message?.error?.('缺少 transaction_id，无法生成数字合约');
      return;
    }

    // 2) 取交易详情
    const txDetailRes = await axios.get(
      `http://10.112.47.214:3000/api/get-transaction-detail/${transactionId}`
    );
    const tx = txDetailRes?.data?.transaction;
    if (!tx) {
      this.$message?.error?.('未获取到交易详情');
      return;
    }

    // 3) 取资产详情
    const assetId = tx.asset_id || asset.file_hash;
    const assetRes = await axios.get(`http://10.112.47.214:3000/api/asset/${assetId}`);
    const assetInfo = assetRes?.data || {};

    // 4) 权限（quality -> operations）
    const ops = (tx.quality || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => (s === '所有权' ? '所有' : s)); // 统一为“所有/查阅/加工使用”

    // 5) 合约对象（已去掉 contract_status/chain_info/version）
    const contractObj = {
      contract_id: `CONTRACT-${transactionId}`,
      contract_name: `${assetInfo.asset_name || '数字产品'}-数字合约`,
      contract_description:
        assetInfo.description || '该数字合约依据平台交易信息自动生成，用于界定交易双方权责与限制条件。',
      created_at:
        (tx.created_at && new Date(tx.created_at.replace(' ', 'T')).toISOString())
        || new Date().toISOString(),
      token_id: assetId,
      product_name: assetInfo.asset_name || '未知产品',
      seller_id: tx.seller_address ?? 'unknown-seller',
      buyer_id: tx.buyer_address ?? 'unknown-buyer',
      operations: ops.length ? ops : ['所有'],
      constraints: {
        expiration_time: tx.expiration_time
          ? new Date(tx.expiration_time.replace(' ', 'T')).toISOString()
          : null,
        quantity: asset.quantity ?? tx.quantity ?? null
      }
    };

    // 6) 触发浏览器下载
    const blob = new Blob([JSON.stringify(contractObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-${transactionId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.$message?.success?.('数字合约已生成并开始下载');
  } catch (e) {
    console.error('生成数字合约失败：', e);
    this.$message?.error?.('生成数字合约失败，请稍后重试');
  }
},

async fetchRequestedAssets() {
  try {
    const certLists = [];

    // 获取 org1 的证书列表
    try {
      const org1Res = await axios.post('http://10.112.47.214:3000/api/get-certificates', {
        userId: this.userId,
      });
      if (org1Res.status === 200 && Array.isArray(org1Res.data.certificates)) {
        certLists.push(...org1Res.data.certificates.map(cert => ({
          org: 'wx-org1.chainmaker.org',
          cert: cert.cert
        })));
      } else {
        console.warn('org1 证书接口返回异常:', org1Res.data);
      }
    } catch (err) {
      console.error('获取 org1 证书失败:', err);
    }

    // 获取 org2 的证书列表
    try {
      const org2Res = await axios.post('http://10.112.47.214:3000/api/get-certificates2', {
        userId: this.userId,
      });
      if (org2Res.status === 200 && Array.isArray(org2Res.data.certificates)) {
        certLists.push(...org2Res.data.certificates.map(cert => ({
          org: 'wx-org2.chainmaker.org',
          cert: cert.cert
        })));
      } else {
        console.warn('org2 证书接口返回异常:', org2Res.data);
      }
    } catch (err) {
      console.error('获取 org2 证书失败:', err);
    }

    const allTransactions = [];

    for (const { cert } of certLists) {
      try {
        const certInfo = this.certificates.find(item => item.cert === cert);
        const certAddr = certInfo?.address;
        if (!certAddr) {
          console.warn(`未能获取地址，证书: ${cert}`);
          continue;
        }

        const txRes = await axios.get(`http://10.112.47.214:3000/api/buyer-transaction-status/${certAddr}`);
        if (txRes.status !== 200 || !Array.isArray(txRes.data.transactions)) {
          console.warn(`交易状态返回异常，地址: ${certAddr}`, txRes.data);
          continue;
        }

        const formattedTxs = txRes.data.transactions.map(tx => ({
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
        console.error(`处理证书 ${cert} 交易信息时出错:`, err);
      }
    }

    this.requestedAssets = allTransactions;

  } catch (error) {
    console.error('获取多证书资产时失败:', error);
  }
},

 async fetchPendingAssets() {
  try {
    const certLists = [];

    // 获取 org1 的证书
    try {
      const org1Res = await axios.post('http://10.112.47.214:3000/api/get-certificates', {
        userId: this.userId,
      });
      if (org1Res.status === 200 && Array.isArray(org1Res.data.certificates)) {
        certLists.push(...org1Res.data.certificates.map(cert => ({
          org: 'wx-org1.chainmaker.org',
          cert: cert.cert
        })));
      } else {
        console.warn('org1 证书接口异常:', org1Res.data);
      }
    } catch (err) {
      console.error('获取 org1 证书失败:', err);
    }

    // 获取 org2 的证书
    try {
      const org2Res = await axios.post('http://10.112.47.214:3000/api/get-certificates2', {
        userId: this.userId,
      });
      if (org2Res.status === 200 && Array.isArray(org2Res.data.certificates)) {
        certLists.push(...org2Res.data.certificates.map(cert => ({
          org: 'wx-org2.chainmaker.org',
          cert: cert.cert
        })));
      } else {
        console.warn('org2 证书接口异常:', org2Res.data);
      }
    } catch (err) {
      console.error('获取 org2 证书失败:', err);
    }

    const allPendingTx = [];

    for (const { cert } of certLists) {
      try {
        const certInfo = this.certificates.find(item => item.cert === cert);
        const certAddr = certInfo?.address;
        if (!certAddr) {
          console.warn(`未能获取地址，证书: ${cert}`);
          continue;
        }

        const txRes = await axios.get(`http://10.112.47.214:3000/api/seller-pending-transactions/${certAddr}`);
        if (txRes.status !== 200 || !Array.isArray(txRes.data.pendingTransactions)) {
          console.warn(`交易状态返回异常，地址: ${certAddr}`, txRes.data);
          continue;
        }

        const formattedTxs = txRes.data.pendingTransactions.map(tx => ({
          transaction_id: tx.transaction_id,
          price: 1.5,
          file_hash: tx.asset_id,
          status: tx.status,
          seller_address: tx.seller_address,
          buyer_address: tx.buyer_address,
          quantity: tx.quantity,
        }));

        allPendingTx.push(...formattedTxs);
      } catch (err) {
        console.error(`处理证书 ${cert} 的待确认资产时出错:`, err);
      }
    }

    this.awaitingAssets = allPendingTx;

  } catch (error) {
    console.error('获取所有待确认资产时失败:', error);
  }
},


 /* async confirmTransaction(asset) {
  try {
    const isAgree = true;

    // 1. 获取交易详情，拿到 quality 字段
    const txDetail = await axios.get(`http://10.112.47.214:3000/api/get-transaction-detail/${asset.transaction_id}`);
    const qualityStr = txDetail.data.transaction?.quality;

    if (!qualityStr) {
      this.$message.error('无法获取交易权限类型');
      return;
    }
    
    // 假设从后端获取到的 expiration 是带 T 的 ISO 格式
    let expiration = txDetail.data.transaction?.expiration_time;

    // 如果 expiration 存在，直接使用带 T 的 ISO 格式
    if (expiration) {
      expiration = new Date(expiration.replace(' ', 'T')).toISOString();
    }

    // 2. 获取资产详情以补全 industry
    const assetDetailRes = await axios.get(`http://10.112.47.214:3000/api/asset/${asset.file_hash}`);
    asset.industry = assetDetailRes.data.industry;

    // 3. 确认交易（更新数据库）
    const response = await axios.post('http://10.112.47.214:3000/api/seller-confirm-transaction', {
      seller_address: asset.seller_address,
      transaction_id: asset.transaction_id,
      isAgree,
    });

    if (response.status === 200 && response.data.status === '已确认') {
      this.$message.success('交易已确认');
      asset.status = '已确认';

      // 4. 遍历权限字段（如："查阅权,加工权"）
      const qualityList = qualityStr.split(',').map(q => q.trim());
      let hasOwnership = false;

      for (const rightType of qualityList) {
        if (rightType === '所有权') {
          hasOwnership = true; // 延后处理
          continue;
        }

        const permissionPayload = {
          owner: asset.buyer_address,
          tokenID: asset.file_hash,
          expiration: expiration,
          rightType
        };

        console.log('调用 BuyPermission:', permissionPayload);5
        const permissionResponse = await axios.post('http://10.112.47.214:8848/pre/BuyPermission', permissionPayload);

        if (permissionResponse.status !== 200 || permissionResponse.data.code !== 0) {
          this.$message.warning(`权限 ${rightType} 交易失败`);
        } else {
          this.$message.success(`权限 ${rightType} 交易成功`);
        }
      }

      // 5. 如果包含所有权，则调用资产转移
      if (hasOwnership) {
        await this.transferAsset(asset);
      }

    } else {
      this.$message.error('交易确认失败');
    }

  } catch (error) {
    console.error('❌ 确认交易流程异常:', error);
    this.$message.error('确认交易时发生错误');
  }
},*/


    async confirmTransaction(asset) {
  try {
    const isAgree = true;

    // --- Step 1: 获取交易和资产的必要信息 ---
    const txDetail = await axios.get(`http://10.112.47.214:3000/api/get-transaction-detail/${asset.transaction_id}`);
    const transactionInfo = txDetail.data.transaction;
    if (!transactionInfo || !transactionInfo.quality) {
      this.$message.error('无法获取交易详情或权限类型');
      return;
    }
    console.log("user_id", transactionInfo.owner_id);
    const qualityStr = transactionInfo.quality;
    let expiration = transactionInfo.expiration_time;
    if (expiration) {
      expiration = new Date(expiration.replace(' ', 'T')).toISOString();
    }
    const assetDetailRes = await axios.get(`http://10.112.47.214:3000/api/asset/${asset.file_hash}`);
    asset.industry = assetDetailRes.data.industry;

    // --- Step 2: 在数据库中确认交易状态 ---
    const response = await axios.post('http://10.112.47.214:3000/api/seller-confirm-transaction', {
      seller_address: asset.seller_address,
      transaction_id: asset.transaction_id,
      isAgree,
    });
    if (response.status !== 200 || response.data.status !== '已确认') {
      this.$message.error('交易确认失败');
      return;
    }
    this.$message.success('交易已在数据库中确认');
    asset.status = '已确认';

    

    try {
  const tx        = transactionInfo;
  const assetInfo = assetDetailRes.data || {};

  const contractId   = `CONTRACT-${asset.transaction_id}`;
  const productName  = assetInfo.asset_name || "未知产品";
  const contractName = `${productName}-数字合约`;
  const tokenId      = asset.file_hash;
  const desc         = assetInfo.description || "自动生成数字合约";

  const operationsArr = (tx.quality || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (s === "所有权" ? "所有" : s));

  const operationsStr = operationsArr.join(",");

  const expirationIso = expiration || null;
  const quantityLimit = tx.quantity ?? asset.quantity ?? 1;
  const processingType = tx.processing_type || null;

  await axios.post("http://10.112.47.214:3000/api/save-digital-contract", {
    transaction_id: asset.transaction_id,
    contract_id: contractId,
    contract_name: contractName,
    product_name: productName,
    token_id: tokenId,
    contract_description: desc,
    seller_address: asset.seller_address,
    buyer_address: asset.buyer_address,
    operations: operationsStr,
    expiration_time: expirationIso,
    quantity_limit: quantityLimit,
    processing_type: processingType
  });

  this.$message.success("数字合约已生成并保存");

} catch (err) {
  console.error("保存数字合约失败:", err);
  this.$message.error("数字合约保存失败");
}

    // --- Step 3: 处理所有链上交易（所有权和使用权）---
    
    // 【关键修改】引入一个总的成功标志位
    let anyTransactionSucceeded = false; 

    const qualityList = qualityStr.split(',').map(q => q.trim());
    let hasOwnership = qualityList.includes('所有权');

    // 处理使用权 (BuyPermission)
    for (const rightType of qualityList) {
      if (rightType === '所有权') continue; // 所有权单独处理

      const permissionPayload = {
        owner: asset.buyer_address,
        tokenID: asset.file_hash,
        expiration: expiration,
        rightType
      };

      try {
        console.log(`调用 BuyPermission for [${rightType}]:`, permissionPayload);
        const permissionResponse = await axios.post('http://10.112.47.214:8848/pre/BuyPermission', permissionPayload);
        if (permissionResponse.status === 200 && permissionResponse.data.code === 0) {
          this.$message.success(`权限 [${rightType}] 交易成功`);
          anyTransactionSucceeded = true; // 【关键修改】只要有一次成功，就标记
        } else {
          this.$message.warning(`权限 [${rightType}] 交易失败: ${permissionResponse.data.message}`);
        }
      } catch (permError) {
        console.error(`购买权限 [${rightType}] 异常:`, permError);
        const backendMessage =
          permError?.response?.data?.message ||
          permError?.response?.data?.error ||
          permError?.message ||
          '未知错误';
        this.$message.error(`权限 [${rightType}] 交易失败: ${backendMessage}`);
      }
    }

    // 处理所有权 (transferAsset)
    if (hasOwnership) {
      const transferSuccess = await this.transferAsset(asset);
      if (transferSuccess) {
        anyTransactionSucceeded = true; // 【关键修改】转移成功，也标记
      }
    }

    // --- Step 4: 【统一处理】根据交易是否成功，决定是否存入二次交易表 ---
    
    // 【关键修改】最后检查总的成功标志位
   if (anyTransactionSucceeded) {
  console.log('✅ 至少有一项权益交易成功，开始处理二次销售入库...');
  
  try {
    // 4.1. 获取资产的完整信息作为基础模板
    const assetDetailsResponse = await axios.get(`http://10.112.47.214:3000/api/get-asset-details/${asset.file_hash}`);
    
    if (assetDetailsResponse.status === 200) {
      const assetDetails = assetDetailsResponse.data;
      console.log('获取到资产完整信息:', assetDetails);

      // 4.2. 检查原始资产是否允许二次销售
      if (assetDetails.allow_resale === 1) {
        console.log('该资产允许二次交易，准备存入 resalable_assets 表。');

        // 【=============== 核心修改在这里 ===============】
        // 4.3. 准备要存入新表的数据
        
        // 我们从交易信息中获取买家实际购买的权益列表
        const purchasedRights = qualityStr.split(',').map(q => q.trim());
        
        const resalableData = {
          ...assetDetails, // 先复制所有原始信息作为模板

          // --- 关键覆盖操作 ---
          user_id: transactionInfo.buyer_id,        // 覆盖为新所有者(买家)的ID
          current_owner_address: asset.buyer_address, // 覆盖为新所有者(买家)的地址
          
          // 根据买家购买的权益，重置可出售权益字段
          // 无论原始资产的权益是什么，新记录只反映本次购买的权益
          can_sell_asset: purchasedRights.includes('所有权') ? 1 : 0,
          can_sell_view: purchasedRights.includes('查阅权') ? 1 : 0,
          can_sell_process: purchasedRights.includes('加工权') ? 1 : 0,
        };
        
        // 移除旧的ID，让新表自增
        delete resalableData.id;

        console.log('准备存入 resalable_assets 的最终数据:', resalableData);
        
        // 4.4. 调用接口，存入新表
        await axios.post('http://10.112.47.214:3000/api/save-resalable-asset', resalableData);
        
        console.log('成功请求将资产存入 resalable_assets 表。');
        this.$message.info('该资产已成功加入可二次交易列表！');

      } else {
        console.log('ℹ️ 该资产的原始设置不允许二次交易 (allow_resale is not 1)。');
      }
    } else {
      console.error('获取资产详细信息失败:', assetDetailsResponse.data.message);
    }
  } catch (postProcessError) {
    console.error('❌ 交易后处理（二次销售入库）失败:', postProcessError);
    this.$message.error('交易后处理失败，请联系管理员。');
  }

} else {
    //console.log('❌ 所有权益交易均未成功，不执行二次销售入库。');
    //this.$message.error('所有链上交易均未成功，请检查区块链网络或联系管理员。');
}

  } catch (error) {
    console.error('❌ 确认交易顶层流程异常:', error);
    this.$message.error('确认交易时发生未知错误，请查看控制台。');
  }
},

  /*async confirmTransaction(asset) {
    try {
      // 确认交易状态
      const isAgree = true; // 假设用户同意
      console.log("正在确认交易...");
      const response = await axios.post('http://10.112.47.214:3000/api/seller-confirm-transaction', {
        seller_address: asset.seller_address,
        transaction_id: asset.transaction_id,
        isAgree,
      });

      if (response.status === 200 && response.data.status === '已确认') {
        this.$message.success('交易已确认');
        
        // 更新资产状态为已确认
        asset.status = '已确认';

        // 资产转移操作
        await this.transferAsset(asset);

      } else {
        this.$message.error('交易确认失败');
      }
    } catch (error) {
      console.error('确认交易时发生错误:', error);
      this.$message.error('确认交易时发生错误');
    }
  },*/

  /*async transferAsset(asset) {
    try {
      // 获取证书地址（作为买家地址）

      // 打印传递给 TransferFrom 的参数
      console.log("Transferring Asset:");
      console.log("From (Asset's owner address):", asset.seller_address);  // 卖家地址
      console.log("To (Selected certificate address):", asset.buyer_address);  // 证书地址（买家地址）
      console.log("TokenId (Asset's file hash):", asset.file_hash);  // 资产的文件哈希值作为 tokenId

      const transferResponse = await axios.post('http://10.112.47.214:8848/pre/TransferFrom', {
        from: asset.seller_address,
        to: asset.buyer_address,
        tokenId: asset.file_hash,
      });

      if (transferResponse.status === 200 && transferResponse.data.code === 0) {
        this.$message.success('资产转移成功');
        console.log('资产转移成功', transferResponse.data);

        // 更新当前拥有者的证书地址为新拥有者
        await axios.post('http://10.112.47.214:3000/api/update-owner', {
          assetId: asset.file_hash,
          newOwner: asset.buyer_address
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
  },*/


  /*async transferAsset(asset) {
  try {
    console.log("准备转移资产:");
    console.log("卖家地址:", asset.seller_address);
    console.log("买家地址:", asset.buyer_address);
    console.log("资产ID:", asset.file_hash);
    console.log("资产领域:", asset.industry);

    // 定义不可分割资产的领域
    const indivisibleIndustries = ['NY', 'DL', 'TZ', 'JT', 'YL', 'ZX', 'JR'];

    let transferResponse;

    if (indivisibleIndustries.includes(asset.industry)) {
      // 不可分割资产，调用 TransferFrom
      transferResponse = await axios.post('http://localhost:8848/pre/TransferFrom', {
        from: asset.seller_address,
        to: asset.buyer_address,
        tokenId: asset.file_hash,
      });
    } else {
      // 可分割资产，调用 En-Transfer
      transferResponse = await axios.post('http://localhost:8848/pre/En-Transfer', {
        to: asset.buyer_address,
        amount: asset.quantity.toString(), // 确保是字符串
      });
    }

    if (transferResponse.status === 200 && transferResponse.data.code === 0) {
      this.$message.success('资产转移成功');
      console.log('资产转移成功', transferResponse.data);

      // 更新当前拥有者为新买家
      await axios.post('http://10.112.47.214:3000/api/update-owner', {
        assetId: asset.file_hash,
        newOwner: asset.buyer_address
      })
      .then(response => {
        console.log('成功更新当前拥有者:', response.data);
      })
      .catch(error => {
        console.error('更新当前拥有者失败:', error);
      });

    } else {
      throw new Error('资产转移失败，链上返回错误');
    }
  } catch (error) {
    console.error('资产转移失败:', error);
    alert('资产转移失败，请重试。');
  }
},*/



/*async transferAsset(asset) {
  try {
    console.log("卖家地址:", asset.seller_address);
    console.log("买家地址:", asset.buyer_address);
    console.log("资产ID:", asset.file_hash);
    console.log("资产领域:", asset.industry);

    // 定义不可分割资产的领域
    const indivisibleIndustries = ['NY', 'DL', 'TZ', 'JT', 'YL', 'ZX', 'JR'];

    let transferResponse;

    if (indivisibleIndustries.includes(asset.industry)) {
      console.log("资产类型：不可分割，调用 TransferFrom 接口...");
      // 不可分割资产，调用 TransferFrom
      console.log("POST 请求 http://localhost:8848/pre/TransferFrom 参数:", {
        from: asset.seller_address,
        to: asset.buyer_address,
        tokenId: asset.file_hash,
      });

      transferResponse = await axios.post('http://localhost:8848/pre/TransferFrom', {
        from: asset.seller_address,
        to: asset.buyer_address,
        tokenId: asset.file_hash,
      });

    } else {
      console.log("资产类型：可分割，调用 En-Transfer 接口...");
      // 可分割资产，调用 En-Transfer
      console.log("POST 请求 http://localhost:8848/pre/En-Transfer 参数:", {
        to: asset.buyer_address,
        amount: asset.quantity.toString(),
      });

      transferResponse = await axios.post('http://localhost:8848/pre/En-Transfer', {
        to: asset.buyer_address,
        amount: asset.quantity.toString(),
      });
    }

    console.log("链上接口响应:", transferResponse.data);

    if (transferResponse.status === 200 && transferResponse.data.code === 0) {
      this.$message.success('资产转移成功');
      console.log('✅ 资产转移成功！交易数据:', transferResponse.data);

      // 更新当前拥有者为新买家
      console.log("准备更新资产当前拥有者到:", asset.buyer_address);

      await axios.post('http://10.112.47.214:3000/api/update-owner', {
        assetId: asset.file_hash,
        newOwner: asset.buyer_address
      })
      .then(response => {
        console.log('✅ 成功更新当前拥有者:', response.data);
      })
      .catch(error => {
        console.error('❌ 更新当前拥有者失败:', error);
      });

    } else {
      console.error('❌ 链上返回错误，资产转移失败，返回数据:', transferResponse.data);
      throw new Error('资产转移失败，链上返回错误');
    }
  } catch (error) {
    console.error('❌ 资产转移流程异常:', error);
    alert('资产转移失败，请重试。');
  }
},*/


async transferAsset(asset) {
  try {
    console.log("⚙️ 开始资产转移流程...");
    console.log("卖家地址:", asset.seller_address);
    console.log("买家地址:", asset.buyer_address);
    console.log("资产ID:", asset.file_hash);
    console.log("资产领域:", asset.industry);

    const allCerts = [];

    const orgs = [
      { orgName: 'wx-org1.chainmaker.org', api: 'get-certificates' },
      { orgName: 'wx-org2.chainmaker.org', api: 'get-certificates2' },
    ];

    for (const { orgName, api } of orgs) {
      try {
        const res = await axios.post(`http://10.112.47.214:3000/api/${api}`, {
          userId: this.userId,
        });

        if (res.status === 200 && Array.isArray(res.data.certificates)) {
          for (const { cert, address } of res.data.certificates) {
            if (address) {
              allCerts.push({ cert, orgName, addr: address });
            }
          }
        }
      } catch (e) {
        console.error(`获取 ${api} 证书或地址失败:`, e);
      }
    }

    const certInfo = allCerts.find(item => item.addr === asset.seller_address);
    if (!certInfo) {
      throw new Error(`未找到与地址 ${asset.seller_address} 匹配的证书`);
    }

    console.log("🔍 找到对应证书与组织:", certInfo);

    const configResponse = await axios.post('http://10.112.47.214:8848/pre/DynamicCertConfig', {
      clientName: certInfo.cert,
      orgName: certInfo.orgName
    });

    if (configResponse.status !== 200) {
      throw new Error('❌ DynamicCertConfig 配置失败');
    }

    const indivisibleIndustries = ['WH'];
    let transferResponse;

    if (indivisibleIndustries.includes(asset.industry)) {
      console.log("🛡️ 资产类型：不可分割，调用 TransferFrom");
      transferResponse = await axios.post(
        'http://10.112.47.214:8848/pre/TransferFrom',
        {
          from: asset.seller_address,
          to: asset.buyer_address,
          tokenId: asset.file_hash,
        },
        {
          validateStatus: () => true
        }
      );
    } else {
      console.log("🛡️ 资产类型：可分割，调用 En-Transfer");
      transferResponse = await axios.post(
        'http://10.112.47.214:8848/pre/En-Transfer',
        {
          to: asset.buyer_address,
          amount: asset.quantity.toString(),
        },
        {
          validateStatus: () => true
        }
      );
    }

    if (transferResponse.status === 200 && transferResponse.data.code === 0) {
      this.$message.success('资产转移成功');
      console.log('✅ 资产链上转移成功');

      await axios.post('http://10.112.47.214:3000/api/update-owner', {
        assetId: asset.file_hash,
        newOwner: asset.buyer_address
      });
    } else {
      console.warn('⚠️ 链上转移失败，但前端不报错:', {
        status: transferResponse.status,
        data: transferResponse.data
      });
      return;
    }
  } catch (error) {
    console.error('❌ 资产转移流程异常:', error);
    return;
  }
},



    
  async checkAsset(assetID, userID, filehash) {
    try {
      const response = await axios.get('/checkAsset', {
        params: { assetID, userID, filehash },
      });
      const result = response.data.checkResult;
      if (result === 'success') {
        return true;
      } else {
        this.$message.error('您无权限购买此资产。');
        return false;
      }
    } catch (error) {
      this.$message.error(`校验失败：${error.response?.data?.error || error.message}`);
      return false;
    }
  },



  async confirmPurchase() {
    if (!this.selectedAsset) return;

    const hasPermission = await this.checkAsset(
      this.selectedAsset.asset_id,
      this.userId,
      this.selectedAsset.file_hash
    );

    if (!hasPermission) {
      return;
    }

    // 执行购买逻辑（假设这里是前端展示，真实购买由后端完成）
    if (this.insufficientBalance) {
      this.$message.error('余额不足，无法完成购买。');
      return;
    }

    // 模拟购买成功逻辑
    this.purchaseSuccess = true;
    this.userBalance -= this.selectedAsset.price || 100; // 更新余额
    this.closePurchaseModal();
  },


    selectAsset(asset) {
    this.$router.push({ name: 'AssetDetail', params: { id: asset.file_hash } });
  },
    searchAssets() {
      if (this.searchTerm.trim() !== '') {
        this.displayedAssets = this.assets.filter(
          (asset) =>
            (asset.asset_name &&
              asset.asset_name.toLowerCase().includes(this.searchTerm.toLowerCase()))
        );
        this.isSearching = true;
        this.searchExecuted = true;
        this.currentPage = 1; // 搜索时重置到第一页
      } else {
        this.clearSearch();
      }
    },
    clearSearch() {
      this.isSearching = false;
      this.searchTerm = '';
      this.displayedAssets = this.assets; // 清除搜索后显示全部资产
      this.searchExecuted = false;
    },
    /*async filterByCategory(category) {
      this.selectedCategory = category;
      this.currentPage = 1;

      try {
        const response = await axios.get('http://10.112.47.214:3000/api/available-assets', {
          params: { industry: category !== 'ALL' ? category : '' },
        });
        this.assets = response.data;
        this.displayedAssets = this.assets; // 初始化显示为全部资产
        this.totalAssets = this.assets.length;
      } catch (error) {
        console.error('获取资产数据失败:', error);
      }
    },*/

    async filterByCategory(category) {
  this.selectedCategory = category;
  this.currentPage = 1;
  this.isLoading = true;

  try {
    // 准备请求参数
    const params = {
      industry: category !== 'ALL' ? category : undefined
    };

    // 1. 并行发起两个带筛选参数的请求
    const [availableResponse, resalableResponse] = await Promise.all([
      axios.get('http://10.112.47.214:3000/api/available-assets', { params }),
      axios.get('http://10.112.47.214:3000/api/resalable-assets', { params })
    ]);

    const availableAssets = availableResponse.data || [];
    const resalableAssets = resalableResponse.data || [];

    // 【核心修改】
    // 2. 同样，直接合并两个数组
    const finalAssets = [...availableAssets, ...resalableAssets];

    // 3. 更新组件状态
    this.assets = finalAssets;
    this.displayedAssets = this.assets;
    this.totalAssets = this.assets.length;
    console.log(`按分类 [${category}] 筛选完成，共显示 ${this.totalAssets} 条资产记录。`);

  } catch (error) {
    console.error(`按分类 [${category}] 筛选资产数据失败:`, error);
    this.assets = [];
    this.displayedAssets = [];
    this.totalAssets = 0;
  }
  this.isLoading = false;
},

async fetchFilteredAssets() {
  this.currentPage = 1;
  this.isLoading = true;

  try {
    const params = {
      industry_raw_name: this.selectedDomain !== 'ALL' ? this.selectedDomain : undefined,
      asset_category: this.selectedAssetCategory !== 'ALL' ? this.selectedAssetCategory : undefined,
      asset_type: this.selectedAssetType !== 'ALL' ? this.selectedAssetType : undefined
    };

    const [availableResponse, resalableResponse] = await Promise.all([
      axios.get('http://10.112.47.214:3000/api/available-assets', { params }),
      axios.get('http://10.112.47.214:3000/api/resalable-assets', { params })
    ]);

    const finalAssets = [
      ...(availableResponse.data || []),
      ...(resalableResponse.data || [])
    ];

    this.assets = finalAssets;
    this.displayedAssets = finalAssets;
    this.totalAssets = finalAssets.length;
  } catch (e) {
    console.error('筛选资产失败:', e);
    this.assets = [];
    this.displayedAssets = [];
    this.totalAssets = 0;
  } finally {
    this.isLoading = false;
  }
},

filterByDomain(domainRawName) {
  this.selectedDomain = domainRawName;
  this.fetchFilteredAssets();
},

filterByAssetCategory(category) {
  this.selectedAssetCategory = category;
  this.fetchFilteredAssets();
},

filterByAssetType(type) {
  this.selectedAssetType = type;
  this.fetchFilteredAssets();
},

    handlePageChange(page) {
      this.currentPage = page;
    },

    /*
    async fetchAssets() {
      this.isLoading = true;
      try {
        const response = await axios.get('http://10.112.47.214:3000/api/available-assets');
        this.assets = response.data;
        this.displayedAssets = this.assets; // 初始化显示全部资产
        this.totalAssets = this.assets.length;
      } catch (error) {
        console.error('获取资产数据失败:', error);
      }
      this.isLoading = false;
    },*/

    /*async fetchAssets() {
  this.isLoading = true;
  try {
    // 1. 并行发起两个请求，获取两类资产数据
    const [availableResponse, resalableResponse] = await Promise.all([
      axios.get('http://10.112.47.214:3000/api/available-assets'),
      axios.get('http://10.112.47.214:3000/api/resalable-assets')
    ]);

    const availableAssets = availableResponse.data || [];
    const resalableAssets = resalableResponse.data || [];

    // 【核心修改】
    // 2. 直接将两个数组合并成一个，不进行任何去重操作
    const finalAssets = [...availableAssets, ...resalableAssets];

    // 3. 更新组件状态
    this.assets = finalAssets;
    this.displayedAssets = this.assets;
    this.totalAssets = this.assets.length;
    console.log(`交易市场加载完成，共显示 ${this.totalAssets} 条资产记录。`);

  } catch (error) {
    console.error('获取市场资产数据失败:', error);
    // 错误处理，清空数据
    this.assets = [];
    this.displayedAssets = [];
    this.totalAssets = 0;
  }
  this.isLoading = false;
},*/
async fetchAssets() {
  this.selectedDomain = 'ALL';
  this.selectedAssetCategory = 'ALL';
  this.selectedAssetType = 'ALL';
  await this.fetchFilteredAssets();
},


    truncateHash(hash) {
      return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
    },


    toggleCart() {
      this.showCartModal = !this.showCartModal;
    },
    closeCartModal() {
      this.showCartModal = false;
    },
    
  },
  /*mounted() {
    this.fetchAssets();
    
   // this.spinnerColor = this.getRandomColor();
  }*/
};

</script>

<style scoped>

.asset-row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.asset-row-tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 1px solid #cfd9ee;
  border-radius: 4px;
  background: #f8fbff;
  color: #4a67a1;
  font-size: 13px;
  line-height: 28px;
  white-space: nowrap;
}

.asset-row-tag-category {
  background: #f5f8ff;
  border-color: #c9d7ff;
  color: #3a63c7;
}

.asset-row-tag-level {
  background: #fff8ef;
  border-color: #ffd59c;
  color: #d48806;
}

.market {
  width: 100%;
  min-height: 100vh;
  background: #f0f2f5; /* 更柔和的背景色 */
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.main-content {
  display: flex;
  flex: 1;
  background: #F5F6FA;
  overflow-y: auto;
}

.content {
  flex: 1;
  padding: 20px;
  background: #F5F6FA;
  max-width: 1450px;
}

.title {
  margin: 0;
  padding: 10px 0;
  text-align: left;
  padding-left: 30px;
  font-size: 24px;
  color: #333;
}

.search-section {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px; /* 搜索框和按钮之间的间距 */
  margin-bottom: 20px;
}

.search-input-container {
  display: flex;
  align-items: center;
  border: 1px solid #ddd;
  border-radius: 20px; /* 圆角效果 */
  padding: 5px 10px;
  background-color: #fff;
  width: 600px; /* 设置宽度 */
  box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.1); /* 阴影效果 */
}

.search-input-container input {
  border: none;
  outline: none;
  width: 100%;
  padding: 8px;
  font-size: 16px;
  color: #333;
}

.search-icon {
  color: #888;
  font-size: 18px;
  margin-right: 8px; /* 调整图标与输入框之间的间距 */
}

.button-container {
  display: flex;
  gap: 8px; /* 按钮之间的间距 */
}

.search-button,
.clear-button {
  padding: 8px 16px;
  font-size: 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.search-button {
  background-color: #007bff;
  color: white;
}

.clear-button {
  background-color: #f44336;
  color: white;
}

.search-button:hover {
  background-color: #0056b3;
}

.clear-button:hover {
  background-color: #d32f2f;
}


.cart-button-container {
  position: absolute;
  top: 20px;
  right: 20px;
}

.cart-button {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
}

.cart-modal {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 300px;
  height: 90%;
  background-color: white;
  box-shadow: -4px 0 6px rgba(0, 0, 0, 0.1);
  z-index: 1001;
  padding: 20px;
  border-radius: 8px; /* 可选：增加圆角，使其更加美观 */
  
}



.cart-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  height: 100%;
  overflow: hidden; /* 防止内容溢出模态框 */
}

.cart-section {
  flex: 1;
  overflow-y: auto;
  max-height: 70vh; /* 控制最大高度，使其可滚动 */
  padding-right: 8px; /* 给滚动条留点空间 */
}

/* 可选：自定义滚动条样式（提升美观度） */
.cart-section::-webkit-scrollbar {
  width: 6px;
}

.cart-section::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}




.requested-assets, .awaiting-assets {
  margin-bottom: 20px;
}

button {
  padding: 10px;
  margin-top: 10px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}

.tabs {
  display: flex;
  gap: 20px; /* 控制选项之间的间距 */
  margin-bottom: 20px; /* 增加底部间距 */
}
.tabs button {
  padding: 10px;
  margin-right: 10px;
  border: none;
  background-color: #f1f1f1;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.tabs button.active {
  background-color: #007bff;
  color: white;
}

.tabs button:hover {
  background-color: #ddd;
}

.cart-close {
  margin-top: auto; /* 将关闭按钮推到弹窗底部 */
  display: flex;
  justify-content: center;
  width: 100%;
}

.cart-close button {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.cart-close button:hover {
  background-color: #0056b3;
}


.cart-item {
  margin-bottom: 15px;
  padding: 10px;
  background-color: #f9f9f9;
  border-radius: 6px;
  border: 1px solid #ddd;
  word-wrap: break-word; /* 允许子元素换行 */
  max-width: 60%; /* 确保容器宽度不会超出 */
}

.cart-item p {
  margin: 5px 0;
  font-size: 14px;
  word-wrap: break-word; /* 允许文本换行 */
  white-space: normal;  /* 取消不换行 */
  overflow-wrap: break-word; /* 如果文本过长，强制换行 */
  display: block;  /* 强制 p 标签为块级元素，确保换行 */
}

/* 限制id的长度 */
.cart-item p strong {
  font-weight: bold;
  word-break: break-word; /* 强制长文本换行 */
}



.cart-item strong {
  font-weight: bold;
}

.cart-section ul {
  list-style-type: none;
  padding: 0;
}

.cart-section li {
  margin-bottom: 20px;
}

.button-section {
  display: flex;
  justify-content: center;  /* 水平居中 */
  align-items: center;  /* 垂直居中 */
  height: 100%;  /* 确保父容器有足够的高度来居中按钮 */
}

.confirm-button {
  padding: 10px 20px;
  background-color: #007bff;  /* 蓝色背景 */
  color: white;
  border: none;
  border-radius: 5px;  /* 圆角效果 */
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s ease, transform 0.2s ease;  /* 平滑的背景色过渡和缩放效果 */
}

.confirm-button:hover {
  background-color: #0056b3;  /* 鼠标悬停时的颜色变化 */
  transform: scale(1.05);  /* 悬停时稍微放大 */
}

.confirm-button:active {
  background-color: #004085;  /* 点击时的颜色变化 */
  transform: scale(0.98);  /* 点击时略微缩小 */
}

.confirm-button:disabled {
  background-color: #c6c6c6;  /* 禁用时的颜色 */
  cursor: not-allowed;  /* 禁用时禁止点击效果 */
}

.confirm-button:disabled:hover {
  background-color: #c6c6c6;  /* 禁用时鼠标悬停颜色不变 */
}



/* ===== 图二风格的筛选区域 ===== */
.market-filter-wrap {
  margin: 26px 0 30px;
  padding: 0 20px;
}

.market-filter-title {
  font-size: 16px;
  font-weight: 700;
  color: #2f63e0;
  margin-bottom: 10px;
  position: relative;
  display: inline-block;
  padding-bottom: 8px;
}

.market-filter-title::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: 0;
  width: 68px;
  height: 4px;
  background: #2f63e0;
  border-radius: 2px;
}

.market-filter-panel {
  background: #fff;
  border-radius: 4px;
  padding: 18px 22px 20px;
  box-shadow: none;
  border: 1px solid #eef1f5;
}

.filter-row {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}


.filter-row-label {
  width: 150px;          /* 原来如果太小，就加大 */
  min-width: 150px;
  flex-shrink: 0;
  font-size: 15px;
  font-weight: 600;
  color: #4a5568;
  line-height: 34px;
  white-space: nowrap;   /* 关键：不换行 */
}

.filter-row-options {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 18px;
  flex: 1;
}

.domain-option {
  background: transparent;
  border: none;
  color: #3559a6;
  font-size: 14px;
  line-height: 32px;
  padding: 0 2px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.domain-option:hover {
  color: #2f63e0;
  background: transparent;
}

.domain-option.active {
  min-width: 62px;
  height: 34px;
  line-height: 32px;
  padding: 0 14px;
  border: 1px solid #7ea6ff;
  border-radius: 4px;
  background: #fff;
  color: #2f63e0;
  font-weight: 600;
}

/* 资产展示样式 */
/* ===== 列表式资产展示 ===== */
.assets-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 8px 20px 30px;
}

.asset-row {
  display: flex;
  align-items: stretch;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #e9edf3;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.25s ease, transform 0.25s ease;
  min-height: 180px;
}

.asset-row:hover {
  box-shadow: 0 8px 22px rgba(30, 60, 120, 0.08);
  transform: translateY(-2px);
}

.asset-row-left {
  width: 180px;
  min-width: 180px;
  padding: 20px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.asset-row-image {
  width: 150px;
  height: 150px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #edf1f6;
  display: block;
}

.asset-row-center {
  flex: 1;
  padding: 26px 20px 22px 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
}

.asset-row-title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.asset-row-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f3f8b;
  line-height: 1.4;
}

.asset-row-desc {
  font-size: 14px;
  line-height: 1.8;
  color: #7a869a;
  margin-bottom: 18px;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.asset-row-company {
  font-size: 14px;
  color: #65758b;
  margin-bottom: 16px;
}

.asset-row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.asset-row-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  font-size: 12px;
  color: #4d73c8;
  border: 1px solid #b9c9ef;
  border-radius: 3px;
  background: #f8fbff;
}

.asset-row-right {
  width: 180px;
  min-width: 180px;
  border-left: 1px solid #eef2f7;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  background: #fff;
}

.asset-row-price {
  font-size: 24px;
  font-weight: 700;
  color: #1e3d8f;
  line-height: 1;
  margin-bottom: 28px;
}

.asset-row-price-unit {
  font-size: 14px;
  font-weight: 400;
  margin-left: 4px;
  color: #6c7b95;
}

.asset-row-detail-btn {
  min-width: 96px;
  height: 38px;
  padding: 0 18px;
  border: none;
  border-radius: 4px;
  background: #ffffff;
  color: #2f63e0;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: none;
}

.asset-row-detail-btn:hover {
  background: #f3f7ff;
  color: #1f53d3;
}

/* 分页容器居中对齐 */
.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

/* 分页栏的样式 */
.pagination {
  display: flex;
  justify-content: center; /* 将分页符靠右 */
  align-items: center;
  margin-top: 100px; /* 根据需求调整这个值 */
}

.pagination button {
  padding: 10px;
  margin: 0 10px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 4px;
  cursor: pointer;
}

.pagination span {
  font-size: 16px;
  color: #333;
}

/* 弹窗样式 */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  max-width: 500px;
  width: 100%;
  text-align: center;
}


.modal-image {
  width: 400px; /* 调整为更大的宽度 */
  height: 400px; /* 调整为更大的高度 */
  object-fit: cover; /* 保持图片比例，裁剪溢出的部分 */
  margin-bottom: 20px;
}

/* 按钮区域的布局 */
.modal-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 20px;
}

.buy-button,
.close-button {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

.buy-button {
  background-color: #007bff;
  color: white;
}

.close-button {
  background-color: #434547;
  color: white;
}

.spinner {
  display: inline-block;
  width: 60px;
  height: 60px;
  border: 5px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-container {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
}


.content {
  position: relative; /* 为相对定位的父容器 */
}

.cross-search-button {
  padding: 8px 14px;
  font-size: 14px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: #1f9dff;
  color: #fff;
  white-space: nowrap;
}
.cross-search-button:hover {
  background-color: #1479c9;
}

/* 弹窗遮罩 */
.cross-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

/* 弹窗主体 */
.cross-modal-content {
  width: 620px;
  max-width: 92vw;
  background: #fff;
  border-radius: 12px;
  padding: 18px 18px 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
}

.cross-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.cross-title {
  margin: 0;
  font-size: 18px;
}
.cross-close {
  border: none;
  background: transparent;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}

/* 搜索条 */
.cross-search-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 14px;
}
.cross-search-input {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #dcdcdc;
  outline: none;
}
.cross-search-icon {
  padding: 10px 12px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  background: #e9f6ff;
}

/* 结果区 */
.cross-result-title {
  font-weight: 600;
  margin: 6px 0 10px;
}

.cross-table {
  border: 1px solid #eee;
  border-radius: 10px;
  overflow: hidden;
}
.cross-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 1.2fr;
  gap: 10px;
  padding: 10px 12px;
  align-items: center;
}
.cross-head {
  background: #f7f7f7;
  font-weight: 600;
}
.cross-body {
  border-top: 1px solid #f0f0f0;
  cursor: pointer;
}
.cross-body:hover {
  background: #fafcff;
}

.c3 {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  color: #444;
}

.cross-empty {
  padding: 14px 12px;
  color: #777;
}





/* ====== Cross-chain modal (match screenshot) ====== */
.cc-modal-mask{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  display:flex;
  align-items:center;
  justify-content:center;
  z-index: 3000;
}

/* ✅ 改：弹窗本体不负责滚动，交给左右栏 */
.cc-modal{
  position: relative;
  width: 980px;
  max-width: 95vw;
  height: 540px;
  max-height: 90vh;
  border-radius: 20px;
  background: rgba(30, 33, 37, .92);
  box-shadow: 0 18px 50px rgba(0,0,0,.45);
  backdrop-filter: blur(12px);
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  overflow: hidden;
  padding: 26px 26px 22px;
  box-sizing: border-box;
}

.cc-left,.cc-right{
  position: relative;
  display:flex;
  flex-direction:column;
  gap: 16px;
  color: rgba(255,255,255,.88);

  min-height: 0;          /* ⭐ 关键：让子元素能在 grid/flex 下正确计算高度 */
  overflow-y: auto;       /* ✅ 出现滚轮 */
  padding-right: 6px;     /* 给滚动条留点空间，视觉更舒服 */
}

/* ✅ 新增：滚动条美化（可选） */
.cc-left::-webkit-scrollbar,
.cc-right::-webkit-scrollbar{
  width: 8px;
}
.cc-left::-webkit-scrollbar-thumb,
.cc-right::-webkit-scrollbar-thumb{
  background: rgba(255,255,255,.18);
  border-radius: 10px;
}
.cc-left::-webkit-scrollbar-track,
.cc-right::-webkit-scrollbar-track{
  background: rgba(255,255,255,.06);
}

/* ✅ 双保险：右侧卡片内部也允许滚动（表单很长时更稳） */
.cc-swap-card{
  flex: 1;
  border-radius: 18px;
  background: rgba(14, 16, 20, .55);
  border: 1px solid rgba(255,255,255,.08);
  padding: 16px 16px 18px;
  position: relative;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);

  min-height: 0;          /* ⭐ 关键 */
  overflow-y: auto;       /* ✅ 卡片内滚动 */
}

/* ✅ 返回内容 pre 很长时，避免撑爆布局 */
.cc-resp-pre{
  margin: 0;
  font-size: 12px;
  line-height: 1.3;
  color: rgba(255,255,255,.8);
  max-height: 180px;      /* 稍微放大一点更好用 */
  overflow: auto;
}

.cc-close{
  position:absolute;
  top: 10px;
  right: 14px;
  border:none;
  background: transparent;
  color: rgba(255,255,255,.75);
  font-size: 26px;
  cursor:pointer;
}

.cc-divider{
  width: 1px;
  background: rgba(255,255,255,.10);
  margin: 0 18px;
}

.cc-left,.cc-right{
  position: relative;
  display:flex;
  flex-direction:column;
  gap: 16px;
  color: rgba(255,255,255,.88);
}

.cc-title{
  font-size: 22px;
  font-weight: 700;
  letter-spacing: .5px;
}

/* 左侧霓虹搜索框 */
.cc-search-wrap{
  position: relative;
  display:flex;
  align-items:center;

  /* 🔽 尺寸明显收紧 */
  padding: 4px 6px;
  height: 44px;
  border-radius: 12px;

  /* 🌈 多元但克制的描边（青绿 → 蓝） */
  background:
    linear-gradient(
      rgba(15,18,22,.65),
      rgba(15,18,22,.65)
    ) padding-box,
    linear-gradient(
      135deg,
      rgba(132,255,222,.9),
      rgba(90,170,255,.8),
      rgba(150,120,255,.7)
    ) border-box;

  border: 1.5px solid transparent;

  /* 🔽 阴影弱化，不再“发光炸开” */
  box-shadow:
    0 6px 18px rgba(0,0,0,.35),
    inset 0 1px 0 rgba(255,255,255,.06);
}

.cc-search-input{
  flex:1;
  background: transparent;
  border:none;
  outline:none;

  /* 🔽 字号略降，更精致 */
  font-size: 14px;
  line-height: 1.2;

  /* 🔽 关键：内边距大幅收紧 */
  padding: 3px 4px;

  color: rgba(255,255,255,.9);
}

.cc-search-btn{
  width: 32px;
  height: 32px;
  margin-left: 4px;

  border-radius: 10px;
  border: none;
  cursor: pointer;

  /* 🌈 与边框呼应的低饱和渐变 */
  background: linear-gradient(
    135deg,
    rgba(132,255,222,.25),
    rgba(90,170,255,.25)
  );

  color: rgba(255,255,255,.85);

  transition: background .2s ease, transform .15s ease;
}

.cc-search-btn:hover{
  background: linear-gradient(
    135deg,
    rgba(132,255,222,.4),
    rgba(150,120,255,.35)
  );
  transform: translateY(-1px);
}

/* 左侧结果卡片 */
.cc-card{
  flex: 1;
  border-radius: 16px;
  background: rgba(14, 16, 20, .55);
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
  padding: 14px 14px 10px;
  overflow: hidden;
}

.cc-card-title{
  font-size: 20px;
  font-weight: 800;
  margin-bottom: 10px;
}

.cc-table{
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,.08);
  overflow:hidden;
}

.cc-row{
  display:grid;
  grid-template-columns: 1.2fr 1fr 1.3fr;
  gap: 10px;
  align-items:center;
  padding: 12px 14px;
  font-size: 14px;
}

.cc-head{
  background: rgba(255,255,255,.06);
  font-weight: 700;
}

.cc-body{
  background: rgba(255,255,255,.02);
  border-top: 1px solid rgba(255,255,255,.06);
  cursor:pointer;
}
.cc-body:hover{
  background: rgba(132,255,222,.06);
}
.cc-body.selected{
  outline: 2px solid rgba(132,255,222,.45);
  outline-offset: -2px;
}

.cc-asset{
  display:flex;
  align-items:center;
  gap: 10px;
}
.cc-token-dot{
  color: rgba(132,255,222,.95);
}
.cc-asset-name{
  font-weight: 600;
}

.cc-mono{
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  opacity: .9;
}

.cc-empty{
  padding: 14px;
  color: rgba(255,255,255,.6);
}

/* ===== 右侧：跨链调配卡 ===== */
.cc-swap-card{
  flex:1;
  border-radius: 18px;
  background: rgba(14, 16, 20, .55);
  border: 1px solid rgba(255,255,255,.08);
  padding: 16px 16px 18px;
  position: relative;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
}

.cc-label{
  color: rgba(132,255,222,.9);
  font-weight: 700;
  margin-bottom: 6px;
}

.cc-from-row,.cc-to-row{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap: 14px;
}

.cc-amount{
  flex: 1;
}
.cc-amount-big{
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  opacity: .85;
}
.cc-amount-sub{
  margin-top: 6px;
  color: rgba(255,255,255,.55);
  font-size: 12px;
}

.cc-idline{
  margin-top: 10px;
  display:flex;
  gap: 10px;
  align-items:center;
  color: rgba(255,255,255,.6);
}
.cc-idtext{ opacity: .85; }
.cc-idmono{
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  opacity: .9;
}

.cc-chain-box{
  min-width: 230px;
  border-radius: 14px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.08);
  padding: 10px 10px;
  display:flex;
  align-items:center;
  gap: 10px;
  position: relative;
}

.cc-token-icon{
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: rgba(132,255,222,.12);
  display:flex;
  align-items:center;
  justify-content:center;
  color: rgba(132,255,222,.95);
  font-weight: 900;
}

.cc-chain-meta{
  flex: 1;
}
.cc-token-name{
  font-weight: 800;
  font-size: 14px;
}
.cc-chain-name{
  font-size: 12px;
  color: rgba(255,255,255,.55);
}

.cc-chain-select{
  appearance: none;
  border: none;
  outline: none;
  background: transparent;
  color: transparent; /* 仅用于占位，视觉上像右侧下拉按钮 */
  width: 26px;
  height: 26px;
  cursor: pointer;
}
.cc-chain-box::after{
  content: "▾";
  position:absolute;
  right: 10px;
  top: 10px;
  color: rgba(255,255,255,.65);
  pointer-events:none;
}

.cc-balance{
  margin-top: 8px;
  text-align:right;
  color: rgba(255,255,255,.5);
  font-size: 12px;
}
.cc-choosechain{
  margin-top: 2px;
  text-align:right;
  color: rgba(255,255,255,.65);
  font-size: 14px;
  font-weight: 700;
}

.cc-arrow{
  width: 36px;
  height: 36px;
  margin: 14px auto;
  border-radius: 14px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.08);
  display:flex;
  align-items:center;
  justify-content:center;
  color: rgba(255,255,255,.75);
}

.cc-recipient{
  margin-top: 10px;
  display:flex;
  align-items:center;
  gap: 8px;
  color: rgba(255,255,255,.55);
  font-size: 12px;
}
.cc-pencil{ opacity:.8; }

.cc-connect{
  width: 100%;
  margin-top: 18px;
  padding: 14px 16px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  background: rgba(132,255,222,.75);
  color: rgba(10,12,14,.92);
  font-weight: 900;
  letter-spacing: .2px;
  box-shadow: 0 10px 26px rgba(0,0,0,.35);
}
.cc-wallet{ margin-right: 10px; }

.cc-spark{
  position:absolute;
  right: 18px;
  bottom: 14px;
  color: rgba(255,255,255,.25);
  font-size: 22px;
}

.cc-bridge-tabs{
  display:flex;
  gap: 10px;
  margin-bottom: 12px;
}

.cc-tab{
  flex:1;
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06);
  color: rgba(255,255,255,.85);
  border-radius: 12px;
  padding: 10px 12px;
  cursor:pointer;
  font-weight: 700;
}

.cc-tab.active{
  border-color: rgba(132,255,222,.45);
  background: rgba(132,255,222,.18);
  color: rgba(255,255,255,.95);
}

.cc-form{
  display:flex;
  flex-direction:column;
  gap: 10px;
}

.cc-field{
  display:flex;
  flex-direction:column;
  gap: 6px;
  padding: 10px 10px;
  border-radius: 14px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.06);
}

.cc-field-label{
  font-size: 12px;
  color: rgba(255,255,255,.65);
  font-weight: 700;
}

.cc-field-value{
  font-size: 14px;
  color: rgba(255,255,255,.88);
}

.cc-input{
  border:none;
  outline:none;
  border-radius: 12px;
  padding: 10px 10px;
  background: rgba(0,0,0,.22);
  border: 1px solid rgba(255,255,255,.10);
  color: rgba(255,255,255,.90);
}

.cc-resp{
  margin-top: 10px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(0,0,0,.22);
  border: 1px solid rgba(255,255,255,.08);
}

.cc-resp-title{
  font-size: 12px;
  color: rgba(255,255,255,.65);
  font-weight: 700;
  margin-bottom: 6px;
}

.cc-resp-pre{
  margin: 0;
  font-size: 12px;
  line-height: 1.3;
  color: rgba(255,255,255,.8);
  max-height: 120px;
  overflow: auto;
}
</style>
