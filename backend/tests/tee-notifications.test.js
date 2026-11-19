const test = require('node:test');
const assert = require('node:assert/strict');
const { notificationFor, registerTeeNotificationRoutes } = require('../tee/notifications');

const base = { transaction_id: 561, status: 'PENDING', current_attempt_id: null,
  requested_at: new Date('2026-11-01T10:00:00Z'), expiration_time: new Date('2099-01-01') };

test('seller request notifications distinguish repeated requests and pending model upload belongs only to the buyer', () => {
  const first = notificationFor(base, 'seller');
  assert.equal(first.stage, 'SELLER_ACTION_REQUIRED');
  assert.equal(notificationFor(base, 'buyer'), null);
  assert.notEqual(first.id, notificationFor({ ...base, requested_at: new Date('2026-11-01T11:00:00Z') }, 'seller').id);
  const model = { ...base, status: 'VM_RUNNING', step: 'WAITING_MODEL', current_attempt_id: 34 };
  assert.equal(notificationFor(model, 'buyer').stage, 'MODEL_UPLOAD_REQUIRED');
  assert.equal(notificationFor(model, 'seller'), null);
});

test('expired contracts do not invite new delivery actions while terminal notifications preserve their outcome', () => {
  const expired = { ...base, expiration_time: new Date('2000-01-01') };
  assert.equal(notificationFor(expired, 'seller'), null);
  assert.equal(notificationFor({ ...expired, status: 'SUCCESS', result_status: 'READY' }, 'buyer').stage, 'RESULT_READY');
  assert.equal(notificationFor({ ...expired, status: 'FAILED', current_attempt_id: 34 }, 'buyer').stage, 'DELIVERY_FAILED');
});

test('feed queries all relevant orders under the authenticated account rather than the current UI page', async () => {
  const routes = new Map();
  const calls = [];
  registerTeeNotificationRoutes({ app: { get(path, ...handlers) { routes.set(path, handlers.at(-1)); } }, authenticate() {},
    dbQuery: async (sql, params) => { calls.push({ sql, params }); return [base]; } });
  const res = { status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await routes.get('/api/privacy/tee/notifications')({ authUser: { id: 7 }, query: { role: 'seller' } }, res);
  assert.equal(res.body.notifications.length, 1);
  assert.match(calls[0].sql, /cr.user_id=\? AND cr.address=t.seller_address/);
  assert.doesNotMatch(calls[0].sql, /LIMIT|OFFSET/);
  assert.deepEqual(calls[0].params, [7]);
  await routes.get('/api/privacy/tee/notifications')({ authUser: { id: 7 }, query: { role: 'invalid' } }, res);
  assert.equal(res.statusCode, 400);
});

test('notification deep links cannot fetch another account’s transaction', async () => {
  const routes = new Map();
  registerTeeNotificationRoutes({ app: { get(path, ...handlers) { routes.set(path, handlers.at(-1)); } }, authenticate() {}, dbQuery: async () => [] });
  const res = { status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  await routes.get('/api/privacy/tee/notifications/:transactionId')({ authUser: { id: 8 }, query: { role: 'buyer' }, params: { transactionId: '561' } }, res);
  assert.equal(res.statusCode, 404);
});
