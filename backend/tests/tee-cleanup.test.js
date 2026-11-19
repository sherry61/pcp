const test = require('node:test');
const assert = require('node:assert/strict');

let cleanupModule = {};
let hostCleanup = {};
try { cleanupModule = require('../tee/exportCleanupScheduler'); } catch (_) { /* RED */ }
try { hostCleanup = require('../tee/hostVmCleanup'); } catch (_) { /* RED */ }

function createFakeDb(initialRows = []) {
  const rows = new Map(initialRows.map((row) => [String(row.transaction_id), { ...row }]));
  const dbQuery = async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('UPDATE delivery_secure_jobs SET cleanup_status = ?, cleanup_scheduled_at = ?')) {
      const [status, scheduledAt, tx, vmId] = params;
      const row = rows.get(String(tx));
      if (!row || row.vm_id !== vmId || row.cleanup_scheduled_at != null) return { affectedRows: 0 };
      Object.assign(row, { cleanup_status: status, cleanup_scheduled_at: scheduledAt, cleanup_started_at: null, cleanup_finished_at: null, cleanup_error: null });
      return { affectedRows: 1 };
    }
    if (normalized.startsWith("UPDATE delivery_secure_jobs SET cleanup_status = 'DISABLED'")) {
      const row = rows.get(String(params[0]));
      if (row && row.cleanup_scheduled_at == null) row.cleanup_status = 'DISABLED';
      return { affectedRows: row ? 1 : 0 };
    }
    if (normalized.startsWith("UPDATE delivery_secure_jobs SET cleanup_status = 'RUNNING'")) {
      const row = rows.get(String(params[1]));
      if (!row || row.cleanup_status !== 'SCHEDULED') return { affectedRows: 0 };
      row.cleanup_status = 'RUNNING'; row.cleanup_started_at = params[0];
      return { affectedRows: 1 };
    }
    if (normalized.startsWith("UPDATE delivery_secure_jobs SET cleanup_status = 'SUCCESS'")) {
      const row = rows.get(String(params[1]));
      Object.assign(row, { cleanup_status: 'SUCCESS', cleanup_finished_at: params[0], cleanup_error: null, vm_status: 'DELETED' });
      return { affectedRows: 1 };
    }
    if (normalized.startsWith("UPDATE delivery_secure_jobs SET cleanup_status = 'FAILED'")) {
      const row = rows.get(String(params[2]));
      Object.assign(row, { cleanup_status: 'FAILED', cleanup_finished_at: params[0], cleanup_error: params[1] });
      return { affectedRows: 1 };
    }
    if (normalized.startsWith("UPDATE delivery_secure_jobs SET cleanup_status = 'SCHEDULED'")) {
      const row = rows.get(String(params[0]));
      if (row?.cleanup_status === 'RUNNING') row.cleanup_status = 'SCHEDULED';
      return { affectedRows: row ? 1 : 0 };
    }
    if (normalized.includes("WHERE cleanup_status IN ('SCHEDULED','RUNNING')")) {
      return [...rows.values()].filter((row) => ['SCHEDULED', 'RUNNING'].includes(row.cleanup_status));
    }
    if (normalized.startsWith('SELECT transaction_id, vm_id, cleanup_status')) {
      const row = rows.get(String(params[0]));
      return row ? [{ ...row }] : [];
    }
    throw new Error(`Unexpected SQL: ${normalized}`);
  };
  return { dbQuery, rows };
}

function createFakeTimers() {
  const timers = [];
  return {
    timers,
    setTimer(fn, delay) { const timer = { fn, delay, cleared: false, unref() {} }; timers.push(timer); return timer; },
    clearTimer(timer) { timer.cleared = true; }
  };
}

test('exact VM cleanup validates the ID and targets only that VM', async () => {
  assert.equal(typeof hostCleanup.cleanupRemoteVm, 'function');
  await assert.rejects(() => hostCleanup.cleanupRemoteVm('bad-id', { runRemote: async () => ({ code: 0 }) }), /VM ID/);
  const commands = [];
  const result = await hostCleanup.cleanupRemoteVm('0123456789abcdef', {
    config: { enabled: true, password: 'not-logged', scriptsDir: '/scripts' },
    runRemote: async (command) => { commands.push(command); return { code: 0, stdout: 'deleted', stderr: '' }; }
  });
  assert.equal(result.vmId, '0123456789abcdef');
  assert.equal(commands.length, 1);
  assert.match(commands[0], /stop_vm\.sh 0123456789abcdef/);
  assert.match(commands[0], /delete_vm\.sh 0123456789abcdef/);
});

test('exact VM cleanup treats its missing instance directory as already absent', async () => {
  const vmId = '82b835cc3323fb8a';
  const message = `FileNotFoundError: [Errno 2] No such file or directory: '/var/lib/vm-api/instances/${vmId}'`;
  const result = await hostCleanup.cleanupRemoteVm(vmId, {
    config: { enabled: true, password: 'not-logged', scriptsDir: '/scripts' },
    runRemote: async () => ({ code: 1, stdout: '', stderr: message })
  });
  assert.deepEqual(result, { vmId, deleted: true, alreadyAbsent: true });
});

test('exact VM cleanup does not hide unrelated missing-file errors', async () => {
  const vmId = '82b835cc3323fb8a';
  await assert.rejects(
    () => hostCleanup.cleanupRemoteVm(vmId, {
      config: { enabled: true, password: 'not-logged', scriptsDir: '/scripts' },
      runRemote: async () => ({
        code: 1,
        stdout: '',
        stderr: "bash: ./delete_vm.sh: No such file or directory"
      })
    }),
    /delete_vm\.sh/
  );
});

test('pre-delivery cleanup accepts an already missing historical VM', async () => {
  const vmId = '82b835cc3323fb8a';
  const result = await hostCleanup.cleanupRemoteVms({
    extraVmIds: [vmId],
    config: { enabled: true, password: 'not-logged', scriptsDir: '/scripts' },
    listRemoteVms: async () => [],
    runRemote: async () => ({
      code: 1,
      stdout: '',
      stderr: `FileNotFoundError: [Errno 2] No such file or directory: '/var/lib/vm-api/instances/${vmId}'`
    })
  });
  assert.deepEqual(result, { cleaned: [vmId], failed: [] });
});

test('first export schedules once and repeated exports do not extend the deadline', async () => {
  assert.equal(typeof cleanupModule.createExportCleanupScheduler, 'function');
  const start = new Date('2026-10-06T00:00:00.000Z');
  const db = createFakeDb([{ transaction_id: 'tx-1', vm_id: '0123456789abcdef', cleanup_scheduled_at: null }]);
  const fakeTimers = createFakeTimers();
  const scheduler = cleanupModule.createExportCleanupScheduler({
    dbQuery: db.dbQuery, cleanupVm: async () => {}, enabled: true, delayMs: 120000,
    now: () => start, setTimer: fakeTimers.setTimer, clearTimer: fakeTimers.clearTimer, logger: { info() {}, warn() {}, error() {} }
  });
  const first = await scheduler.schedule('tx-1', '0123456789abcdef');
  const second = await scheduler.schedule('tx-1', '0123456789abcdef');
  assert.equal(new Date(first.cleanup_scheduled_at).toISOString(), '2026-10-06T00:02:00.000Z');
  assert.equal(new Date(second.cleanup_scheduled_at).toISOString(), '2026-10-06T00:02:00.000Z');
  assert.equal(fakeTimers.timers.length, 1);
});

test('scheduled cleanup marks only the bound VM deleted and records success', async () => {
  const now = new Date('2026-10-06T00:00:00.000Z');
  const db = createFakeDb([{ transaction_id: 'tx-2', vm_id: '0123456789abcdef', cleanup_scheduled_at: null }]);
  const fakeTimers = createFakeTimers();
  const cleaned = [];
  const scheduler = cleanupModule.createExportCleanupScheduler({
    dbQuery: db.dbQuery, cleanupVm: async (vmId) => { cleaned.push(vmId); }, enabled: true, delayMs: 120000,
    now: () => now, setTimer: fakeTimers.setTimer, clearTimer: fakeTimers.clearTimer, logger: { info() {}, warn() {}, error() {} }
  });
  await scheduler.schedule('tx-2', '0123456789abcdef');
  await fakeTimers.timers[0].fn();
  assert.deepEqual(cleaned, ['0123456789abcdef']);
  assert.equal(db.rows.get('tx-2').cleanup_status, 'SUCCESS');
  assert.equal(db.rows.get('tx-2').vm_status, 'DELETED');
  assert.equal(db.rows.get('tx-2').vm_id, '0123456789abcdef');
});

test('cleanup failures are recorded without deleting the persisted result state', async () => {
  const now = new Date('2026-10-06T00:00:00.000Z');
  const db = createFakeDb([{ transaction_id: 'tx-3', vm_id: '0123456789abcdef', result_status: 'READY', cleanup_scheduled_at: null }]);
  const fakeTimers = createFakeTimers();
  const scheduler = cleanupModule.createExportCleanupScheduler({
    dbQuery: db.dbQuery, cleanupVm: async () => { throw new Error('remote delete failed'); }, enabled: true, delayMs: 120000,
    now: () => now, setTimer: fakeTimers.setTimer, clearTimer: fakeTimers.clearTimer, logger: { info() {}, warn() {}, error() {} }
  });
  await scheduler.schedule('tx-3', '0123456789abcdef');
  await fakeTimers.timers[0].fn();
  assert.equal(db.rows.get('tx-3').cleanup_status, 'FAILED');
  assert.match(db.rows.get('tx-3').cleanup_error, /remote delete failed/);
  assert.equal(db.rows.get('tx-3').result_status, 'READY');
});

test('a skipped exact cleanup is not reported as a successful VM deletion', async () => {
  const now = new Date('2026-10-06T00:00:00.000Z');
  const db = createFakeDb([{ transaction_id: 'tx-skip', vm_id: '0123456789abcdef', cleanup_scheduled_at: null }]);
  const fakeTimers = createFakeTimers();
  const scheduler = cleanupModule.createExportCleanupScheduler({
    dbQuery: db.dbQuery,
    cleanupVm: async () => ({ skipped: true, reason: 'TEE_HOST_SSH_ENABLED=false' }),
    enabled: true, delayMs: 120000, now: () => now,
    setTimer: fakeTimers.setTimer, clearTimer: fakeTimers.clearTimer,
    logger: { info() {}, warn() {}, error() {} }
  });
  await scheduler.schedule('tx-skip', '0123456789abcdef');
  await fakeTimers.timers[0].fn();
  assert.equal(db.rows.get('tx-skip').cleanup_status, 'FAILED');
  assert.notEqual(db.rows.get('tx-skip').vm_status, 'DELETED');
});

test('disabled mode persists DISABLED and restoration reschedules pending cleanup', async () => {
  const now = new Date('2026-10-06T00:00:00.000Z');
  const disabledDb = createFakeDb([{ transaction_id: 'tx-off', vm_id: '0123456789abcdef', cleanup_scheduled_at: null }]);
  const disabledTimers = createFakeTimers();
  const disabled = cleanupModule.createExportCleanupScheduler({
    dbQuery: disabledDb.dbQuery, cleanupVm: async () => {}, enabled: false,
    now: () => now, setTimer: disabledTimers.setTimer, clearTimer: disabledTimers.clearTimer, logger: { info() {}, warn() {}, error() {} }
  });
  await disabled.schedule('tx-off', '0123456789abcdef');
  assert.equal(disabledDb.rows.get('tx-off').cleanup_status, 'DISABLED');
  assert.equal(disabledTimers.timers.length, 0);

  const restoreDb = createFakeDb([{
    transaction_id: 'tx-restore', vm_id: 'fedcba9876543210', cleanup_status: 'SCHEDULED',
    cleanup_scheduled_at: new Date('2026-10-06T00:01:00.000Z')
  }]);
  const restoreTimers = createFakeTimers();
  const restored = cleanupModule.createExportCleanupScheduler({
    dbQuery: restoreDb.dbQuery, cleanupVm: async () => {}, enabled: true,
    now: () => now, setTimer: restoreTimers.setTimer, clearTimer: restoreTimers.clearTimer, logger: { info() {}, warn() {}, error() {} }
  });
  await restored.restore();
  assert.equal(restoreTimers.timers.length, 1);
  assert.equal(restoreTimers.timers[0].delay, 60000);
});
