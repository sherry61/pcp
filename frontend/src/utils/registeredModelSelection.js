function validateTeeTerms({ pcType, model } = {}) {
  if (String(pcType || '').trim().toUpperCase() !== 'TEE') return { valid: true, message: '' };
  if (!/^asset:[1-9][0-9]*$/.test(String(model?.id || '')) || model.status !== 'REGISTERED' || !/^[a-f0-9]{64}$/.test(String(model.fileHash || ''))) {
    return { valid: false, message: '请选择本人或已获使用授权的计算模型！' };
  }
  return { valid: true, message: '' };
}

module.exports = { validateTeeTerms };
