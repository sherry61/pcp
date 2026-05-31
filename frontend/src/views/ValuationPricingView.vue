<template>
  <div class="valuation-pricing">
    <AppHeader />
    <div class="main-content">
      <AppSidebar />
      <div class="content">
        <h2 class="title">估值定价</h2>
        <div class="valuation-container">
          <!-- 参数输入表单 -->
          <form @submit.prevent="evaluate" class="form-wrapper">
            <div class="form-grid">
              <div
                class="form-group"
                v-for="field in inputFields"
                :key="field.key"
              >
                <label :for="field.key">
                  {{ field.label }}
                  <span
                    class="help-icon"
                    :title="field.reason"
                  ></span>
                </label>
                <input
                  type="number"
                  step="any"
                  :id="field.key"
                  v-model.number="params[field.key]"
                  :placeholder="field.default"
                  required
                />
                <small class="field-reason">{{ field.reason }}</small>
              </div>
            </div>
            <div class="buttons-row">
              <button type="submit">计算估值</button>
            </div>
          </form>

          <!-- 弹窗：结果展示 -->
          <div v-if="showResultDialog" class="modal-overlay">
            <div class="modal-content">
              <h3>计算结果</h3>
              <table>
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>数值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="field in resultFields"
                    :key="field.key"
                  >
                    <td>{{ field.label }}</td>
                    <td>{{ resultData[field.key] }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="modal-footer">
                <button @click="showResultDialog = false">关闭</button>
              </div>
            </div>
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
  name: 'ValuationPricing',
  components: { AppHeader, AppSidebar },
  data() {
    return {
      showResultDialog: false,  // 控制弹窗显隐
      inputFields: [
        { key: 'm',   label: '被评估数据量 (m)',           default: 100000,   reason: '典型AI训练语料量' },
        { key: 'mc',  label: '年度数据采集总量 (Mc)',    default: 1000000,  reason: '企业全年采集量' },
        { key: 'mp',  label: '产品化数据总量 (Mp)',       default: 500000,   reason: '约占采集量50%，取中值' },
        { key: 'd2m', label: '人工数据挖掘成本 (¥/条)',  default: 0.05,     reason: '行业众包标注平均成本' },
        { key: 'd3m', label: '人工数据管理成本 (¥/条)',  default: 0.02,     reason: '清洗/存储等管理成本' },
        { key: 'rf',  label: '无风险收益率 (%)',         default: 2.5,      reason: '中国10年期国债平均收益' },
        { key: 'ra',  label: '市场平均收益率 (%)',       default: 8,        reason: '近三年主要股指年化回报' },
        { key: 'beta',label: '风险调整系数 β',           default: 1.2,      reason: '高风险数据资产波动偏高' },
        { key: 'g',   label: '经济增长率 (%)',           default: 5,        reason: '国家统计局GDP增速参考' },
        { key: 'x',   label: '数据应用范围 (行业数)',     default: 10,       reason: '跨行业应用，典型值' },
        { key: 'd',   label: '下载量 (次)',               default: 5000,    reason: '平台真实下载量示例' },
        { key: 'a',   label: '社会价值指数幂 a',         default: 0.5,      reason: '调整社会影响权重' },
        { key: 'w1',  label: '成本法权重 w1',           default: 0.4,      reason: '成本法适用性较高时设置' },
        { key: 'w2',  label: '市场法权重 w2',           default: 0.6,      reason: '市场法数据丰富时设置' }
      ],
      params: {
        m:   100000,
        mc:  1000000,
        mp:  500000,
        d2m: 0.05,
        d3m: 0.02,
        rf:  2.5,
        ra:  8,
        beta:1.2,
        g:   5,
        x:   10,
        d:   5000,
        a:   0.5,
        w1:  0.4,
        w2:  0.6
      },
      resultFields: [
        { key: '产品化成本',           label: '产品化成本' },
        { key: '市场价值(P)',         label: '市场价值 (P)' },
        { key: '总成本(Total Cost)',   label: '总成本 (Total Cost)' },
        { key: '最终估值(V)',         label: '最终估值 (V)' },
        { key: '源数据成本(Cs)',       label: '源数据成本 (Cs)' },
        { key: '社会价值(H)',         label: '潜在社会价值 (H)' },
        { key: '经济增长因子(Alpha)', label: '经济增长因子 (Alpha)' },
        { key: '质量提升成本',         label: '质量提升成本' },
        { key: '预期收益率(Yr)',       label: '预期收益率 (Yr)' }
      ],
      resultData: {}
    }
  },
  methods: {
  async evaluate() {
    // 1. 将响应式对象转为普通 JS 对象
    const raw = JSON.parse(JSON.stringify(this.params))

    // 2. 百分比 → 小数
    const payload = {
      ...raw,
      rf: raw.rf / 100,
      ra: raw.ra / 100,
      g:  raw.g  / 100,
    }

    console.log('真正发送给后端的 payload →', payload)
    try {
      const response = await axios.post(
        'http://10.112.47.214:8848/pre/EvaluateValue',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      )
      if (response.data.code === 0) {
        // 格式化数字，只保留两位小数
        this.resultData = Object.keys(response.data.data).reduce((acc, key) => {
          acc[key] = parseFloat(response.data.data[key]).toFixed(2); // 限制两位小数
          return acc;
        }, {});
        this.showResultDialog = true
      } else {
        this.$message.error(response.data.message || '计算失败')
      }
    } catch (error) {
      console.error('请求错误', error)
      this.$message.error('网络错误，无法计算估值')
    }
  }
}
}
</script>

<style scoped>
.valuation-container {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-top: 20px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.form-wrapper {
  width: 100%;
}

/* 自动填充列，根据宽度换行 */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-size: 14px;
  color: #333;
  display: flex;
  align-items: center;
}

.help-icon {
  margin-left: 6px;
  cursor: help;
  color: #999;
  font-weight: bold;
}

.form-group input {
  margin-top: 6px;
  padding: 8px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.field-reason {
  margin-top: 4px;
  font-size: 12px;
  color: #666;
}

.buttons-row {
  margin-top: 20px;
  text-align: right;
}

.buttons-row button {
  padding: 8px 16px;
  font-size: 14px;
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* 弹窗遮罩层 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* 弹窗内容 */
.modal-content {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  max-width: 90%;
  max-height: 80%;
  overflow-y: auto;
}

.modal-content h3 {
  margin-top: 0;
}

.modal-content table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.modal-content th,
.modal-content td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.modal-footer {
  margin-top: 15px;
  text-align: right;
}

.modal-footer button {
  padding: 6px 12px;
  font-size: 14px;
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

/* 弹窗遮罩层 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8); /* 增加透明度，让弹窗更暗 */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* 弹窗内容 */
/* 弹窗内容 */
.modal-content {
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  max-width: 800px; /* 增加最大宽度 */
  width: 70%; /* 宽度占用 90% 的屏幕 */
  max-height: 70%;
  overflow-y: auto;
}
.modal-content h3 {
  margin-top: 0;
}

/* 优化表格行的交替颜色 */
.modal-content table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

.modal-content th,
.modal-content td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.modal-content tr:nth-child(even) {
  background-color: #f9f9f9; /* 偶数行深灰色 */
}

.modal-content tr:nth-child(odd) {
  background-color: #ffffff; /* 奇数行浅灰色 */
}

.modal-footer {
  margin-top: 15px;
  text-align: right;
}

.modal-footer button {
  padding: 6px 12px;
  font-size: 14px;
  background-color: #007bff;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style>