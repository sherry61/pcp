function noticeContent(notice) {
  const content = {
    SELLER_ACTION_REQUIRED: ['待执行交付', '买方已提交交付请求，请前往资产交付执行。', 'warning'],
    MODEL_UPLOAD_REQUIRED: ['待上传模型', '可信计算环境已就绪，请前往资产交付上传计算模型。', 'warning'],
    RESULT_READY: ['交付完成', notice.role === 'buyer' ? '计算结果已就绪，可前往资产交付下载。' : '本次交付已完成，可前往资产交付查看详情。', 'success'],
    DELIVERY_FAILED: ['交付失败', '本次交付未完成，请前往资产交付查看详情。', 'error']
  }[notice.stage];
  if (!content) return null;
  return { title: `资产交付 · ${content[0]}`, message: `交易 ${notice.transactionId}：${content[1]}`, type: content[2] };
}

function deliveryDestination(notice) {
  return { path: `/delivery/${notice.role === 'seller' ? 'seller' : 'buyer'}`,
    query: { transactionId: String(notice.transactionId), stage: notice.stage } };
}

function createDeliveryNotificationMonitor({ storage, fetchNotifications, showNotice, getContext,
  intervalMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer;
  let stopped = true;
  let generation = 0;
  let initialized = false;
  let contextKey = '';
  let controller;
  const visible = new Map();
  const seen = new Set();

  const closeAll = () => { visible.forEach(handle => handle?.close?.()); visible.clear(); };
  const claim = (context, notice) => {
    const key = `global-tee-notice:${context.identity}:${context.role}:${notice.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    try { if (storage.getItem(key)) return false; storage.setItem(key, '1'); } catch (_) { /* memory deduplication remains available */ }
    return true;
  };
  const tick = async () => {
    if (stopped) return;
    clearTimer(timer);
    const context = getContext();
    const key = context ? `${context.identity}:${context.role}:${context.token}` : '';
    if (key !== contextKey) {
      generation++;
      controller?.abort();
      controller = null;
      contextKey = key;
      initialized = false;
      closeAll();
    }
    const currentGeneration = generation;
    if (controller) return;
    if (!context) { timer = setTimer(tick, intervalMs); return; }
    const currentController = new AbortController();
    controller = currentController;
    try {
      const notices = await fetchNotifications(context, currentController.signal);
      if (stopped || currentGeneration !== generation || getContext()?.token !== context.token || getContext()?.role !== context.role) return;
      const ids = new Set(notices.map(notice => notice.id));
      for (const [id, handle] of visible) if (!ids.has(id)) { handle?.close?.(); visible.delete(id); }
      if (!initialized) notices.filter(notice => !notice.actionable).forEach(notice => claim(context, notice));
      for (const notice of notices) {
        // First successful sync establishes a baseline: terminal history is
        // acknowledged silently, while pending actions remain useful reminders.
        if (!initialized && !notice.actionable) continue;
        if (visible.size >= 3) break;
        if (claim(context, notice)) {
          const handle = showNotice(notice, () => visible.delete(notice.id));
          visible.set(notice.id, handle);
        }
      }
      initialized = true;
    } catch (_) { /* Retry after transient network errors; no delivery side effects. */ }
    finally {
      if (controller === currentController) controller = null;
      if (!stopped && currentGeneration === generation) { clearTimer(timer); timer = setTimer(tick, intervalMs); }
    }
  };
  return {
    start() { if (!stopped) return; stopped = false; return tick(); },
    refresh() { return tick(); },
    stop() { stopped = true; generation++; clearTimer(timer); controller?.abort(); controller = null; closeAll(); }
  };
}

async function openDeliveryNotificationTarget(view, role, loadTarget) {
  const transactionId = String(view.$route.query.transactionId || '').trim();
  const stage = String(view.$route.query.stage || '');
  const focus = `${transactionId}:${stage}`;
  if (!transactionId || view.deliveryNotificationFocus === focus) return;
  view.deliveryNotificationFocus = focus;
  try {
    const transaction = await loadTarget(transactionId, role);
    if (String(view.$route.query.transactionId || '') !== transactionId || view.$route.path !== `/delivery/${role}`) return;
    const rows = role === 'buyer' ? view.resultList : view.requestedAssets;
    const row = rows.find(item => String(item.transaction_id) === transactionId) || { ...transaction, teeRequested: true };
    await view.refreshTeeStatus(row);
    if (String(view.$route.query.transactionId || '') !== transactionId || view.$route.path !== `/delivery/${role}`) return;
    if (role === 'buyer' && stage === 'MODEL_UPLOAD_REQUIRED' && view.canUploadTeeModel(row)) view.openTeeModelDialog(row);
    else if (role === 'seller' && stage === 'SELLER_ACTION_REQUIRED' && view.canSellerDeliverTee(row)) await view.openTeeSellerDialog(row);
    else await view.openTeeDeliveryDetail(row);
    const query = { ...view.$route.query };
    delete query.transactionId;
    delete query.stage;
    await view.$router.replace({ path: view.$route.path, query });
  } catch (error) {
    view.$message.error(error.response?.data?.message || '无法打开交付订单，请刷新后重试');
  } finally { view.deliveryNotificationFocus = ''; }
}

module.exports = { createDeliveryNotificationMonitor, noticeContent, deliveryDestination, openDeliveryNotificationTarget };
