const test = require('node:test');
const assert = require('node:assert/strict');
const { createDbQueryPools } = require('../dbQueryPools');

test('slow autocommit writes do not queue status reads; callback overloads and query objects remain supported', async () => {
  const calls = [];
  let finishWrite;
  let created = 0;
  const driver = { createPool(config) {
    const type = created++ === 0 ? 'read' : 'write';
    assert.ok(config.connectionLimit > 1);
    return { query(sql, ...args) {
      calls.push(type);
      const callback = args.at(-1);
      if (type === 'write') { finishWrite = () => callback(null, { affectedRows: 1 }); return; }
      callback(null, [{ status: 'SUCCESS' }]);
    } };
  } };
  const db = createDbQueryPools({ database: 'test' }, driver);
  let completedWrite = false;
  db.query('INSERT INTO he_delivery_contracts VALUES (?)', [1], () => { completedWrite = true; });
  const rows = await new Promise((resolve, reject) => db.query({ sql: ' SELECT status FROM delivery_secure_jobs WHERE transaction_id=?' }, ['561'], (error, rows) => error ? reject(error) : resolve(rows)));
  assert.equal(rows[0].status, 'SUCCESS');
  assert.equal(completedWrite, false);
  assert.deepEqual(calls, ['write', 'read']);
  finishWrite();
  assert.equal(completedWrite, true);
});

test('real MySQL reads remain available while the write pool is busy', { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
  const db = createDbQueryPools({ host: 'localhost', user: 'root', password: '123456', database: 'r01_prod' });
  const query = sql => new Promise((resolve, reject) => db.query(sql, (error, rows) => error ? reject(error) : resolve(rows)));
  let finished = false;
  try {
    const slow = query('DO SLEEP(1)').then(() => { finished = true; });
    const rows = await query("SELECT status,result_status FROM delivery_secure_jobs WHERE transaction_id='561'");
    assert.equal(rows[0].status, 'SUCCESS');
    assert.equal(rows[0].result_status, 'READY');
    assert.equal(finished, false);
    await slow;
  } finally { await new Promise(resolve => db.end(resolve)); }
});
