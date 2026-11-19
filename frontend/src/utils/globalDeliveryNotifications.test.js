const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeliveryNotificationMonitor, noticeContent, deliveryDestination, openDeliveryNotificationTarget } = require('./globalDeliveryNotifications');

function fixture({ initial = [], stored = new Map(), fetcher } = {}) {
  let context = { token: 'token-a', identity: '7', role: 'buyer' };
  let feed = initial;
  let calls = 0;
  const shown = [];
  const timers = new Map();
  let nextTimer = 0;
  const storage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  const monitor = createDeliveryNotificationMonitor({ storage, getContext: () => context,
    fetchNotifications: fetcher || (async () => { calls++; return feed; }),
    setTimer: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimer: id => timers.delete(id),
    showNotice: (notice, onClose) => {
      const shownNotice = { ...notice, closed: false, close() { this.closed = true; onClose(); } };
      shown.push(shownNotice); return shownNotice;
    } });
  return { monitor, shown, stored, timers, calls: () => calls,
    setFeed: value => { feed = value; }, setContext: value => { context = value; } };
}
const pending = (id, role = 'buyer') => ({ id, transactionId: id, role, stage: role === 'buyer' ? 'MODEL_UPLOAD_REQUIRED' : 'SELLER_ACTION_REQUIRED', actionable: true });
const done = id => ({ id, transactionId: id, role: 'buyer', stage: 'RESULT_READY', actionable: false });

test('initial synchronization silently acknowledges every historical completion, including history behind the popup limit', async () => {
  const f = fixture({ initial: [pending('a'), pending('b'), pending('c'), done('old-1'), done('old-2'), pending('d')] });
  await f.monitor.start();
  assert.deepEqual(f.shown.map(item => item.id), ['a', 'b', 'c']);
  f.shown.forEach(item => item.close());
  await f.monitor.refresh();
  assert.deepEqual(f.shown.map(item => item.id), ['a', 'b', 'c', 'd']);
  f.monitor.stop();
});

test('new status changes notify once across route refreshes and reloads; existing completed orders remain silent', async () => {
  const f = fixture({ initial: [done('old')] });
  await f.monitor.start();
  assert.equal(f.shown.length, 0);
  f.setFeed([done('new'), done('old')]);
  await f.monitor.refresh();
  await f.monitor.refresh();
  assert.deepEqual(f.shown.map(item => item.id), ['new']);
  f.monitor.stop();
  const reloaded = fixture({ initial: [done('new'), done('old')], stored: f.stored });
  await reloaded.monitor.start();
  assert.equal(reloaded.shown.length, 0);
  reloaded.monitor.stop();
});

test('account and role changes close old popups and never show stale in-flight responses', async () => {
  let resolve;
  const f = fixture({ fetcher: () => new Promise(done => { resolve = done; }) });
  const first = f.monitor.start();
  f.setContext(null);
  await f.monitor.refresh();
  resolve([pending('foreign')]);
  await first;
  assert.equal(f.shown.length, 0);
  f.monitor.stop();
  assert.equal(f.timers.size, 0);
});

test('pending reminders are scoped by account and role, with no overlapping polling timers', async () => {
  const f = fixture({ initial: [pending('same')] });
  await f.monitor.start();
  await f.monitor.refresh();
  assert.equal(f.timers.size, 1);
  f.setContext({ token: 'b', identity: '8', role: 'buyer' });
  await f.monitor.refresh();
  assert.equal(f.shown.length, 2);
  assert.equal(f.shown[0].closed, true);
  f.monitor.stop();
});

test('all notices explicitly point to the correct asset-delivery branch and transaction', () => {
  for (const role of ['buyer', 'seller']) {
    const notice = pending('561', role);
    assert.match(noticeContent(notice).title, /资产交付/);
    assert.match(noticeContent(notice).message, /561/);
    assert.deepEqual(deliveryDestination(notice), { path: `/delivery/${role}`, query: { transactionId: '561', stage: notice.stage } });
  }
});

test('a deep link opens the target even when its order is absent from the current page', async () => {
  let opened;
  let replaced;
  const view = { $route: { path: '/delivery/buyer', query: { transactionId: '561', stage: 'MODEL_UPLOAD_REQUIRED' } },
    resultList: [], refreshTeeStatus: async row => { row.teeStep = 'WAITING_MODEL'; },
    canUploadTeeModel: row => row.teeStep === 'WAITING_MODEL', openTeeModelDialog: row => { opened = row; },
    $router: { replace: async target => { replaced = target; } }, $message: { error: message => { throw new Error(message); } } };
  await openDeliveryNotificationTarget(view, 'buyer', async () => ({ transaction_id: '561', pc_type: 'TEE' }));
  assert.equal(opened.transaction_id, '561');
  assert.deepEqual(replaced.query, {});
});

test('a failed initial poll does not turn old completed orders into new notifications on retry', async () => {
  let attempts = 0;
  const f = fixture({ fetcher: async () => {
    attempts++;
    if (attempts === 1) throw new Error('network unavailable');
    return [done('historical')];
  } });
  await f.monitor.start();
  await f.monitor.refresh();
  assert.equal(f.shown.length, 0);
  assert.equal(f.timers.size, 1);
  f.monitor.stop();
});

test('notification links recheck ownership before opening any order dialog', async () => {
  let opened = false;
  let message;
  const view = { $route: { path: '/delivery/seller', query: { transactionId: 'other-order', stage: 'SELLER_ACTION_REQUIRED' } },
    requestedAssets: [], openTeeSellerDialog: () => { opened = true; },
    $message: { error: value => { message = value; } } };
  await openDeliveryNotificationTarget(view, 'seller', async () => { throw { response: { data: { message: '交付订单不存在或无权访问' } } }; });
  assert.equal(opened, false);
  assert.match(message, /无权访问/);
});
