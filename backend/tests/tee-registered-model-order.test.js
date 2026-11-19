'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mysql = require('mysql');
const { buildTeeDigitalContract } = require('../tee/contractFinalization');
const { buildFormalContractDocument } = require('../tee/modelContractProtocol');

const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const start = source.indexOf('function insertTransaction(');
const end = source.indexOf("app.post('/api/save-transaction'", start);
const snapshot = JSON.stringify({ resourceType: 'TEE_COMPUTATION_MODEL', registrationId: '12345678-1234-1234-1234-123456789abc',
  name: '登记模型', version: '1.0', modelFileHash: 'a'.repeat(64), tokenId: 'tee-model-test', chainTxId: 'mint-receipt' });

async function transactionInsert() {
  let captured;
  const context = {
    db: { query(sql, params, callback) {
      if (/^SELECT number/.test(sql)) return callback(null, []);
      if (/INSERT INTO transactions/.test(sql)) { captured = { sql, params }; return callback(null, { insertId: 77 }); }
      callback(null, { affectedRows: 0 });
    } }, console
  };
  const insert = vm.runInNewContext(`${source.slice(start, end)}; insertTransaction`, context);
  await new Promise((resolve, reject) => insert({ asset_id: 'registered-model-integration-test', buyer_address: 'buyer', seller_address: 'seller',
    pc_type: 'TEE', quantity: 2, quality: '使用权', expiration_time: '2099-12-31T23:59', model_file_hash: 'a'.repeat(64),
    model_registration_id: JSON.parse(snapshot).registrationId, model_snapshot_json: snapshot, delivery_limit: 2
  }, error => error ? reject(error) : resolve()));
  return captured;
}

test('the actual shared order INSERT binds model identity and immutable snapshot to their SQL columns', async () => {
  const { sql, params } = await transactionInsert();
  const columns = sql.match(/INSERT INTO transactions\s*\(([\s\S]+?)\)\s*VALUES/)[1].split(',').map(value => value.trim());
  assert.equal((sql.match(/\?/g) || []).length, params.length);
  assert.equal(columns.length, params.length);
  const fields = Object.fromEntries(columns.map((name, i) => [name, params[i]]));
  assert.equal(fields.model_registration_id, JSON.parse(snapshot).registrationId);
  assert.equal(fields.model_snapshot_json, snapshot);
  assert.equal(fields.model_file_hash, JSON.parse(snapshot).modelFileHash);
});

test('real database round-trip preserves the selected model through transaction, digital contract and TEE fileHash',
  { skip: process.env.RUN_DB_INTEGRATION !== '1' }, async () => {
    const connection = mysql.createConnection({ host: 'localhost', user: 'root', password: '123456', database: process.env.MAIN_DB_NAME || 'r01_prod' });
    const query = (sql, params = []) => new Promise((resolve, reject) => connection.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
    try {
      await query('START TRANSACTION');
      const { sql, params } = await transactionInsert();
      const inserted = await query(sql, params);
      const transaction = (await query('SELECT * FROM transactions WHERE transaction_id=?', [inserted.insertId]))[0];
      const contract = buildTeeDigitalContract({ transaction, asset: { asset_name: '测试服务' } });
      await query('INSERT INTO digital_contracts SET ?', contract);
      const saved = (await query('SELECT * FROM digital_contracts WHERE transaction_id=?', [inserted.insertId]))[0];
      const formal = buildFormalContractDocument(saved);
      assert.equal(formal.fileHash, 'a'.repeat(64));
      assert.equal(formal.model_registration_id, JSON.parse(snapshot).registrationId);
      assert.equal(formal.model_snapshot_json, snapshot);
    } finally {
      await query('ROLLBACK');
      await new Promise(resolve => connection.end(resolve));
    }
  });
