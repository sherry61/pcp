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
  <!-- 数字标识选择 -->
  <div class="form-group">
    <label class="full-width-label left-align">
      <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
      数字标识选择
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
        <input type="radio" id="fingerprint" value="FINGERPRINT" v-model="form.algorithm" />
        <label for="fingerprint" class="radio-label">数字指纹</label>
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

            <div class="form-row">
              <div class="form-group">
                <label for="file">
                  <span class="required-asterisk" title="必填：用于生成资产元数据名称。">*</span>
                  选择文件
                </label>
                <input type="file" id="file" @change="handleFileChange" required />
              </div>
            </div>
<!-- 资产领域：放到分类分级上面 -->
<div class="form-row">
  <div class="form-group">
    <label for="industry">
      <span class="required-asterisk">*</span>
      资产领域
    </label>
    <select
      id="industry"
      v-model="form.industryRaw"
      @change="handleIndustryChange"
      required
    >
      <option value="">请选择行业</option>
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

<!-- 分类分级：先方法，再结果 -->
<div class="form-row">
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

  <div class="form-group classify-inline-group">
    <button
      type="button"
      class="classify-btn"
      @click="analyzeAssetCombined"
      :disabled="classifyLoading || !form.analysisMethod"
    >
      {{ classifyLoading ? '分类中...' : '分类分级' }}
    </button>
  </div>
</div>

          
<!-- 资产估值 -->
<div class="form-row">
  <div class="form-group">
    <label for="asset-price">
      资产估值
    </label>
    <input
      type="number"
      id="asset-price"
      v-model.number="form.price"
      min="0"
      step="0.01"
      placeholder="可手动填写，也可点击估值计算"
    />
  </div>

  <div class="form-group classify-inline-group">
    <button
      type="button"
      class="classify-btn"
      @click="openValuationModal"
    >
      估值计算
    </button>
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
                <el-checkbox v-model="form.isSellBody">允许出售持有权</el-checkbox>
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
              <!--<label class="full-width-label left-align">资产交易地点设置</label>
              <el-cascader v-model="selectedRegionOptions" :options="regionData" :props="cascaderProps"
                @change="handleRegionChange" placeholder="请选择资产交易地点" clearable />
              <div class="form-group full-width">
                <label class="full-width-label left-align">资产交易时间设置</label>
                <el-time-picker  v-model="transactionStartTime" placeholder="开始时间"
                  :picker-options="startTimePickerOptions" @change="validateTimeRange" :clearable="true"
                  :editable="false" :arrow-control="false" :format="'HH:mm:ss'" :value-format="'HH:mm:ss'"
                  :picker-type="'time'" :use-12h="false" :is-range="false" :start-placeholder="'Start Time'"
                  :end-placeholder="'End Time'" :range-separator="'至'" :popper-class="'time-picker-popper'"
                  :prefix-icon="'el-icon-time'" :clear-icon="'el-icon-circle-close'" :disabled-date="disabledStartDate"
                  :disabled-time="disabledStartTime" :align="left" :popper-append-to-body="true" :transfer="true"
                  :popper-options="{ boundariesElement: 'body' }" :scroll-to-option="true" />
                <el-time-picker v-model="transactionEndTime" placeholder="结束时间"
                  :picker-options="endTimePickerOptions" @change="validateTimeRange" :clearable="true"
                  :editable="false" :arrow-control="false" :format="'HH:mm:ss'" :value-format="'HH:mm:ss'"
                  :picker-type="'time'" :use-12h="false" :is-range="false" :start-placeholder="'Start Time'"
                  :end-placeholder="'End Time'" :range-separator="'至'" :popper-class="'time-picker-popper'"
                  :prefix-icon="'el-icon-time'" :clear-icon="'el-icon-circle-close'" :disabled-date="disabledEndDate"
                  :disabled-time="disabledEndTime" :align="left" :popper-append-to-body="true" :transfer="true"
                  :popper-options="{ boundariesElement: 'body' }" :scroll-to-option="true" />
              </div> -->


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
            <p><strong>资产估值:</strong> {{ form.price || '未填写' }}</p>
<p><strong>分类方法:</strong> {{ getMethodLabelByOptions(classificationMethods, form.classificationMethod) }}</p>
<p><strong>分级方法:</strong> {{ getMethodLabelByOptions(gradingMethods, form.gradingMethod) }}</p>
            <p><strong>地址:</strong> {{ form.address }}</p>
            <p><strong>数据资产上链登记内容:</strong> {{ form.description }}</p>
            <p><strong>数字标识:</strong> {{ getIdentifierMethodLabel(form.algorithm) }}</p>
            <p><strong>模型选择:</strong> 
  {{ form.modelSelection === 'weighted_average' ? '加权平均' : form.modelSelection }}
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
              <div v-if="loadingHash" key="hashPending">
                <span class="pending-icon">...</span>
                <p class="pending-text">
                  <strong>文件哈希值:</strong> 生成中
                </p>
              </div>
              <div v-else key="hashResult">
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
              <div v-if="loadingDatabase" key="databasePending">
                <span class="pending-icon">...</span>
                <p class="pending-text">
                  <strong>本地数据库状态:</strong> 保存中
                </p>
              </div>
              <div v-else key="databaseResult">
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
              <div v-if="loadingBlockchain" key="blockchainPending">
                <span class="pending-icon">...</span>
                <p class="pending-text">
                  <strong>长安链返回信息:</strong> 上链中
                </p>
              </div>
              <div v-else key="blockchainResult">
                <el-icon v-if="blockchainSuccess" class="success-icon">
                  <check />
                </el-icon>
                <el-icon v-else-if="hasDefinitiveBlockchainFailure()" class="error-icon">
                  <close />
                </el-icon>
                <span v-else class="pending-icon">...</span>
                <p :class="{
                  'success-text': blockchainSuccess,
                  'error-text': hasDefinitiveBlockchainFailure(),
                  'pending-text': !blockchainSuccess && !hasDefinitiveBlockchainFailure()
                }">
                  <strong>长安链返回信息:</strong> {{ getBlockchainStatusText() }}
                </p>
              
                <p v-if="hasDefinitiveBlockchainFailure()" class="error-text">
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

<script>
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import axios from 'axios'
import { provinceAndCityData } from 'element-china-area-data'

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
fingerprint: '',
fingerprintBits: '',
fingerprintLoading: false,
price: null,
      },

      
classificationRationale: '',
gradeRationale: '',

      isQuantityLocked: false, // 控制数量输入框是否可编辑

      certificates: [], // 存储从接口获取的证书列表
      certAddr: '',
      defaultRegisterCertInfo: null,
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
      regionData: provinceAndCityData,
      cascaderProps: {
        expandTrigger: 'hover', // 鼠标悬停时展开子菜单
        checkStrictly: false, // 级联选择时必须选中父节点
        emitPath: true // 返回完整的路径数组
      },
      transactionStartTime: null, // 新增资产交易时间字段
      transactionEndTime: null,
      startTimePickerOptions: {}, // 动态生成
      endTimePickerOptions: {},   // 动态生成

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
  computed:{
    selectedValuationSection(){
        return this.valuationSections.find(
            x=>x.method===this.selectedValuationMethod
        )
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
buildErrorResult(methodName, errors) {
      return {
        methodName,
        formulaText: '-',
        intermediates: errors,
        valuation: null,
        notes: '该方法输入存在错误，请根据提示修正后重算。'
      };
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
  //this.fetchCertificates(this.form.industry);

  // 4) 数量锁定：只有 WH 不可分割
  if (this.form.industry === 'WH') {
    this.isQuantityLocked = true;
    this.form.quantity = 1;
  } else {
    this.isQuantityLocked = false;
  }
},

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

  this.valuationMethodResults = this.buildMethodResults(
    validation,
    this.selectedValuationMethod
  );

  const hasError =
    this.valuationMethodResults.length === 0 ||
    this.valuationMethodResults.some(item => item.valuation === null);

  this.valuationHasErrors = hasError;

  const selectedMethodLabel = this.getMethodLabel(this.selectedValuationMethod);

  this.valuationResultStatus = hasError
    ? `${selectedMethodLabel}输入存在错误，请按提示修正`
    : `${selectedMethodLabel}计算完成，结果已更新`;

  // 核心新增：把估值结果自动写入上链登记表单里的资产估值
  const firstValid = this.valuationMethodResults.find(
    item => item.valuation !== null && item.valuation !== undefined
  );

  if (firstValid) {
    this.form.price = Number(firstValid.valuation).toFixed(2);
  }

  this.showValuationResultModal = true;
  this.showValuationModal = false;

  if (hasError) {
    this.$message.warning(`${selectedMethodLabel}参数存在问题，请查看结果明细`);
  } else {
    this.$message.success(`${selectedMethodLabel}估值计算完成，已写入资产估值`);
  }
},

       closeValuationModal() {
      this.showValuationModal = false;
    },
    closeValuationResultModal() {
      this.showValuationResultModal = false;
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

async generateOmniPrint() {
  if (!this.form.file) {
    this.$message?.warning('请先选择文件');
    return;
  }

  this.form.fingerprintLoading = true;

  try {
    const fd = new FormData();
    fd.append('file', this.form.file);
    fd.append('assetId', this.form.assetName || `asset-${Date.now()}`);

    const res = await axios.post(
      'http://10.112.47.214:3000/api/omniprint/fingerprint',
      fd,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000
      }
    );

    if (!res.data?.success) {
      throw new Error(res.data?.message || '数字指纹生成失败');
    }

    this.form.fingerprint = res.data.fingerprint;
    this.form.fingerprintBits = res.data.fingerprint_bits;

    // 如果你想完全替换原来的哈希标识，就把 hashValue 也设置成新指纹
    this.hashValue = res.data.fingerprint;

    this.$message?.success('数字指纹生成成功');

  } catch (err) {
    if (err.response?.status === 409) {
      this.$message?.error('发现相似资产，不能重复登记');
      console.error('相似资产:', err.response.data?.similarAssets);
    } else {
      this.$message?.error(
        err.response?.data?.message ||
        err.message ||
        '数字指纹生成失败'
      );
    }

    this.form.fingerprint = '';
    this.hashValue = '';
  } finally {
    this.form.fingerprintLoading = false;
  }
},

getIdentifierMethodLabel(method) {
  const methodMap = {
    SHA2_256: 'SHA2_256',
    SHA3_256: 'SHA3_256',
    FINGERPRINT: '数字指纹'
  };

  return methodMap[method] || method || '';
},

normalizeChainmakerResult(raw = {}, httpStatus = 200) {
  const code = raw?.code;
  const message = raw?.message;
  const txId = raw?.data?.tx_id;

  const isSuccess =
    httpStatus === 200 && (
      code === 0 ||
      code === '0' ||
      message === 'success' ||
      message === '成功' ||
      Boolean(txId)
    );

  return {
    success: isSuccess,
    payload: {
      ...raw,
      message: message === 'success' ? '成功' : (message || (isSuccess ? '成功' : '状态未知'))
    }
  };
},

hasDefinitiveBlockchainFailure() {
  if (this.loadingBlockchain || this.blockchainSuccess) {
    return false;
  }

  const code = this.blockchainResponseData?.code;
  const message = this.blockchainResponseData?.message || '';

  if (code === undefined || code === null || code === '') {
    return false;
  }

  if (code === 0 || code === '0') {
    return false;
  }

  if (message === '状态未知') {
    return false;
  }

  return true;
},

getBlockchainStatusText() {
  if (this.loadingBlockchain) {
    return '上链中';
  }

  if (this.blockchainSuccess) {
    return this.blockchainResponseData.message || '成功';
  }

  if (this.hasDefinitiveBlockchainFailure()) {
    return this.blockchainResponseData.message || '上链失败';
  }

  return this.blockchainResponseData.message || '链上处理中';
},

async generateSelectedIdentifier() {
  if (this.form.algorithm === 'FINGERPRINT') {
    if (!this.form.file) {
      throw new Error('请先选择文件');
    }

    if (this.form.fingerprint) {
      this.hashValue = this.form.fingerprint;
      this.hashSuccess = true;
      return this.hashValue;
    }

    this.form.fingerprintLoading = true;

    try {
      const fd = new FormData();
      fd.append('file', this.form.file);
      fd.append('assetId', this.form.assetName || `asset-${Date.now()}`);

      const res = await axios.post(
        'http://10.112.47.214:3000/api/omniprint/fingerprint',
        fd,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000
        }
      );

      if (!res.data?.success || !res.data?.fingerprint) {
        throw new Error(res.data?.message || '数字指纹生成失败');
      }

      this.form.fingerprint = res.data.fingerprint;
      this.form.fingerprintBits = res.data.fingerprint_bits || '';
      this.hashValue = res.data.fingerprint;
      this.hashSuccess = true;
      return this.hashValue;
    } catch (err) {
      if (err.response?.status === 409) {
        throw new Error('发现相似资产，不能重复登记');
      }

      throw new Error(
        err.response?.data?.message ||
        err.message ||
        '数字指纹生成失败'
      );
    } finally {
      this.form.fingerprintLoading = false;
    }
  }

  const formData = new FormData();
  formData.append('file', this.form.file);
  formData.append('algorithm', this.form.algorithm);

  const response = await axios.post('/api/generate-hash', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (response.status === 200 && response.data && response.data.hash) {
    this.hashValue = response.data.hash;
    this.hashSuccess = true;
    return this.hashValue;
  }

  throw new Error(`标识生成失败，状态码：${response.status}`);
},


async fetchDefaultRegisterCertInfo() {
  if (!this.userId) {
    throw new Error('用户ID缺失，无法获取上链默认证书');
  }

  const res = await axios.get(
    'http://10.112.47.214:3000/api/default-register-cert-info',
    {
      params: {
        userId: this.userId
      }
    }
  );

  if (!res.data?.success || !res.data.cert?.address) {
    throw new Error(res.data?.message || '未获取到上链默认证书地址');
  }

  return res.data.cert;
},
async publishToDataCatalog() {
  if (!this.hashValue) {
    return {
      success: false,
      message: '缺少数字标识，无法发布目录'
    };
  }

  try {
    const response = await axios.post(
      'http://10.112.47.214:3000/api/datacatalog/publish-asset',
      {
        identifier: this.hashValue,
        assetName: this.form.assetName,
        description: this.form.description,
        assetType: this.form.assetType,
        userId: this.userId,
        certOrg: this.defaultRegisterCertInfo?.org || ''
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: response.data?.success === true,
      message: response.data?.message || '目录发布成功',
      data: response.data || null
    };
  } catch (error) {
    return {
      success: false,
      message:
        error.response?.data?.message ||
        error.message ||
        '目录发布失败',
      data: error.response?.data || null
    };
  }
},
getCatalogPublishSuccess() {
  return this.blockchainResponseData?.catalogPublish?.success === true;
},
getCatalogPublishMessage() {
  if (!this.blockchainSuccess) {
    return '主链上链未成功，未执行目录发布';
  }

  if (!this.hashValue) {
    return '未执行，未生成数字标识';
  }

  if (!this.blockchainResponseData?.catalogPublish) {
    return '未返回目录发布结果';
  }

  return this.blockchainResponseData.catalogPublish.message || '目录发布状态未知';
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
          this.certificates = response.data.certificates.map(item => ({
            cert: item.cert || '未知证书',
            address: item.address || '',
            org: item.organization || '',
            sign_cert_path: item.sign_cert_path || ''
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
      this.certAddr = selected.address;
      console.log("成功获取证书地址:", this.certAddr);
      return selected.address;
    } else {
      console.error('获取地址失败: 未找到证书地址', selectedCert);
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
      this.form.fingerprint = '';
      this.form.fingerprintBits = '';
      this.hashValue = '';
      this.hashSuccess = false;
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
  if (!value || value.length !== 2) {
    this.$message.warning('请完整选择省、市');
    return;
  }

  const transactionLocation = value.join('-');
  console.log('用户选择的地区:', transactionLocation);

  const isDynamicCertSet = await this.setDynamicCert();
  if (!isDynamicCertSet) {
    this.$message.error('动态证书配置失败，无法继续操作');
    return;
  }

  try {
    const response = await axios.post('http://10.112.47.214:8848/pre/SetAllowedLocations', {
      allowedLocations: [transactionLocation]
    });

    if (response.status === 200 && response.data.code === 0) {
      this.$message.success('交易地点设置成功');
    } else {
      this.$message.error('设置交易地点失败');
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

  /*console.log('选中的证书名称:', this.form.selectedCertificate); // 输出 selectedCertificate 的值

  // 调用获取证书地址的方法
  await this.getCertAddr(this.form.selectedCertificate);

  // 检查是否成功获取到证书地址
  if (!this.certAddr) {
    console.error("未能成功获取证书地址，无法执行 Mint 接口调用");
    this.showError = true;
      this.errorMessage = '无法获取证书地址，请检查证书登记信息';
    this.showUnifiedModal = false; // 隐藏统一模态框
    return; // 中止后续流程
  }*/
  try {
  const defaultCert = await this.fetchDefaultRegisterCertInfo();

  this.defaultRegisterCertInfo = defaultCert;
  this.form.selectedCertificate = defaultCert.certificate_name;
  this.certAddr = defaultCert.address;

  console.log('默认上链证书:', defaultCert.certificate_name);
  console.log('默认上链证书地址:', this.certAddr);
} catch (error) {
  console.error('获取上链默认证书失败:', error);

  this.showError = true;
  this.errorMessage =
    error.response?.data?.message ||
    error.message ||
    '未设置上链默认证书，请先到个人中心设置';

  this.showUnifiedModal = false;
  this.loadingHash = false;
  return;
}

  try {
    await this.generateSelectedIdentifier();
  } catch (error) {
    console.error('标识生成错误:', error);
    this.hashSuccess = false;
    this.hashValue = '未生成标识值';
    this.errorMessage = error.message || '标识生成失败，请检查网络连接。';
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

      if (databaseResponse.status === 201) {
        const catalogResponse = await this.publishToDataCatalog();
        this.blockchainResponseData = {
          ...this.blockchainResponseData,
          catalogPublish: catalogResponse,
        };

        if (catalogResponse.success) {
          this.blockchainResponseData.message = `${this.blockchainResponseData.message}，目录发布成功`;
        }
      }
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

/*async analyzeAssetCombined() {
  this.classifyError = '';
  this.gradingError = '';

  if (!this.form.analysisMethod) {
    this.classifyError = '请先选择分类分级方法。';
    return;
  }

  if (!this.summaryRecords || this.summaryRecords.length === 0) {
    this.classifyError = '请先上传 records.json。';
    return;
  }

  this.classifyLoading = true;

  try {
    const classificationMethods = [
      'type',
      'income',
      'liquidity',
      'value-stability'
    ];

    const gradingMethods = [
      'harm',
      'security',
      'sensitivity',
      'vulnerability'
    ];

    let endpoint = '';

    if (classificationMethods.includes(this.form.analysisMethod)) {
      endpoint = `/api/summary-records/combined/classification/${this.form.analysisMethod}`;
    } else if (gradingMethods.includes(this.form.analysisMethod)) {
      endpoint = `/api/summary-records/combined/grading/${this.form.analysisMethod}`;
    } else {
      throw new Error('分类分级方法无效');
    }

    const response = await axios.post(
      `http://10.112.47.214:3000${endpoint}`,
      {
        source_file: this.summarySourceFile,
        records: this.summaryRecords,
        model: 'qwen3:8b',
        embedding_model: 'bge-m3',
        rag_top_k: 3,
        rag_recall_k: 20,
        record_limit: 100,
        base_url: 'http://127.0.0.1:11434'
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000
      }
    );

    const entries = response.data.entries || [];
    const first = entries[0] || {};

    const classification = first.classification || '';
    const grade = first.grade || '';

    if (!classification || !grade) {
      throw new Error('分类分级结果为空');
    }

    this.form.assetCategory = classification;
    this.form.assetType = grade;
    this.form.analysisResultText = `资产类别：${classification}；资产等级：${grade}`;

    this.classificationRationale = first.classification_rationale || '';
    this.gradeRationale = first.grade_rationale || '';

    this.form.classificationMethod = response.data.classification_method_code || '';
    this.form.gradingMethod = response.data.grading_method_code || '';

    this.$message?.success(`分类分级完成：${classification} / ${grade}`);
  } catch (error) {
    console.error('分类分级失败:', error);

    this.classifyError =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      '分类分级失败';

    this.form.assetCategory = '';
    this.form.assetType = '';
    this.form.analysisResultText = '';
    this.classificationRationale = '';
    this.gradeRationale = '';
  } finally {
    this.classifyLoading = false;
  }
},*/

async analyzeAssetCombined() {
  this.classifyError = '';
  this.gradingError = '';

  if (!this.form.analysisMethod) {
    this.classifyError = '请先选择分类分级方法。';
    return;
  }

  this.classifyLoading = true;

  try {
    const classificationMethods = [
      'type',
      'income',
      'liquidity',
      'value-stability'
    ];

    const gradingMethods = [
      'harm',
      'security',
      'sensitivity',
      'vulnerability'
    ];

    let endpoint = '';

    if (classificationMethods.includes(this.form.analysisMethod)) {
      endpoint = `/api/summary-records/combined/latest/classification/${this.form.analysisMethod}`;
    } else if (gradingMethods.includes(this.form.analysisMethod)) {
      endpoint = `/api/summary-records/combined/latest/grading/${this.form.analysisMethod}`;
    } else {
      throw new Error('分类分级方法无效');
    }

    const response = await axios.post(
      `http://10.112.47.214:3000${endpoint}`,
      {
        model: 'qwen3:8b',
        embedding_model: 'bge-m3',
        rag_top_k: 3,
        rag_recall_k: 20,
        record_limit: 100,
        base_url: 'http://127.0.0.1:11434'
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000
      }
    );

    if (!response.data || response.data.success === false) {
      throw new Error(response.data?.message || '分类分级失败');
    }

    const entries = response.data.entries || [];
    const first = entries[0] || {};

    const classification = first.classification || '';
    const grade = first.grade || '';

    if (!classification || !grade) {
      throw new Error('分类分级结果为空');
    }

    this.form.assetCategory = classification;
    this.form.assetType = grade;
    this.form.analysisResultText = `资产类别：${classification}；资产等级：${grade}`;

    this.classificationRationale = first.classification_rationale || '';
    this.gradeRationale = first.grade_rationale || '';

    this.form.classificationMethod =
      response.data.classification_method_code ||
      response.data.classification_method ||
      '';

    this.form.gradingMethod =
      response.data.grading_method_code ||
      response.data.grading_method ||
      '';

    this.$message?.success(`分类分级完成：${classification} / ${grade}`);
  } catch (error) {
    console.error('分类分级失败:', error);

    this.classifyError =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message ||
      '分类分级失败';

    this.form.assetCategory = '';
    this.form.assetType = '';
    this.form.analysisResultText = '';
    this.classificationRationale = '';
    this.gradeRationale = '';

    this.$message?.error(this.classifyError);
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
      formData.append('algorithm', this.form.algorithm);
      formData.append('customAlgorithm', null);
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
      formData.append('price', this.form.price || 0);
      formData.append('can_sell_asset', this.form.isSellBody ? '1':'0');
      formData.append('can_sell_process', this.form.isSellProcessRight ? '1':'0');
      formData.append('can_sell_view', this.form.isSellReadRight ? '1':'0');
      formData.append('allow_resale', this.form.allow_resale); // 将 allow_resale 传递到后端
      formData.append('model_selection', this.form.modelSelection);
      // 交易地点
const tradeLocation =
  this.selectedRegionOptions && this.selectedRegionOptions.length === 2
    ? this.selectedRegionOptions.join('-')
    : '';

formData.append('trade_location', tradeLocation);

// 交易时间
let tradeStartTs = '';
let tradeEndTs = '';

if (this.transactionStartTime && this.transactionEndTime) {
  const today = new Date().toISOString().split('T')[0];

  tradeStartTs = new Date(`${today} ${this.transactionStartTime}`).getTime();
  tradeEndTs = new Date(`${today} ${this.transactionEndTime}`).getTime();
}

formData.append('trade_start_ts', tradeStartTs);
formData.append('trade_end_ts', tradeEndTs);


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
        algorithm: this.form.algorithm,
        customAlgorithm: '',
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

    const normalized = this.normalizeChainmakerResult(response.data, response.status);

    if (normalized.success) {
      this.chainMakerSuccess = true;

      // 更新前端显示的数据，仅显示 Mint 或 En-Mint 的返回结果
      this.blockchainResponseData = normalized.payload;

      return this.blockchainResponseData; // 返回成功响应
    } else {
      this.chainMakerSuccess = false;
      this.blockchainResponseData = normalized.payload;

      this.chainMakerErrorMessage = `接口调用失败，错误码：${response.data?.code ?? '未知'}, 错误信息：${this.blockchainResponseData.message}`;
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

    return this.blockchainResponseData;
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
        file: null,
        fingerprint: '',
        fingerprintBits: ''
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
    getMethodLabelByOptions(methods, value) {
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

.pending-icon {
  color: #007bff;
  margin-right: 5px;
  font-weight: 700;
}

.success-text {
  color: #28a745;
}

.error-text {
  color: #dc3545;
}

.pending-text {
  color: #007bff;
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
 @media (max-width: 900px) {
  .valuation-method-body {
    grid-template-columns: 1fr;
  }

  .valuation-field.span-2 {
    grid-column: span 1;
  }
}
</style>
