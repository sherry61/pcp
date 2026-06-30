<template>
  <div class="asset-management">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />

      <!-- 加载动画 -->
      <div v-if="isLoading" class="loading-container">
        <div class="spinner"></div>
      </div>

      <div class="content">
        <h2 class="title">
          资产管理
          <!--<div class="data-source-container">
            <span style="font-size: 18px;">数据源：</span>

             <el-select v-model="dataSource" @change="handleDataSourceChange"
              :placeholder="dataSource ? dataSourceLabel : '选择数据源'" class="data-source-selector"
              style="width: 150px; margin-left: 10px;">
              
              <el-option label="已登记资产" value="database"></el-option>
              <el-option label="已购买资产" value="buy"></el-option>

            </el-select> 
          </div>
          -->
        </h2>
        <div class="asset-container">
          <div class="info-row">
            <div class="info-text">
              <img src="@/assets/transaction-icon.png" alt="Info Icon" class="info-icon">
              <span>资产管理</span>
            </div>
          </div>

          <!-- 根据选择的数据源显示不同的信息 -->
          <div v-if="dataSource === 'buy'">

            <!-- 在这里可以添加更多与长安链相关的内容 -->
          </div>
          <div v-else-if="dataSource === 'database'">
            <!-- 在这里可以添加更多与数据库相关的内容 -->
          </div>

          <div class="table-container">
            <!-- 加载指示器 -->
            <div v-if="isLoading" class="loading">加载中...</div>

            <table v-else class="styled-table table-hover-row">
              <thead>
                <tr>
                  <th>资产哈希</th>
                  <th class="nowrap">用户 ID</th>
                  <th>资产名称</th>
                  <th class="nowrap">安全等级</th>
                  <th>资产介绍</th>
                  <th v-if="isSeller" class="nowrap">数量</th>
                  <!--<th>性质</th>-->
                  <th>状态</th>
                  <th>可出售权益</th> <!-- 新增字段 -->
                
                 <!--<th>备注</th>-->
<th v-if="isSeller">编辑</th>
<th v-if="isSeller">授权</th>
<th v-if="isSeller">估值定价</th>
                </tr>
              </thead>
             <tbody>
  <tr v-for="item in currentPageData" :key="item.id">
    <td>
      <div @click="toggleExpand(item)" class="hash-display">
        <span v-if="!item.isExpanded">{{ shortenHash(item.fileHash) }}... 展开</span>
        <span v-else>{{ item.fileHash }} <span @click.stop="toggleExpand(item)" class="collapse">收起</span></span>
      </div>
      ({{ item.algorithm }})
    </td>
    <td>{{ item.userId }}</td>
    <td>{{ item.assetName }}</td>
    <td>{{ item.assetType }}</td>
    <td>{{ item.description }}</td>
    <td v-if="isSeller" class="nowrap">{{ item.number }}</td>
    <!--<td class="nowrap">{{ isIndivisible(item.industry) ? '不可分割' : '可分割' }}</td>-->
    <td class="nowrap" :class="{
      'gray-text': item.txperm === 0,
      'yellow-text': item.txperm === 1 || item.txperm === 2,
      'green-text': item.txperm === 3,
      'red-text': item.txperm === 9
    }">
      {{
        item.txperm === 0 ? '无状态' :
          item.txperm === 1 ? '已登记' :
            item.txperm === 2 ? '已定价' :
              item.txperm === 3 ? '开放交易' :
                item.txperm === 9 ? '锁定中' :
                  '未知状态'
      }}
    </td>

    <!-- 可出售权益字段，根据已购买或已登记资产来显示 -->
    <td>
      {{ item.canSellAsset ? '持有' : '' }} 
      {{ item.canSellView ? '经营' : '' }} 
      {{ item.canSellProcess ? '加工' : '' }}
    </td>

    <!--<td>{{ formatRemarks(item.email, item.address) }}</td>-->

<td v-if="isSeller" class="action-cell">
  <button @click="openEditModal(item)" class="edit-button">
    编辑
  </button>
</td>
<td v-if="isSeller">
  <button :disabled="item.isProxied === 0" @click="handleAuthorization(item)" class="edit-button">授权</button>
</td>
<td v-if="isSeller">
  <button @click="openValuationModal(item)" class="edit-button">估值</button>
</td>
  </tr>
</tbody>

            </table>

          </div>

          <!-- 授权弹窗 -->
          <!-- 授权弹窗 -->
          <div v-if="showAuthorizationModal" class="modal">
            <div class="modal-content wide-modal">
              <h3>确认授权</h3>
              <p>请填写授权码并确认授权数量</p>

              <div class="form-row">
                <div class="form-group">
                  <label for="target-address">授权码</label>
                  <input type="text" id="target-address" v-model="authorizationData.targetAddress" placeholder="请输入目标地址"
                    required />
                </div>
              </div>

              <div class="form-row">
        <div class="form-group">
          <label for="authorization-quantity">授权数量</label>
          <!-- 授权数量输入框根据是否为不可分割资产来禁用 -->
          <input type="number" id="authorization-quantity" v-model="authorizationData.authorizationQuantity"
            min="1" :disabled="isIndivisible(selectedAsset.industry)" required />
        </div>
      </div>

              <div class="button-container">
                <button class="confirm-button" @click="confirmAuthorization">确认授权</button>
                <button class="cancel-button" @click="cancelAuthorization">取消</button>
              </div>
            </div>
          </div>



          <div class="pagination-container">
            <div class="pagination-info">
              {{ pagination.total }} 条，共 {{ pagination.pages }} 页
            </div>
            <div class="pagination-controls">
              <select v-model="pagination.perPage" @change="updatePages">
                <option v-for="option in perPageOptions" :key="option" :value="option">{{ option }} 条/页</option>
              </select>
              <button @click="prevPage" :disabled="pagination.page === 1">上一页</button>
              <span v-for="page in pagination.pages" :key="page" @click="goToPage(page)"
                :class="{ active: pagination.page === page }">
                {{ page }}
              </span>
              <button @click="nextPage" :disabled="pagination.page === pagination.pages">下一页</button>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- 授权成功的弹窗 -->
    <div v-if="showAuthorizationSuccessModal" class="modal">
      <div class="modal-content wide-modal">
        <h3>授权成功</h3>
        <p>您已成功授权资产</p>
        <div class="centered-button">
          <button @click="closeAuthorizationSuccessModal">确认</button>
        </div>
      </div>
    </div>


    <!-- Edit Modal Window -->
    <div v-if="showEditModal" class="modal">
      <div class="modal-content wide-modal">
        <h3>
          <img src="@/assets/info-icon.png" alt="Info Icon" class="info-icon-modal"> 编辑资产信息
        </h3>
        <form @submit.prevent="confirmEdit">
          <!-- 在 Edit Modal Window 中修改哈希值部分 -->
          <div class="form-row">
            <div class="form-group">
              <label for="file-hash-modal">哈希值</label>
              <input type="text" id="file-hash-modal" v-model="editAsset.fileHash" disabled />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="asset-type-modal">安全等级</label>
              <input type="text" id="asset-type-modal" v-model="editAsset.assetType" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="description-modal">资产介绍</label>
              <textarea id="description-modal" v-model="editAsset.description"></textarea>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="asset-name-modal">资产名称</label>
              <input type="text" id="asset-name-modal" v-model="editAsset.assetName" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="email-modal">邮箱</label>
              <input type="email" id="email-modal" v-model="editAsset.email" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="address-modal">地址</label>
              <input type="text" id="address-modal" v-model="editAsset.address" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="user-id-modal">状态</label>
              <select id="user-id-modal" v-model="editAsset.txperm">
                <option value="0">无状态</option>
                <option value="1">已登记</option>
                <option value="2">已定价</option>
                <option value="3">开放交易</option>
                <option value="9">锁定中</option>
              </select>
            </div>
          </div>
          
        <!-- <div class="form-row">
          <label for="asset-permissions">选择可出售权益</label>
          <div>
            <input type="checkbox" id="can_sell_asset" v-model="editAsset.canSellAsset" /> 允许出售所有权
            <input type="checkbox" id="can_sell_view" v-model="editAsset.canSellView" /> 允许出售查阅权
            <input type="checkbox" id="can_sell_process" v-model="editAsset.canSellProcess" /> 允许出售加工权
          </div>
        </div>-->

  


          <div class="form-row buttons">
            <button type="button" @click="closeEditModal">取消</button>
            <button type="submit">确定</button>
          </div>
        </form>
      </div>
    </div>


    <!-- Success Modal -->
    <div v-if="showSuccessModal" class="modal">
      <div class="modal-content wide-modal2">
        <p>修改成功</p>
        <div class="centered-button">
          <button @click="closeSuccessModal">确认</button>
        </div>
      </div>
    </div>
  </div>

 <!-- 估值定价弹窗 -->
<div v-if="showValuationModal" class="modal">
  <div class="modal-content wide-modal valuation-modal">
    <h3>价值评估</h3>

    <div class="valuation-control-row">
      <div class="valuation-method-select">
        <label for="valuation-method">估值方法</label>
        <select id="valuation-method" v-model="selectedValuationMethod">
          <option
            v-for="option in valuationMethodOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>
      <button type="button" class="btn-secondary" @click="resetValuationToDefaults">重置为默认参数</button>
      <button type="button" class="btn-primary" @click="useValuationExample">使用示例参数</button>
    </div>

    <div class="valuation-form">
      <details v-if="selectedValuationSection" class="valuation-method-box" open>
        <summary>{{ selectedValuationSection.title }}</summary>
        <div class="valuation-method-body">
          <div
            v-for="field in selectedValuationSection.fields"
            :key="field.key"
            class="valuation-field"
            :class="{ 'span-2': field.span === 2 }"
          >
            <label :for="field.key">{{ field.label }}</label>
            <input
              v-if="field.type !== 'textarea'"
              :id="field.key"
              type="number"
              :step="field.step || '0.01'"
              :min="field.min"
              :max="field.max"
              v-model.number="params[field.key]"
            />
            <textarea
              v-else
              :id="field.key"
              v-model.trim="params[field.key]"
              :placeholder="field.placeholder || ''"
            ></textarea>
            <div v-if="field.hint" class="valuation-hint">{{ field.hint }}</div>
          </div>
          <div v-if="selectedValuationSection.note" class="valuation-field span-2">
            <label>{{ selectedValuationSection.noteLabel || '说明' }}</label>
            <div class="valuation-hint">{{ selectedValuationSection.note }}</div>
          </div>
        </div>
      </details>
    </div>

    <div class="button-container">
      <button @click="submitValuation" class="confirm-button">提交计算</button>
      <button @click="closeValuationModal" class="cancel-button">关闭</button>
    </div>
  </div>
</div>

<!-- 计算结果弹窗 -->
<div v-if="showValuationResultModal" class="modal">
  <div class="modal-content wide-modal valuation-result-modal">
    <h3>计算结果</h3>
    <div class="valuation-result-status" :class="{ 'has-errors': valuationHasErrors }">
      {{ valuationResultStatus }}
    </div>
    <div class="valuation-result-wrap">
      <table class="valuation-result-table">
        <thead>
          <tr>
            <th>方法</th>
            <th>公式</th>
            <th>关键中间项</th>
            <th>估值结果（万元）</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="item in valuationMethodResults" :key="item.methodName">
            <tr>
              <td>{{ item.methodName }}</td>
              <td class="mono-cell">{{ item.formulaText }}</td>
              <td>
                <ul class="valuation-intermediate-list">
                  <li v-for="(line, idx) in item.intermediates" :key="idx" class="mono-cell">{{ line }}</li>
                </ul>
              </td>
              <td>
                <span v-if="item.valuation === null" class="warn-text">不可计算</span>
                <span v-else class="mono-cell">{{ formatNum(item.valuation) }}</span>
              </td>
              <td>{{ item.valuation === null ? '请修正输入' : '计算成功' }}</td>
            </tr>
            <tr class="valuation-note-row">
              <td colspan="5"><strong>公式备注：</strong>{{ item.notes }}</td>
            </tr>
          </template>
          <tr v-if="valuationMethodResults.length === 0">
            <td colspan="5">暂无结果</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="button-container">
      <button
        @click="saveCurrentValuationRecord"
        class="confirm-button"
        :disabled="valuationSaving || !valuationMethodResults.length || valuationMethodResults[0].valuation === null"
      >
        {{ valuationSaving ? '保存中...' : '保存估值记录' }}
      </button>
      <button @click="closeValuationResultModal" class="confirm-button">确认</button>
    </div>
  </div>
</div>


</template>



<!-- <div v-if="showHistoryModal" class="modal">  
  <div class="modal-content">  
    <h3>历史版本</h3>  
    <ul class="version-list">  
        <li v-for="(version, index) in historyData" :key="version.id" style="text-align: left;">
    第{{ index + 1 }}次编辑 (库中序号{{ version.id }}) --介绍「{{ version.description }}」
    <span v-if="version.additionalInfo">{{ version.additionalInfo }}</span>
</li>
    </ul>  
    <button @click="closeHistoryModal">关闭</button>  
  </div>  
</div> -->


<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import axios from 'axios'

export default {
  name: 'AssetManagement',
  components: {
    AppHeader,
    AppSidebar
  },
  data() {
    return {
      //assetData: [], // 初始化为空数组，将从后端获取

      registeredAssets: [],
      purchasedAssets: [],

      pagination: {
        total: 0,
        pages: 0,
        page: 1,
        perPage: 10
      },

      showAuthorizationModal: false,  // 控制授权弹窗显示
      showAuthorizationSuccessModal: false,
      selectedAsset: null,  // 当前选择的资产
      authorizationData: {
        targetAddress: '',  // 目标地址
        authorizationQuantity: 1,  // 默认授权数量为 1
      },


      showHistoryModal: false,
      historyData: [],
      perPageOptions: [5, 10, 15],
      showEditModal: false,
      showSuccessModal: false,
      isExpanded: false,
      editAsset: {
        assetName: '',
        assetType: '',
        description: '',
        fileHash: '',
        email: '',
        address: '',
        user_id: '', // 新增字段
        txperm: '',
        customAlgorithm: '',
        industry: '',
        canSellAsset: false,   // 是否允许出售本体
        canSellView: false,    // 是否允许出售查阅权
        canSellProcess: false, // 是否允许出售加工权

        allowTradeTime: false,
        allowTradeLocation: false,
      },
      isLoading: true,      // 新增
      showError: false,
      errorMessage: '',      // 新增
      username: '',          // 新增
      userId: '',
      isAdmin: false,        // 用于判断是否为管理员,

      dataSource: 'database', // 设置默认数据源为 'database'
      dataSourceLabel: '本地数据库', // 设置默认的数据源标签
      permissionOptions: [
        { value: "允许出售本体", label: "允许出售本体" },
        { value: "允许出售查阅权", label: "允许出售查阅权" },
        { value: "允许出售加工权", label: "允许出售加工权" }
      ],


      purchasedAssetsRaw: [],           // 所有购买的资产原始数据
purchasedAssetsPaginated: [],     // 当前页显示的数据
certificates: [],                 // 用户所有证书
certAddr: '',                     // 单个证书对应地址
       transactionStartTime: null,
      transactionEndTime: null,
      selectedRegionOptions: [],
      regionData: [
        {
          value: 'zhejiang',
          label: '浙江省',
          children: [
            {
              value: 'hangzhou',
              label: '杭州市',
              children: [
                { value: 'xihu', label: '西湖区' },
                { value: 'xiacheng', label: '下城区' }
              ]
            }
          ]
        }
      ],
      cascaderProps: {
        expandTrigger: 'hover',
        checkStrictly: false,
        emitPath: true
      },
      startTimePickerOptions: {
        selectableRange: '00:00:00 - 23:59:59'
      },
      endTimePickerOptions: {
        selectableRange: '00:00:00 - 23:59:59'
      },

      selectedAssetForValuation: null,
      selectedValuationMethod: 'cost',
      valuationMethodOptions: [
        { value: 'cost', label: '成本法' },
        { value: 'income', label: '收益法' },
        { value: 'market', label: '市场法' },
        { value: 'hybrid', label: '综合法' },
        { value: 'comparison', label: '比较法' },
        { value: 'technical', label: '技术分析法' },
        { value: 'dcf', label: 'DCF估值法' },
        { value: 'ahp', label: '层次分析法(AHP)' }
      ],
      valuationSections: [
        {
          method: 'cost',
          title: '成本法参数',
          fields: [
            { key: 'cOneoff', label: '一次性投入成本（万元）', min: 0, step: '0.01' },
            { key: 'cOngoing', label: '持续性投入成本（万元）', min: 0, step: '0.01' },
            { key: 'cQualityEval', label: '质量评估成本（万元）', min: 0, step: '0.01' },
            { key: 'cQualityImprove', label: '质量提升成本（万元）', min: 0, step: '0.01' },
            { key: 'cProduct', label: '数据产品化成本（万元）', min: 0, step: '0.01' },
            { key: 'completenessPct', label: '完整性（%）', min: 0, max: 100, step: '0.01' },
            { key: 'accuracyPct', label: '准确性（%）', min: 0, max: 100, step: '0.01' },
            { key: 'consistencyPct', label: '一致性（%）', min: 0, max: 100, step: '0.01' },
            { key: 'coveragePct', label: '覆盖度（%）', min: 0, max: 100, step: '0.01' }
          ]
        },
        {
          method: 'income',
          title: '收益法参数（多期折现 NPV）',
          fields: [
            { key: 'rfPct', label: '无风险收益率 rf（%）', min: 0, step: '0.01' },
            { key: 'rmPct', label: '市场平均收益率 rm（%）', min: 0, step: '0.01' },
            { key: 'beta', label: '市场风险暴露系数 beta', min: 0, max: 3, step: '0.01' },
            { key: 'growthPct', label: '经济增长率 g（%）', min: 0, step: '0.01' },
            { key: 'scope', label: '应用范围 scope（1~5）', min: 1, max: 5, step: '1' },
            { key: 'horizonN', label: '预测年限 N（1~10）', min: 1, max: 10, step: '1' },
            {
              key: 'cashFlows',
              label: '未来现金流 CF（按年逗号分隔，单位万元）',
              type: 'textarea',
              span: 2,
              placeholder: '例如：120, 135, 150',
              hint: '条目数量建议与 N 相同'
            }
          ]
        },
        {
          method: 'market',
          title: '市场法参数（可比均价乘调整系数）',
          fields: [
            { key: 'comparableTotalPrice', label: '可比样本总成交价（万元）', min: 0, step: '0.01' },
            { key: 'comparableCount', label: '可比样本数量（个）', min: 1, step: '1' },
            { key: 'targetSize', label: '评估对象规模（GB）', min: 0.01, step: '0.01' },
            { key: 'comparableSize', label: '可比对象规模（GB）', min: 0.01, step: '0.01' },
            { key: 'kQuality', label: '质量系数 K_quality（>0）', min: 0.01, step: '0.01' },
            { key: 'kCoverage', label: '覆盖系数 K_coverage（>0）', min: 0.01, step: '0.01' },
            { key: 'kTimeliness', label: '时效系数 K_timeliness（>0）', min: 0.01, step: '0.01' }
          ]
        },
        {
          method: 'hybrid',
          title: '综合法参数（成本基准乘双因子）',
          fields: [
            { key: 'hybridGrowthPct', label: '经济增长率 g（%）', min: 0, step: '0.01' },
            { key: 'hybridScope', label: '应用范围 scope（1~5）', min: 1, max: 5, step: '1' },
            { key: 'hybridN', label: '预测年限 N（1~10）', min: 1, max: 10, step: '1' },
            { key: 'alpha', label: '社会价值调节系数 alpha（>0）', min: 0.01, step: '0.01' },
            { key: 'downloads', label: '下载量（次，>=0）', min: 0, step: '1' }
          ]
        },
        {
          method: 'comparison',
          title: '比较法参数（可比样本加权均价修正）',
          fields: [
            {
              key: 'compPrices',
              label: '可比样本成交价 P_i（万元，逗号分隔）',
              type: 'textarea',
              span: 2,
              placeholder: '例如：820, 860, 910'
            },
            {
              key: 'compWeights',
              label: '相似度权重 w_i（逗号分隔，需与价格一一对应）',
              type: 'textarea',
              span: 2,
              placeholder: '例如：0.9, 0.8, 0.95',
              hint: '样本数量需与 P_i 一致，且每个权重 > 0'
            },
            { key: 'targetFeatureIndex', label: '目标对象特征指数 I_target（>0）', min: 0.01, step: '0.01' },
            { key: 'comparableFeatureIndex', label: '可比对象特征指数 I_comp（>0）', min: 0.01, step: '0.01' }
          ]
        },
        {
          method: 'technical',
          title: '技术分析法参数（趋势/动量/波动/流动性）',
          fields: [
            { key: 'taCurrentPrice', label: '当前市场价格（万元）', min: 0.01, step: '0.01' },
            { key: 'taMa20', label: '20期均价 MA20（万元）', min: 0.01, step: '0.01' },
            { key: 'taMa60', label: '60期均价 MA60（万元）', min: 0.01, step: '0.01' },
            { key: 'taMomentumPct', label: '动量因子（%，-100~200）', min: -100, max: 200, step: '0.01' },
            { key: 'taVolatilityPct', label: '波动率（%，0~200）', min: 0, max: 200, step: '0.01' },
            { key: 'taLiquidityScore', label: '流动性评分（1~10）', min: 1, max: 10, step: '1' }
          ]
        },
        {
          method: 'dcf',
          title: 'DCF估值法参数（分期现金流+终值）',
          fields: [
            { key: 'dcfDiscountRatePct', label: '折现率 r（%，>0）', min: 0.01, step: '0.01' },
            { key: 'dcfTerminalGrowthPct', label: '永续增长率 g（%，>=0）', min: 0, step: '0.01' },
            { key: 'dcfHorizonN', label: '预测年限 N（1~10）', min: 1, max: 10, step: '1' },
            {
              key: 'dcfCashFlows',
              label: '未来自由现金流 FCF（逗号分隔，单位万元）',
              type: 'textarea',
              span: 2,
              placeholder: '例如：180, 210, 245, 275, 310',
              hint: '条目数量需与 N 一致，且 r 必须大于 g'
            }
          ]
        },
        {
          method: 'ahp',
          title: '层次分析法（AHP）参数',
          fields: [
            { key: 'ahpRelCost', label: '方法可靠度 r1（成本法，1~9）', min: 1, max: 9, step: '0.01' },
            { key: 'ahpRelIncome', label: '方法可靠度 r2（收益法，1~9）', min: 1, max: 9, step: '0.01' },
            { key: 'ahpRelMarket', label: '方法可靠度 r3（市场法，1~9）', min: 1, max: 9, step: '0.01' },
            { key: 'ahpRelHybrid', label: '方法可靠度 r4（综合法，1~9）', min: 1, max: 9, step: '0.01' },
            { key: 'ahpRelComparison', label: '方法可靠度 r5（比较法，1~9）', min: 1, max: 9, step: '0.01' }
          ],
          noteLabel: 'AHP 综合说明',
          note: 'AHP 方法按 a_ij=r_i/r_j 构造方法层判断矩阵，并基于前5法（成本/收益/市场/综合/比较）做加权融合。'
        }
      ],
      valuationDefaults: {
        cOneoff: 180,
        cOngoing: 85,
        cQualityEval: 22,
        cQualityImprove: 28,
        cProduct: 62,
        completenessPct: 92,
        accuracyPct: 88,
        consistencyPct: 90,
        coveragePct: 84,
        rfPct: 2.1,
        rmPct: 8.3,
        beta: 1.2,
        growthPct: 5.5,
        scope: 4,
        horizonN: 3,
        cashFlows: '120, 138, 156',
        comparableTotalPrice: 940,
        comparableCount: 8,
        targetSize: 2.4,
        comparableSize: 2.1,
        kQuality: 1.08,
        kCoverage: 1.04,
        kTimeliness: 0.97,
        hybridGrowthPct: 6.2,
        hybridScope: 4,
        hybridN: 3,
        alpha: 0.36,
        downloads: 22000,
        compPrices: '820, 860, 910',
        compWeights: '0.9, 0.8, 0.95',
        targetFeatureIndex: 1.06,
        comparableFeatureIndex: 1,
        taCurrentPrice: 980,
        taMa20: 960,
        taMa60: 920,
        taMomentumPct: 6,
        taVolatilityPct: 18,
        taLiquidityScore: 7,
        dcfDiscountRatePct: 12,
        dcfTerminalGrowthPct: 3,
        dcfHorizonN: 5,
        dcfCashFlows: '180, 210, 245, 275, 310',
        ahpRelCost: 7.5,
        ahpRelIncome: 8,
        ahpRelMarket: 6.5,
        ahpRelHybrid: 7,
        ahpRelComparison: 6
      },
      valuationExample: {
        cOneoff: 220,
        cOngoing: 98,
        cQualityEval: 27,
        cQualityImprove: 33,
        cProduct: 75,
        completenessPct: 95,
        accuracyPct: 91,
        consistencyPct: 89,
        coveragePct: 87,
        rfPct: 1.9,
        rmPct: 9.1,
        beta: 1.35,
        growthPct: 6.1,
        scope: 5,
        horizonN: 4,
        cashFlows: '136, 152, 170, 194',
        comparableTotalPrice: 1260,
        comparableCount: 9,
        targetSize: 2.9,
        comparableSize: 2.3,
        kQuality: 1.1,
        kCoverage: 1.12,
        kTimeliness: 1.03,
        hybridGrowthPct: 6.6,
        hybridScope: 5,
        hybridN: 4,
        alpha: 0.42,
        downloads: 46000,
        compPrices: '980, 1050, 1120, 1080',
        compWeights: '0.82, 0.9, 0.88, 0.93',
        targetFeatureIndex: 1.1,
        comparableFeatureIndex: 1.02,
        taCurrentPrice: 1120,
        taMa20: 1080,
        taMa60: 1005,
        taMomentumPct: 9,
        taVolatilityPct: 22,
        taLiquidityScore: 8,
        dcfDiscountRatePct: 11.5,
        dcfTerminalGrowthPct: 3.2,
        dcfHorizonN: 5,
        dcfCashFlows: '220, 255, 295, 338, 380',
        ahpRelCost: 8,
        ahpRelIncome: 8.6,
        ahpRelMarket: 7.2,
        ahpRelHybrid: 7.8,
        ahpRelComparison: 6.8
      },
      params: {
        cOneoff: 180,
        cOngoing: 85,
        cQualityEval: 22,
        cQualityImprove: 28,
        cProduct: 62,
        completenessPct: 92,
        accuracyPct: 88,
        consistencyPct: 90,
        coveragePct: 84,
        rfPct: 2.1,
        rmPct: 8.3,
        beta: 1.2,
        growthPct: 5.5,
        scope: 4,
        horizonN: 3,
        cashFlows: '120, 138, 156',
        comparableTotalPrice: 940,
        comparableCount: 8,
        targetSize: 2.4,
        comparableSize: 2.1,
        kQuality: 1.08,
        kCoverage: 1.04,
        kTimeliness: 0.97,
        hybridGrowthPct: 6.2,
        hybridScope: 4,
        hybridN: 3,
        alpha: 0.36,
        downloads: 22000,
        compPrices: '820, 860, 910',
        compWeights: '0.9, 0.8, 0.95',
        targetFeatureIndex: 1.06,
        comparableFeatureIndex: 1,
        taCurrentPrice: 980,
        taMa20: 960,
        taMa60: 920,
        taMomentumPct: 6,
        taVolatilityPct: 18,
        taLiquidityScore: 7,
        dcfDiscountRatePct: 12,
        dcfTerminalGrowthPct: 3,
        dcfHorizonN: 5,
        dcfCashFlows: '180, 210, 245, 275, 310',
        ahpRelCost: 7.5,
        ahpRelIncome: 8,
        ahpRelMarket: 6.5,
        ahpRelHybrid: 7,
        ahpRelComparison: 6
      },
      valuationMethodResults: [],
      valuationResultStatus: '输入有效，结果已更新',
      valuationHasErrors: false,
      valuationSaving: false,
      showValuationModal: false,
      showValuationResultModal: false,


    }
  },
  computed: {
    /*currentPageData() {
      return this.assetData.slice(
        (this.pagination.page - 1) * this.pagination.perPage,
        this.pagination.page * this.pagination.perPage
      )
    },*/
  
  userRole() {
    return localStorage.getItem('user_role') || 'seller'; // 你要默认卖家就写 seller
  },
  isSeller() { return this.userRole === 'seller'; },
  isBuyer() { return this.userRole === 'buyer'; },
    

  /*mergedAssets() {
    const merged = [];

    // 添加已登记资产
    this.registeredAssets.forEach(asset => {
      merged.push({
        ...asset,
        source: 'registered', // 标记来源为已登记
        // 从数据库获取的可出售权益
        canSellAsset: asset.canSellAsset,
        canSellView: asset.canSellView,
        canSellProcess: asset.canSellProcess,
      });
    });

    // 添加已购买资产
    this.purchasedAssets.forEach(asset => {
      // 检查是否已存在相同哈希的已登记资产
      const existingIndex = merged.findIndex(a => a.fileHash === asset.fileHash);

      if (existingIndex >= 0) {
        // 如果已存在相同资产，则在原已登记资产上再添加已购买的资产信息
        const registeredAsset = merged[existingIndex];
        merged.push({
          ...registeredAsset,
          source: 'purchased', // 标记来源为已购买
          // 使用购买的权益覆盖可出售权益
          canSellAsset: asset.quality.includes('所有') ? 1 : 0, // 使用已购买的权益值
          canSellView: asset.quality.includes('查阅') ? 1 : 0,
          canSellProcess: asset.quality.includes('加工') ? 1 : 0,
        });
      } else {
        // 如果没有找到已登记资产，直接将已购买资产添加到列表
        merged.push({
          ...asset,
          source: 'purchased', // 标记为已购买
          // 使用已购买的权益值作为可出售权益
          canSellAsset: asset.quality.includes('所有') ? 1 : 0,
          canSellView: asset.quality.includes('查阅') ? 1 : 0,
          canSellProcess: asset.quality.includes('加工') ? 1 : 0,
        });
      }
    });

    return merged;
  },*/

  
// ✅ 兜底：永远返回数组
  activeAssets() {
    const arr = this.isSeller ? this.registeredAssets : this.purchasedAssets;
    return Array.isArray(arr) ? arr : [];
  },

  currentPageData() {
    const start = (this.pagination.page - 1) * this.pagination.perPage;
    const end = this.pagination.page * this.pagination.perPage;
    return this.activeAssets.slice(start, end);
  },
  selectedValuationSection() {
    return this.valuationSections.find((item) => item.method === this.selectedValuationMethod) || null;
  },
  
 },


  methods: {

    openValuationModal(asset) {
      this.selectedAssetForValuation = asset;
      this.showValuationModal = true;
    },
    resetValuationToDefaults() {
      this.params = { ...this.valuationDefaults };
    },
    useValuationExample() {
      this.params = { ...this.valuationExample };
    },
    submitValuation() {
      const validation = this.validateValuationInputs(this.params);
      this.valuationMethodResults = this.buildMethodResults(validation, this.selectedValuationMethod);
      const hasError = this.valuationMethodResults.length === 0 || this.valuationMethodResults[0].valuation === null;
      this.valuationHasErrors = hasError;
      const selectedMethodLabel = this.getMethodLabel(this.selectedValuationMethod);
      this.valuationResultStatus = hasError
        ? `${selectedMethodLabel}输入存在错误，请按提示修正`
        : `${selectedMethodLabel}计算完成，结果已更新`;
      this.showValuationResultModal = true;
      this.showValuationModal = false;

      if (hasError) {
        this.$message.warning(`${selectedMethodLabel}参数存在问题，请查看结果明细`);
      } else {
        this.$message.success(`${selectedMethodLabel}估值计算完成`);
      }
    },
    getSelectedMethodInputSnapshot() {
      if (!this.selectedValuationSection || !Array.isArray(this.selectedValuationSection.fields)) {
        return {};
      }
      return this.selectedValuationSection.fields.reduce((acc, field) => {
        acc[field.key] = this.params[field.key];
        return acc;
      }, {});
    },
    async saveCurrentValuationRecord() {
      const currentResult = this.valuationMethodResults[0];
      if (!currentResult || currentResult.valuation === null) {
        this.$message.warning('当前结果不可保存，请先修正参数并重新计算');
        return;
      }

      const selectedAsset = this.selectedAssetForValuation || {};
      const fileHash = selectedAsset.fileHash || selectedAsset.id || '';
      if (!fileHash) {
        this.$message.error('缺少资产哈希，无法保存估值记录');
        return;
      }

      const payload = {
        fileHash,
        assetName: selectedAsset.assetName || '',
        methodKey: this.selectedValuationMethod,
        methodName: currentResult.methodName,
        finalValuation: currentResult.valuation,
        valuationUnit: '万元',
        calcStatus: 1,
        statusMessage: '计算成功',
        inputSnapshot: this.getSelectedMethodInputSnapshot(),
        resultSnapshot: {
          formulaText: currentResult.formulaText,
          intermediates: currentResult.intermediates,
          notes: currentResult.notes,
          valuation: currentResult.valuation
        },
        createdByUserId: this.userId || '',
        createdByUsername: this.username || ''
      };

      this.valuationSaving = true;
      try {
        const response = await axios.post('http://10.112.47.214:3001/api/asset-valuations', payload);
        if (response.data && response.data.code === 0) {
          const recordNo = response.data?.data?.recordNo;
          this.$message.success(recordNo ? `保存成功，记录号：${recordNo}` : '保存成功');
        } else {
          this.$message.error(response.data?.message || '保存失败');
        }
      } catch (error) {
        console.error('保存估值记录失败:', error);
        this.$message.error('保存失败，后端接口不可用或服务异常');
      } finally {
        this.valuationSaving = false;
      }
    },
    validateValuationInputs(raw) {
      const state = {
        fieldErrors: {},
        methodErrors: {
          cost: [],
          income: [],
          market: [],
          hybrid: [],
          comparison: [],
          technical: [],
          dcf: [],
          ahp: []
        },
        values: {},
        errorCount: 0
      };

      const addError = (field, message, methods) => {
        if (!state.fieldErrors[field]) {
          state.fieldErrors[field] = message;
        }
        methods.forEach((name) => {
          state.methodErrors[name].push(message);
        });
        state.errorCount += 1;
      };

      const asNumber = (value) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : NaN;
      };

      const asNumberList = (value) => String(value || '')
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => Number(item));

      const nonNegativeFields = [
        ['cOneoff', '一次性投入成本', ['cost', 'hybrid']],
        ['cOngoing', '持续性投入成本', ['cost', 'hybrid']],
        ['cQualityEval', '质量评估成本', ['cost', 'hybrid']],
        ['cQualityImprove', '质量提升成本', ['cost', 'hybrid']],
        ['cProduct', '数据产品化成本', ['cost', 'hybrid']],
        ['comparableTotalPrice', '可比样本总成交价', ['market']],
        ['downloads', '下载量', ['hybrid']]
      ];
      nonNegativeFields.forEach(([field, label, methods]) => {
        const value = asNumber(raw[field]);
        if (Number.isNaN(value)) {
          addError(field, `${label}必须为数字`, methods);
          return;
        }
        if (value < 0) {
          addError(field, `${label}不能小于0`, methods);
        }
      });

      const percentFields = [
        ['completenessPct', '完整性', ['cost']],
        ['accuracyPct', '准确性', ['cost']],
        ['consistencyPct', '一致性', ['cost']],
        ['coveragePct', '覆盖度', ['cost']],
        ['rfPct', '无风险收益率', ['income']],
        ['rmPct', '市场平均收益率', ['income']],
        ['growthPct', '经济增长率', ['income']],
        ['hybridGrowthPct', '综合法经济增长率', ['hybrid']]
      ];
      percentFields.forEach(([field, label, methods]) => {
        const value = asNumber(raw[field]);
        if (Number.isNaN(value)) {
          addError(field, `${label}必须为数字`, methods);
          return;
        }
        if (value < 0 || value > 100) {
          addError(field, `${label}应在0~100之间`, methods);
        }
      });

      const taMomentum = asNumber(raw.taMomentumPct);
      if (Number.isNaN(taMomentum)) {
        addError('taMomentumPct', '动量因子必须为数字', ['technical']);
      } else if (taMomentum < -100 || taMomentum > 200) {
        addError('taMomentumPct', '动量因子应在-100~200之间', ['technical']);
      }

      const taVolatility = asNumber(raw.taVolatilityPct);
      if (Number.isNaN(taVolatility)) {
        addError('taVolatilityPct', '波动率必须为数字', ['technical']);
      } else if (taVolatility < 0 || taVolatility > 200) {
        addError('taVolatilityPct', '波动率应在0~200之间', ['technical']);
      }

      const dcfDiscountRate = asNumber(raw.dcfDiscountRatePct);
      if (Number.isNaN(dcfDiscountRate)) {
        addError('dcfDiscountRatePct', 'DCF折现率必须为数字', ['dcf']);
      } else if (dcfDiscountRate <= 0 || dcfDiscountRate > 100) {
        addError('dcfDiscountRatePct', 'DCF折现率应在0~100之间且大于0', ['dcf']);
      }

      const dcfTerminalGrowth = asNumber(raw.dcfTerminalGrowthPct);
      if (Number.isNaN(dcfTerminalGrowth)) {
        addError('dcfTerminalGrowthPct', 'DCF永续增长率必须为数字', ['dcf']);
      } else if (dcfTerminalGrowth < 0 || dcfTerminalGrowth >= 100) {
        addError('dcfTerminalGrowthPct', 'DCF永续增长率应在0~100之间', ['dcf']);
      }

      const integerRanges = [
        ['scope', '应用范围 scope', 1, 5, ['income']],
        ['hybridScope', '综合法应用范围 scope', 1, 5, ['hybrid']],
        ['horizonN', '预测年限 N', 1, 10, ['income']],
        ['hybridN', '综合法预测年限 N', 1, 10, ['hybrid']],
        ['taLiquidityScore', '流动性评分', 1, 10, ['technical']],
        ['dcfHorizonN', 'DCF预测年限 N', 1, 10, ['dcf']]
      ];
      integerRanges.forEach(([field, label, min, max, methods]) => {
        const value = asNumber(raw[field]);
        if (!Number.isInteger(value)) {
          addError(field, `${label}必须为整数`, methods);
          return;
        }
        if (value < min || value > max) {
          addError(field, `${label}必须在${min}~${max}之间`, methods);
        }
      });

      const beta = asNumber(raw.beta);
      if (Number.isNaN(beta)) {
        addError('beta', 'beta必须为数字', ['income']);
      } else if (beta < 0 || beta > 3) {
        addError('beta', 'beta必须在0~3之间', ['income']);
      }

      const positiveFields = [
        ['comparableCount', '可比样本数量', ['market']],
        ['targetSize', '评估对象规模', ['market']],
        ['comparableSize', '可比对象规模', ['market']],
        ['kQuality', '质量系数', ['market']],
        ['kCoverage', '覆盖系数', ['market']],
        ['kTimeliness', '时效系数', ['market']],
        ['alpha', '社会价值调节系数 alpha', ['hybrid']],
        ['targetFeatureIndex', '目标对象特征指数', ['comparison']],
        ['comparableFeatureIndex', '可比对象特征指数', ['comparison']],
        ['taCurrentPrice', '当前市场价格', ['technical']],
        ['taMa20', 'MA20', ['technical']],
        ['taMa60', 'MA60', ['technical']]
      ];
      positiveFields.forEach(([field, label, methods]) => {
        const value = asNumber(raw[field]);
        if (Number.isNaN(value)) {
          addError(field, `${label}必须为数字`, methods);
          return;
        }
        if (value <= 0) {
          addError(field, `${label}必须大于0`, methods);
        }
      });

      const ahpFields = [
        ['ahpRelCost', 'AHP 方法可靠度 r1', ['ahp']],
        ['ahpRelIncome', 'AHP 方法可靠度 r2', ['ahp']],
        ['ahpRelMarket', 'AHP 方法可靠度 r3', ['ahp']],
        ['ahpRelHybrid', 'AHP 方法可靠度 r4', ['ahp']],
        ['ahpRelComparison', 'AHP 方法可靠度 r5', ['ahp']]
      ];
      ahpFields.forEach(([field, label, methods]) => {
        const value = asNumber(raw[field]);
        if (Number.isNaN(value)) {
          addError(field, `${label}必须为数字`, methods);
          return;
        }
        if (value < 1 || value > 9) {
          addError(field, `${label}应在1~9区间`, methods);
        }
      });

      const cashFlows = asNumberList(raw.cashFlows);
      if (cashFlows.length === 0) {
        addError('cashFlows', '现金流不能为空', ['income']);
      }
      if (cashFlows.some((item) => !Number.isFinite(item))) {
        addError('cashFlows', '现金流列表中存在非数字', ['income']);
      }
      const horizon = asNumber(raw.horizonN);
      if (Number.isInteger(horizon) && cashFlows.length > 0 && cashFlows.length !== horizon) {
        addError('cashFlows', '现金流条目数量应与N一致', ['income']);
      }

      const compPrices = asNumberList(raw.compPrices);
      const compWeights = asNumberList(raw.compWeights);
      if (compPrices.length === 0) {
        addError('compPrices', '比较法可比成交价列表不能为空', ['comparison']);
      }
      if (compWeights.length === 0) {
        addError('compWeights', '比较法权重列表不能为空', ['comparison']);
      }
      if (compPrices.some((item) => !Number.isFinite(item) || item <= 0)) {
        addError('compPrices', '比较法成交价列表需为大于0的数字', ['comparison']);
      }
      if (compWeights.some((item) => !Number.isFinite(item) || item <= 0)) {
        addError('compWeights', '比较法权重列表需为大于0的数字', ['comparison']);
      }
      if (compPrices.length > 0 && compWeights.length > 0 && compPrices.length !== compWeights.length) {
        addError('compWeights', '比较法中价格与权重数量必须一致', ['comparison']);
      }

      const dcfCashFlows = asNumberList(raw.dcfCashFlows);
      if (dcfCashFlows.length === 0) {
        addError('dcfCashFlows', 'DCF现金流不能为空', ['dcf']);
      }
      if (dcfCashFlows.some((item) => !Number.isFinite(item))) {
        addError('dcfCashFlows', 'DCF现金流列表中存在非数字', ['dcf']);
      }
      const dcfHorizon = asNumber(raw.dcfHorizonN);
      if (Number.isInteger(dcfHorizon) && dcfCashFlows.length > 0 && dcfCashFlows.length !== dcfHorizon) {
        addError('dcfCashFlows', 'DCF现金流条目数量应与N一致', ['dcf']);
      }
      if (Number.isFinite(dcfDiscountRate) && Number.isFinite(dcfTerminalGrowth) && dcfDiscountRate <= dcfTerminalGrowth) {
        addError('dcfTerminalGrowthPct', 'DCF要求折现率 r 必须大于永续增长率 g', ['dcf']);
      }

      state.values.cost = {
        cOneoff: asNumber(raw.cOneoff),
        cOngoing: asNumber(raw.cOngoing),
        cQualityEval: asNumber(raw.cQualityEval),
        cQualityImprove: asNumber(raw.cQualityImprove),
        cProduct: asNumber(raw.cProduct),
        completeness: asNumber(raw.completenessPct),
        accuracy: asNumber(raw.accuracyPct),
        consistency: asNumber(raw.consistencyPct),
        coverage: asNumber(raw.coveragePct)
      };
      state.values.income = {
        rf: asNumber(raw.rfPct) / 100,
        rm: asNumber(raw.rmPct) / 100,
        beta: asNumber(raw.beta),
        g: asNumber(raw.growthPct) / 100,
        scope: asNumber(raw.scope),
        n: asNumber(raw.horizonN),
        cashFlows
      };
      state.values.market = {
        comparableTotalPrice: asNumber(raw.comparableTotalPrice),
        comparableCount: asNumber(raw.comparableCount),
        targetSize: asNumber(raw.targetSize),
        comparableSize: asNumber(raw.comparableSize),
        kQuality: asNumber(raw.kQuality),
        kCoverage: asNumber(raw.kCoverage),
        kTimeliness: asNumber(raw.kTimeliness)
      };
      state.values.hybrid = {
        g: asNumber(raw.hybridGrowthPct) / 100,
        scope: asNumber(raw.hybridScope),
        n: asNumber(raw.hybridN),
        alpha: asNumber(raw.alpha),
        downloads: asNumber(raw.downloads)
      };
      state.values.comparison = {
        prices: compPrices,
        weights: compWeights,
        targetFeatureIndex: asNumber(raw.targetFeatureIndex),
        comparableFeatureIndex: asNumber(raw.comparableFeatureIndex)
      };
      state.values.technical = {
        currentPrice: asNumber(raw.taCurrentPrice),
        ma20: asNumber(raw.taMa20),
        ma60: asNumber(raw.taMa60),
        momentum: asNumber(raw.taMomentumPct) / 100,
        volatility: asNumber(raw.taVolatilityPct) / 100,
        liquidityScore: asNumber(raw.taLiquidityScore)
      };
      state.values.dcf = {
        discountRate: asNumber(raw.dcfDiscountRatePct) / 100,
        terminalGrowth: asNumber(raw.dcfTerminalGrowthPct) / 100,
        n: asNumber(raw.dcfHorizonN),
        cashFlows: dcfCashFlows
      };
      state.values.ahp = {
        relCost: asNumber(raw.ahpRelCost),
        relIncome: asNumber(raw.ahpRelIncome),
        relMarket: asNumber(raw.ahpRelMarket),
        relHybrid: asNumber(raw.ahpRelHybrid),
        relComparison: asNumber(raw.ahpRelComparison)
      };
      state.values.sharedCost = {
        cOneoff: asNumber(raw.cOneoff),
        cOngoing: asNumber(raw.cOngoing),
        cQualityEval: asNumber(raw.cQualityEval),
        cQualityImprove: asNumber(raw.cQualityImprove),
        cProduct: asNumber(raw.cProduct)
      };
      return state;
    },
    getMethodLabel(methodKey) {
      const mapping = {
        cost: '成本法',
        income: '收益法',
        market: '市场法',
        hybrid: '综合法',
        comparison: '比较法',
        technical: '技术分析法',
        dcf: 'DCF估值法',
        ahp: '层次分析法(AHP)'
      };
      return mapping[methodKey] || methodKey;
    },
    buildMethodResults(validation, selectedMethod) {
      const parsed = validation.values;
      const buildOne = (methodKey) => {
        if (methodKey === 'cost') {
          return validation.methodErrors.cost.length > 0
            ? this.buildErrorResult('成本法', validation.methodErrors.cost)
            : this.calculateCost(parsed.cost);
        }
        if (methodKey === 'income') {
          return validation.methodErrors.income.length > 0
            ? this.buildErrorResult('收益法', validation.methodErrors.income)
            : this.calculateIncome(parsed.income);
        }
        if (methodKey === 'market') {
          return validation.methodErrors.market.length > 0
            ? this.buildErrorResult('市场法', validation.methodErrors.market)
            : this.calculateMarket(parsed.market);
        }
        if (methodKey === 'hybrid') {
          return validation.methodErrors.hybrid.length > 0
            ? this.buildErrorResult('综合法', validation.methodErrors.hybrid)
            : this.calculateHybrid(parsed.hybrid, parsed.sharedCost);
        }
        if (methodKey === 'comparison') {
          return validation.methodErrors.comparison.length > 0
            ? this.buildErrorResult('比较法', validation.methodErrors.comparison)
            : this.calculateComparison(parsed.comparison);
        }
        if (methodKey === 'technical') {
          return validation.methodErrors.technical.length > 0
            ? this.buildErrorResult('技术分析法', validation.methodErrors.technical)
            : this.calculateTechnical(parsed.technical);
        }
        if (methodKey === 'dcf') {
          return validation.methodErrors.dcf.length > 0
            ? this.buildErrorResult('DCF估值法', validation.methodErrors.dcf)
            : this.calculateDcf(parsed.dcf);
        }
        return this.buildErrorResult('未知方法', ['未识别的估值方法']);
      };

      if (selectedMethod !== 'ahp') {
        return [buildOne(selectedMethod)];
      }

      const baseResults = [
        buildOne('cost'),
        buildOne('income'),
        buildOne('market'),
        buildOne('hybrid'),
        buildOne('comparison')
      ];
      if (validation.methodErrors.ahp.length > 0 || baseResults.some((item) => item.valuation === null)) {
        return [this.buildErrorResult('层次分析法(AHP)', [
          ...validation.methodErrors.ahp,
          'AHP依赖前5法的有效结果，请先修正当前参数'
        ])];
      }
      return [this.calculateAHP(parsed.ahp, baseResults)];
    },
    buildErrorResult(methodName, errors) {
      return {
        methodName,
        formulaText: '-',
        intermediates: errors,
        valuation: null,
        notes: '该方法输入存在错误，请根据提示修正后重算。'
      };
    },
    calculateCost(input) {
      const sourceCost = input.cOneoff + input.cOngoing;
      const devCost = sourceCost + input.cQualityEval + input.cQualityImprove + input.cProduct;
      const qualityFactor = (input.completeness + input.accuracy + input.consistency + input.coverage) / 400;
      const valuation = devCost * qualityFactor;
      return {
        methodName: '成本法',
        formulaText: 'V_cost=(C_source+C_quality_eval+C_quality_improve+C_product)*Q_factor',
        intermediates: [
          `C_source=${this.formatNum(sourceCost)}`,
          `开发成本合计=${this.formatNum(devCost)}`,
          `Q_factor=${this.formatNum(qualityFactor, 4)}`,
          `V_cost=${this.formatNum(valuation)}`
        ],
        valuation,
        notes: 'Q_factor=(完整性+准确性+一致性+覆盖度)/400。'
      };
    },
    calculateIncome(input) {
      const discountRate = input.rf + input.beta * (input.rm - input.rf);
      const npv = input.cashFlows.reduce((sum, cashFlow, index) => {
        const t = index + 1;
        return sum + cashFlow / Math.pow(1 + discountRate, t);
      }, 0);
      const economicFactor = Math.pow(1 + input.g, input.n) * (input.scope / 5);
      const valuation = npv * economicFactor;
      return {
        methodName: '收益法',
        formulaText: 'r=rf+beta(rm-rf), NPV=Σ(CF_t/(1+r)^t), V_income=NPV*E_factor',
        intermediates: [
          `折现率r=${this.formatPercent(discountRate)}`,
          `NPV=${this.formatNum(npv)}`,
          `E_factor=${this.formatNum(economicFactor, 4)}`,
          `V_income=${this.formatNum(valuation)}`
        ],
        valuation,
        notes: 'E_factor=(1+g)^N*(scope/5)，scope 依据应用场景覆盖广度。'
      };
    },
    calculateMarket(input) {
      const averagePrice = input.comparableTotalPrice / input.comparableCount;
      const scaleFactor = input.targetSize / input.comparableSize;
      const adjustFactor = input.kQuality * input.kCoverage * input.kTimeliness;
      const valuation = averagePrice * scaleFactor * adjustFactor;
      return {
        methodName: '市场法',
        formulaText: 'V_market=P_avg*Scale*K_quality*K_coverage*K_timeliness',
        intermediates: [
          `P_avg=${this.formatNum(averagePrice)}`,
          `Scale=${this.formatNum(scaleFactor, 4)}`,
          `调整系数乘积=${this.formatNum(adjustFactor, 4)}`,
          `V_market=${this.formatNum(valuation)}`
        ],
        valuation,
        notes: '可比均价基于交易样本，质量/覆盖/时效系数用于差异修正。'
      };
    },
    calculateHybrid(input, shared) {
      const devBase = shared.cOneoff + shared.cOngoing + shared.cQualityEval + shared.cQualityImprove + shared.cProduct;
      const economicFactor = Math.pow(1 + input.g, input.n) * (input.scope / 5);
      const socialFactor = 1 + input.alpha * Math.log(1 + input.downloads / 1000);
      const valuation = devBase * economicFactor * socialFactor;
      return {
        methodName: '综合法',
        formulaText: 'V_hybrid=V_dev_base*E_factor*S_factor',
        intermediates: [
          `V_dev_base=${this.formatNum(devBase)}`,
          `E_factor=${this.formatNum(economicFactor, 4)}`,
          `S_factor=${this.formatNum(socialFactor, 4)}`,
          `V_hybrid=${this.formatNum(valuation)}`
        ],
        valuation,
        notes: 'S_factor=1+alpha*ln(1+downloads/1000)，体现下载量边际递减。'
      };
    },
    calculateComparison(input) {
      const weightedPriceSum = input.prices.reduce((sum, price, index) => sum + price * input.weights[index], 0);
      const weightSum = input.weights.reduce((sum, weight) => sum + weight, 0);
      const weightedAveragePrice = weightedPriceSum / weightSum;
      const featureFactor = input.targetFeatureIndex / input.comparableFeatureIndex;
      const valuation = weightedAveragePrice * featureFactor;
      return {
        methodName: '比较法',
        formulaText: 'V_compare=(Σ(P_i*w_i)/Σw_i)*(I_target/I_comp)',
        intermediates: [
          `样本数量n=${input.prices.length}`,
          `加权均价=${this.formatNum(weightedAveragePrice)}`,
          `特征修正系数=${this.formatNum(featureFactor, 4)}`,
          `V_compare=${this.formatNum(valuation)}`
        ],
        valuation,
        notes: '比较法采用可比样本加权均价，并按目标/可比特征指数进行修正。'
      };
    },
    calculateTechnical(input) {
      const trendFactor = input.ma20 / input.ma60;
      const momentumFactor = 1 + input.momentum;
      const volatilityPenalty = 1 / (1 + input.volatility);
      const liquidityFactor = 0.8 + (input.liquidityScore / 10) * 0.4;
      const valuation = input.currentPrice * trendFactor * momentumFactor * volatilityPenalty * liquidityFactor;
      return {
        methodName: '技术分析法',
        formulaText: 'V_tech=P_now*(MA20/MA60)*(1+M)*1/(1+σ)*L_factor',
        intermediates: [
          `趋势因子(MA20/MA60)=${this.formatNum(trendFactor, 4)}`,
          `动量因子(1+M)=${this.formatNum(momentumFactor, 4)}`,
          `波动惩罚因子=${this.formatNum(volatilityPenalty, 4)}`,
          `流动性因子=${this.formatNum(liquidityFactor, 4)}`,
          `V_tech=${this.formatNum(valuation)}`
        ],
        valuation,
        notes: '技术分析法结合趋势、动量、波动率和流动性进行价格修正，适用于有市场行为数据的资产。'
      };
    },
    calculateDcf(input) {
      const pvStage = input.cashFlows.reduce((sum, cashFlow, index) => {
        const t = index + 1;
        return sum + cashFlow / Math.pow(1 + input.discountRate, t);
      }, 0);
      const lastCashFlow = input.cashFlows[input.cashFlows.length - 1];
      const terminalValue = (lastCashFlow * (1 + input.terminalGrowth)) / (input.discountRate - input.terminalGrowth);
      const pvTerminal = terminalValue / Math.pow(1 + input.discountRate, input.n);
      const valuation = pvStage + pvTerminal;
      return {
        methodName: 'DCF估值法',
        formulaText: 'V_dcf=Σ(FCF_t/(1+r)^t)+[FCF_N*(1+g)/(r-g)]/(1+r)^N',
        intermediates: [
          `阶段现值PV_stage=${this.formatNum(pvStage)}`,
          `终值TV=${this.formatNum(terminalValue)}`,
          `终值现值PV_terminal=${this.formatNum(pvTerminal)}`,
          `V_dcf=${this.formatNum(valuation)}`
        ],
        valuation,
        notes: 'DCF法基于现金流折现与永续增长终值；为保证模型稳定性，要求 r > g。'
      };
    },
    calculateAHP(input, baseResults) {
      const methodValues = baseResults.map((item) => item.valuation);
      const reliability = [input.relCost, input.relIncome, input.relMarket, input.relHybrid, input.relComparison];
      const n = reliability.length;

      const matrix = reliability.map((ri) => reliability.map((rj) => ri / rj));
      const geoMeans = matrix.map((row) => Math.pow(row.reduce((product, value) => product * value, 1), 1 / n));
      const totalGeoMean = geoMeans.reduce((sum, value) => sum + value, 0);
      const weights = geoMeans.map((value) => value / totalGeoMean);
      const valuation = methodValues.reduce((sum, value, index) => sum + weights[index] * value, 0);

      const aw = matrix.map((row) => row.reduce((sum, value, colIndex) => sum + value * weights[colIndex], 0));
      const lambdaMax = aw.reduce((sum, value, index) => sum + value / weights[index], 0) / n;
      const ci = (lambdaMax - n) / (n - 1);
      const ri = 1.12;
      const cr = ci / ri;
      const consistencyNote = cr <= 0.1 ? 'CR<=0.10，一致性可接受' : 'CR>0.10，建议调整方法可靠度参数';

      return {
        methodName: '层次分析法(AHP)',
        formulaText: 'a_ij=r_i/r_j, w_i=(Πa_ij)^(1/n)/Σ((Πa_ij)^(1/n)), V_ahp=Σ(w_i*V_i)',
        intermediates: [
          `前5法估值=(${baseResults.map((item) => `${item.methodName}:${this.formatNum(item.valuation)}`).join('、')})`,
          `方法权重w=(${weights.map((item) => this.formatNum(item, 4)).join(', ')})`,
          `λ_max=${this.formatNum(lambdaMax, 4)}, CI=${this.formatNum(ci, 4)}, CR=${this.formatNum(cr, 4)}`,
          `V_ahp=${this.formatNum(valuation)}`
        ],
        valuation,
        notes: `AHP基于前5种方法估值结果赋权融合。${consistencyNote}`
      };
    },
    formatNum(value, digits = 2) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return String(value);
      }
      return number.toLocaleString('zh-CN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      });
    },
    formatPercent(value, digits = 2) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return String(value);
      }
      return `${(number * 100).toFixed(digits)}%`;
    },
    closeValuationModal() {
      this.showValuationModal = false;
    },
    closeValuationResultModal() {
      this.showValuationResultModal = false;
    },

   
    validateTimeRange() {
      if (this.transactionStartTime && this.transactionEndTime) {
        if (this.transactionStartTime >= this.transactionEndTime) {
          this.$message.error('结束时间必须大于开始时间');
        }
      }
    },
    /*handleRegionChange(value) {
      if (value.length !== 3) {
        this.$message.warning('请完整选择省、市、区');
        return;
      }
      console.log('交易地点已选择:', value);

      // 进行动态证书设置
      this.setDynamicCert()
        .then(isDynamicCertSet => {
          if (!isDynamicCertSet) {
            this.$message.error('动态证书配置失败，无法继续操作');
            return;
          }

          // 处理交易地点
          const transactionLocation = value.join('-');
          this.setTransactionLocation(transactionLocation);
        })
        .catch(error => {
          console.error('动态证书设置失败:', error);
          this.$message.error('动态证书设置失败，请稍后重试');
        });
    },*/

    handleRegionChange(value) {
  if (!value || value.length === 0) {
    return;
  }

  if (value.length !== 3) {
    this.$message.warning('如果设置交易地点，请完整选择省、市、区');
    return;
  }

  console.log('交易地点已选择:', value);

  this.setDynamicCert()
    .then(isDynamicCertSet => {
      if (!isDynamicCertSet) {
        this.$message.error('动态证书配置失败');
      }
    });
},
    async setDynamicCert() {
      try {
        const response = await axios.post('http://10.112.47.214:8848/pre/DynamicCertConfig', {
          clientName: 'client1',
          orgName: 'wx-org1.chainmaker.org'
        });
        return response.status === 200;
      } catch (error) {
        console.error('动态证书设置错误:', error);
        return false;
      }
    },
    async setTransactionLocation(location) {
      try {
        const response = await axios.post('http://10.112.47.214:8848/pre/SetAllowedLocations', {
          allowedLocations: [location]
        });
        if (response.status === 200 && response.data.code === 0) {
          this.$message.success('交易地点设置成功');
        } else {
          this.$message.error('设置交易地点失败');
        }
      } catch (error) {
        console.error('设置交易地点失败:', error);
        this.$message.error('请求失败，请稍后再试');
      }
    },


isIndivisible(industry) {
  return String(industry) === 'WH';
},

    handleDataSourceChange() {
      this.isLoading = true;
      this.errorMessage = '';
      this.assetData = []; // 清空当前数据

      if (this.dataSource === 'database') {
        this.fetchAssetData(); // 调用获取数据库数据的函数
      } else if (this.dataSource === 'buy') {
        this.fetchPurchasedAssets();
      }
    }

    ,
    toggleExpand(item) {
      item.isExpanded = !item.isExpanded; // 切换当前项的展开状态
    },
    shortenHash(hash) {
      return hash.length > 10 ? hash.substring(0, 10) : hash; // 如果哈希的长度超过10，显示前10个字符
    },
    //////////////////////////////////////////////////////////
 fetchUserId() {
  const token = localStorage.getItem('token');
  console.log('Token:', token); // 输出 token
  if (token) {
    try {
      const payload = this.parseJwt(token);
      console.log('解析后的用户信息:', payload); // 确保 token 解析成功
      this.username = decodeURIComponent(payload.username); // 获取并设置用户名
      console.log('当前登录用户名:', this.username);

      // 请求用户ID
      axios.post('http://10.112.47.214:3000/api/get-user-id', { username: this.username })
        .then(response => {
          if (response.status === 200 && response.data.id) {
            this.userId = response.data.id.toString(); // 确保 userId 转为字符串
            console.log('获取的用户ID:', this.userId);

            // 获取资产数据
            this.fetchAllAssets();
          } else {
            console.error('获取用户ID失败:', response.data);
            this.errorMessage = '获取用户ID失败，请稍后重试。';
          }
        })
        .catch(error => {
          console.error('请求用户ID时发生错误:', error);
          this.errorMessage = '获取用户ID失败，服务器不可用。';
          this.isLoading = false;
        });
    } catch (error) {
      console.error('解析 token 出错:', error);
      this.isLoading = false;
    }
  } else {
    console.error('Token 不存在，请检查登录状态');
    this.isLoading = false;
  }
},


    handleAuthorization(item) {
      if (item.isProxied === 1) {
        this.selectedAsset = item;  // 保存当前资产信息
        this.showAuthorizationModal = true; // 显示授权弹窗
      }
    },

    // 关闭授权弹窗
    closeAuthorizationModal() {
      this.showAuthorizationModal = false;
    },
    cancelAuthorization() {
      this.showAuthorizationModal = false;  // 关闭授权弹窗
    },
    closeAuthorizationSuccessModal() {
      this.showAuthorizationSuccessModal = false; // 关闭授权成功弹窗
    },


    // 执行授权操作
    // 前端调用授权的API
    /*confirmAuthorization() {
      const payload = {
        fileHash: this.selectedAsset.fileHash,   // 当前选中的资产哈希
        agent_addr: this.authorizationData.targetAddress,  // 用户输入的目标地址
      };

      axios.post('http://10.112.47.214:3000/api/authorize', payload)
        .then(response => {
          console.log(response.data.message);  // 成功消息
          this.showAuthorizationSuccessModal = true;

          this.closeAuthorizationModal();  // 关闭授权弹窗
        })
        .catch(error => {
          console.error('授权失败:', error);
          this.errorMessage = '授权失败，请稍后再试。';
        });
    },*/

    getSellPermissions(item) {
  const rights = [];
  if (item.canSellAsset === 1 || item.canSellAsset === '1') {
    rights.push('持有');
  }
  if (item.canSellView === 1 || item.canSellView === '1') {
    rights.push('经营');
  }
  if (item.canSellProcess === 1 || item.canSellProcess === '1') {
    rights.push('加工');
  }
  return rights.length > 0 ? rights.join('、') : '无'
},

async fetchCertificates() {
  if (!this.userId) {
    console.error('用户ID缺失，无法获取证书');
    this.errorMessage = '用户ID缺失，请重新登录。';
    return; // 如果没有 userId，停止执行
  }
  try {
    // 同时请求两类证书（不传 org 字段）
    const [org1Res, org2Res] = await Promise.all([
      axios.post('http://10.112.47.214:3000/api/get-certificates', {
        userId: this.userId
      }),
      axios.post('http://10.112.47.214:3000/api/get-certificates2', {
        userId: this.userId
      })
    ]);

    // 标注 org 字段为完整形式
    const org1Certs = org1Res.data.certificates?.map(cert => ({
      name: cert.cert,
      org: 'wx-org1.chainmaker.org',
      address: cert.address || ''
    })) || [];

    const org2Certs = org2Res.data.certificates?.map(cert => ({
      name: cert.cert,
      org: 'wx-org2.chainmaker.org',
      address: cert.address || ''
    })) || [];

    this.certificates = [...org1Certs, ...org2Certs];

    console.log('✅ 所有证书列表:', this.certificates);
  } catch (error) {
    console.error('❌ 获取证书失败:', error);
    this.certificates = [];
  }
},


async getCertAddr(certInfo) {
  try {
    return certInfo.address || null;
  } catch (err) {
    console.warn('跳过无效或过期证书:', {
      cert: certInfo,
      error: err.response?.data || err.message
    });
    return null;
  }
},

  /*async fetchAllAssets() {
      try {
        this.isLoading = true;
        // 并行获取已登记和已购买资产
        await Promise.all([
          this.fetchAssetData(),
          this.fetchPurchasedAssets()
        ]);
      } catch (error) {
        console.error('获取资产失败:', error);
      } finally {
        this.isLoading = false;
        this.setPagination(); 
      }
    },*/

async fetchAllAssets() {
  this.isLoading = true;

  // ✅ 先清空另一侧数据，避免切换角色时混入旧数据
  if (this.isSeller) this.purchasedAssets = [];
  else this.registeredAssets = [];

  try {
    if (this.isSeller) {
      await this.fetchAssetData();        // 只拉登记资产
    } else {
      await this.fetchPurchasedAssets();  // 只拉购买资产
    }
  } catch (e) {
    console.error('获取资产失败:', e);
  } finally {
    this.isLoading = false;
    this.setPagination();
  }
},

async fetchPurchasedAssets() {
  try {
    this.isLoading = true;

    // 1. 先获取 org1 + org2 的所有证书
    await this.fetchCertificates();

    const addresses = [];

    // 2. 逐个证书转地址，过期/无效证书跳过
    for (const certInfo of this.certificates) {
      const addr = await this.getCertAddr(certInfo);

      if (addr) {
        addresses.push(addr);
      }
    }

    console.log('✅ 有效买家地址列表:', addresses);

    // 3. 没有有效地址，直接清空
    if (addresses.length === 0) {
      this.purchasedAssets = [];
      this.setPagination();
      return;
    }

    // 4. 根据有效地址查询购买资产
    const response = await axios.post(
      'http://10.112.47.214:3000/api/get-purchased-assets',
      {
        addresses
      }
    );

    if (response.status === 200) {
      const rawAssets = response.data.assets || [];
      console.log('📦 买家购买资产:', rawAssets);

      this.purchasedAssets = rawAssets.map(item => ({
        id: item.file_hash,
        assetName: item.asset_name,
        assetType: item.asset_type,
        description: item.description,
        fileHash: item.file_hash,
        email: item.email,
        address: item.address,
        industry: item.industry,
        algorithm: item.algorithm,
        userId: item.user_id,
        txperm: item.txperm,
        isProxied: item.is_proxied,

        canSellAsset: item.can_sell_asset,
        canSellView: item.can_sell_view,
        canSellProcess: item.can_sell_process,

        quality: item.quality,
        number: item.number || item.quantity || 1,
        isExpanded: false
      }));

      this.setPagination();
    } else {
      console.error('❌ 获取购买资产失败:', response.data);
      this.purchasedAssets = [];
      this.setPagination();
    }
  } catch (error) {
    console.error('❌ 获取用户购买资产信息失败:', error);
    this.purchasedAssets = [];
    this.setPagination();
  } finally {
    this.isLoading = false;
  }
},

updatePurchasedAssetsPagination() {
  this.pagination.total = this.purchasedAssetsRaw.length;
  this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage);
  this.assetData = this.purchasedAssetsRaw.slice(
    (this.pagination.page - 1) * this.pagination.perPage,
    this.pagination.page * this.pagination.perPage
  );
},

    async getOwnerOfAsset(tokenId) {
    try {
      const response = await axios.post('http://10.112.47.214:8848/pre/OwnerOf', {
        tokenId: tokenId
      });

      if (response.status === 200 && response.data.code === 0) {
        return response.data.result; // 返回资产的拥有者
      } else {
        console.error('获取资产拥有者失败:', response.data.message);
        throw new Error('获取资产拥有者失败');
      }
    } catch (error) {
      console.error('调用 OwnerOf 方法失败:', error);
      throw new Error('调用 OwnerOf 方法失败');
    }
  },

    /*async confirmAuthorization() {
      // 校验表单数据
      if (!this.authorizationData.targetAddress || this.authorizationData.authorizationQuantity <= 0) {
        this.showError = true;
        return;
      }

      const payload = {
        to: this.authorizationData.targetAddress,
        amount: this.authorizationData.authorizationQuantity.toString(),
      };

      // 如果是可分割资产，调用 En-Approve 接口
      if (!this.isIndivisible(this.selectedAsset.industry)) {
        try {
          console.log("传给后端的参数为", payload);
          this.isLoading = true;
          const response = await axios.post('http://localhost:8848/pre/En-Approve', payload);
          if (response.status === 200 && response.data.code === 0) {
            this.showAuthorizationSuccessModal = true;
          } else {
            this.showError = true;
            console.error('授权失败:', response.data.message);
          }
        } catch (error) {
          console.error('授权接口调用失败:', error);
          this.showError = true;
        } finally {
          this.isLoading = false;
          this.showAuthorizationModal = false;
        }
      } else {
        console.log("不可分割资产，尚未实现该部分逻辑");
        // 这里可以处理不可分割资产的授权逻辑，调用 SetApproval 接口等
      }
    },*/
    // 授权操作
  async confirmAuthorization() {
    if (this.selectedAsset && this.authorizationData.targetAddress) {
      const asset = this.selectedAsset;
      let owner;

      // 获取资产的拥有者
      try {
        owner = await this.getOwnerOfAsset(asset.fileHash); // 获取资产拥有者
      } catch (error) {
        this.errorMessage = '获取资产拥有者失败，请稍后再试。';
        return;
      }

      // 判断资产是可分割的还是不可分割的
      let authorizationQuantity = this.isIndivisible(asset.industry) ? 1 : this.authorizationData.authorizationQuantity;

      // 构建请求参数
      const payload = this.isIndivisible(asset.industry)
        ? {
            owner: owner, // 资产拥有者
            to: this.authorizationData.targetAddress, // 被授权地址
            tokenId: asset.fileHash,  // 资产的 tokenId
            isApproval: 'true',  // 授权为 true
          }
        : {
            to: this.authorizationData.targetAddress, // 目标地址
            amount: authorizationQuantity.toString(), // 授权数量
          };

      // 判断资产是可分割的还是不可分割的，选择正确的调用接口
      const apiUrl = this.isIndivisible(asset.industry)
        ? 'http://10.112.47.214:8848/pre/SetApproval' // 不可分割资产
        : 'http://10.112.47.214:8848/pre/En-Approve'; // 可分割资产

      try {
        const response = await axios.post(apiUrl, payload);

        if (response.status === 200 && response.data.code === 0) {
          console.log('授权成功:', response);
          this.showAuthorizationSuccessModal = true; // 显示授权成功弹窗
          this.closeAuthorizationModal(); // 关闭授权弹窗
        } else {
          this.errorMessage = '授权失败，错误信息: ' + response.data.message;
        }
      } catch (error) {
        console.error('授权失败:', error);
        this.errorMessage = '授权失败，请稍后再试。';
      }
    } else {
      this.errorMessage = '请填写所有必填字段';
    }
  },

    //////////////////////////////////////////////////////////
    fetchAssetDataFromFisco() {
      this.isLoading = true;
      const assetHash = 'KEY-111'; // 示例哈希值
      axios.get(`http://10.129.186.227:8080/retrieve?key=${assetHash}`)
        .then(response => {
          this.assetData = response.data;
        })
        .catch(error => {
          // 捕获并处理错误，设置自定义的错误消息
          console.error('获取 FISCO 链数据失败:', error);
          this.errorMessage = '获取 FISCO 链数据失败，无法连接到服务器';
        })
        .finally(() => {
          this.isLoading = false;
        });
    },
    //////////////////////////////////////////////////////////

    fetchAssetDataFromChangan() {
      this.isLoading = true;
      axios.post('http://10.112.47.214:8848/pre/QueryAsset')
        .then(response => {
          console.log('长安链返回原始数据:', response.data);
          const rawAssets = response.data.result;
          if (!rawAssets || rawAssets.length === 0) {
            throw new Error('长安链数据缺少 result 字段或 result 为空');
          }
          const groupedAssets = this.groupAssets(rawAssets);
          this.filterAndSetAssetData(groupedAssets);
        })
        .catch(error => {
          console.error('获取长安链数据失败:', error);
          this.errorMessage = '获取长安链数据失败，无法连接到服务器';
        })
        .finally(() => {
          this.isLoading = false;
        });
    },

    groupAssets(assets) {
      return assets.reduce((acc, item) => {
        const key = item.filehash || item.assetID;
        if (!acc[key] || item.astsecl > acc[key].astsecl) {
          acc[key] = item;
        }
        return acc;
      }, {});
    },

    filterAndSetAssetData(groupedAssets) {
      this.assetData = Object.values(groupedAssets).filter(item => {
        // 过滤掉 fileHash 包含 'no_shengcheng' 的资产
        if (item.filehash && item.filehash.includes('no_shengcheng')) {
          231
          return false;
        }

        console.log('检查长安链资产 item.userID:', item.userID, '当前用户 userId:', this.userId, '当前领域：', item.industry);
        return this.isAdmin || item.userID?.toString() === this.userId?.toString();
      }).map(item => ({
        id: item.assetID,
        assetName: item.assetName || '未命名资产',
        assetType: item.astsecl || '未知类型',
        description: item.description || '无描述',
        fileHash: item.filehash || '无哈希值',
        email: item.email || '无邮箱',
        address: item.address || '无地址',
        algorithm: item.algorithm || '未知算法',
        userId: item.userID || '0',
        txperm: item.txperm || 1,
        isExpanded: false
      }));
      this.setPagination();
    }
    ,

   /* setPagination() {
      this.pagination.total = this.assetData.length;
      this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage);
    }

    ,*/

    //////////////////////////////////////////////////////////
    // 获取资产数据的方法
    fetchAssetData() {
      // 判断是否为管理员
      if (this.username === 'rrrao' || this.username === 'liu') {
        this.isAdmin = true;
      } else {
        this.isAdmin = false;
      }
      // 获取资产数据
      axios.get(`http://10.112.47.214:3000/api/get-asset2`)
        .then(response => {
          this.isLoading = true;
          const groupedAssets = response.data.reduce((acc, item) => {
            const key = item.file_hash;
            if (!acc[key] || item.id > acc[key].id) {
              acc[key] = item; // 更新为最新版本
            }
            return acc;
          }, {});

          // 根据是否为管理员来过滤资产
          this.registeredAssets = Object.values(groupedAssets).filter(item => {
            // 添加日志，检查 item.user_id 和 this.userId 的值
            console.log('检查资产 item.user_id:', item.user_id, '当前用户 userId:', this.userId);
            // 如果是管理员，显示所有资产，否则只显示当前用户的资产
            const isValidAsset = this.isAdmin || item.user_id.toString() === this.userId;
            // 过滤掉包含 'no_shengcheng' 的哈希值
            return isValidAsset && !item.file_hash.includes('未生成哈希值') && !item.file_hash.includes('no_shengcheng');
          }).map(item => ({
            id: item.id,
            assetName: item.asset_name,
            assetType: item.asset_type,
            description: item.description,
            fileHash: item.file_hash,
            email: item.email,
            address: item.address,
            industry: item.industry,
            algorithm: item.algorithm,
            userId: item.user_id,
            txperm: item.txperm,
            isProxied: item.is_proxied, // 这里加上 is_proxied 字段
            canSellAsset: item.can_sell_asset,
            canSellView: item.can_sell_view,
            canSellProcess: item.can_sell_process,
            number: item.number,
            isExpanded: false // 新增字段用于控制展开状态
          }));

         /* this.pagination.total = this.assetData.length;
          this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage);*/
           this.setPagination();
        })
        .catch(error => {
          console.error('获取资产数据失败:', error);
          this.errorMessage = '获取资产数据失败，请稍后再试。';
        })
        .finally(() => {
          this.isLoading = false;
        });
    },

    formatRemarks(email, address) {
      return `邮箱: ${email}, 地址: ${address}`;
    },
    /*
    prevPage() {
      if (this.pagination.page > 1) {
        this.pagination.page--;
        this.fetchAssetData();
      }
    },
    nextPage() {
      if (this.pagination.page < this.pagination.pages) {
        this.pagination.page++;
        this.fetchAssetData();
      }
    },
    goToPage(page) {
      this.pagination.page = page;
      this.fetchAssetData();
    },
    updatePages() {
      this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage);
      if (this.pagination.page > this.pagination.pages) {
        this.pagination.page = this.pagination.pages;
      }
      this.fetchAssetData();
    },*/


    
  // 保持原有方法名称不变
  setPagination() {
  const total = (this.activeAssets && this.activeAssets.length) ? this.activeAssets.length : 0;
  this.pagination.total = total;
  this.pagination.pages = Math.ceil(total / this.pagination.perPage) || 0;

  if (this.pagination.page > this.pagination.pages && this.pagination.pages > 0) {
    this.pagination.page = this.pagination.pages;
  }
  if (this.pagination.pages === 0) {
    this.pagination.page = 1;
  }
},

  // 保持原有分页方法不变
  prevPage() {
    if (this.pagination.page > 1) {
      this.pagination.page--;
    }
  },
  
  nextPage() {
    if (this.pagination.page < this.pagination.pages) {
      this.pagination.page++;
    }
  },
  
  goToPage(page) {
    this.pagination.page = page;
  },
  
  updatePages() {
    this.pagination.pages = Math.ceil(this.pagination.total / this.pagination.perPage);
    if (this.pagination.page > this.pagination.pages) {
      this.pagination.page = this.pagination.pages;
    }
  },
  
    /*openEditModal(asset) {
      this.editAsset = { ...asset };
      this.showEditModal = true;
    },*/
    openEditModal(asset) {
  this.editAsset = {
    ...asset,
    canSellAsset: !!asset.canSellAsset,
    canSellView: !!asset.canSellView,
    canSellProcess: !!asset.canSellProcess
  };

  // 不强制用户重新选择时间和地点
  this.transactionStartTime = null;
  this.transactionEndTime = null;
  this.selectedRegionOptions = [];

  this.showEditModal = true;
},
    closeEditModal() {
      this.showEditModal = false;
    },

    /*async confirmEdit() {
  this.isLoading = true;
  this.errorMessage = '';

  // 1. 校验交易时间
  if (!this.transactionStartTime || !this.transactionEndTime) {
    this.$message.error('请填写完整的交易时间');
    this.isLoading = false; // 设置loading为false
    return;
  }

  // 格式化交易时间为标准时间戳
  const startDateTimeString = `${new Date().toISOString().split('T')[0]} ${this.transactionStartTime}`;
  const endDateTimeString = `${new Date().toISOString().split('T')[0]} ${this.transactionEndTime}`;

  const startTime = new Date(startDateTimeString);
  const endTime = new Date(endDateTimeString);

  const startTimeStamp = startTime.getTime();
  const endTimeStamp = endTime.getTime();

  if (isNaN(startTime) || isNaN(endTime)) {
    this.$message.error('请输入有效的开始时间和结束时间');
    this.isLoading = false;
    return;
  }

  if (startTimeStamp >= endTimeStamp) {
    this.$message.error('结束时间必须大于开始时间');
    this.isLoading = false;
    return;
  }

  console.log('开始时间戳:', startTimeStamp);
  console.log('结束时间戳:', endTimeStamp);

  // 2. 调用后端接口保存交易时间
  try {
    const response = await axios.post('http://10.112.47.214:8848/pre/SetTradingTime', {
      startTime: startTimeStamp,
      endTime: endTimeStamp
    });

    if (response.status === 200 && response.data.code === 0) {
      this.$message.success('交易时间设置成功');
    } else {
      this.$message.error('交易时间设置失败');
      this.isLoading = false;
      return;
    }
  } catch (error) {
    console.error('设置交易时间失败:', error);
    this.$message.error('设置交易时间失败，请稍后再试');
    this.isLoading = false;
    return;
  }

  // 3. 根据数据源选择不同的处理方式
  try {
    if (this.dataSource === 'database') {
      await this.confirmEditDatabase(); // 更新数据库
    } else if (this.dataSource === 'changan') {
      await this.confirmEditChain(); // 调用智能合约
    }
  } catch (error) {
    this.isLoading = false;
    this.errorMessage = '操作失败，请稍后再试。';
    console.error('操作失败:', error);
  } finally {
    this.isLoading = false;
  }
},*/
async confirmEdit() {
  this.isLoading = true;
  this.errorMessage = '';

  try {
    const hasStart = !!this.transactionStartTime;
    const hasEnd = !!this.transactionEndTime;

    // 只有填写了其中一个，才要求必须成对填写
    if (hasStart || hasEnd) {
      if (!hasStart || !hasEnd) {
        this.$message.error('如果设置交易时间，需要同时填写开始时间和结束时间');
        this.isLoading = false;
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const startTime = new Date(`${today} ${this.transactionStartTime}`);
      const endTime = new Date(`${today} ${this.transactionEndTime}`);

      const startTimeStamp = startTime.getTime();
      const endTimeStamp = endTime.getTime();

      if (isNaN(startTimeStamp) || isNaN(endTimeStamp)) {
        this.$message.error('请输入有效的开始时间和结束时间');
        this.isLoading = false;
        return;
      }

      if (startTimeStamp >= endTimeStamp) {
        this.$message.error('结束时间必须大于开始时间');
        this.isLoading = false;
        return;
      }

      const response = await axios.post('http://10.112.47.214:8848/pre/SetTradingTime', {
        startTime: startTimeStamp,
        endTime: endTimeStamp
      });

      if (!(response.status === 200 && response.data.code === 0)) {
        this.$message.error('交易时间设置失败');
        this.isLoading = false;
        return;
      }

      this.$message.success('交易时间设置成功');
    }

    if (this.dataSource === 'database') {
      await this.confirmEditDatabase();
    } else if (this.dataSource === 'changan') {
      await this.confirmEditChain();
    }
  } catch (error) {
    this.errorMessage = '操作失败，请稍后再试。';
    console.error('操作失败:', error);
  } finally {
    this.isLoading = false;
  }
},


    async confirmEditDatabase() {
      this.isLoading = true;
      this.errorMessage = ''
       
    
      const payload = {
        assetName: this.editAsset.assetName,
        assetType: this.editAsset.assetType,
        description: this.editAsset.description,
        email: this.editAsset.email,
        address: this.editAsset.address,
        userId: this.editAsset.userId,
        txperm: this.editAsset.txperm,
        can_sell_asset: this.editAsset.canSellAsset ? 1 : 0,   // 选中则传 1，未选中传 0
        can_sell_view: this.editAsset.canSellView ? 1 : 0,
        can_sell_process: this.editAsset.canSellProcess ? 1 : 0,
        fileHash: this.editAsset.fileHash,  // 确保哈希值不变
      };
      console.log('参数', payload);
      axios.post('http://10.112.47.214:3000/api/update-asset', payload)
        .then(response => {
          if (response.status === 200) {
            this.showSuccessModal = true;
            this.closeEditModal();
          } else {
            this.errorMessage = '更新资产失败，请稍后再试。';
          }
        })
        .catch(error => {
          console.error('更新资产失败:', error);
          this.errorMessage = '更新资产失败，请稍后再试。';
        })
        .finally(() => {
          this.isLoading = false;
        });
    },


    async confirmEditChain() {
      this.isLoading = true;
      this.errorMessage = '';
      
      // 构建请求体
      const payload = {
        assetName: this.editAsset.assetName,
        assetType: this.editAsset.assetType,
        txperm: '2',
        email: this.editAsset.email,
        address: this.editAsset.address,
        description: this.editAsset.description,
        algorithm: this.editAsset.algorithm,
        customAlgorithm: this.editAsset.customAlgorithm,
        fileHash: this.editAsset.fileHash, // 哈希值保持不变
        industry: this.editAsset.industry,
        user_id: String(this.editAsset.user_id), // 强制转换为字符串
      };

      console.log('请求体:', payload);

      try {
        const response = await axios.post('http://10.112.47.214:8848/pre/IssueAsset', payload, {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        console.log("调用长安链返回：", response.data);

        if (response.status === 200 && response.data.code === 0) {
          this.showSuccessModal = true;
          this.closeEditModal();
          this.chainMakerSuccess = true;
          this.blockchainResponseData = response; // 直接存储返回数据
          return response.data; // 返回成功响应
        } else {
          this.chainMakerSuccess = false;
          this.blockchainResponseData = response.data; // 存储失败的返回数据
          this.chainMakerErrorMessage = `链调用失败，错误码：${response.data.code}, 错误信息：${response.data.message}`;
          this.errorMessage = '更新资产失败，请稍后再试。';
          return response.data; // 返回失败响应
        }
      } catch (error) {
        this.chainMakerSuccess = false;
        // 处理错误返回
        if (error.response) {
          this.blockchainResponseData = {
            code: error.response.status,
            message: error.response.data?.message || error.message,
            data: null,
            result: null,
          };
        } else {
          this.blockchainResponseData = {
            code: 500,
            message: error.message,
            data: null,
            result: null,
          };
        }
        this.chainMakerErrorMessage = `链调用失败，错误信息：${this.blockchainResponseData.message}`;
        this.errorMessage = '更新资产失败，请稍后再试。';
        return this.blockchainResponseData; // 返回构造的错误数据
      } finally {
        this.isLoading = false;
      }
    },




    closeSuccessModal() {
      this.showSuccessModal = false;
      location.reload(); // 刷新整个页面
    },
    parseJwt(token) {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    }
  },
  mounted() {
    
    this.fetchUserId();

  }
}
</script>


<style scoped>

.action-cell {
    display: flex;
    justify-content: center;
    align-items: center;
}

.nowrap {
  white-space: nowrap;
}

/* 修改按钮容器的样式，使按钮之间有间距 */
.button-container {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 20px;
}

/* 按钮的基础样式 */
.button-container button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

/* 确认按钮样式 */
.button-container .confirm-button {
  background-color: #007bff;
  color: white;
}

.button-container .confirm-button:hover {
  background-color: #0056b3;
}

/* 取消按钮样式 */
.button-container .cancel-button {
  background-color: #f5f6fa;
  color: #333;
  border: 1px solid #ddd;
}

.button-container .cancel-button:hover {
  background-color: #e2e6ea;
}

.edit-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
  pointer-events: none;
}

.data-source-container {
  display: flex;
  align-items: center;
}

.data-source-container span {
  margin-right: 5px;
}

body {
  background-color: #F5F6FA;
  margin: 0;
  font-family: Arial, sans-serif;
}

.asset-management {
  width: 100%;
  min-height: 100vh;
  background: #F5F6FA;
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
}

.title {
  margin: 0;
  padding: 10px 0;
  text-align: left;
  padding-left: 30px;
  font-size: 24px;
  color: #333;
}

.asset-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-top: 20px;
  margin-left: 20px;
  margin-right: 20px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.info-text {
  display: flex;
  align-items: center;
}

.info-icon {
  width: 20px;
  height: 20px;
  margin-right: 10px;
}

/* 表格容器添加水平滚动 */
.table-container {
  overflow-x: auto;
  width: 100%;
}

/* 表格固定布局 */
.styled-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
  color: #333;
  table-layout: fixed; /* 关键：固定表格布局 */
}

/* 设置各列固定宽度 */
.styled-table th:nth-child(1), /* 资产哈希 */
.styled-table td:nth-child(1) {
  width: 120px;
  min-width: 120px;
}

.styled-table th:nth-child(2), /* 用户 ID */
.styled-table td:nth-child(2) {
  width: 80px;
  min-width: 80px;
}

.styled-table th:nth-child(3), /* 资产名称 */
.styled-table td:nth-child(3) {
  width: 100px;
  min-width: 100px;
}

.styled-table th:nth-child(4), /* 安全等级 */
.styled-table td:nth-child(4) {
  width: 80px;
  min-width: 80px;
}

.styled-table th:nth-child(5), /* 资产介绍 */
.styled-table td:nth-child(5) {
  width: 200px; /* 给资产介绍固定宽度 */
  min-width: 200px;
  max-width: 200px;
  word-wrap: break-word;
  white-space: normal;
}

.styled-table th:nth-child(6), /* 数量 */
.styled-table td:nth-child(6) {
  width: 80px;
  min-width: 80px;
}

.styled-table th:nth-child(7), /* 性质 */
.styled-table td:nth-child(7) {
  width: 90px;
  min-width: 90px;
}

.styled-table th:nth-child(8), /* 状态 */
.styled-table td:nth-child(8) {
  width: 100px;
  min-width: 100px;
}

.styled-table th:nth-child(9), /* 可出售权益 - 固定宽度 */
.styled-table td:nth-child(9) {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
  word-wrap: break-word;
  white-space: normal;
}



.styled-table th:nth-child(10), /* 编辑 */
.styled-table td:nth-child(10),
.styled-table th:nth-child(11), /* 授权 */
.styled-table td:nth-child(11),
.styled-table th:nth-child(12), /* 估值定价 */
.styled-table td:nth-child(12) {
  width: 70px;
  min-width: 70px;
}

/* 单元格内容处理 */
.styled-table td {
  padding: 12px 8px;
  text-align: center;
  vertical-align: middle;
  word-wrap: break-word;
  overflow: hidden;
}

/* 资产介绍和可出售权益的特殊处理 */
.styled-table td:nth-child(5), /* 资产介绍 */
.styled-table td:nth-child(9) { /* 备注 */
  text-align: left;
  line-height: 1.4;
}

/* 长文本显示省略号，hover时显示完整内容 */
.styled-table td {
  position: relative;
}

.styled-table td:hover::after {
  content: attr(data-fulltext);
  position: absolute;
  left: 0;
  top: 100%;
  background: #fff;
  border: 1px solid #ddd;
  padding: 8px;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 1000;
  white-space: normal;
  width: 200px;
  display: none;
}

.styled-table td:hover::after {
  display: block;
}

/* 表头样式 */
.styled-table thead tr {
  background-color: #f8f9fa;
  border-bottom: 2px solid #dee2e6;
  font-weight: bold;
}

/* 奇偶行交替颜色 */
.styled-table tbody tr:nth-of-type(odd) {
  background-color: #f9f9f9;
}

.styled-table tbody tr:nth-of-type(even) {
  background-color: #ffffff;
}

/* 行悬停效果 */
.table-hover-row tbody tr:hover {
  background-color: #e9ecef;
  cursor: pointer;
  transition: background-color 0.3s;
}

/* 状态颜色 */
.green-text {
  color: #28a745;
}

.gray-text {
  color: #6c757d;
}

.yellow-text {
  color: #ffc107;
}

.red-text {
  color: #dc3545;
}

/* 编辑按钮样式 */
.edit-button {
  background-color: #007bff;
  color: #fff;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.edit-button:hover {
  background-color: #0056b3;
}

/* 调整分页器样式 */
.pagination-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

.pagination-controls button,
.pagination-controls span {
  padding: 5px 10px;
  font-size: 14px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  background-color: #f8f9fa;
  cursor: pointer;
}

.pagination-controls .active {
  background-color: #007bff;
  color: white;
}

.pagination-controls button:hover:not(:disabled) {
  background-color: #e2e6ea;
}

/* 表头字体加粗 */
.styled-table thead th {
  font-weight: bold;
}

/* Modal Styles */
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
}

.modal-content {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  width: 600px;
  max-width: 90%;
  text-align: center;
}

.wide-modal {
  width: 600px;
}

.modal-content h3 {
  margin-top: 0;
  display: flex;
  align-items: center;
}

.info-icon-modal {
  width: 20px;
  height: 20px;
  margin-right: 10px;
}

.form-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-bottom: 15px;
  width: 100%;
}

.form-group {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  width: 100%;
}

.form-group label {
  margin-right: 10px;
  white-space: nowrap;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  min-width: 200px;
  max-width: 100%;
  box-sizing: border-box;
}

/* 调整textarea以自适应内容*/
.form-group textarea {
  resize: vertical;
  min-height: 50px;
}

.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
  flex-direction: row;
}

.buttons button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.buttons button[type="button"] {
  background-color: #f5f6fa;
  color: #333;
}

.buttons button[type="submit"] {
  background-color: #007bff;
  color: white;
}

.centered-button {
  display: flex;
  justify-content: center;
  width: 100%;
}

.modal-content.wide-modal2 {
  width: 300px;
  padding: 10px;
}

.centered-button button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: #007bff;
  color: white;
  margin-top: 20px;
}

.loading {
  text-align: center;
  padding: 20px;
  font-size: 16px;
  color: #666;
}

.error-message {
  color: red;
  text-align: center;
  margin-bottom: 10px;
}

.edit-label {
  float: left;
  width: 80px;
  text-align: left;
}

.version-info {
  margin-left: 90px;
}

.version-list {
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
}

.version-list li {
  list-style-type: none;
  padding: 10px 0;
}

.red-text {
  color: red;
}

.green-text {
  color: green;
}

.yellow-text {
  color: rgb(191, 191, 8);
}

.gray-text {
  color: gray;
}

.hash-display {
  cursor: pointer;
  color: #007bff;
}

.hash-display .collapse {
  cursor: pointer;
  color: #007bff;
}

.form-row {
  display: flex;
  justify-content: space-between; /* 让元素排列在同一行 */
  gap: 20px; /* 可选：设置两个输入框之间的间距 */
}

.form-group {
  flex: 1;
}

.form-group label {
  margin-bottom: 0;
  margin-right: 10px;
  white-space: nowrap;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px;
  font-size: 14px;
}

.spinner {
  display: inline-block;
  width: 50px;
  height: 50px;
  border: 5px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: #007bff;
  animation: spin 1s ease-in-out infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-container {
  position: absolute;
  top: 50%;
  left: 57.4%;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.content {
  position: relative;
}

.valuation-modal {
  width: min(1100px, 95vw);
  max-height: 86vh;
  overflow-y: auto;
  text-align: left;
}

.valuation-result-modal {
  width: min(760px, 92vw);
}

.valuation-result-status {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  margin-bottom: 10px;
  font-size: 13px;
  border-radius: 999px;
  color: #166534;
  background: rgba(22, 101, 52, 0.1);
  border: 1px solid rgba(22, 101, 52, 0.2);
}

.valuation-result-status.has-errors {
  color: #b91c1c;
  border-color: rgba(185, 28, 28, 0.24);
  background: rgba(185, 28, 28, 0.08);
}

.valuation-control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  align-items: flex-end;
}

.valuation-method-select {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 220px;
}

.valuation-method-select label {
  font-size: 13px;
  color: #4b5563;
}

.valuation-method-select select {
  border: 1px solid #d4dde6;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  background: #fff;
  color: #1f2a37;
}

.valuation-control-row .btn-primary,
.valuation-control-row .btn-secondary {
  border: none;
  border-radius: 10px;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.valuation-control-row .btn-primary {
  background: linear-gradient(130deg, #0f766e, #115e59);
  color: #fff;
  box-shadow: 0 8px 16px rgba(15, 118, 110, 0.2);
}

.valuation-control-row .btn-secondary {
  background: #fff;
  color: #1f2a37;
  border: 1px solid #d4dde6;
}

.valuation-control-row .btn-primary:hover,
.valuation-control-row .btn-secondary:hover {
  transform: translateY(-1px);
}

.valuation-form {
  margin-bottom: 10px;
}

.valuation-method-box {
  border: 1px solid rgba(17, 94, 89, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  margin-bottom: 10px;
  overflow: hidden;
}

.valuation-method-box[open] {
  box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.12);
}

.valuation-method-box summary {
  list-style: none;
  cursor: pointer;
  padding: 10px 12px;
  font-size: 16px;
  font-weight: 700;
  background: linear-gradient(90deg, rgba(15, 118, 110, 0.09), rgba(240, 140, 52, 0.08));
  border-bottom: 1px solid rgba(17, 94, 89, 0.15);
}

.valuation-method-box summary::-webkit-details-marker {
  display: none;
}

.valuation-method-body {
  padding: 10px 10px 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(200px, 1fr));
  gap: 8px;
}

.valuation-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.valuation-field label {
  font-size: 13px;
  color: #4b5563;
}

.valuation-field input,
.valuation-field textarea {
  width: 100%;
  border: 1px solid #d4dde6;
  border-radius: 8px;
  padding: 8px;
  font-size: 14px;
  background: #fff;
  color: #1f2a37;
  box-sizing: border-box;
}

.valuation-field textarea {
  min-height: 68px;
  resize: vertical;
}

.valuation-hint {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.3;
}

.valuation-field.span-2 {
  grid-column: span 2;
}

.valuation-result-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #dbe5ee;
  border-radius: 8px;
  overflow: hidden;
  font-size: 14px;
  table-layout: fixed;
}

.valuation-result-wrap {
  overflow-x: auto;
}

.valuation-result-table th,
.valuation-result-table td {
  border-bottom: 1px solid #edf2f7;
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

.valuation-result-table thead th {
  background: #f3f7fb;
  color: #1b4d47;
}

.valuation-result-table tbody tr:last-child td {
  border-bottom: none;
}

.valuation-intermediate-list {
  margin: 0;
  padding-left: 18px;
}

.valuation-intermediate-list li {
  margin-bottom: 4px;
}

.mono-cell {
  font-family: Consolas, "Courier New", monospace;
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
}

.warn-text {
  color: #92400e;
  font-weight: 700;
}

.valuation-note-row td {
  background: #fcf7ef;
  color: #6c4f2d;
  font-size: 13px;
}

/* 分页信息样式 */
.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
  padding: 10px 0;
}

.pagination-info {
  font-size: 14px;
  color: #666;
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .styled-table {
    font-size: 14px;
  }
  
  .styled-table th,
  .styled-table td {
    padding: 8px 6px;
  }
}

@media (max-width: 768px) {
  .table-container {
    font-size: 13px;
  }
  
  .asset-container {
    margin-left: 10px;
    margin-right: 10px;
    padding: 15px;
  }
  
  .pagination-container {
    flex-direction: column;
    gap: 10px;
  }

  .valuation-method-body {
    grid-template-columns: 1fr;
  }

  .valuation-field.span-2 {
    grid-column: span 1;
  }
}
</style>
