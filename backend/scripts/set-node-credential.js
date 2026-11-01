const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.pam') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const nodeId = String(process.argv[2] || '').trim();
const username = String(process.argv[3] || '').trim();
const password = String(process.argv[4] || '');
const nodeName = String(process.argv[5] || nodeId).trim();

const keyHex = process.env.PAM_NODE_CREDENTIAL_KEY || '';
if (!nodeId || !username || !password) {
  console.error('Usage: node scripts/set-node-credential.js <node_id> <username> <password> [node_name]');
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
  console.error('PAM_NODE_CREDENTIAL_KEY 未配置或长度不是 32 字节');
  process.exit(1);
}

function encryptSecret(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '123456',
  database: process.env.MAIN_DB_NAME || 'r01_prod'
});

db.query(
  `INSERT INTO pam_node_credentials (node_id, node_name, username, password_enc)
   VALUES (?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE
     node_name = VALUES(node_name),
     username = VALUES(username),
     password_enc = VALUES(password_enc)`,
  [nodeId, nodeName, username, encryptSecret(password)],
  (error) => {
    if (error) {
      console.error('保存节点凭据失败:', error.message);
      process.exitCode = 1;
    } else {
      console.log(`节点凭据已保存: ${nodeId} / ${username}`);
    }
    db.end();
  }
);
