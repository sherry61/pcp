const test = require('node:test');
const assert = require('node:assert/strict');

let policy = {};
try { policy = require('../tee/contractPolicy'); } catch (_) { /* RED */ }

test('TEE delivery limit accepts only positive integers', () => {
  assert.equal(typeof policy.validateDeliveryLimit, 'function');
  assert.equal(policy.validateDeliveryLimit(1), 1);
  assert.equal(policy.validateDeliveryLimit('3'), 3);
  for (const invalid of [0, -1, 1.5, '1.5', '', null, undefined, 'abc']) {
    assert.throws(() => policy.validateDeliveryLimit(invalid), /positive integer/i);
  }
});

test('successful and running attempts both reduce remaining quota', () => {
  assert.equal(typeof policy.evaluateTeeEntitlement, 'function');
  const result = policy.evaluateTeeEntitlement({
    deliveryLimit: 4,
    successfulDeliveries: 2,
    activeReservations: 1,
    nowMs: Date.parse('2026-10-07T00:00:00Z')
  });
  assert.deepEqual(result, {
    expired: false,
    limitReached: false,
    remainingDeliveries: 1,
    allowed: true
  });
});

test('quota is exhausted when successes plus reservations reach the limit', () => {
  const result = policy.evaluateTeeEntitlement({
    deliveryLimit: 3,
    successfulDeliveries: 2,
    activeReservations: 1
  });
  assert.equal(result.limitReached, true);
  assert.equal(result.remainingDeliveries, 0);
  assert.equal(result.allowed, false);
});

test('failed attempts release quota because only success and running counts are supplied', () => {
  const result = policy.evaluateTeeEntitlement({
    deliveryLimit: 2,
    successfulDeliveries: 1,
    activeReservations: 0
  });
  assert.equal(result.remainingDeliveries, 1);
  assert.equal(result.allowed, true);
});

test('expiration independently blocks delivery at the boundary', () => {
  const nowMs = Date.parse('2026-10-07T00:00:00Z');
  const result = policy.evaluateTeeEntitlement({
    expirationTime: '2026-10-07T00:00:00Z',
    deliveryLimit: 5,
    successfulDeliveries: 0,
    activeReservations: 0,
    nowMs
  });
  assert.equal(result.expired, true);
  assert.equal(result.limitReached, false);
  assert.equal(result.allowed, false);
});

test('legacy null delivery limits remain unlimited but still honor expiration', () => {
  const active = policy.evaluateTeeEntitlement({ deliveryLimit: null });
  assert.equal(active.remainingDeliveries, null);
  assert.equal(active.limitReached, false);
  assert.equal(active.allowed, true);

  const expired = policy.evaluateTeeEntitlement({
    deliveryLimit: null,
    expirationTime: '2026-10-01 00:00:00',
    nowMs: Date.parse('2026-10-07T00:00:00Z')
  });
  assert.equal(expired.expired, true);
  assert.equal(expired.allowed, false);
});
