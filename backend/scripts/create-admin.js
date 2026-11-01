const path = require('path');
const mysql = require('mysql');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.pam') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const username = String(process.argv[2] || '').trim();
const password = String(process.argv[3] || '');

if (!username || !password) {
  console.error('Usage: node scripts/create-admin.js <username> <password>');
  process.exit(1);
}

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '123456',
  database: process.env.MAIN_DB_NAME || 'r01_prod'
});

bcrypt.hash(password, 10)
  .then((hash) => new Promise((resolve, reject) => {
    db.query(
      `INSERT INTO users (username, password, email, phone_number, address, role, trade_role)
       VALUES (?, ?, ?, NULL, NULL, 'ADMIN', 'BOTH')
       ON DUPLICATE KEY UPDATE
         password = VALUES(password),
         role = 'ADMIN',
         trade_role = 'BOTH'`,
      [username, hash, `${username}@local`],
      (error, result) => error ? reject(error) : resolve(result)
    );
  }))
  .then(() => {
    console.log(`管理员账号已就绪: ${username}`);
  })
  .catch((error) => {
    console.error('创建管理员失败:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
