'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql');
const { loadTeeEntitlement, loadTeeVerificationContract, assertTeeDeliveryAllowed } = require('../tee/entitlementRepository');

const enabled = process.env.RUN_DB_INTEGRATION === '1';

test('real MySQL schema stores TEE contract terms and enforces success/running quota', { skip: !enabled }, async () => {
  const connection = mysql.createConnection({
    host: process.env.MAIN_DB_HOST || 'localhost',
    user: process.env.MAIN_DB_USER || 'root',
    password: process.env.MAIN_DB_PASSWORD || '123456',
    database: process.env.MAIN_DB_NAME || 'r01_prod'
  });
  const query = (sql, params = []) => new Promise((resolve, reject) => {
    connection.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
  const begin = () => new Promise((resolve, reject) => connection.beginTransaction((error) => error ? reject(error) : resolve()));
  const rollback = () => new Promise((resolve) => connection.rollback(() => resolve()));
  const end = () => new Promise((resolve) => connection.end(() => resolve()));

  await begin();
  try {
    const hash = 'a'.repeat(64);
    const inserted = await query(
      `INSERT INTO transactions
       (asset_id,buyer_address,seller_address,status,quantity,quality,expiration_time,delivery_limit,model_file_hash,pc_type)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ['codex-tee-contract-test', 'buyer-test', 'seller-test', '已确认', 1, '使用权', '2099-12-31 23:59:59', 2, hash, 'TEE']
    );
    const transactionId = inserted.insertId;
    await query(
      `INSERT INTO digital_contracts
       (contract_id,transaction_id,contract_name,product_name,token_id,contract_description,
        seller_address,buyer_address,operations,expiration_time,quantity_limit,processing_type,
        pc_type,model_file_hash,delivery_limit)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [`CONTRACT-${transactionId}`, transactionId, 'TEE 测试合约', '测试产品', 'codex-tee-contract-test',
        '事务结束后回滚', 'seller-test', 'buyer-test', '使用权', '2099-12-31 23:59:59', 1, null,
        'TEE', hash, 2]
    );

    let entitlement = await loadTeeEntitlement(query, transactionId);
    assert.equal(entitlement.deliveryLimit, 2);
    assert.equal(entitlement.remainingDeliveries, 2);
    const verification = await loadTeeVerificationContract(query, transactionId);
    assert.equal(verification.contract.fileHash, hash);
    assert.equal(verification.contract.delivery_cnt, '2');
    assert.match(verification.contract.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.equal(verification.successfulDeliveries, 0);

    await query(
      'INSERT INTO tee_delivery_attempts (transaction_id,asset_id,attempt_no,status,step) VALUES (?,?,?,?,?)',
      [String(transactionId), 'codex-tee-contract-test', 1, 'FAILED', 'FAILED']
    );
    entitlement = await loadTeeEntitlement(query, transactionId);
    assert.equal(entitlement.remainingDeliveries, 2, 'FAILED must release quota');

    await query(
      'INSERT INTO tee_delivery_attempts (transaction_id,asset_id,attempt_no,status,step) VALUES (?,?,?,?,?)',
      [String(transactionId), 'codex-tee-contract-test', 2, 'SUCCESS', 'RESULT_READY']
    );
    await query(
      'INSERT INTO tee_delivery_attempts (transaction_id,asset_id,attempt_no,status,step) VALUES (?,?,?,?,?)',
      [String(transactionId), 'codex-tee-contract-test', 3, 'RUNNING', 'VM_CREATING']
    );
    entitlement = await loadTeeEntitlement(query, transactionId);
    assert.equal(entitlement.successfulDeliveries, 1);
    assert.equal(entitlement.activeReservations, 1);
    assert.equal(entitlement.remainingDeliveries, 0);
    assert.throws(() => assertTeeDeliveryAllowed(entitlement), (error) => error.code === 'DELIVERY_IN_PROGRESS');

    await query(
      "UPDATE tee_delivery_attempts SET status='FAILED', step='FAILED' WHERE transaction_id=? AND attempt_no=3",
      [String(transactionId)]
    );
    entitlement = await loadTeeEntitlement(query, transactionId);
    assert.equal(entitlement.remainingDeliveries, 1, 'failed reservation must be released');

    await query(
      "UPDATE tee_delivery_attempts SET status='SUCCESS', step='RESULT_READY' WHERE transaction_id=? AND attempt_no=3",
      [String(transactionId)]
    );
    entitlement = await loadTeeEntitlement(query, transactionId);
    assert.throws(() => assertTeeDeliveryAllowed(entitlement), (error) => error.code === 'DELIVERY_LIMIT_REACHED');
  } finally {
    await rollback();
    await end();
  }
});
