function validateTeeTerms({ pcType, file } = {}) {
  if (String(pcType || '').trim().toUpperCase() !== 'TEE') {
    return { valid: true, message: '' };
  }
  if (!file || !/\.c$/i.test(String(file.name || ''))) {
    return { valid: false, message: 'TEE 交易申请必须上传 .c 计算模型文件！' };
  }
  if (Number(file.size) <= 0) {
    return { valid: false, message: '计算模型文件不能为空！' };
  }
  return { valid: true, message: '' };
}

module.exports = { validateTeeTerms };
