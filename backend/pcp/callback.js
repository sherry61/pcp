// PCC 结果通知（PCC_TOKEN_READY）回传地址。
//
// PCC 自 2026-11 起不再只使用全局 download.token_notify_url，而是支持在
// 创建合同 / 创建 attempt 时显式传 callback_url。这里统一给出默认值：
// PCC 运行在容器中，回调必须使用宿主机可达地址，不能用 127.0.0.1。
//
// 显式设置 PCC_CALLBACK_URL="" 表示不接收通知；未设置则使用默认值。
const DEFAULT_CALLBACK_URL =
  'http://10.112.191.163:3000/api/privacy/result-notify';

function getPccCallbackUrl() {
  if (Object.prototype.hasOwnProperty.call(process.env, 'PCC_CALLBACK_URL')) {
    return String(process.env.PCC_CALLBACK_URL || '').trim();
  }

  return DEFAULT_CALLBACK_URL;
}

module.exports = {
  DEFAULT_CALLBACK_URL,
  getPccCallbackUrl
};
