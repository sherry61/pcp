const test = require('node:test');
const assert = require('node:assert/strict');

let repository = {};
try { repository = require('../tee/entitlementRepository'); } catch (_) { /* RED */ }

function fakeDb({ contract = {}, success = 0, running = 0 } = {}) {
  return async (sql) => {
    if (sql.includes('FROM transactions t') && sql.includes('digital_contracts')) {
      return contract === null ? [] : [{
        transaction_id: 'tx-1',
        contract_id: 'CONTRACT-tx-1',
        pc_type: 'TEE',
        expiration_time: null,
        delivery_limit: null,
        model_file_hash: null,
        ...contract
      }];
    }
    if (sql.includes('FROM tee_delivery_attempts')) {
      return [{ successful_deliveries: success, active_reservations: running }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
}

test('legacy null limits remain unlimited', async () => {
  assert.equal(typeof repository.loadTeeEntitlement, 'function');
  const entitlement = await repository.loadTeeEntitlement(fakeDb(), 'tx-1');
  assert.equal(entitlement.deliveryLimit, null);
  assert.equal(entitlement.remainingDeliveries, null);
  assert.equal(entitlement.allowed, true);
});

test('successful deliveries consume quota while failed attempts are excluded by SQL', async () => {
  const entitlement = await repository.loadTeeEntitlement(fakeDb({
    contract: { delivery_limit: 3, model_file_hash: 'a'.repeat(64) },
    success: 2,
    running: 0
  }), 'tx-1');
  assert.equal(entitlement.successfulDeliveries, 2);
  assert.equal(entitlement.remainingDeliveries, 1);
  assert.equal(entitlement.allowed, true);
});

test('running delivery reserves quota and reports delivery in progress', async () => {
  const entitlement = await repository.loadTeeEntitlement(fakeDb({
    contract: { delivery_limit: 2, model_file_hash: 'a'.repeat(64) },
    success: 1,
    running: 1
  }), 'tx-1');
  assert.throws(
    () => repository.assertTeeDeliveryAllowed(entitlement),
    (error) => error.statusCode === 409 && error.code === 'DELIVERY_IN_PROGRESS'
  );
});

test('exhausted successful quota reports a stable error code', async () => {
  const entitlement = await repository.loadTeeEntitlement(fakeDb({
    contract: { delivery_limit: 2, model_file_hash: 'a'.repeat(64) },
    success: 2
  }), 'tx-1');
  assert.throws(
    () => repository.assertTeeDeliveryAllowed(entitlement),
    (error) => error.statusCode === 409 && error.code === 'DELIVERY_LIMIT_REACHED'
  );
});

test('expired contract reports a stable error code', async () => {
  const entitlement = await repository.loadTeeEntitlement(fakeDb({
    contract: {
      expiration_time: '2026-10-01 00:00:00',
      delivery_limit: 3,
      model_file_hash: 'a'.repeat(64)
    }
  }), 'tx-1', { nowMs: Date.parse('2026-10-07T00:00:00Z') });
  assert.throws(
    () => repository.assertTeeDeliveryAllowed(entitlement),
    (error) => error.statusCode === 409 && error.code === 'CONTRACT_EXPIRED'
  );
});

test('missing digital contract is rejected as incomplete', async () => {
  await assert.rejects(
    () => repository.loadTeeEntitlement(fakeDb({ contract: null }), 'tx-1'),
    (error) => error.statusCode === 409 && error.code === 'CONTRACT_INCOMPLETE'
  );
});

test('formal verification loads the complete latest contract and counts SUCCESS only', async () => {
  const calls = [];
  const dbQuery = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT dc.*')) {
      return [{
        id: 9,
        contract_id: 'CONTRACT-tx-1',
        transaction_id: 'tx-1',
        pc_type: 'TEE',
        model_file_hash: 'b'.repeat(64),
        delivery_limit: 5,
        created_at: '2026-10-07 10:00:00'
      }];
    }
    if (sql.includes("status = 'SUCCESS'")) return [{ successful_deliveries: 2 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  assert.equal(typeof repository.loadTeeVerificationContract, 'function');
  const result = await repository.loadTeeVerificationContract(dbQuery, 'tx-1');
  assert.equal(result.contract.contract_id, 'CONTRACT-tx-1');
  assert.equal(result.successfulDeliveries, 2);
  assert.match(calls[1].sql, /status = 'SUCCESS'/);
  assert.doesNotMatch(calls[1].sql, /RUNNING/);
});

test('formal verification rejects historical contracts without a model hash or delivery limit', async () => {
  const dbQuery = async (sql) => {
    if (sql.includes('SELECT dc.*')) {
      return [{
        contract_id: 'CONTRACT-tx-1',
        pc_type: 'TEE',
        model_file_hash: null,
        delivery_limit: null,
        created_at: '2026-10-07 10:00:00'
      }];
    }
    return [{ successful_deliveries: 0 }];
  };
  await assert.rejects(
    () => repository.loadTeeVerificationContract(dbQuery, 'tx-1'),
    (error) => error.code === 'CONTRACT_INCOMPLETE' && error.statusCode === 409
  );
});
