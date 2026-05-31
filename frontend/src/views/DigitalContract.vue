<template>
  <div class="contract-management">
    <AppHeader :username="username" :userId="userId" />
    
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="title">数字合约管理</h2>

        <!-- 合约操作按钮 -->
        <div class="contract-actions">
          <el-button type="primary" @click="showTemplateModal = true">
            下载合约模板
          </el-button>
          <el-button type="success" @click="showCreateModal = true">
            创建数字合约
          </el-button>
          <el-button type="info" @click="fetchMyContracts">
            刷新合约列表
          </el-button>
        </div>

        <!-- 合约筛选 -->
        <div class="filter-section">
          <el-select v-model="contractFilter" placeholder="筛选合约状态" @change="filterContracts">
            <el-option label="全部" value="ALL"></el-option>
            <el-option label="发起" value="INITIATED"></el-option>
            <el-option label="协商中" value="NEGOTIATING"></el-option>
            <el-option label="签署成功" value="SIGNED_SUCCESS"></el-option>
            <el-option label="签署失败" value="SIGNED_FAILED"></el-option>
            <el-option label="履行中" value="EXECUTING"></el-option>
            <el-option label="终止" value="TERMINATED"></el-option>
          </el-select>
        </div>

        <!-- 合约列表 -->
        <div class="contracts-list">
          <div 
            v-for="contract in filteredContracts" 
            :key="contract.contractId" 
            class="contract-item"
            @click="viewContractDetail(contract)"
          >
            <div class="contract-header">
              <h3>{{ contract.contractName }}</h3>
              <span :class="`status-badge status-${contract.contractStatus}`">
                {{ getStatusText(contract.contractStatus) }}
              </span>
            </div>
            <div class="contract-info">
              <p><strong>合约ID:</strong> {{ truncateHash(contract.contractId) }}</p>
              <p><strong>创建时间:</strong> {{ formatDate(contract.createTime) }}</p>
              <p><strong>签署方:</strong> {{ contract.signingParties.join(', ') }}</p>
              <p><strong>有效期:</strong> {{ formatDate(contract.validityStart) }} 至 {{ formatDate(contract.validityEnd) }}</p>
            </div>
            <div class="contract-actions">
              <el-button 
                v-if="contract.contractStatus === 'NEGOTIATING' && contract.isMyTurn" 
                size="small" 
                type="primary"
                @click.stop="reviewContract(contract)"
              >
                审核合约
              </el-button>
              <el-button 
                v-if="contract.contractStatus === 'SIGNED_SUCCESS'" 
                size="small" 
                type="success"
                @click.stop="executeContract(contract)"
              >
                履行合约
              </el-button>
              <el-button 
                v-if="contract.contractStatus === 'INITIATED' || contract.contractStatus === 'NEGOTIATING'" 
                size="small" 
                type="danger"
                @click.stop="terminateContract(contract)"
              >
                终止合约
              </el-button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="filteredContracts.length === 0" class="empty-state">
          <p>暂无合约数据</p>
        </div>

        <!-- 分页 -->
        <div class="pagination-container">
          <el-pagination 
            background 
            layout="prev, pager, next" 
            :total="totalContracts" 
            :page-size="itemsPerPage" 
            @current-change="handlePageChange" 
          />
        </div>

        <!-- 下载模板弹窗 -->
        <div v-if="showTemplateModal" class="modal" @click.self="showTemplateModal = false">
          <div class="modal-content">
            <h2>下载合约模板</h2>
            <div class="template-list">
              <div 
                v-for="template in contractTemplates" 
                :key="template.id" 
                class="template-item"
                @click="downloadTemplate(template)"
              >
                <h4>{{ template.name }}</h4>
                <p>{{ template.description }}</p>
                <span class="template-type">{{ template.type }}</span>
              </div>
            </div>
            <div class="modal-buttons">
              <button class="close-button" @click="showTemplateModal = false">关闭</button>
            </div>
          </div>
        </div>

        <!-- 创建合约弹窗 -->
        <div v-if="showCreateModal" class="modal" @click.self="showCreateModal = false">
          <div class="modal-content large-modal">
            <h2>创建数字合约</h2>
            <el-form :model="newContract" label-width="120px">
              <el-form-item label="合约名称">
                <el-input v-model="newContract.contractName" placeholder="请输入合约名称"></el-input>
              </el-form-item>
              <el-form-item label="合约简介">
                <el-input 
                  type="textarea" 
                  v-model="newContract.contractDescription" 
                  placeholder="请输入合约简要描述"
                  :rows="3"
                ></el-input>
              </el-form-item>
              <el-form-item label="合约标的">
                <el-select 
                  v-model="newContract.contractSubject" 
                  placeholder="选择数据产品"
                  @change="onSubjectChange"
                >
                  <el-option 
                    v-for="asset in availableAssets" 
                    :key="asset.file_hash" 
                    :label="asset.asset_name" 
                    :value="asset.file_hash"
                  ></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="签署模式">
                <el-radio-group v-model="newContract.signingMode">
                  <el-radio label="P2P">点对点签署</el-radio>
                  <el-radio label="PLATFORM">平台中介签署</el-radio>
                  <el-radio label="MULTI_PARTY">多方共识签署</el-radio>
                </el-radio-group>
              </el-form-item>
              
              <!-- 合约策略配置 -->
              <div class="strategy-section">
                <h3>合约策略配置</h3>
                
                <!-- 允许策略 -->
                <div class="strategy-type">
                  <h4>允许策略</h4>
                  <div class="strategy-item" v-for="(strategy, index) in newContract.allowStrategies" :key="index">
                    <el-form-item label="操作行为">
                      <el-select v-model="strategy.action" placeholder="选择允许的操作">
                        <el-option 
                          v-for="action in availableActions" 
                          :key="action.value" 
                          :label="action.label" 
                          :value="action.value"
                        ></el-option>
                      </el-select>
                    </el-form-item>
                    <el-form-item label="约束条件">
                      <el-select v-model="strategy.constraintType" placeholder="选择约束类型">
                        <el-option label="时间窗口" value="TIME_WINDOW"></el-option>
                        <el-option label="次数限制" value="COUNT_LIMIT"></el-option>
                        <el-option label="数据规模" value="DATA_SIZE"></el-option>
                        <el-option label="执行环境" value="EXECUTION_ENV"></el-option>
                      </el-select>
                      <el-input 
                        v-if="strategy.constraintType" 
                        v-model="strategy.constraintValue" 
                        placeholder="输入约束值"
                        style="margin-left: 10px; width: 200px;"
                      ></el-input>
                    </el-form-item>
                    <el-button 
                      type="danger" 
                      size="small" 
                      @click="removeStrategy('allow', index)"
                      v-if="newContract.allowStrategies.length > 1"
                    >
                      删除
                    </el-button>
                  </div>
                  <el-button type="primary" size="small" @click="addStrategy('allow')">添加允许策略</el-button>
                </div>
                
                <!-- 禁止策略 -->
                <div class="strategy-type">
                  <h4>禁止策略</h4>
                  <div class="strategy-item" v-for="(strategy, index) in newContract.prohibitStrategies" :key="index">
                    <el-form-item label="操作行为">
                      <el-select v-model="strategy.action" placeholder="选择禁止的操作">
                        <el-option 
                          v-for="action in availableActions" 
                          :key="action.value" 
                          :label="action.label" 
                          :value="action.value"
                        ></el-option>
                      </el-select>
                    </el-form-item>
                    <el-form-item label="补救措施">
                      <el-input 
                        v-model="strategy.remedy" 
                        placeholder="输入触发禁止行为后的补救措施"
                      ></el-input>
                    </el-form-item>
                    <el-button 
                      type="danger" 
                      size="small" 
                      @click="removeStrategy('prohibit', index)"
                      v-if="newContract.prohibitStrategies.length > 1"
                    >
                      删除
                    </el-button>
                  </div>
                  <el-button type="primary" size="small" @click="addStrategy('prohibit')">添加禁止策略</el-button>
                </div>
                
                <!-- 义务策略 -->
                <div class="strategy-type">
                  <h4>义务策略</h4>
                  <div class="strategy-item" v-for="(strategy, index) in newContract.obligationStrategies" :key="index">
                    <el-form-item label="操作行为">
                      <el-select v-model="strategy.action" placeholder="选择必须执行的操作">
                        <el-option 
                          v-for="action in availableActions" 
                          :key="action.value" 
                          :label="action.label" 
                          :value="action.value"
                        ></el-option>
                      </el-select>
                    </el-form-item>
                    <el-form-item label="违约责任">
                      <el-input 
                        v-model="strategy.liability" 
                        placeholder="输入未履行义务的违约责任"
                      ></el-input>
                    </el-form-item>
                    <el-button 
                      type="danger" 
                      size="small" 
                      @click="removeStrategy('obligation', index)"
                      v-if="newContract.obligationStrategies.length > 1"
                    >
                      删除
                    </el-button>
                  </div>
                  <el-button type="primary" size="small" @click="addStrategy('obligation')">添加义务策略</el-button>
                </div>
              </div>
              
              <el-form-item label="有效期">
                <el-date-picker
                  v-model="newContract.validityRange"
                  type="daterange"
                  range-separator="至"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  value-format="yyyy-MM-dd"
                >
                </el-date-picker>
              </el-form-item>
              <el-form-item label="签署方">
                <el-select 
                  v-model="newContract.signingParties" 
                  multiple 
                  placeholder="选择签署方"
                  style="width: 100%;"
                >
                  <el-option 
                    v-for="party in availableParties" 
                    :key="party.id" 
                    :label="party.name" 
                    :value="party.id"
                  ></el-option>
                </el-select>
              </el-form-item>
              <el-form-item label="扩展信息">
                <el-input 
                  type="textarea" 
                  v-model="newContract.extensionInfo" 
                  placeholder="请输入其他相关说明"
                  :rows="3"
                ></el-input>
              </el-form-item>
            </el-form>
            <div class="modal-buttons">
              <button class="confirm-button" @click="createContract">创建合约</button>
              <button class="close-button" @click="showCreateModal = false">取消</button>
            </div>
          </div>
        </div>

        <!-- 合约详情弹窗 -->
        <div v-if="showDetailModal" class="modal" @click.self="showDetailModal = false">
          <div class="modal-content large-modal">
            <h2>合约详情</h2>
            <div v-if="selectedContract" class="contract-detail">
              <div class="detail-section">
                <h3>基本信息</h3>
                <div class="detail-grid">
                  <div class="detail-item">
                    <strong>合约名称:</strong> {{ selectedContract.contractName }}
                  </div>
                  <div class="detail-item">
                    <strong>合约ID:</strong> {{ selectedContract.contractId }}
                  </div>
                  <div class="detail-item">
                    <strong>合约状态:</strong> 
                    <span :class="`status-badge status-${selectedContract.contractStatus}`">
                      {{ getStatusText(selectedContract.contractStatus) }}
                    </span>
                  </div>
                  <div class="detail-item">
                    <strong>创建时间:</strong> {{ formatDate(selectedContract.createTime) }}
                  </div>
                  <div class="detail-item">
                    <strong>签署模式:</strong> {{ getSigningModeText(selectedContract.signingMode) }}
                  </div>
                  <div class="detail-item">
                    <strong>有效期:</strong> {{ formatDate(selectedContract.validityStart) }} 至 {{ formatDate(selectedContract.validityEnd) }}
                  </div>
                </div>
              </div>
              
              <div class="detail-section">
                <h3>签署方信息</h3>
                <div class="parties-list">
                  <div 
                    v-for="party in selectedContract.parties" 
                    :key="party.id" 
                    class="party-item"
                    :class="{ 'signed': party.signed }"
                  >
                    <div class="party-info">
                      <strong>{{ party.name }}</strong> ({{ party.type }})
                    </div>
                    <div class="party-status">
                      <span v-if="party.signed" class="signed-badge">已签署</span>
                      <span v-else class="unsigned-badge">未签署</span>
                      <span v-if="party.signTime">签署时间: {{ formatDate(party.signTime) }}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="detail-section">
                <h3>合约策略</h3>
                <div class="strategies-list">
                  <div class="strategy-category">
                    <h4>允许策略</h4>
                    <div 
                      v-for="(strategy, index) in selectedContract.allowStrategies" 
                      :key="index" 
                      class="strategy-detail"
                    >
                      <p><strong>操作:</strong> {{ getActionText(strategy.action) }}</p>
                      <p><strong>约束:</strong> {{ strategy.constraintType }} - {{ strategy.constraintValue }}</p>
                    </div>
                  </div>
                  
                  <div class="strategy-category">
                    <h4>禁止策略</h4>
                    <div 
                      v-for="(strategy, index) in selectedContract.prohibitStrategies" 
                      :key="index" 
                      class="strategy-detail"
                    >
                      <p><strong>操作:</strong> {{ getActionText(strategy.action) }}</p>
                      <p><strong>补救措施:</strong> {{ strategy.remedy }}</p>
                    </div>
                  </div>
                  
                  <div class="strategy-category">
                    <h4>义务策略</h4>
                    <div 
                      v-for="(strategy, index) in selectedContract.obligationStrategies" 
                      :key="index" 
                      class="strategy-detail"
                    >
                      <p><strong>操作:</strong> {{ getActionText(strategy.action) }}</p>
                      <p><strong>违约责任:</strong> {{ strategy.liability }}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="detail-section" v-if="selectedContract.negotiationHistory && selectedContract.negotiationHistory.length">
                <h3>协商历史</h3>
                <div class="negotiation-history">
                  <div 
                    v-for="(record, index) in selectedContract.negotiationHistory" 
                    :key="index" 
                    class="negotiation-record"
                  >
                    <div class="record-header">
                      <strong>{{ record.partyName }}</strong>
                      <span class="record-time">{{ formatDate(record.time) }}</span>
                    </div>
                    <div class="record-content">
                      <p>{{ record.action }}: {{ record.content }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-buttons">
              <button 
                v-if="selectedContract.contractStatus === 'NEGOTIATING' && selectedContract.isMyTurn" 
                class="confirm-button"
                @click="showReviewModal = true"
              >
                审核并签署
              </button>
              <button class="close-button" @click="showDetailModal = false">关闭</button>
            </div>
          </div>
        </div>

        <!-- 合约审核弹窗 -->
        <div v-if="showReviewModal" class="modal" @click.self="showReviewModal = false">
          <div class="modal-content">
            <h2>合约审核</h2>
            <div class="review-section">
              <h3>合约内容确认</h3>
              <p>请仔细检查合约内容，确认无误后进行签署</p>
              
              <el-form :model="reviewForm" label-width="100px">
                <el-form-item label="审核意见">
                  <el-input 
                    type="textarea" 
                    v-model="reviewForm.comment" 
                    placeholder="请输入审核意见（可选）"
                    :rows="3"
                  ></el-input>
                </el-form-item>
                <el-form-item label="操作">
                  <el-radio-group v-model="reviewForm.action">
                    <el-radio label="SIGN">同意并签署</el-radio>
                    <el-radio label="REVISE">提出修订</el-radio>
                    <el-radio label="REJECT">拒绝签署</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item 
                  label="修订内容" 
                  v-if="reviewForm.action === 'REVISE'"
                >
                  <el-input 
                    type="textarea" 
                    v-model="reviewForm.revisionContent" 
                    placeholder="请输入修订内容"
                    :rows="3"
                  ></el-input>
                </el-form-item>
              </el-form>
            </div>
            <div class="modal-buttons">
              <button class="confirm-button" @click="submitReview">提交</button>
              <button class="close-button" @click="showReviewModal = false">取消</button>
            </div>
          </div>
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
  name: 'ContractManagement',
  components: {
    AppHeader,
    AppSidebar,
  },
  data() {
    return {
      username: '',
      userId: '',
      contracts: [],
      filteredContracts: [],
      contractFilter: 'ALL',
      itemsPerPage: 8,
      currentPage: 1,
      totalContracts: 0,
      
      // 弹窗控制
      showTemplateModal: false,
      showCreateModal: false,
      showDetailModal: false,
      showReviewModal: false,
      
      // 选中的合约
      selectedContract: null,
      
      // 合约模板
      contractTemplates: [
        { id: 1, name: '数据使用许可协议', description: '标准数据使用许可协议模板', type: '标准模板' },
        { id: 2, name: '数据交易合约', description: '数据产品交易标准合约模板', type: '标准模板' },
        { id: 3, name: '多方数据协作合约', description: '多方数据协作与共享合约模板', type: '标准模板' },
        { id: 4, name: '数据服务合约', description: '数据服务提供与使用合约模板', type: '标准模板' }
      ],
      
      // 新合约表单
      newContract: {
        contractName: '',
        contractDescription: '',
        contractSubject: '',
        signingMode: 'P2P',
        signingParties: [],
        validityRange: [],
        extensionInfo: '',
        allowStrategies: [{ action: '', constraintType: '', constraintValue: '' }],
        prohibitStrategies: [{ action: '', remedy: '' }],
        obligationStrategies: [{ action: '', liability: '' }]
      },
      
      // 审核表单
      reviewForm: {
        action: 'SIGN',
        comment: '',
        revisionContent: ''
      },
      
      // 可用数据
      availableAssets: [],
      availableParties: [],
      availableActions: [
        { value: 'READ', label: '读取' },
        { value: 'ACCESS', label: '访问' },
        { value: 'PROCESS', label: '加工' },
        { value: 'COPY', label: '复制' },
        { value: 'STORE', label: '存储' },
        { value: 'DOWNLOAD', label: '下载' },
        { value: 'TRANSFER', label: '交易' },
        { value: 'DELETE', label: '删除' },
        { value: 'ANONYMIZE', label: '匿名化' },
        { value: 'DESENSITIZE', label: '脱敏' }
      ]
    };
  },
  async mounted() {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = this.parseJwt(token);
      this.username = decodeURIComponent(payload.username);
      await this.fetchUserId(this.username);
    }
    
    this.fetchMyContracts();
    this.fetchAvailableAssets();
    this.fetchAvailableParties();
  },
  methods: {
    async fetchUserId(username) {
      try {
        const response = await axios.post('http://10.112.47.214:3000/api/get-user-id', { username });
        if (response.status === 200 && response.data.id) {
          this.userId = response.data.id;
        }
      } catch (error) {
        console.error('请求用户ID时发生错误:', error);
      }
    },
    
    parseJwt(token) {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    },
    
    // 获取我的合约列表
    async fetchMyContracts() {
      try {
        // 这里应该调用后端API获取当前用户的合约列表
        // 暂时使用模拟数据
        const response = await axios.get(`http://10.112.47.214:3000/api/user-contracts/${this.userId}`);
        if (response.status === 200) {
          this.contracts = response.data.contracts || this.getMockContracts();
          this.filterContracts();
          this.totalContracts = this.contracts.length;
        } else {
          this.contracts = this.getMockContracts();
          this.filterContracts();
          this.totalContracts = this.contracts.length;
        }
      } catch (error) {
        console.error('获取合约列表失败:', error);
        this.contracts = this.getMockContracts();
        this.filterContracts();
        this.totalContracts = this.contracts.length;
      }
    },
    
    // 获取可用数据产品
    async fetchAvailableAssets() {
      try {
        const response = await axios.get('http://10.112.47.214:3000/api/available-assets');
        this.availableAssets = response.data || [];
      } catch (error) {
        console.error('获取可用数据产品失败:', error);
        this.availableAssets = [];
      }
    },
    
    // 获取可用签署方
    async fetchAvailableParties() {
      try {
        const response = await axios.get(`http://10.112.47.214:3000/api/available-parties/${this.userId}`);
        this.availableParties = response.data || [];
      } catch (error) {
        console.error('获取可用签署方失败:', error);
        this.availableParties = [];
      }
    },
    
    // 筛选合约
    filterContracts() {
      if (this.contractFilter === 'ALL') {
        this.filteredContracts = this.contracts;
      } else {
        this.filteredContracts = this.contracts.filter(
          contract => contract.contractStatus === this.contractFilter
        );
      }
      this.currentPage = 1;
    },
    
    // 查看合约详情
    viewContractDetail(contract) {
      this.selectedContract = contract;
      this.showDetailModal = true;
    },
    
    // 创建合约
    async createContract() {
      try {
        // 验证表单
        if (!this.newContract.contractName) {
          this.$message.error('请输入合约名称');
          return;
        }
        
        if (!this.newContract.contractSubject) {
          this.$message.error('请选择合约标的');
          return;
        }
        
        if (this.newContract.signingParties.length === 0) {
          this.$message.error('请选择至少一个签署方');
          return;
        }
        
        if (!this.newContract.validityRange || this.newContract.validityRange.length !== 2) {
          this.$message.error('请选择有效期');
          return;
        }
        
        // 准备合约数据
        const contractData = {
          ...this.newContract,
          creatorId: this.userId,
          validityStart: this.newContract.validityRange[0],
          validityEnd: this.newContract.validityRange[1]
        };
        
        // 调用后端API创建合约
        const response = await axios.post('http://10.112.47.214:3000/api/create-contract', contractData);
        
        if (response.status === 200 && response.data.success) {
          this.$message.success('合约创建成功');
          this.showCreateModal = false;
          this.resetNewContractForm();
          this.fetchMyContracts();
        } else {
          this.$message.error('合约创建失败: ' + (response.data.message || '未知错误'));
        }
      } catch (error) {
        console.error('创建合约失败:', error);
        this.$message.error('创建合约失败，请重试');
      }
    },
    
    // 重置新合约表单
    resetNewContractForm() {
      this.newContract = {
        contractName: '',
        contractDescription: '',
        contractSubject: '',
        signingMode: 'P2P',
        signingParties: [],
        validityRange: [],
        extensionInfo: '',
        allowStrategies: [{ action: '', constraintType: '', constraintValue: '' }],
        prohibitStrategies: [{ action: '', remedy: '' }],
        obligationStrategies: [{ action: '', liability: '' }]
      };
    },
    
    // 添加策略
    addStrategy(type) {
      if (type === 'allow') {
        this.newContract.allowStrategies.push({ action: '', constraintType: '', constraintValue: '' });
      } else if (type === 'prohibit') {
        this.newContract.prohibitStrategies.push({ action: '', remedy: '' });
      } else if (type === 'obligation') {
        this.newContract.obligationStrategies.push({ action: '', liability: '' });
      }
    },
    
    // 删除策略
    removeStrategy(type, index) {
      if (type === 'allow') {
        this.newContract.allowStrategies.splice(index, 1);
      } else if (type === 'prohibit') {
        this.newContract.prohibitStrategies.splice(index, 1);
      } else if (type === 'obligation') {
        this.newContract.obligationStrategies.splice(index, 1);
      }
    },
    
    // 标的变更处理
    onSubjectChange(subjectId) {
      const selectedAsset = this.availableAssets.find(asset => asset.file_hash === subjectId);
      if (selectedAsset) {
        // 可以在这里根据选中的数据产品自动填充一些合约信息
        if (!this.newContract.contractName) {
          this.newContract.contractName = `${selectedAsset.asset_name}使用协议`;
        }
      }
    },
    
    // 下载模板
    downloadTemplate(template) {
      // 这里应该调用后端API下载模板文件
      this.$message.success(`开始下载模板: ${template.name}`);
      this.showTemplateModal = false;
    },
    
    // 审核合约
    reviewContract(contract) {
      this.selectedContract = contract;
      this.showReviewModal = true;
    },
    
    // 提交审核
    async submitReview() {
      try {
        if (!this.reviewForm.action) {
          this.$message.error('请选择审核操作');
          return;
        }
        
        const reviewData = {
          contractId: this.selectedContract.contractId,
          userId: this.userId,
          ...this.reviewForm
        };
        
        // 调用后端API提交审核
        const response = await axios.post('http://10.112.47.214:3000/api/submit-contract-review', reviewData);
        
        if (response.status === 200 && response.data.success) {
          this.$message.success('审核提交成功');
          this.showReviewModal = false;
          this.showDetailModal = false;
          this.resetReviewForm();
          this.fetchMyContracts();
        } else {
          this.$message.error('审核提交失败: ' + (response.data.message || '未知错误'));
        }
      } catch (error) {
        console.error('提交审核失败:', error);
        this.$message.error('提交审核失败，请重试');
      }
    },
    
    // 重置审核表单
    resetReviewForm() {
      this.reviewForm = {
        action: 'SIGN',
        comment: '',
        revisionContent: ''
      };
    },
    
    // 履行合约
    async executeContract(contract) {
      try {
        // 调用后端API履行合约
        const response = await axios.post('http://10.112.47.214:3000/api/execute-contract', {
          contractId: contract.contractId,
          userId: this.userId
        });
        
        if (response.status === 200 && response.data.success) {
          this.$message.success('合约履行操作已提交');
          this.fetchMyContracts();
        } else {
          this.$message.error('合约履行失败: ' + (response.data.message || '未知错误'));
        }
      } catch (error) {
        console.error('履行合约失败:', error);
        this.$message.error('履行合约失败，请重试');
      }
    },
    
    // 终止合约
    async terminateContract(contract) {
      try {
        this.$confirm('确定要终止此合约吗?', '提示', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(async () => {
          // 调用后端API终止合约
          const response = await axios.post('http://10.112.47.214:3000/api/terminate-contract', {
            contractId: contract.contractId,
            userId: this.userId
          });
          
          if (response.status === 200 && response.data.success) {
            this.$message.success('合约已终止');
            this.fetchMyContracts();
          } else {
            this.$message.error('终止合约失败: ' + (response.data.message || '未知错误'));
          }
        }).catch(() => {
          // 用户取消操作
        });
      } catch (error) {
        console.error('终止合约失败:', error);
        this.$message.error('终止合约失败，请重试');
      }
    },
    
    // 分页处理
    handlePageChange(page) {
      this.currentPage = page;
    },
    
    // 工具函数
    truncateHash(hash) {
      if (!hash) return '';
      return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
    },
    
    formatDate(dateString) {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    },
    
    getStatusText(status) {
      const statusMap = {
        'INITIATED': '发起',
        'NEGOTIATING': '协商中',
        'SIGNED_SUCCESS': '签署成功',
        'SIGNED_FAILED': '签署失败',
        'EXECUTING': '履行中',
        'TERMINATED': '终止'
      };
      return statusMap[status] || status;
    },
    
    getSigningModeText(mode) {
      const modeMap = {
        'P2P': '点对点签署',
        'PLATFORM': '平台中介签署',
        'MULTI_PARTY': '多方共识签署'
      };
      return modeMap[mode] || mode;
    },
    
    getActionText(action) {
      const actionObj = this.availableActions.find(a => a.value === action);
      return actionObj ? actionObj.label : action;
    },
    
    // 模拟合约数据
    getMockContracts() {
      return [
        {
          contractId: 'CONTRACT001',
          contractName: '能源数据分析使用协议',
          contractStatus: 'NEGOTIATING',
          createTime: '2025-06-01T12:00:00',
          signingParties: ['数据提供方A', '数据使用方B'],
          validityStart: '2025-06-10',
          validityEnd: '2025-12-10',
          isMyTurn: true,
          parties: [
            { id: 'PARTY001', name: '数据提供方A', type: '数据提供方', signed: true, signTime: '2025-06-05T10:30:00' },
            { id: 'PARTY002', name: '数据使用方B', type: '数据使用方', signed: false, signTime: null }
          ],
          allowStrategies: [
            { action: 'READ', constraintType: 'TIME_WINDOW', constraintValue: 'P30D' },
            { action: 'PROCESS', constraintType: 'DATA_SIZE', constraintValue: '100MB' }
          ],
          prohibitStrategies: [
            { action: 'TRANSFER', remedy: '立即停止使用并赔偿损失' }
          ],
          obligationStrategies: [
            { action: 'DELETE', liability: '支付违约金' }
          ],
          negotiationHistory: [
            { partyName: '数据提供方A', action: '创建合约', content: '创建了初始版本合约', time: '2025-06-01T12:00:00' },
            { partyName: '数据使用方B', action: '提出修订', content: '建议延长使用期限', time: '2025-06-03T14:20:00' }
          ]
        },
        {
          contractId: 'CONTRACT002',
          contractName: '金融数据共享合约',
          contractStatus: 'SIGNED_SUCCESS',
          createTime: '2025-05-20T09:15:00',
          signingParties: ['数据服务方C', '数据使用方D', '数据使用方E'],
          validityStart: '2025-05-25',
          validityEnd: '2025-11-25',
          isMyTurn: false,
          parties: [
            { id: 'PARTY003', name: '数据服务方C', type: '数据服务方', signed: true, signTime: '2025-05-22T11:00:00' },
            { id: 'PARTY004', name: '数据使用方D', type: '数据使用方', signed: true, signTime: '2025-05-23T15:30:00' },
            { id: 'PARTY005', name: '数据使用方E', type: '数据使用方', signed: true, signTime: '2025-05-24T09:45:00' }
          ],
          allowStrategies: [
            { action: 'ACCESS', constraintType: 'COUNT_LIMIT', constraintValue: '1000次' },
            { action: 'PROCESS', constraintType: 'EXECUTION_ENV', constraintValue: '安全沙箱' }
          ],
          prohibitStrategies: [
            { action: 'COPY', remedy: '立即删除副本并赔偿' }
          ],
          obligationStrategies: [
            { action: 'DESENSITIZE', liability: '承担数据泄露责任' }
          ],
          negotiationHistory: [
            { partyName: '数据服务方C', action: '创建合约', content: '创建了多方数据共享合约', time: '2025-05-20T09:15:00' },
            { partyName: '数据使用方D', action: '提出修订', content: '建议增加数据脱敏要求', time: '2025-05-21T10:30:00' },
            { partyName: '数据服务方C', action: '同意修订', content: '已添加数据脱敏义务策略', time: '2025-05-21T16:45:00' }
          ]
        }
      ];
    }
  }
};
</script>

<style scoped>
.contract-management {
  width: 100%;
  min-height: 100vh;
  background: #f0f2f5;
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

.contract-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  padding: 0 30px;
}

.filter-section {
  margin-bottom: 20px;
  padding: 0 30px;
}

.contracts-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 20px;
  padding: 0 30px;
}

.contract-item {
  background: white;
  border-radius: 8px;
  padding: 15px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: box-shadow 0.3s ease;
}

.contract-item:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.contract-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.contract-header h3 {
  margin: 0;
  color: #333;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.status-INITIATED {
  background-color: #e6f7ff;
  color: #1890ff;
}

.status-NEGOTIATING {
  background-color: #fff7e6;
  color: #fa8c16;
}

.status-SIGNED_SUCCESS {
  background-color: #f6ffed;
  color: #52c41a;
}

.status-SIGNED_FAILED {
  background-color: #fff2f0;
  color: #ff4d4f;
}

.status-EXECUTING {
  background-color: #f9f0ff;
  color: #722ed1;
}

.status-TERMINATED {
  background-color: #f5f5f5;
  color: #8c8c8c;
}

.contract-info {
  margin-bottom: 10px;
}

.contract-info p {
  margin: 5px 0;
  font-size: 14px;
  color: #666;
}

.contract-actions {
  display: flex;
  gap: 10px;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}

.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

/* 模态框样式 */
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
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

.large-modal {
  max-width: 800px;
}

.modal-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 20px;
}

.confirm-button, .close-button {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}

.confirm-button {
  background-color: #007bff;
  color: white;
}

.close-button {
  background-color: #434547;
  color: white;
}

/* 模板列表样式 */
.template-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 20px 0;
}

.template-item {
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.template-item:hover {
  background-color: #f5f5f5;
}

.template-type {
  display: inline-block;
  padding: 2px 6px;
  background-color: #e6f7ff;
  color: #1890ff;
  border-radius: 4px;
  font-size: 12px;
}

/* 策略配置样式 */
.strategy-section {
  margin: 20px 0;
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.strategy-section h3 {
  margin-top: 0;
  color: #333;
}

.strategy-type {
  margin-bottom: 20px;
}

.strategy-type h4 {
  margin-bottom: 10px;
  color: #666;
}

.strategy-item {
  padding: 10px;
  margin-bottom: 10px;
  border: 1px dashed #e0e0e0;
  border-radius: 4px;
}

/* 合约详情样式 */
.contract-detail {
  margin-bottom: 20px;
}

.detail-section {
  margin-bottom: 20px;
  padding: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
}

.detail-section h3 {
  margin-top: 0;
  color: #333;
  border-bottom: 1px solid #e0e0e0;
  padding-bottom: 8px;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.detail-item {
  padding: 5px 0;
}

.parties-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.party-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-radius: 4px;
}

.party-item.signed {
  background-color: #f6ffed;
}

.party-item:not(.signed) {
  background-color: #fff7e6;
}

.signed-badge {
  color: #52c41a;
  font-weight: bold;
}

.unsigned-badge {
  color: #fa8c16;
  font-weight: bold;
}

.strategies-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.strategy-category {
  padding: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.strategy-category h4 {
  margin-top: 0;
  color: #666;
}

.strategy-detail {
  padding: 8px;
  margin-bottom: 8px;
  background-color: #f9f9f9;
  border-radius: 4px;
}

.strategy-detail p {
  margin: 4px 0;
  font-size: 14px;
}

.negotiation-history {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.negotiation-record {
  padding: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.record-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}

.record-time {
  color: #999;
  font-size: 12px;
}

.record-content {
  color: #666;
}

/* 审核部分样式 */
.review-section {
  margin: 20px 0;
}

.review-section h3 {
  margin-top: 0;
  color: #333;
}
</style>