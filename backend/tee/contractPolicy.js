'use strict';

function normalizePcType(value) {
  return String(value || '').trim().toUpperCase();
}

function validateDeliveryLimit(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new TypeError('delivery limit must be a positive integer');
  }
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new TypeError('delivery limit must be a positive integer');
  }
  return numeric;
}

function parseExpirationMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const timestamp = new Date(String(value).replace(' ', 'T')).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function evaluateTeeEntitlement(input = {}) {
  const successfulDeliveries = Math.max(0, Number(input.successfulDeliveries || 0));
  const activeReservations = Math.max(0, Number(input.activeReservations || 0));
  const deliveryLimit = input.deliveryLimit == null
    ? null
    : validateDeliveryLimit(input.deliveryLimit);
  const expirationMs = parseExpirationMs(input.expirationTime);
  const expired = expirationMs !== null && expirationMs <= (input.nowMs ?? Date.now());
  const remainingDeliveries = deliveryLimit === null
    ? null
    : Math.max(0, deliveryLimit - successfulDeliveries - activeReservations);
  const limitReached = deliveryLimit !== null && remainingDeliveries === 0;

  return {
    expired,
    limitReached,
    remainingDeliveries,
    allowed: !expired && !limitReached
  };
}

module.exports = {
  normalizePcType,
  validateDeliveryLimit,
  evaluateTeeEntitlement
};
