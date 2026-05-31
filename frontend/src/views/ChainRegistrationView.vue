<template>
  <div class="chain-registration">
    <AppHeader :username="username" :userId="userId" />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="title">上链登记</h2>
        <div class="form-container">
          <div class="info-row">
            <img src="@/assets/info-icon.png" alt="Info Icon" class="info-icon">
            <span>数字资产上链登记</span>
          </div>
          <form @submit.prevent="openConfirmation">

            <div class="form-row">
              <div class="form-group">
                <label for="asset-name">
                  <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
                  资产名称
                </label>
                <input type="text" id="asset-name" v-model="form.assetName" required />
              </div>
              <div class="form-group">
                <label for="email">
                  邮箱
                </label>
                <input type="email" id="email" v-model="form.email" />
              </div>
              <div class="form-group">
                <label for="address">
                  地址
                </label>
                <input type="text" id="address" v-model="form.address" />
              </div>
            </div>
            
            <div class="form-row">
  <div class="form-group full-width align-top">
    <label for="description" class="full-width-label">
      <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
      数字资产上链登记内容
    </label>

    <div class="description-wrapper">
      <textarea id="description" v-model="form.description" required></textarea>

      <!--<div class="classify-row">
  <select v-model="form.gradingMethod" class="method-select">
    <option value="">请选择分级方法</option>
    <option
      v-for="method in gradingMethods"
      :key="method.value"
      :value="method.value"
    >
      {{ method.label }}
    </option>
  </select>

  <button
    type="button"
    class="classify-btn"
    @click="gradeAssetLevel"
    :disabled="gradingLoading || !form.file || !form.gradingMethod"
  >
    {{ gradingLoading ? '分级中...' : '分级' }}
  </button>

  <div v-if="form.assetType" class="grade-result">
    资产等级：<span class="grade-value">{{ form.assetType }}</span>
  </div>
</div>

<div v-if="gradingError" class="grade-error">
  {{ gradingError }}
</div>-->
    </div>
  </div>
</div>
            <div class="form-row">
  <!-- 哈希算法选择 -->
  <div class="form-group">
    <label class="full-width-label left-align">
      <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
      哈希算法选择
    </label>
    <div class="radio-group">
      <div class="radio-item">
        <input type="radio" id="SHA2_256" value="SHA2_256" v-model="form.algorithm" required />
        <label for="SHA2_256" class="radio-label">SHA2_256</label>
      </div>
      <div class="radio-item">
        <input type="radio" id="SHA3_256" value="SHA3_256" v-model="form.algorithm" />
        <label for="SHA3_256" class="radio-label">SHA3_256</label>
      </div>
      <div class="radio-item">
        <input type="radio" id="other" value="OTHER" v-model="form.algorithm" />
        <label for="other" class="radio-label">其他</label>
      </div>
    </div>
  </div>

  <!-- 模型选择 -->
<div class="form-group">
  <label for="model-selection">模型选择</label>
  <select id="model-selection" v-model="form.modelSelection">
    <!-- 占位提示：默认显示 -->
    <option value="">请选择模型</option>
    <!-- 用户真正可以选择的选项 -->
    <option value="weighted_average">加权平均</option>
  </select>
</div>

</div>

            <!-- 自定义算法输入框 -->
            <div class="form-row" v-if="form.algorithm === 'OTHER'">
              <div class="form-group full-width">
                <label for="custom-algorithm" class="full-width-label left-align">
                  <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
                  自定义哈希算法
                </label>
                <input type="text" id="custom-algorithm" v-model="form.customAlgorithm" required />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="file">
                  <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
                  选择文件
                </label>
                <input type="file" id="file" @change="handleFileChange" required />
              </div>
            </div>
            
<div class="form-row">
  <div class="form-group">
    <label for="asset-category">
      <span class="required-asterisk">*</span>
      资产等级和类别
    </label>
    <input
      type="text"
      id="asset-category"
      v-model="form.analysisResultText"
      readonly
      placeholder="点击分类分级按钮后自动生成"
    />
  </div>

  <div class="form-group">
    <label for="classification-method">
      <span class="required-asterisk">*</span>
      分类分级方法
    </label>
    <select id="classification-method" v-model="form.analysisMethod">
      <option value="">请选择分类分级方法</option>
      <option
        v-for="method in classificationMethods"
        :key="method.value"
        :value="method.value"
      >
        {{ method.label }}
      </option>
    </select>
  </div>

  <div class="form-group classify-inline-group">
    <button
      type="button"
      class="classify-btn"
      @click="analyzeAssetCombined"
:disabled="classifyLoading || !form.file || !form.analysisMethod"
    >
      {{ classifyLoading ? '分类中...' : '分类分级' }}
    </button>
  </div>
</div>

            <div class="form-row">
              <div class="form-group">
                <label for="industry">
                  <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
                  资产领域
                </label>
                <select
  id="industry"
  v-model="form.industryRaw"
  @change="handleIndustryChange"
  required
>

                  <option value="">请选择行业</option>
                  <!--<option value="NY">能源</option>
                  <option value="DL">电力</option>
                  <option value="TZ">碳证交易</option>
                  <option value="JT">交通出行</option>
                  <option value="YL">医疗健康</option>
                  <option value="ZX">征信</option>
                  <option value="JR">金融</option>
                  <option value="SZ">数字版权</option>
                  <option value="ZD">自动驾驶</option>
                  <option value="CL">车联网</option>
                  <option value="WH">文化</option>
                  <option value="FL">法律</option>
-->
                  <!-- ✅ 新增20个大类 -->
                  <option value="TZ">碳证交易</option>
                  <option value="ZX">征信</option>
                  <option value="SZ">数字版权</option>
                  <option value="ZD">自动驾驶</option>
                  <option value="CL">车联网</option>
                  <option value="FL">法律</option>
<option value="A01">农、林、牧、渔业</option>
<option value="B02">采矿业</option>
<option value="C03">制造业</option>
<option value="D04">电力、热力、燃气及水生产和供应业（能源电力）</option>
<option value="E05">建筑业</option>
<option value="F06">批发和零售业</option>
<option value="G07">交通运输、仓储和邮政业（交通出行）</option>
<option value="H08">住宿和餐饮业</option>
<option value="I09">信息传输、软件和信息技术服务业</option>
<option value="J10">金融业（金融）</option>
<option value="K11">房地产业</option>
<option value="L12">租赁和商务服务业</option>
<option value="M13">科学研究和技术服务业</option>
<option value="N14">水利、环境和公共设施管理业</option>
<option value="O15">居民服务、修理和其他服务业</option>
<option value="P16">教育</option>
<option value="Q17">卫生和社会工作（医疗健康）</option>
<option value="R18">文化、体育和娱乐业（文化）</option>
<option value="S19">公共管理、社会保障和社会组织</option>
<option value="T20">国际组织</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="quantity">
                  <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
                  数量
                </label>
                <input type="number" id="quantity" v-model="form.quantity" :disabled="isQuantityLocked" min="1"
                  required />
              </div>
            </div>


            <div class="form-row">
              <div class="form-group">
                <label for="picture">
                  <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
                  交易预览图片
                </label>
                <input type="file" id="picture" @change="handlePictureChange" accept="image/*" required />
              </div>
            </div>
            <!-- 允许出售选项 -->
            <div class="form-row">
              
              <div class="form-group">
                <el-checkbox v-model="form.isSellBody">允许出售所有权</el-checkbox>
              </div>
              <div class="form-group">
                <el-checkbox v-model="form.isSellReadRight">允许出售经营权</el-checkbox>
              </div>
              <div class="form-group">
                <el-checkbox v-model="form.isSellProcessRight">允许出售加工使用权</el-checkbox>
              </div>
             
            </div>
            <!-- 在这里添加一个允许二次交易的下拉框，点击之后有一个二级勾选，可以选择经过管理员以及不经过管理员 -->
            <div class="form-row cascader-container">
              <!--<label class="full-width-label left-align">是否允许二次交易</label>
<el-cascader
  v-model="selectedOptions"
  :options="transactionOptions"
  @change="handleTransactionChange"
  placeholder="请选择交易选项"
  clearable
  filterable
  aria-label="选择二次交易方式"
  class="custom-cascader">
</el-cascader>-->

              <!-- 这里使用el组件的级联选项添加一个资产交易地点，省市区 -->
              <label class="full-width-label left-align">资产交易地点设置</label>
              <el-cascader v-model="selectedRegionOptions" :options="regionData" :props="cascaderProps"
                @change="handleRegionChange" placeholder="请选择资产交易地点" clearable />
              <div class="form-group full-width">
                <label class="full-width-label left-align">资产交易时间设置</label>
                <el-time-picker  v-model="transactionStartTime" placeholder="开始时间"
                  :picker-options="startTimePickerOptions" @change="validateTimeRange" :clearable="false"
                  :editable="false" :arrow-control="false" :format="'HH:mm:ss'" :value-format="'HH:mm:ss'"
                  :picker-type="'time'" :use-12h="false" :is-range="false" :start-placeholder="'Start Time'"
                  :end-placeholder="'End Time'" :range-separator="'至'" :popper-class="'time-picker-popper'"
                  :prefix-icon="'el-icon-time'" :clear-icon="'el-icon-circle-close'" :disabled-date="disabledStartDate"
                  :disabled-time="disabledStartTime" :align="left" :popper-append-to-body="true" :transfer="true"
                  :popper-options="{ boundariesElement: 'body' }" :scroll-to-option="true" />
                <el-time-picker v-model="transactionEndTime" placeholder="结束时间"
                  :picker-options="endTimePickerOptions" @change="validateTimeRange" :clearable="false"
                  :editable="false" :arrow-control="false" :format="'HH:mm:ss'" :value-format="'HH:mm:ss'"
                  :picker-type="'time'" :use-12h="false" :is-range="false" :start-placeholder="'Start Time'"
                  :end-placeholder="'End Time'" :range-separator="'至'" :popper-class="'time-picker-popper'"
                  :prefix-icon="'el-icon-time'" :clear-icon="'el-icon-circle-close'" :disabled-date="disabledEndDate"
                  :disabled-time="disabledEndTime" :align="left" :popper-append-to-body="true" :transfer="true"
                  :popper-options="{ boundariesElement: 'body' }" :scroll-to-option="true" />
              </div>


            </div>


            <div class="form-group centered-button">
              <button type="submit">新增</button>
            </div>
          </form>

        </div>

        <!-- 确认信息模态框 -->
        <div v-if="showConfirmation" class="modal">
          <div class="modal-content">
            <h3>确认信息</h3>
            <p><strong>资产名称:</strong> {{ form.assetName }}</p>
            <p><strong>邮箱:</strong> {{ form.email }}</p>
            <p><strong>资产类别:</strong> {{ form.assetCategory }}</p>

<p><strong>资产等级:</strong> {{ form.assetType }}</p>
<p><strong>分类方法:</strong> {{ getMethodLabel(classificationMethods, form.classificationMethod) }}</p>
<p><strong>分级方法:</strong> {{ getMethodLabel(gradingMethods, form.gradingMethod) }}</p>
            <p><strong>地址:</strong> {{ form.address }}</p>
            <p><strong>数据资产上链登记内容:</strong> {{ form.description }}</p>
            <p><strong>哈希算法:</strong> {{ form.algorithm === 'OTHER' ? form.customAlgorithm : form.algorithm }}</p>
            <p><strong>模型选择:</strong> 
  {{ form.modelSelection === 'weighted_average' ? '加权平均' : form.modelSelection }}
</p>
            <p><strong>证书选择:</strong>
              <select v-model="form.selectedCertificate" required>
                <option value="">请选择证书</option>
                <option v-for="certificate in certificates" :key="certificate" :value="certificate">
                  {{ certificate }}
                </option>
              </select>
            </p>
            <div class="form-group centered-button">
              <button @click="confirmForm" style="margin-right: 20px;">确认</button>
              <button @click="cancelForm">取消</button>
            </div>
          </div>
        </div>



        <el-dialog v-model="showUnifiedModal" title="上链状态" width="50%">
          <!-- 哈希生成状态 -->
          <div class="modal-section">
            <transition name="fade" mode="out-in">
              <div v-if="!loadingHash" key="hashResult">
                <el-icon v-if="hashSuccess" class="success-icon">
                  <check />
                </el-icon>
                <el-icon v-else class="error-icon">
                  <close />
                </el-icon>
                <p :class="{ 'success-text': hashSuccess, 'error-text': !hashSuccess }">
                  <strong>文件哈希值:</strong> {{ hashValue || '哈希生成失败' }}
                </p>
                <p v-if="!hashSuccess" class="error-text">哈希生成失败：{{ errorMessage }}</p>
              </div>
            </transition>
          </div>

          <!-- 数据库保存状态 -->
          <div class="modal-section" v-show="!loadingHash">
            <transition name="fade" mode="out-in" appear>
              <div v-if="!loadingDatabase" key="databaseResult">
                <el-icon v-if="databaseSuccess" class="success-icon">
                  <check />
                </el-icon>
                <el-icon v-else class="error-icon">
                  <close />
                </el-icon>
                <p :class="{ 'success-text': databaseSuccess, 'error-text': !databaseSuccess }">
                  <strong>本地数据库状态:</strong> {{ databaseSuccess ? '数据已成功保存' : errorMessage }}
                </p>
              </div>
            </transition>
          </div>

          <!-- 长安链上链状态 -->
          <!-- 长安链状态显示 -->
          <div class="modal-section" v-show="!loadingDatabase">
            <transition name="fade" mode="out-in" appear>
              <div v-if="!loadingBlockchain" key="blockchainResult">
                <el-icon v-if="blockchainSuccess" class="success-icon">
                  <check />
                </el-icon>
                <el-icon v-else class="error-icon">
                  <close />
                </el-icon>
                <p :class="{ 'success-text': blockchainSuccess, 'error-text': !blockchainSuccess }">
                  <strong>长安链返回信息:</strong> {{ blockchainResponseData.message || 'Mint 接口调用完成，但状态未知' }}
                </p>
                <p v-if="blockchainSuccess">

                  <strong>Result:</strong> {{ blockchainResponseData.result }}
                </p>
                <p v-else-if="!blockchainSuccess" class="error-text">
                  Mint 接口调用失败，详细信息请检查返回数据
                </p>
              </div>
            </transition>
          </div>


          <!-- FISCO 链状态 -->


          <template v-slot:footer>
            <span class="dialog-footer">
              <el-button @click="closeUnifiedModal">关闭</el-button>
            </span>
          </template>
        </el-dialog>







        <!-- 哈希值成功模态框 (最上层) -->
        <div v-if="showHashSuccess" class="modal hash-modal">
          <div class="modal-content">
            <h3>获取哈希值成功</h3>
            <div class="hash-container">
              <p><strong>文件哈希值:</strong></p>
              <div class="hash-value">
                {{ hashValue }}
                <button @click="copyHash">复制</button>
              </div>
            </div>
            <div class="form-group centered-button">
              <button @click="closeHashSuccess">确认</button>
            </div>
          </div>
        </div>


        <!-- 成功传入数据库模态框 (第二层) -->
        <div v-if="showDatabaseSuccess" class="modal database-modal">
          <div class="modal-content centered">
            <h3>传入数据库成功</h3>
            <div class="form-group centered-button">
              <button @click="closeDatabaseSuccess">确认</button>
            </div>
          </div>
        </div>


        <!-- 哈希生成失败弹窗 -->
        <div v-if="showHashError" class="modal">
          <div class="modal-content">
            <h3>哈希生成失败</h3>
            <p>无法生成文件哈希值。</p>
            <div class="form-group centered-button">
              <button @click="cancelHashError" style="margin-right: 20px;">取消</button>
              <button @click="stillSave">仍然传入数据库</button>
            </div>
          </div>
        </div>

        <!-- 数据库保存失败弹窗 -->
        <div v-if="showSaveError" class="modal">
          <div class="modal-content">
            <h3>保存失败</h3>
            <p>{{ errorMessage }}</p>
            <div class="form-group centered-button">
              <button @click="cancelSaveError" style="margin-right: 20px;">取消</button>
              <button @click="retrySave">重试</button>
            </div>
          </div>
        </div>

        <!-- 错误提示模态框 -->
        <div v-if="showError" class="modal">
          <div class="modal-content">
            <h3>错误</h3>
            <p>{{ errorMessage }}</p>
            <div class="form-group centered-button">
              <button @click="closeError">关闭</button>
            </div>
          </div>
        </div>
      </div>
      <!-- 区块链响应显示模态框 (第三层) -->
      <div v-if="showBlockchainResponse" class="modal blockchain-modal">
        <div class="modal-content">
          <h3>区块链返回信息</h3>
          <p><strong>状态:</strong> {{ blockchainResponseData.message }}</p>
          <p><strong>返回值:</strong> {{ blockchainResponseData.blockchainResponse }}</p>
          <div class="form-group centered-button">
            <button @click="closeBlockchainResponse">关闭</button>
          </div>
        </div>
      </div>

    </div>
  </div>

</template>

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import axios from 'axios'

export default {
  name: 'ChainRegistrationView',
  components: {
    AppHeader,
    AppSidebar
  },
  data() {
    return {
       classifyLoading: false,     // 分类按钮 loading
  gradingLoading: false,      // 分级按钮 loading
  classificationMethods: [
  { label: '类型划分法', value: 'type' },
  { label: '收益法', value: 'income' },
  { label: '流通性划分法', value: 'liquidity' },
  { label: '价值稳定性法', value: 'value-stability' },
  { label: '数据危害性法', value: 'harm' },
  { label: '安全法', value: 'security' },
  { label: '数据敏感法', value: 'sensitivity' },
  { label: '数据脆弱性法', value: 'vulnerability' }
],

gradingMethods: [
  { label: '数据危害性法', value: 'harm' },
  { label: '安全法', value: 'security' },
  { label: '数据敏感法', value: 'sensitivity' },
  { label: '数据脆弱性法', value: 'vulnerability' }
],
  classifyError: '',
  gradingError: '',
  
      username: '',  // 用户名
      userId: '',    // 用户 ID
      form: {
        assetCategory: '',      // 资产类别
  predictedDomain: '',    // 所属领域

        assetName: '',
        assetType: '',
        email: '',
        address: '',
        description: '',
        algorithm: '',
        customAlgorithm: '',
        industry: '',  // 新增行业字段,

        industryRaw: '',      // 你现在 v-model 用了 form.industryRaw，但 data 里没写清楚，建议补上
  industryRawName: '',   // 原始中文名（新增）

        file: null,
        picture: null, // 新增图片字段
        selectedCertificate: '',// 用户选择的证书
        isProxied: false,  // 允许授权的复选框
        quantity: 1,
        isThirdParty: false,
        isSellBody: false,  // 允许出售本体
        isSellReadRight: false,  // 允许出售查阅权
        isSellProcessRight: false,  // 允许出售加工权
        allow_resale: 0,  // 初始为不允许二次交易
        modelSelection: '',
        analysisMethod: '',
analysisResultText: '',
      },

      isQuantityLocked: false, // 控制数量输入框是否可编辑

      certificates: [], // 存储从接口获取的证书列表
      certAddr: '',
      showConfirmation: false,
      showHashSuccess: false,
      showDatabaseSuccess: false,
      showError: false,
      showHashError: false,
      showSaveError: false,
      hashValue: '',
      errorMessage: '',
      saveSuccessMessage: '',// 新增状态变量
      showBlockchainResponse: false, // 控制区块链响应弹窗的显示
      blockchainResponseData: {}, // 用于存储区块链响应数据
      showUnifiedModal: false,
      loadingHash: true,
      hashSuccess: false,
      loadingDatabase: true,
      databaseSuccess: false,
      loadingBlockchain: true,
      blockchainSuccess: false,
      loadingFiscoChain: true,
      fiscoChainSuccess: false,
      fiscoChainResponseData: {},
      transactionOptions: [
        {
          value: 'allow_transaction',
          label: '允许二次交易',
          children: [
            {
              value: 'with_admin',
              label: '经过管理员',
            },
            {
              value: 'without_admin',
              label: '不经过管理员',
            },
          ],
        },
      ],
      selectedOptions: [], // 用于存储级联选择器的值
      selectedRegionOptions: [], // 用户选择的省市区
      regionData: [
        // 示例数据，实际使用时可以从后端接口获取
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
        },
        {
          value: 'jiangsu',
          label: '江苏省',
          children: [
            {
              value: 'nanjing',
              label: '南京市',
              children: [
                { value: 'jianye', label: '建邺区' },
                { value: 'qinhuai', label: '秦淮区' }
              ]
            }
          ]
        }
      ],
      cascaderProps: {
        expandTrigger: 'hover', // 鼠标悬停时展开子菜单
        checkStrictly: false, // 级联选择时必须选中父节点
        emitPath: true // 返回完整的路径数组
      },
      transactionStartTime: null, // 新增资产交易时间字段
      transactionEndTime: null,
      startTimePickerOptions: {}, // 动态生成
      endTimePickerOptions: {}   // 动态生成
    }
  },
  watch: {
    'form.industryRaw': function () {
    this.handleIndustryChange();  // ✅ 统一在这里做映射 + 证书 + 数量锁定
  },
    transactionStartTime(newVal) {
      this.startTimePickerOptions = {}; // 清空限制
      if (newVal) {
        this.endTimePickerOptions = {
          selectableRange: `${newVal}:00:00 - 23:59:00`
        };
      } else {
        this.endTimePickerOptions = {};
      }
    }
  },
  mounted() {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = this.parseJwt(token);
      this.username = decodeURIComponent(payload.username); // 获取并设置用户名
      console.log('当前登录用户名:', this.username);

      // 向后端请求获取用户ID
      this.fetchUserId(this.username);
      if (this.form.industryRaw) {
    this.handleIndustryChange();
  }
    }
  },

  methods: {

    getIndustryRawName(raw) {
  const map = {
    //NY: '能源',
    //DL: '电力',
    TZ: '碳证交易',
    //JT: '交通出行',
    //YL: '医疗健康',
    ZX: '征信',
    //JR: '金融',
    SZ: '数字版权',
    ZD: '自动驾驶',
    CL: '车联网',
    //WH: '文化',
    FL: '法律',
    A01: '农、林、牧、渔业',
    B02: '采矿业',
    C03: '制造业',
    D04: '电力、热力、燃气及水生产和供应业（能源电力）',
    E05: '建筑业',
    F06: '批发和零售业',
    G07: '交通运输、仓储和邮政业（交通出行）',
    H08: '住宿和餐饮业',
    I09: '信息传输、软件和信息技术服务业',
    J10: '金融业（金融）',
    K11: '房地产业',
    L12: '租赁和商务服务业',
    M13: '科学研究和技术服务业',
    N14: '水利、环境和公共设施管理业',
    O15: '居民服务、修理和其他服务业',
    P16: '教育',
    Q17: '卫生和社会工作（医疗健康）',
    R18: '文化、体育和娱乐业（文化）',
    S19: '公共管理、社会保障和社会组织',
    T20: '国际组织',
  };
  return map[raw] || raw || '未知';
},


    mapIndustryTo3(raw) {
  // 文化/能源/电力：保持不变（WH/NY/DL）
  //if (raw === 'WH' || raw === 'NY' || raw === 'DL') return raw;

  // 碳证 -> 能源
  //if (raw === 'TZ') return 'NY';

   const divisibleRawSet = new Set([
    'A01','B02','C03','D04','E05','F06','G07','H08','I09','J10',
    'K11','L12','M13','N14','O15','Q17','R18','S19'
  ]);
const indivisibleRawSet = new Set([
  'P16','R18','T20'
]);

if (indivisibleRawSet.has(raw)) return 'WH';
  if (divisibleRawSet.has(raw)) return 'NY';

  return 'WH';
},

    handleIndustryChange() {
      
  // 1) 原始值
  const raw = this.form.industryRaw;

  // ✅ 新增：记录原始中文名
  this.form.industryRawName = this.getIndustryRawName(raw);

  // 2) 映射成三类（WH/NY/DL）
  this.form.industry = this.mapIndustryTo3(raw);

  // 3) 证书逻辑
  this.fetchCertificates(this.form.industry);

  // 4) 数量锁定：只有 WH 不可分割
  if (this.form.industry === 'WH') {
    this.isQuantityLocked = true;
    this.form.quantity = 1;
  } else {
    this.isQuantityLocked = false;
  }
},



       // 根据资产领域获取证书
    async fetchCertificates(industry) {
      try {
        console.log("选择的资产领域:", industry); // 校验用户选择的领域
        let response;
        // 判断是否为可分割资产
        if (this.isDivisibleIndustry(industry)) {
          // 可分割资产，调用get-certificates2接口
          console.log("调用 get-certificates2 接口");
          response = await axios.post('http://10.112.47.214:3000/api/get-certificates2', {
            userId: this.userId,
          });
        } else {
          // 不可分割资产，调用get-certificates接口
          console.log("调用 get-certificates 接口");
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
    },



    async getCertAddr(selectedCert) { 
  try {
    // 打印 selectedCert 和证书路径，确保路径正确
    console.log("选中的证书:", selectedCert);

    // 根据资产领域判断选择的证书路径
    let certPath;
    if (this.isDivisibleIndustry(this.form.industry)) {
      // 可分割资产，使用 wx-org2
      certPath = `/home/super/r/GoSDK/crypto-config/wx-org2.chainmaker.org/user/${selectedCert}/${selectedCert}.sign.crt`;
      console.log("使用可分割资产证书路径:", certPath);
    } else {
      // 不可分割资产，使用 wx-org1
      certPath = `/home/super/r/GoSDK/crypto-config/wx-org1.chainmaker.org/user/${selectedCert}/${selectedCert}.sign.crt`;
      console.log("使用不可分割资产证书路径:", certPath);
    }

    // 请求获取证书地址
    const response = await axios.post('http://10.112.47.214:9092/cert-to-addr', { cert_path: certPath });

    if (response.status === 200 && response.data.ethereum.address) {
      this.certAddr = response.data.ethereum.address;
      console.log("成功获取证书地址:", this.certAddr);
      return response.data.ethereum.address;
    } else {
      console.error('获取地址失败:', response.data);
      throw new Error('证书地址获取失败');
    }
  } catch (error) {
    console.error('请求地址时发生错误:', error);
    throw new Error('请求证书地址失败，请检查网络连接或服务器状态。');
  }
},


    async postToFiscoChain() {
      // Prepare data to send to the FISCO chain
      const fiscoData = {
        key: this.hashValue, // Use the file hash as the key
        value: this.form.assetName, // Use the asset name as the value
      };

      try {
        const response = await axios.post('10.129.186.227:8080/store', fiscoData);
        if (response.status === 200) {
          this.fiscoChainResponseData = response.data;
          this.fiscoChainSuccess = true;
        } else {
          this.fiscoChainSuccess = false;
          this.errorMessage = `FISCO Chain 请求失败，服务器返回错误状态码：${response.status}`;
        }
      } catch (error) {
        this.fiscoChainSuccess = false;
        this.errorMessage = 'FISCO Chain 请求失败，请检查网络连接或服务器状态。';
      } finally {
        this.loadingFiscoChain = false;
      }
    }
    ,

    async setDynamicCert() {
  try {
    const response = await axios.post('http://10.112.47.214:8848/pre/DynamicCertConfig', {
      clientName: 'client1',
      orgName: 'wx-org1.chainmaker.org'
    });

    if (response.status === 200) {
      console.log('动态证书配置成功:', response.data);
      return true;
    } else {
      console.error('动态证书配置失败:', response.data);
      return false;
    }
  } catch (error) {
    console.error('调用 DynamicCertConfig API 时发生错误:', error);
    return false;
  }
},
    closeHashSuccess() {
      this.showHashSuccess = false;
      // 如果哈希成功后接着要显示数据库传入成功
      this.showDatabaseSuccess = true;
    },
    closeDatabaseSuccess() {
      this.showDatabaseSuccess = false;
      // 如果数据库传入成功后接着要显示区块链响应
      this.showBlockchainResponse = true;
    },
    closeBlockchainResponse() {
      this.showBlockchainResponse = false;
      this.blockchainResponseData = {}; // 清空区块链响应数据
    },
    handleFileChange(event) {
      this.form.file = event.target.files[0];
    },
    handlePictureChange(event) {
      this.form.picture = event.target.files[0];  // 处理图片上传
      console.log(this.form.picture);  // 打印图片信息
    },
    handleTransactionChange(value) {
  if (value && value.length === 2) {
    const transactionType = value[0]; // 例如 'allow_transaction'
    const adminOption = value[1]; // 例如 'with_admin' 或 'without_admin'

    if (transactionType === 'allow_transaction') {
      // 如果选择 'with_admin'，则允许二次交易，设置为 1
      this.form.allow_resale = adminOption === 'with_admin' ? 1 : 0;
    }
  } else {
    this.form.allow_resale = 0;  // 默认不允许二次交易
  }
},
    async handleRegionChange(value) {
      if (value.length !== 3) {
      this.$message.warning('请完整选择省、市、区');
      return;
    }
    console.log('用户选择的地区:', value);


     const isDynamicCertSet = await this.setDynamicCert();
  if (!isDynamicCertSet) {
    this.$message.error('动态证书配置失败，无法继续操作');
    return; // 如果证书配置失败，终止后续操作
  }

    // 将交易地点作为字符串数组传递
    const transactionLocation = `${value[0]}-${value[1]}-${value[2]}`;

    // 调用后端接口，将交易地点以数组的形式发送
    try {
      const response = await axios.post('http://10.112.47.214:8848/pre/SetAllowedLocations', {
        allowedLocations: [transactionLocation]  // 将交易地点作为字符串数组
      });

      // 打印响应数据到控制台
      console.log('交易响应数据:', response);

      // 处理响应
      if (response.status === 200 && response.data.code === 0) {
        this.$message.success('交易地点设置成功');
        console.log('智能合约调用成功');
      } else {
        this.$message.error('设置交易地点失败');
        console.log('智能合约调用失败:', response.data.message);
      }
    } catch (error) {
      console.error('请求 SetAllowedLocations 时出错:', error);
      this.$message.error('请求失败，请检查网络或稍后再试');
    }
  },
    parseJwt(token) {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    },
    async fetchUserId(username) {
      try {
        const response = await axios.post('http://10.112.47.214:3000/api/get-user-id', { username });
        if (response.status === 200 && response.data.id) {
          this.userId = response.data.id;  // 成功获取 user_id
          console.log('获取的用户ID:', this.userId);
        } else {
          console.error('获取用户ID失败:', response.data);
          this.showError = true;
          this.errorMessage = '获取用户ID失败，请稍后重试。';
        }
      } catch (error) {
        console.error('请求用户ID时发生错误:', error);
        this.showError = true;
        this.errorMessage = '获取用户ID失败，服务器不可用。';
      }
    },

async openConfirmation() {
  const isDynamicCertSet = await this.setDynamicCert();

  if (!isDynamicCertSet) {
    this.showError = true;
    this.errorMessage = '动态证书配置失败，无法继续操作。';
    return;
  }

  if (
    !this.form.assetName ||
    !this.form.description ||
    !this.form.algorithm ||
    (this.form.algorithm === 'OTHER' && !this.form.customAlgorithm) ||
    !this.form.file ||
    !this.form.picture ||
    !this.form.industry
  ) {
    this.showError = true;
    this.errorMessage = '请填写所有必填字段。';
    return;
  }

  // ✅ 新的一体化分类分级方法
  if (!this.form.analysisMethod) {
    this.showError = true;
    this.errorMessage = '请选择分类分级方法。';
    return;
  }

  // ✅ 一体化接口返回后，assetCategory 存 classification，assetType 存 grade
  if (!this.form.assetCategory || !this.form.assetType) {
    this.showError = true;
    this.errorMessage = '请先点击“分类分级”按钮生成资产类别和资产等级。';
    return;
  }

  if (!this.form.industry) {
    this.showError = true;
    this.errorMessage = '请选择资产领域。';
    return;
  }

  if (this.transactionStartTime && !this.transactionEndTime) {
    this.showError = true;
    this.errorMessage = '如果设置了开始时间，必须设置结束时间。';
    return;
  }

  if (!this.transactionStartTime && this.transactionEndTime) {
    this.showError = true;
    this.errorMessage = '如果设置了结束时间，必须设置开始时间。';
    return;
  }

  try {
    // 如果你希望交易时间不是必填，可以用这个判断
    if (this.transactionStartTime && this.transactionEndTime) {
      await this.saveTradingTime();
      console.log('交易时间已成功设置');
    }

    this.showConfirmation = true;
  } catch (error) {
    console.error('交易时间设置失败:', error);
    this.showError = true;
    this.errorMessage = '交易时间设置失败，请检查输入';
  }
},

async confirmForm() {
  this.showUnifiedModal = true; // 显示统一模态框
  this.loadingHash = true; // 开始哈希值生成流程

  // 生成文件哈希值
  const formData = new FormData();
  formData.append('file', this.form.file);
  formData.append('algorithm', this.form.algorithm);

  console.log('选中的证书名称:', this.form.selectedCertificate); // 输出 selectedCertificate 的值

  // 调用获取证书地址的方法
  await this.getCertAddr(this.form.selectedCertificate);

  // 检查是否成功获取到证书地址
  if (!this.certAddr) {
    console.error("未能成功获取证书地址，无法执行 Mint 接口调用");
    this.showError = true;
    this.errorMessage = '无法获取证书地址，请检查证书选择或网络连接';
    this.showUnifiedModal = false; // 隐藏统一模态框
    return; // 中止后续流程
  }

  try {
    const response = await axios.post('/api/generate-hash', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    // 检查响应是否包含所需的字段
    if (response.status === 200 && response.data && response.data.hash) {
      this.hashValue = response.data.hash; // 成功生成哈希值
      this.hashSuccess = true;
    } else {
      throw new Error(`哈希生成失败，状态码：${response.status}`);
    }
  } catch (error) {
    console.error('哈希生成错误:', error);
    this.hashSuccess = false;
    this.hashValue = '未生成哈希值'; // 设置默认值，继续后续流程
    this.errorMessage = error.message || '哈希生成失败，请检查网络连接。';
  } finally {
    this.loadingHash = false;
  }

  // 如果哈希生成失败，中断后续流程
  if (!this.hashSuccess) {
    this.loadingBlockchain = false;
    this.loadingDatabase = false;
    return;
  }

  // 调用 saveToChainmaker() 方法，处理 Mint 接口和 IssueAsset 接口逻辑
  this.loadingBlockchain = true; // 开始区块链操作流程
  this.loadingDatabase = true; // 开始数据库保存流程

  try {
    // 并行处理数据库保存和区块链操作
    const [databaseResponse, chainmakerResponse] = await Promise.all([
      this.saveToDatabase(), // 保存到数据库
      this.saveToChainmaker(), // 调用 Mint 和 IssueAsset
    ]);

    // 数据库保存结果处理
    if (databaseResponse.status === 201) {
      this.databaseSuccess = true;
    } else {
      this.databaseSuccess = false;
      this.errorMessage = `数据库保存失败：${databaseResponse.message}`;
    }

    // 区块链调用结果处理（显示 Mint 的结果）
    if (chainmakerResponse.code === 0) {
      this.blockchainSuccess = true;
      this.blockchainResponseData = chainmakerResponse;
    } else {
      this.blockchainSuccess = false;
      this.errorMessage = `Mint 接口调用失败：${chainmakerResponse.message}`;
    }
  } catch (error) {
    console.error('操作失败:', error);
    this.databaseSuccess = false;
    this.blockchainSuccess = false;
    this.errorMessage = error.message || '操作失败，请稍后重试。';
  } finally {
    this.loadingBlockchain = false;
    this.loadingDatabase = false;
  }
},

async analyzeAssetCombined() {
  this.classifyError = '';
  this.gradingError = '';

  if (!this.form.file) {
    this.classifyError = '请先选择文件。';
    return;
  }

  if (!this.form.analysisMethod) {
    this.classifyError = '请先选择分类分级方法。';
    return;
  }

  this.classifyLoading = true;

  try {
    const formData = new FormData();
    formData.append('method', this.form.analysisMethod);
    formData.append('input_file', this.form.file);

    const response = await axios.post(
      'http://10.112.47.214:3000/api/asset-analysis/combined',
      formData,
      { timeout: 300000 }
    );

    if (!response.data || response.data.success !== true) {
      throw new Error(response.data?.message || '分类分级失败');
    }

    const entries = response.data.entries || [];
    const first = entries[0] || {};

    const classification = first.classification || response.data.classification || '';
    const grade = first.grade || response.data.grade || '';

    if (!classification || !grade) {
      throw new Error('分类分级结果为空');
    }

    this.form.assetCategory = classification;
    this.form.assetType = grade;
    this.form.analysisResultText = `资产类别：${classification}；资产等级：${grade}`;

    // 可选：同步实际使用的方法
    this.form.classificationMethod = response.data.classification_method_code || '';
    this.form.gradingMethod = response.data.grading_method_code || '';

    this.$message?.success(`分类分级完成：${classification} / ${grade}`);
  } catch (error) {
    console.error('分类分级失败:', error);
    this.classifyError =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      '分类分级失败，请检查服务是否正常。';

    this.form.assetCategory = '';
    this.form.assetType = '';
    this.form.analysisResultText = '';
  } finally {
    this.classifyLoading = false;
  }
},


async gradeAssetLevel() {
  this.gradingError = '';

  if (!this.form.file) {
    this.gradingError = '请先选择文件。';
    return;
  }

  if (!this.form.gradingMethod) {
    this.gradingError = '请先选择分级方法。';
    return;
  }

  this.gradingLoading = true;

  try {
    const formData = new FormData();
    formData.append('method', this.form.gradingMethod);
    formData.append('input_file', this.form.file);

    const response = await axios.post(
      'http://10.112.47.214:3000/api/asset-analysis/grade',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000
      }
    );

    if (!response.data || response.data.success !== true) {
      throw new Error(response.data?.message || '分级失败');
    }

    const entries = response.data.entries || [];
    const first = entries[0] || {};
    const grade = first.grade || response.data.grade || '';

    if (!grade) {
      throw new Error('分级结果为空');
    }

    this.form.assetType = grade;
    this.$message?.success(`分级完成：${grade}`);
  } catch (error) {
    console.error('分级失败:', error);
    this.gradingError =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      '分级失败，请检查服务是否正常。';

    this.form.assetType = '';
  } finally {
    this.gradingLoading = false;
  }
},

async saveTradingTime() {
  if (this.transactionStartTime && this.transactionEndTime) {
    // 格式化时间为 yyyy-mm-dd HH:mm:ss，补全为标准格式
    const today = new Date().toISOString().split('T')[0]; // 获取今天的日期 yyyy-mm-dd

    // 将用户选择的时间添加到今天的日期中
    const startDateTimeString = `${today} ${this.transactionStartTime}`;
    const endDateTimeString = `${today} ${this.transactionEndTime}`;

    // 转换为 Date 对象
    const startTime = new Date(startDateTimeString);
    const endTime = new Date(endDateTimeString);

    // 检查转换后的时间是否有效
    if (isNaN(startTime) || isNaN(endTime)) {
      this.$message.error('请输入有效的开始时间和结束时间');
      return;
    }

    // 转换为时间戳
    const startTimeStamp = startTime.getTime();
    const endTimeStamp = endTime.getTime();

    console.log("Sending startTime:", startTimeStamp, "endTime:", endTimeStamp);

    if (startTimeStamp && endTimeStamp && startTimeStamp < endTimeStamp) {
      try {
        const response = await axios.post('http://10.112.47.214:8848/pre/SetTradingTime', {
          startTime: startTimeStamp, // 毫秒级时间戳
          endTime: endTimeStamp      // 毫秒级时间戳
        });

        if (response.status === 200 && response.data.code === 0) {
          console.log('交易时间设置成功');
        } else {
          throw new Error(`交易时间设置失败: ${response.data.message}`);
        }
      } catch (error) {
        console.error('调用 SetTradingTime 接口时出错:', error);
        this.$message.error('交易时间设置失败，请稍后重试');
      }
    } else {
      this.$message.error('开始时间必须小于结束时间');
    }
  } else {
    this.$message.error('请填写完整的交易时间');
  }
}
,



    closeUnifiedModal() {
      this.showUnifiedModal = false;
      this.loadingHash = this.loadingDatabase = this.loadingBlockchain = this.loadingFiscoChain = false;
      this.hashSuccess = this.databaseSuccess = this.blockchainSuccess = this.fiscoChainSuccess = false;
      this.hashValue = '';
      this.errorMessage = '';
      this.blockchainResponseData = {};
      this.fiscoChainResponseData = {};
      this.showConfirmation = false;
    }

    ,
    async saveToDatabase() {
      const formData = new FormData();

      formData.append('assetName', this.form.assetName);
      formData.append('assetType', this.form.assetType);
      formData.append('email', this.form.email);
      formData.append('address', this.form.address);
      formData.append('owner_address', String(this.certAddr) || ''); // 确保它是字符串
      // 使用获取的证书地址
      formData.append('description', this.form.description);
      formData.append('algorithm', this.form.algorithm === 'OTHER' ? this.form.customAlgorithm : this.form.algorithm);
      formData.append('customAlgorithm', this.form.customAlgorithm || null);
      formData.append('fileHash', this.hashValue);
      formData.append('industry', this.form.industry);

      formData.append('industry_raw', this.form.industryRaw);      // A01...T20 / TZ... 等
      formData.append('industry_raw_name', this.form.industryRawName);

      formData.append('asset_category', this.form.assetCategory || '');
      formData.append('predicted_domain', '');
      
      formData.append('picture', this.form.picture);
      formData.append('user_id', this.userId);
      formData.append('is_proxied', this.form.isProxied ? '1' : '0');
      formData.append('number', this.form.quantity);
      formData.append('can_sell_asset', this.form.isSellBody ? '1':'0');
      formData.append('can_sell_process', this.form.isSellProcessRight ? '1':'0');
      formData.append('can_sell_view', this.form.isSellReadRight ? '1':'0');
      formData.append('allow_resale', this.form.allow_resale); // 将 allow_resale 传递到后端
      formData.append('model_selection', this.form.modelSelection);


      // 打印 formData 中的内容，转换为对象形式
      const formDataObj = {};
      formData.forEach((value, key) => {
        formDataObj[key] = value;
      });
      console.log('发送到后端的参数:', formDataObj);  // 打印所有发送到后端的数据


      try {
        const response = await axios.post('http://10.112.47.214:3000/api/save-asset2', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        // 检查响应是否包含正确的返回数据
        if (response.status === 201 && response.data && response.data.message) {
          this.databaseSuccess = true;
          this.errorMessage = '';  // 清除错误信息
          return response; // 返回成功响应
        } else {
          this.databaseSuccess = false;
          this.errorMessage = `保存失败，服务器返回错误状态码：${response.status}`;
          return response; // 返回失败响应
        }
      } catch (error) {
        console.error('请求错误:', error);
        this.databaseSuccess = false;

        // 文件重复错误检查
        if (error.response && error.response.status === 409) {
          this.errorMessage = '传入重复文件，保存数据失败';
        } else {
          this.errorMessage = `保存失败：${error.message}`;
        }

        // 返回错误响应数据
        return { status: error.response ? error.response.status : 500, data: { message: this.errorMessage } };
      } finally {
        this.loadingDatabase = false;
        this.loadingBlockchain = false;
      }
    }
    ,


    /*isDivisibleIndustry(industry) {
    const indivisibleIndustries = ['DL', 'TZ', 'JT', 'YL', 'ZX', 'JR']; // 不可分割的行业
    return !indivisibleIndustries.includes(industry);  // 如果不在不可分割列表中，则为可分割
  },*/
  isDivisibleIndustry(industry) {
  // ✅ 只有 WH 不可分割，其它都可分割
  return industry !== 'WH';
},


  async saveToChainmaker() { 
  console.log('表单数据:', this.form); // 检查表单数据

  const chainType = this.isDivisibleIndustry(this.form.industry) ? 'divisible' : 'indivisible';
  console.log('上链类型:', chainType);  // 打印判断的上链类型

  // 准备 Mint 或 En-Mint 接口的请求体
  const payload = {
    // 对于 En-Mint，传入的参数只需要 from 和 amount
    from: this.certAddr, // 使用证书地址作为 from
    amount: this.form.quantity.toString(), // 使用数量作为 amount
  };

  try {
    let response;

    // 处理交易地点
    let allowedLocations = [];
    if (this.selectedRegionOptions && this.selectedRegionOptions.length === 3) {
      // 如果用户选择了交易地点，则加入 allowedLocations
      allowedLocations = [{
        province: this.selectedRegionOptions[0],  // 省
        city: this.selectedRegionOptions[1],      // 市
        district: this.selectedRegionOptions[2],  // 区
      }];
    }

    // 创建 Mint 接口的请求体
    const mintPayload = {
      to: this.certAddr, // 接收方地址
      tokenId: this.hashValue, // 使用文件哈希值作为 tokenId
      categoryName: this.form.industry, // 使用行业作为分类名称
      metadata: {
        assetName: this.form.assetName,
        assetType: this.form.assetType,
        assetCategory: this.form.assetCategory,
        email: this.form.email,
        address: this.form.address,
        description: this.form.description,
        algorithm: this.form.algorithm === 'OTHER' ? this.form.customAlgorithm : this.form.algorithm, // 使用自定义算法（如果有）
        customAlgorithm: this.form.customAlgorithm || '', // 如果没有选择其他算法，填充为空字符串
        picture: this.form.picture ? this.form.picture : '', // 确保有文件时传递路径
        isProxied: this.form.isProxied,
        number: this.form.quantity, // 数量
         modelSelection: this.form.modelSelection,
         
        allowedLocations: allowedLocations.length ? allowedLocations : undefined, // 如果有交易地点则传入，没选则不传
      }
    };

    // 打印 mintPayload 数据
    console.log("准备发送给后端的 mintPayload 数据:", mintPayload);

    // 动态证书配置



    // 根据上链类型选择不同的接口
    if (chainType === 'divisible') {
      // 可分割的，调用 En-Mint 接口
      response = await axios.post('http://10.112.47.214:8848/pre/En-Mint', payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } else {
      // 不可分割的，调用 Mint 接口
      response = await axios.post('http://10.112.47.214:8848/pre/Mint', mintPayload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    console.log("Mint 或 En-Mint 接口响应:", response.data);

    if (response.status === 200 && response.data.code === 0) {
      this.chainMakerSuccess = true;

      const translatedMessage = response.data.message === 'success' ? '成功' : response.data.message;

      // 更新前端显示的数据，仅显示 Mint 或 En-Mint 的返回结果
      this.blockchainResponseData = {
        ...response.data,
        message: translatedMessage, // 更新返回信息为中文
      };

      return this.blockchainResponseData; // 返回成功响应
    } else {
      this.chainMakerSuccess = false;

      const translatedMessage = response.data.message === 'success' ? '成功' : response.data.message;

      this.blockchainResponseData = {
        ...response.data,
        message: translatedMessage, // 更新返回信息为中文
      };

      this.chainMakerErrorMessage = `接口调用失败，错误码：${response.data.code}, 错误信息：${translatedMessage}`;
      return this.blockchainResponseData; // 返回失败响应
    }
  } catch (error) {
    this.chainMakerSuccess = false;

    if (error.response) {
      const translatedMessage = error.response.data?.message === 'success' ? '成功' : error.response.data?.message || error.message;

      this.blockchainResponseData = {
        code: error.response.status,
        message: translatedMessage, // 翻译错误消息
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
  }
}
,


    retrySave() {
      this.showSaveError = false;
      this.saveToDatabase();
    },
    cancelSaveError() {
      this.showSaveError = false;
    },


    closeError() {
      this.showError = false;
      this.errorMessage = '';
    },
    cancelForm() {
      this.showConfirmation = false;
    },
    resetForm() {
      this.form = {
        assetName: '',
        assetType: '',
        email: '',
        address: '',
        description: '',
        algorithm: '',
        customAlgorithm: '',
        file: null
      };
      this.hashValue = '';
    },
    copyHash() {
      navigator.clipboard.writeText(this.hashValue)
        .then(() => {
          alert('哈希值已复制到剪贴板。');
        })
        .catch(err => {
          console.error('复制失败: ', err);
          alert('无法复制哈希值，请手动复制。');
        });
    },

    validateTimeRange() {
      // 如果有开始时间且没有结束时间
      if (this.transactionStartTime && !this.transactionEndTime) {
        this.$message.error('请选择结束时间');
        return;
      }
      // 如果有结束时间且没有开始时间
      if (this.transactionEndTime && !this.transactionStartTime) {
        this.$message.error('请选择开始时间');
        return;
      }
      // 如果开始时间 >= 结束时间，报错
      if (this.transactionStartTime && this.transactionEndTime) {
        if (this.transactionStartTime >= this.transactionEndTime) {
          this.$message.error('结束时间必须晚于开始时间');
          this.transactionEndTime = null;
        }
      }
    },
    
    // 处理保存交易时间
  

    disabledStartDate(time) {
      return time.getTime() > Date.now();
    },
    disabledStartTime(time) {
      if (this.transactionEndTime) {
        return time.getTime() >= new Date(`1970-01-01T${this.transactionEndTime}:00Z`).getTime();
      }
      return false;
    },
    disabledEndDate(time) {
      return time.getTime() > Date.now();
    },
    disabledEndTime(time) {
      if (this.transactionStartTime) {
        return time.getTime() <= new Date(`1970-01-01T${this.transactionStartTime}:00Z`).getTime();
      }
      return false;
    },
    getMethodLabel(methods, value) {
  const item = methods.find(m => m.value === value);
  return item ? item.label : value;
}
  }

}  
</script>

<style scoped>
:root {
  --label-width: 170px;
  --control-height: 42px;
  --row-gap: 18px;
}

/* =========================
   基础区域
========================= */
body {
  background-color: #F5F6FA;
  margin: 0;
  font-family: Arial, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  overflow: hidden;
}

.chain-registration {
  width: 100%;
  height: 100%;
  max-width: 100vw;
  max-height: 100vh;
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
  padding: 10px 0 10px 30px;
  text-align: left;
  font-size: 24px;
  color: #333;
}

.form-container {
  background: #fff;
  padding: 24px 28px 28px;
  border-radius: 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  margin-top: 20px;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.info-icon {
  width: 20px;
  height: 20px;
  margin-right: 10px;
}

.required-asterisk {
  color: #dc3545;
  margin-right: 6px;
  font-weight: 700;
  user-select: none;
}

/* =========================
   行与组：统一对齐核心
========================= */
.form-row {
  display: flex;
  align-items: center;
  gap: var(--row-gap);
  margin-bottom: 16px;
  width: 100%;
}

.form-group {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  margin-right: 0;
}

.form-group.align-top {
  align-items: flex-start;
}

.form-group label,
.full-width-label {
  width: var(--label-width);
  min-width: var(--label-width);
  max-width: var(--label-width);
  margin-right: 14px;
  text-align: right;
  line-height: var(--control-height);
  white-space: nowrap;
  flex-shrink: 0;
  box-sizing: border-box;
  color: #222;
  font-size: 15px;
  font-weight: 600;
}

.form-group.align-top label {
  line-height: 24px;
  padding-top: 8px;
}

.full-width-label.left-align {
  text-align: right;
}

/* =========================
   输入控件统一
========================= */
.form-group input,
.form-group select,
.form-group textarea {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  color: #333;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  box-sizing: border-box;
}

.form-group input,
.form-group select {
  height: var(--control-height);
}

.form-group textarea {
  min-height: 110px;
  resize: vertical;
  line-height: 1.6;
  padding-top: 10px;
}

input[readonly] {
  background-color: #f5f7fa;
  color: #606266;
  cursor: not-allowed;
}

/* 描述整行 */
.full-width {
  display: flex;
  align-items: flex-start;
  width: 100%;
  margin-right: 0;
}

.description-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* =========================
   分级 / 分类区域
========================= */
.classify-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
}

.classify-inline-group {
  display: flex;
  align-items: center;
  flex: 0 0 110px;
  justify-content: flex-start;
}

.classify-btn {
  min-width: 88px;
  height: 40px;
  padding: 0 18px;
  font-size: 14px;
  border: none;
  background-color: #1677ff;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.classify-btn:hover {
  background-color: #0f5fd6;
}

.classify-btn:disabled {
  background-color: #9bbcf7;
  cursor: not-allowed;
}

.grade-result,
.result-item {
  font-size: 14px;
  color: #333;
  line-height: 40px;
}

.grade-value,
.result-value {
  color: #1677ff;
  font-weight: 700;
  margin-left: 4px;
}

.classify-result-box {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
}

.grade-error {
  margin-top: 8px;
  font-size: 13px;
  color: #dc3545;
}

/* =========================
   单选按钮区域
========================= */
.radio-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 26px;
  min-height: var(--control-height);
  flex: 1;
}

.radio-item {
  display: flex;
  align-items: center;
  margin-right: 0;
}

.radio-item input[type="radio"] {
  width: auto;
  height: auto;
  margin-right: 6px;
  flex: none;
}

.radio-group label.radio-label {
  width: auto;
  min-width: auto;
  max-width: none;
  margin-right: 0;
  text-align: left;
  line-height: normal;
  white-space: nowrap;
  font-weight: 500;
}

/* =========================
   按钮
========================= */
.form-group button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  background-color: #007bff;
  color: white;
  border-radius: 6px;
  cursor: pointer;
}

.centered-button {
  display: flex;
  justify-content: center;
  width: 100%;
  margin-top: 8px;
}

.centered-button button {
  min-width: 96px;
  height: 42px;
  padding: 0 24px;
}

/* =========================
   复选框区域
========================= */
.checkbox-container {
  display: flex;
  align-items: center;
  margin-top: 15px;
}

.checkbox-container input[type="checkbox"] {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid #007bff;
  border-radius: 4px;
  background-color: #fff;
  position: relative;
  cursor: pointer;
  transition: background-color 0.3s, border-color 0.3s;
}

.checkbox-container input[type="checkbox"]:checked {
  background-color: #007bff;
  border-color: #007bff;
}

.checkbox-container input[type="checkbox"]:checked::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 8px;
  height: 8px;
  background-color: #fff;
  border-radius: 2px;
}

.checkbox-container input[type="checkbox"]:not(:checked) {
  background-color: #fff;
  border-color: #ccc;
}

.checkbox-label {
  font-size: 14px;
  color: #333;
  margin-left: 10px;
  cursor: pointer;
  font-weight: normal;
}

.checkbox-container input[type="checkbox"]:hover {
  border-color: #0056b3;
}

.checkbox-container input[type="checkbox"]:focus {
  outline: none;
  border-color: #0056b3;
  box-shadow: 0 0 5px rgba(0, 91, 255, 0.5);
}

/* =========================
   弹窗
========================= */
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
  width: 80%;
  max-width: 500px;
  min-height: 180px;
  text-align: center;
}

.modal-content select {
  width: 100%;
  padding: 10px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.hash-modal {
  z-index: 1030;
}

.database-modal {
  z-index: 1020;
}

.blockchain-modal {
  z-index: 1010;
}

.modal-content h3 {
  margin-top: 0;
}

.modal-content p {
  text-align: left;
  margin: 10px 0;
}

.modal-content.centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.form-group.centered-button {
  margin-top: 20px;
}

.modal-section {
  margin: 20px 0;
  padding: 10px;
  border-top: 1px solid #eee;
}

.loading-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  color: #007bff;
}

.success-icon {
  color: #28a745;
  margin-right: 5px;
}

.error-icon {
  color: #dc3545;
  margin-right: 5px;
}

.success-text {
  color: #28a745;
}

.error-text {
  color: #dc3545;
}

/* =========================
   哈希展示
========================= */
.hash-value {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  word-break: break-all;
  overflow-x: auto;
  white-space: nowrap;
  background-color: #f9f9f9;
  padding: 10px;
  border-radius: 4px;
  position: relative;
  font-family: monospace;
}

.hash-value::-webkit-scrollbar {
  height: 8px;
}

.hash-value::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

.hash-value button {
  margin-left: 10px;
  padding: 5px 10px;
  font-size: 12px;
  border: none;
  background-color: #28a745;
  color: white;
  border-radius: 4px;
  cursor: pointer;
}

.hash-value button:hover {
  background-color: #218838;
}

/* =========================
   Element Plus 组件统一高度
========================= */
:deep(.el-input),
:deep(.el-cascader),
:deep(.el-time-picker) {
  width: 100%;
}

:deep(.el-input__wrapper) {
  min-height: var(--control-height);
  box-sizing: border-box;
}

:deep(.el-input__inner) {
  height: calc(var(--control-height) - 2px);
  line-height: calc(var(--control-height) - 2px);
}

:deep(.el-cascader .el-input__wrapper) {
  min-height: var(--control-height);
}

:deep(.el-checkbox) {
  display: flex;
  align-items: center;
  min-height: var(--control-height);
  line-height: var(--control-height);
}

:deep(.el-checkbox__label) {
  font-size: 14px;
  color: #333;
}

:deep(.el-time-editor.el-input),
:deep(.el-cascader),
:deep(.el-input) {
  vertical-align: middle;
}

/* =========================
   二次交易 / 地点 / 时间设置这一块
========================= */
.cascader-container {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px 18px;
}

.cascader-container > .full-width-label {
  width: auto;
  min-width: auto;
  max-width: none;
  margin-right: 6px;
  text-align: left;
  line-height: var(--control-height);
}

.cascader-container :deep(.el-cascader),
.cascader-container :deep(.el-time-picker) {
  width: 190px;
}

.cascader-container .form-group.full-width {
  width: auto;
  flex: 0 0 auto;
  align-items: center;
}

/* =========================
   响应式
========================= */
@media (max-width: 1400px) {
  .form-row {
    flex-wrap: wrap;
  }

  .form-group {
    flex: 1 1 100%;
  }

  .classify-inline-group {
    flex: 1 1 100%;
    padding-left: calc(var(--label-width) + 14px);
  }
}

@media (max-width: 900px) {
  .form-group,
  .full-width {
    flex-direction: column;
    align-items: stretch;
  }

  .form-group label,
  .full-width-label {
    width: 100%;
    min-width: 100%;
    max-width: 100%;
    margin-right: 0;
    margin-bottom: 8px;
    text-align: left;
    line-height: 1.5;
  }

  .classify-inline-group {
    padding-left: 0;
  }
}
</style>
