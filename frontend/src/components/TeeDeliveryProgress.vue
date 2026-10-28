<template>
  <div class="delivery-progress-detail">
    <section class="journey-card" aria-labelledby="tee-journey-title">
      <div class="section-heading">
        <h3 id="tee-journey-title">可信计算交付流程</h3>
        <span class="journey-state" :class="`is-${progress.state}`">{{ progress.label }}</span>
      </div>

      <ol class="journey-steps" aria-label="可信计算交付步骤">
        <li
          v-for="(item, index) in progressSteps"
          :key="item.label"
          class="journey-step"
          :class="`is-${stepState(index)}`"
        >
          <div class="step-marker" aria-hidden="true">
            <span v-if="stepState(index) === 'complete'">✓</span>
            <span v-else-if="stepState(index) === 'failed'">!</span>
            <span v-else>{{ index + 1 }}</span>
          </div>
          <span class="step-label">{{ item.label }}</span>
        </li>
      </ol>

      <div class="journey-summary">
        <div class="summary-copy">
          <span>当前阶段</span>
          <strong>{{ progress.label }}</strong>
        </div>
        <div class="summary-progress" aria-hidden="true">
          <span :class="`is-${progress.state}`" :style="{ width: `${progress.percentage}%` }" />
        </div>
        <span class="summary-percent">{{ progress.percentage }}%</span>
      </div>
    </section>

    <section class="attempt-section" aria-labelledby="attempt-title">
      <div class="section-heading compact-heading">
        <h3 id="attempt-title">交付记录</h3>
      </div>
      <el-table :data="attempts" border size="small" v-loading="loading" class="attempt-table">
        <el-table-column prop="attemptNo" label="序号" width="64" align="center" />
        <el-table-column label="状态" width="88" align="center">
          <template #default="{ row: attempt }">
            <el-tag :type="attemptTagType(attempt.status)" effect="plain">{{ attemptStatusText(attempt.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="参数来源" width="104" align="center">
          <template #default="{ row: attempt }">{{ attempt.weightSource === 'BUYER_UPLOADED' ? '买方提供' : '资产预设' }}</template>
        </el-table-column>
        <el-table-column label="开始时间" width="155" align="center">
          <template #default="{ row: attempt }">{{ formatTime(attempt.startedAt) }}</template>
        </el-table-column>
        <el-table-column label="完成时间" width="155" align="center">
          <template #default="{ row: attempt }">{{ formatTime(attempt.finishedAt) }}</template>
        </el-table-column>
              <el-table-column label="异常说明" min-width="120" align="center">
          <template #default="{ row: attempt }">
            <span v-if="!attempt.errorMessage">—</span>
            <el-popover
              v-else
              placement="top"
              width="320"
              trigger="click"
              popper-class="tee-attempt-error-popover"
            >
              <template #reference>
                <el-button class="error-reason-button" type="danger" link size="small">查看原因</el-button>
              </template>
              <div class="attempt-error-detail">{{ attempt.errorMessage }}</div>
            </el-popover>
          </template>
        </el-table-column>
        <el-table-column label="服务调用详情" width="130" align="center">
          <template #default="{ row: attempt }">
            <el-button
              size="small"
              plain
              :loading="processLoading && isSelectedAttempt(attempt)"
              @click="openServiceDialog(attempt)"
            >
              查看调用详情
            </el-button>
          </template>
        </el-table-column>
        <el-table-column v-if="canDownloadResults" label="下载结果" width="94" align="center" fixed="right">
          <template #default="{ row: attempt }">
            <el-button
              size="small"
              :type="canDownloadAttemptResult(attempt) ? 'primary' : 'default'"
              :disabled="!canDownloadAttemptResult(attempt)"
              :loading="Boolean(attempt.resultDownloading)"
              @click="$emit('download-attempt-result', attempt)"
            >
              {{ attemptResultActionText(attempt) }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="!loading && !attempts.length" class="empty-note">尚无交付执行记录</div>
    </section>

    <div class="delivery-quota-summary">交付次数（{{ deliveryQuotaText }}）</div>

    <el-dialog
      v-model="serviceDialog.visible"
      title="服务调用详情"
      width="min(720px, 92vw)"
      append-to-body
      destroy-on-close
      @closed="serviceDialog.attempt = null"
    >
      <div class="service-call-body">
        <div class="binding-result" :class="{ 'is-bound': Boolean(serviceDialog.attempt?.vmId || serviceDialog.attempt?.vm_id) }">
          <span class="binding-dot" aria-hidden="true" />
          <strong>{{ selectedBindingText }}</strong>
        </div>

        <div class="process-toolbar">
          <p>仅展示本轮交付的真实调用过程，不展示接口返回值或业务数据。</p>
          <el-button
            size="small"
            plain
            :loading="processLoading"
            aria-label="刷新本轮服务调用详情"
            @click="requestProcessEvents(true)"
          >
            刷新记录
          </el-button>
        </div>

        <div v-loading="processLoading" class="process-list" aria-live="polite">
          <div v-for="(event, index) in selectedAttemptEvents" :key="`${event.time}-${event.label}-${index}`" class="process-item">
            <time>{{ formatTime(event.time) }}</time>
            <span>{{ event.label }}</span>
            <code translate="no">{{ event.endpoint }}</code>
          </div>
          <div v-if="!processLoading && !selectedAttemptEvents.length" class="empty-note">
            本轮暂无可展示的服务调用记录
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="serviceDialog.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import teeProgress from '@/utils/teeProgress'

export default {
  name: 'TeeDeliveryProgress',
  props: {
    row: { type: Object, required: true },
    attempts: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    processEvents: { type: Array, default: () => [] },
    processLoading: { type: Boolean, default: false },
    canDownloadResults: { type: Boolean, default: false }
  },
  emits: ['load-process-events', 'download-attempt-result'],
  data() {
    return {
      serviceDialog: { visible: false, attempt: null }
    }
  },
  computed: {
    progress() {
      return teeProgress.resolveTeeProgress({
        requested: this.row?.teeRequested,
        status: this.row?.teeStatus,
        step: this.row?.teeStep
      })
    },
    progressSteps() {
      return teeProgress.TEE_PROGRESS_STEPS
    },
    selectedAttemptEvents() {
      return teeProgress.getAttemptProcessEvents(this.attempts, this.processEvents, this.serviceDialog.attempt)
    },
    selectedBindingText() {
      return teeProgress.getAttemptBindingText(this.serviceDialog.attempt)
    },
    deliveryQuotaText() {
      return teeProgress.formatTeeDeliveryQuota(this.row)
    }
  },
  methods: {
    stepState(index) {
      if (this.progress.state === 'idle') return 'pending'
      if (this.progress.state === 'success') return 'complete'
      if (index < this.progress.activeIndex) return 'complete'
      if (index === this.progress.activeIndex) return this.progress.state === 'failed' ? 'failed' : 'active'
      return 'pending'
    },
    openServiceDialog(attempt) {
      this.serviceDialog.attempt = attempt
      this.serviceDialog.visible = true
      this.requestProcessEvents(false)
    },
    requestProcessEvents(force) {
      this.$emit('load-process-events', { force: Boolean(force) })
    },
    isSelectedAttempt(attempt) {
      return this.serviceDialog.attempt === attempt || (
        this.serviceDialog.attempt?.attemptNo != null &&
        this.serviceDialog.attempt.attemptNo === attempt?.attemptNo
      )
    },
    formatTime(value) {
      if (!value) return '—'
      const date = new Date(String(value).replace(' ', 'T'))
      if (!Number.isFinite(date.getTime())) return String(value)
      return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(date)
    },
    canDownloadAttemptResult(attempt) {
      return teeProgress.canDownloadTeeAttemptResult(attempt)
    },
    attemptResultActionText(attempt) {
      if (this.canDownloadAttemptResult(attempt)) return '下载'
      const status = String(attempt?.status || '').toUpperCase()
      if (status === 'RUNNING') return '待完成'
      return status === 'SUCCESS' ? '暂无归档' : '不可下载'
    },
    attemptStatusText(status) {
      const value = String(status || '').toUpperCase()
      if (value === 'SUCCESS') return '成功'
      if (value === 'FAILED') return '失败'
      return '进行中'
    },
    attemptTagType(status) {
      const value = String(status || '').toUpperCase()
      if (value === 'SUCCESS') return 'success'
      if (value === 'FAILED') return 'danger'
      return 'primary'
    }
  }
}
</script>

<style scoped>
.delivery-progress-detail { color: #1f2937; }
.journey-card,
.attempt-section { margin-top: 14px; }

.journey-card {
  padding: 20px;
  overflow: hidden;
  border: 1px solid #dbe4f0;
  border-radius: 14px;
  background: linear-gradient(145deg, #fbfdff 0%, #f3f7fc 100%);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-heading h3 {
  margin: 0;
  color: #172033;
  font-size: 17px;
  line-height: 1.35;
  text-wrap: balance;
}

.journey-state {
  padding: 5px 10px;
  border: 1px solid #c9d7ea;
  border-radius: 999px;
  background: rgba(255, 255, 255, .82);
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.journey-state.is-running { border-color: #adc8f8; color: #245ec4; }
.journey-state.is-success { border-color: #9bd9bf; color: #117653; }
.journey-state.is-failed { border-color: #f1aeb7; color: #b92b3b; }

.journey-steps {
  display: grid;
  grid-template-columns: repeat(6, minmax(90px, 1fr));
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}

.journey-step {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  color: #8a98aa;
  text-align: center;
}

.journey-step:not(:last-child)::after {
  position: absolute;
  top: 15px;
  left: calc(50% + 19px);
  width: calc(100% - 38px);
  height: 2px;
  background: #d8e0ea;
  content: '';
}

.journey-step.is-complete:not(:last-child)::after { background: #71c5a3; }
.step-marker {
  position: relative;
  z-index: 1;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 2px solid #d4dde8;
  border-radius: 50%;
  background: #fff;
  color: #8290a3;
  font-size: 12px;
  font-weight: 700;
}

.journey-step.is-active { color: #245ec4; }
.journey-step.is-active .step-marker { border-color: #2f6fec; background: #2f6fec; color: #fff; box-shadow: 0 0 0 5px rgba(47, 111, 236, .12); }
.journey-step.is-complete { color: #117653; }
.journey-step.is-complete .step-marker { border-color: #16a36a; background: #16a36a; color: #fff; }
.journey-step.is-failed { color: #b92b3b; }
.journey-step.is-failed .step-marker { border-color: #dc3e4f; background: #dc3e4f; color: #fff; }
.step-label { max-width: 105px; font-size: 12px; line-height: 1.4; }

.journey-summary {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto;
  align-items: center;
  gap: 14px;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid #dfe7f1;
}

.summary-copy { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.summary-copy span { color: #7a8799; }
.summary-copy strong { color: #26364e; font-size: 13px; }
.summary-progress { height: 7px; overflow: hidden; border-radius: 999px; background: #e0e7f0; }
.summary-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #2f6fec;
  transition: width 280ms ease, background-color 180ms ease;
}
.summary-progress span.is-success { background: #16a36a; }
.summary-progress span.is-failed { background: #dc3e4f; }
.summary-percent { color: #46566d; font-size: 12px; font-variant-numeric: tabular-nums; }

.compact-heading { margin-bottom: 10px; }
.attempt-table { width: 100%; }
.error-reason-button { padding: 0 2px; font-size: 12px; }
.attempt-error-detail { color: #4f5f74; font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; white-space: pre-wrap; }
.empty-note { padding: 15px 4px; color: #8a98aa; font-size: 13px; text-align: center; }

.delivery-quota-summary {
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  color: #46566d;
  font-size: 13px;
  font-weight: 600;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.service-call-body {
  max-height: min(62vh, 560px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.binding-result {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 13px;
}

.binding-result.is-bound { border-color: #b8e3d0; background: #f4fbf7; color: #117653; }
.binding-dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: currentColor; }
.process-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 16px 0 8px; }
.process-toolbar p { margin: 0; color: #7a8799; font-size: 12px; line-height: 1.45; }
.process-list { min-height: 52px; }
.process-item {
  display: grid;
  grid-template-columns: 164px minmax(130px, .8fr) minmax(200px, 1.2fr);
  gap: 12px;
  align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid #edf1f6;
  color: #4f5f74;
  font-size: 12px;
}

.process-item time { color: #7a8799; font-variant-numeric: tabular-nums; }
.process-item code { color: #245ec4; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }

:deep(.el-button:focus-visible) { outline: 2px solid #2f6fec; outline-offset: 2px; }

@media (max-width: 760px) {
  .journey-card { padding: 16px; }
  .journey-steps { grid-template-columns: 1fr; gap: 0; }
  .journey-step { min-height: 48px; flex-direction: row; text-align: left; }
  .journey-step:not(:last-child)::after { top: 32px; left: 15px; width: 2px; height: 16px; }
  .step-label { max-width: none; }
  .journey-summary { grid-template-columns: 1fr auto; }
  .summary-progress { grid-column: 1 / -1; grid-row: 2; }
  .process-toolbar { align-items: flex-start; flex-direction: column; }
  .process-item { grid-template-columns: 1fr; gap: 4px; }
}

@media (prefers-reduced-motion: reduce) {
  .summary-progress span { transition: none; }
}
</style>
