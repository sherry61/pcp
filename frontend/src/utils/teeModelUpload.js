const DEFAULT_MAX_MODEL_BYTES = 10 * 1024 * 1024;
// 海光侧一旦开始模型/合约处理，失败就会关闭本轮任务并清理 VM；
// 只有尚未调用远端服务的 WAITING_MODEL 阶段允许提交。
const UPLOADABLE_STEPS = new Set(['WAITING_MODEL']);

function validateTeeModelFile(file, maxBytes = DEFAULT_MAX_MODEL_BYTES) {
  if (!file || !/\.c$/i.test(String(file.name || ''))) {
    return { valid: false, message: '计算模型仅支持 .c 文件' };
  }
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, message: '计算模型文件不能为空' };
  }
  if (size > maxBytes) {
    return { valid: false, message: '计算模型文件不能超过 10 MB' };
  }
  return { valid: true, message: '' };
}

function isTeeModelUploadStep(step) {
  return UPLOADABLE_STEPS.has(String(step || '').trim().toUpperCase());
}

module.exports = {
  DEFAULT_MAX_MODEL_BYTES,
  validateTeeModelFile,
  isTeeModelUploadStep
};

module.exports.default = module.exports;
