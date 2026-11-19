'use strict';

const crypto = require('crypto');
const { JOB_STATUS, TERMINAL_STATUSES } = require('./constants');
const {
  parseCoefficient,
  parseCompositeCsv,
  mergeGroupedCsv,
  splitFilesIntoSlots,
  normalizeParties,
  mergePartyCsvFiles,
  computeSamples
} = require('./calculator');

const DEFAULT_COEFFICIENT = 1n;
const { buildMpcCompositeEvidence } = require('./evidence');
const {
  createHubClient,
  buildHubIds,
  submitAudit,
  getAuditStatus
} = require('./hubClient');
const store = require('./store');

const log = require('../logger').createLogger({ module: 'mpc-audit' });

function formatError(error) {
  return {
    status: error.statusCode || error.response?.status || 500,
    body: {
      success: false,
      message: error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        'MPC 审计请求失败'
    }
  };
}

function requireField(value, fieldName) {
  const text = String(value == null ? '' : value).trim();
  if (!text) {
    const error = new Error(`${fieldName} 不能为空`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function parseOptionalInteger(value, fieldName) {
  if (value == null || String(value).trim() === '') {
    return null;
  }
  return parseCoefficient(value, fieldName);
}

function parseParties(value) {
  if (value == null || String(value).trim() === '') {
    return null;
  }
  if (Array.isArray(value)) {
    return normalizeParties(value);
  }
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) {
      throw new Error('not an array');
    }
    return normalizeParties(parsed);
  } catch (error) {
    const invalid = new Error('parties 必须是 JSON 数组');
    invalid.statusCode = 400;
    throw invalid;
  }
}

function getFileContent(file) {
  if (!file || !file.buffer) return '';
  return file.buffer.toString('utf8');
}

function mapHubStatus(data) {
  const consensusStatus = String(data?.consensus_status || '').toUpperCase();
  const consensusResult = String(data?.consensus_result || '').toUpperCase();
  if (consensusStatus === 'REACHED') {
    if (consensusResult === 'PASSED') return JOB_STATUS.AUDIT_PASSED;
    if (consensusResult === 'FAILED') return JOB_STATUS.AUDIT_FAILED;
    return JOB_STATUS.AUDIT_PENDING;
  }
  if (consensusStatus === 'TIMEOUT') return JOB_STATUS.AUDIT_TIMEOUT;
  return JOB_STATUS.AUDIT_PENDING;
}

function buildResult(job, samples) {
  const qualifiedCount = samples.filter((item) => item.qualified === true).length;
  return {
    coefficient: job.coefficient,
    threshold: job.threshold,
    user_count: samples.length,
    qualified_count: qualifiedCount,
    user_results: samples.map((item) => ({
      user_id: item.user_id,
      y: item.y,
      qualified: item.qualified,
      // 兼容旧模板字段
      is_qualified: item.qualified
    }))
  };
}

function registerMpcAuditRoutes({ app, upload, dbQuery }) {
  // 1) 创建任务：确定交易、参与方、折算系数（可选阈值）。
  app.post('/api/privacy/mpc-audit/create', async (req, res) => {
    try {
      const transactionId = requireField(req.body?.transactionId ?? req.body?.transaction_id, 'transactionId');
      const businessContractId = requireField(
        req.body?.businessContractId ?? req.body?.business_contract_id ?? transactionId,
        'businessContractId'
      );
      const buyerId = requireField(req.body?.buyerId ?? req.body?.buyer_id, 'buyerId');
      const sellerId = requireField(req.body?.sellerId ?? req.body?.seller_id, 'sellerId');
      const rawCoefficient = req.body?.coefficient ?? req.body?.c;
      const coefficient = rawCoefficient == null || String(rawCoefficient).trim() === ''
        ? DEFAULT_COEFFICIENT
        : parseCoefficient(rawCoefficient, 'coefficient');
      const threshold = parseOptionalInteger(
        req.body?.threshold ?? req.body?.t,
        'threshold'
      );
      const parties = parseParties(req.body?.parties);

      const job = await store.createJob(dbQuery, {
        transactionId,
        businessContractId,
        buyerId,
        sellerId,
        coefficient,
        threshold,
        parties
      });

      return res.status(200).json({ success: true, data: job });
    } catch (error) {
      const formatted = formatError(error);
      return res.status(formatted.status).json(formatted.body);
    }
  });

  // 2) 上传数据：
  //    - 单文件：file（列 user_id,a,b[,c]）
  //    - 分组：a_files / b_files（各自按 user 求和）
  app.post(
    '/api/privacy/mpc-audit/data',
    upload.any(),
    async (req, res) => {
      let transactionId = null;
      try {
        transactionId = requireField(req.body?.transactionId ?? req.body?.transaction_id, 'transactionId');
        const job = await store.getJob(dbQuery, transactionId);
        if (!job) {
          return res.status(404).json({ success: false, message: '请先创建 MPC 审计任务' });
        }

        const bodyCoefficient = req.body?.coefficient ?? req.body?.c;
        const coefficient = bodyCoefficient == null || String(bodyCoefficient).trim() === ''
          ? parseCoefficient(job.coefficient, 'coefficient')
          : parseCoefficient(bodyCoefficient, 'coefficient');
        const bodyThreshold = req.body?.threshold ?? req.body?.t;
        const threshold = bodyThreshold == null || String(bodyThreshold).trim() === ''
          ? (job.threshold == null ? null : parseCoefficient(job.threshold, 'threshold'))
          : parseCoefficient(bodyThreshold, 'threshold');

        const files = Array.isArray(req.files) ? req.files : [];
        const singleFile = files.find((file) => file.fieldname === 'file') || null;
        const aFiles = files.filter((file) => file.fieldname === 'a_files');
        const bFiles = files.filter((file) => file.fieldname === 'b_files');
        const genericFiles = files.filter((file) => file.fieldname === 'files');
        const partyFiles = files.filter((file) => /^party_/.test(file.fieldname));
        const parties = parseParties(req.body?.parties) || job.parties || [];

        let byUser;
        if (singleFile) {
          byUser = parseCompositeCsv(getFileContent(singleFile), {
            defaultCoefficient: coefficient
          });
        } else if (aFiles.length || bFiles.length) {
          byUser = mergeGroupedCsv({
            aFiles: aFiles.map((file) => ({ filename: file.originalname, content: getFileContent(file) })),
            bFiles: bFiles.map((file) => ({ filename: file.originalname, content: getFileContent(file) })),
            coefficient
          });
        } else if (genericFiles.length) {
          // 兼容旧前端：仍上传 files 多文件，不区分组。
          // 约定：前 N-1 个进 A，最后 1 个进 B（N=1 时全进 A）。
          const slots = splitFilesIntoSlots(genericFiles);
          byUser = mergeGroupedCsv({
            aFiles: slots.aFiles.map((file) => ({ filename: file.originalname, content: getFileContent(file) })),
            bFiles: slots.bFiles.map((file) => ({ filename: file.originalname, content: getFileContent(file) })),
            coefficient
          });
        } else if (partyFiles.length) {
          byUser = mergePartyCsvFiles({
            files: partyFiles.map((file) => ({ fieldname: file.fieldname, content: getFileContent(file) })),
            parties,
            coefficient
          });
        } else {
          return res.status(400).json({
            success: false,
            message: '请上传 files 多文件、file、a_files/b_files，或 party_<id> 文件（需配合 parties 清单）'
          });
        }

        const samples = computeSamples(byUser, { threshold });
        const updatedJob = await store.saveSamples(dbQuery, transactionId, {
          samples,
          result: buildResult({ coefficient: coefficient.toString(), threshold: threshold == null ? null : threshold.toString() }, samples),
          coefficient,
          threshold,
          parties
        });

        log.info('MPC 审计数据已就绪', {
          transaction_id: transactionId,
          users: samples.length,
          coefficient: coefficient.toString(),
          threshold: threshold == null ? null : threshold.toString()
        });

        return res.status(200).json({ success: true, data: updatedJob });
      } catch (error) {
        if (transactionId) {
          try {
            await store.markFailed(dbQuery, transactionId, error.message);
          } catch (persistError) {
            // 忽略落库失败，返回原始错误
          }
        }
        const formatted = formatError(error);
        return res.status(formatted.status).json(formatted.body);
      }
    }
  );

  // 3) 提交审计：把计算结果转成 MPC_COMPOSITE 证据并提交 Hub。
  app.post('/api/privacy/mpc-audit/submit', async (req, res) => {
    let transactionId = null;
    try {
      transactionId = requireField(req.body?.transactionId ?? req.body?.transaction_id, 'transactionId');
      const job = await store.getJob(dbQuery, transactionId);
      if (!job) {
        return res.status(404).json({ success: false, message: '任务不存在' });
      }
      if (!Array.isArray(job.samples) || job.samples.length === 0) {
        return res.status(409).json({ success: false, message: '请先上传并计算数据' });
      }
      if (job.pam_event_id && !store.isTerminal(job.status)) {
        return res.status(200).json({ success: true, message: '审计已提交，正在等待节点投票', data: job });
      }

      // Hub 当前对单次审计约 5 分钟超时；每条样本都要独立 Groth16 证明，
      // 全量 160 条会超时。默认只抽样前 20 条送审，计算结果仍覆盖全部用户。
      // MPC_AUDIT_MAX_SAMPLES=0 表示全量送审。
      const rawMaxSamples = process.env.MPC_AUDIT_MAX_SAMPLES;
      const maxSamples = rawMaxSamples == null || String(rawMaxSamples).trim() === ''
        ? 20
        : Number(rawMaxSamples);
      const auditSamples = Number.isInteger(maxSamples) && maxSamples > 0
        ? job.samples.slice(0, maxSamples)
        : job.samples;

      const evidence = buildMpcCompositeEvidence({
        transactionId: job.transaction_id,
        businessContractId: job.business_contract_id,
        sellerId: job.seller_id,
        buyerId: job.buyer_id,
        samples: auditSamples
      });
      const evidenceSuffix = crypto
        .createHash('sha256')
        .update(JSON.stringify(evidence))
        .digest('hex')
        .slice(0, 8);
      const ids = buildHubIds({
        transactionId: job.transaction_id,
        businessContractId: job.business_contract_id,
        suffix: evidenceSuffix
      });

      const client = createHubClient();
      const response = await submitAudit(client, {
        pccContractId: ids.pccContractId,
        deliveryId: ids.deliveryId,
        evidence
      });

      const eventId = response?.event_id;
      if (!eventId) {
        throw new Error('Hub 未返回 event_id');
      }

      const updated = await store.saveSubmission(dbQuery, transactionId, {
        evidence,
        pccContractId: ids.pccContractId,
        deliveryId: ids.deliveryId,
        eventId,
        targetNodes: response.target_nodes
      });

      log.info('MPC 审计已提交 Hub', {
        transaction_id: transactionId,
        event_id: eventId,
        total_nodes: response.total_nodes
      });

      return res.status(202).json({ success: true, data: updated });
    } catch (error) {
      if (transactionId) {
        try {
          await store.markFailed(dbQuery, transactionId, error.message);
        } catch (persistError) {
          // 忽略落库失败
        }
      }
      const formatted = formatError(error);
      return res.status(formatted.status).json(formatted.body);
    }
  });

  // 4) 查询状态：本地状态 + 主动刷新 Hub 共识（可选）。
  app.get('/api/privacy/mpc-audit/status', async (req, res) => {
    try {
      const transactionId = requireField(req.query?.transactionId ?? req.query?.transaction_id, 'transactionId');
      let job = await store.getJob(dbQuery, transactionId);
      if (!job) {
        return res.status(404).json({ success: false, message: '任务不存在' });
      }

      const shouldRefresh = String(req.query?.refresh || '').toLowerCase() === '1' ||
        String(req.query?.refresh || '').toLowerCase() === 'true';
      if (job.pam_event_id && !store.isTerminal(job.status) && (shouldRefresh || job.status !== JOB_STATUS.CREATED)) {
        try {
          const client = createHubClient();
          const data = await getAuditStatus(client, job.pam_event_id);
          job = await store.saveAuditStatus(dbQuery, transactionId, {
            status: mapHubStatus(data),
            consensusStatus: data.consensus_status,
            consensusResult: data.consensus_result,
            respondedNodes: data.responded_nodes,
            passedNodes: data.passed_nodes,
            targetNodes: data.target_nodes
          });
        } catch (hubError) {
          log.warn('刷新 Hub 审计状态失败', {
            transaction_id: transactionId,
            event_id: job.pam_event_id,
            err: hubError
          });
        }
      }

      return res.status(200).json({ success: true, data: job });
    } catch (error) {
      const formatted = formatError(error);
      return res.status(formatted.status).json(formatted.body);
    }
  });

  // 5) 结果：逐用户 y / 是否达标 + 审计结论。
  app.get('/api/privacy/mpc-audit/result', async (req, res) => {
    try {
      const transactionId = requireField(req.query?.transactionId ?? req.query?.transaction_id, 'transactionId');
      const job = await store.getJob(dbQuery, transactionId);
      if (!job) {
        return res.status(404).json({ success: false, message: '任务不存在' });
      }
      return res.status(200).json({
        success: true,
        data: {
          transaction_id: job.transaction_id,
          status: job.status,
          result: job.result,
          audit: {
            event_id: job.pam_event_id,
            consensus_status: job.consensus_status,
            consensus_result: job.consensus_result,
            responded_nodes: job.responded_nodes,
            passed_nodes: job.passed_nodes,
            target_nodes: job.target_nodes
          }
        }
      });
    } catch (error) {
      const formatted = formatError(error);
      return res.status(formatted.status).json(formatted.body);
    }
  });
}

module.exports = {
  registerMpcAuditRoutes,
  mapHubStatus,
  buildResult,
  TERMINAL_STATUSES
};
