'use strict';

const { VM_ID_RE } = require('./protocol');

function createExportCleanupScheduler(options) {
  const {
    dbQuery,
    cleanupVm,
    enabled = String(process.env.TEE_AUTO_CLEANUP_AFTER_EXPORT || 'true').toLowerCase() !== 'false',
    delayMs = Math.max(0, Number(process.env.TEE_AUTO_CLEANUP_DELAY_MS || 120000)),
    logger = console,
    now = () => new Date(),
    setTimer = setTimeout,
    clearTimer = clearTimeout
  } = options || {};
  if (typeof dbQuery !== 'function' || typeof cleanupVm !== 'function') {
    throw new Error('createExportCleanupScheduler requires dbQuery and cleanupVm');
  }

  const timers = new Map();
  const selectSql = `SELECT transaction_id, vm_id, cleanup_status, cleanup_scheduled_at,
    cleanup_started_at, cleanup_finished_at, cleanup_error
    FROM delivery_secure_jobs WHERE transaction_id = ? LIMIT 1`;

  const getState = async (transactionId) => (await dbQuery(selectSql, [String(transactionId)]))[0] || null;

  const runCleanup = async (transactionId, vmId) => {
    timers.delete(String(transactionId));
    const startedAt = now();
    const claimed = await dbQuery(
      `UPDATE delivery_secure_jobs SET cleanup_status = 'RUNNING', cleanup_started_at = ?, cleanup_error = NULL
       WHERE transaction_id = ? AND cleanup_status = 'SCHEDULED'`,
      [startedAt, String(transactionId)]
    );
    if (!claimed?.affectedRows) return getState(transactionId);
    try {
      const cleanup = await cleanupVm(vmId);
      if (cleanup?.skipped) throw new Error(cleanup.reason || 'exact VM cleanup was skipped');
      await dbQuery(
        `UPDATE delivery_secure_jobs SET cleanup_status = 'SUCCESS', cleanup_finished_at = ?, cleanup_error = NULL,
         vm_status = 'DELETED' WHERE transaction_id = ?`,
        [now(), String(transactionId)]
      );
      logger.info?.(`[TEE cleanup] ${transactionId} deleted VM ${vmId}`);
    } catch (error) {
      await dbQuery(
        `UPDATE delivery_secure_jobs SET cleanup_status = 'FAILED', cleanup_finished_at = ?, cleanup_error = ?
         WHERE transaction_id = ?`,
        [now(), String(error.message || error).slice(0, 4000), String(transactionId)]
      );
      logger.error?.(`[TEE cleanup] ${transactionId} failed: ${error.message || error}`);
    }
    return getState(transactionId);
  };

  const arm = (row) => {
    const transactionId = String(row.transaction_id);
    if (timers.has(transactionId) || row.cleanup_status !== 'SCHEDULED') return;
    const scheduledMs = new Date(row.cleanup_scheduled_at).getTime();
    const remaining = Math.max(0, scheduledMs - now().getTime());
    const timer = setTimer(() => runCleanup(transactionId, String(row.vm_id)), remaining);
    timer?.unref?.();
    timers.set(transactionId, timer);
  };

  const schedule = async (transactionId, vmId) => {
    const tx = String(transactionId || '').trim();
    const boundVmId = String(vmId || '').trim();
    if (!tx) throw new Error('transactionId is required for cleanup scheduling');
    if (!VM_ID_RE.test(boundVmId)) throw new Error('Invalid TEE VM ID for cleanup scheduling');
    if (!enabled) {
      await dbQuery(
        `UPDATE delivery_secure_jobs SET cleanup_status = 'DISABLED'
         WHERE transaction_id = ? AND cleanup_scheduled_at IS NULL`,
        [tx]
      );
      return getState(tx);
    }

    const scheduledAt = new Date(now().getTime() + delayMs);
    await dbQuery(
      `UPDATE delivery_secure_jobs SET cleanup_status = ?, cleanup_scheduled_at = ?, cleanup_started_at = NULL,
       cleanup_finished_at = NULL, cleanup_error = NULL
       WHERE transaction_id = ? AND vm_id = ? AND cleanup_scheduled_at IS NULL`,
      ['SCHEDULED', scheduledAt, tx, boundVmId]
    );
    const row = await getState(tx);
    if (!row) throw new Error('TEE delivery transaction not found while scheduling cleanup');
    if (String(row.vm_id) !== boundVmId) {
      const error = new Error('Cleanup VM does not match the transaction-bound VM');
      error.statusCode = 409;
      throw error;
    }
    arm(row);
    return row;
  };

  const restore = async () => {
    if (!enabled) return [];
    const rows = await dbQuery(
      `SELECT transaction_id, vm_id, cleanup_status, cleanup_scheduled_at,
       cleanup_started_at, cleanup_finished_at, cleanup_error
       FROM delivery_secure_jobs WHERE cleanup_status IN ('SCHEDULED','RUNNING') AND vm_id IS NOT NULL`
    );
    for (const row of rows) {
      if (row.cleanup_status === 'RUNNING') {
        await dbQuery(
          `UPDATE delivery_secure_jobs SET cleanup_status = 'SCHEDULED'
           WHERE transaction_id = ? AND cleanup_status = 'RUNNING'`,
          [String(row.transaction_id)]
        );
        row.cleanup_status = 'SCHEDULED';
      }
      arm(row);
    }
    return rows;
  };

  const close = () => {
    for (const timer of timers.values()) clearTimer(timer);
    timers.clear();
  };

  return { schedule, restore, getState, close };
}

module.exports = { createExportCleanupScheduler };
