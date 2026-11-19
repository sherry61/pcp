'use strict';

// Default is read-only planning. --apply copies files without overwriting different
// content, then switches preview path references in one database transaction.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql');

const backend = path.resolve(__dirname, '..');
const sourceRoot = path.resolve(backend, '../backend-logic-preview/storage');
const targetRoot = path.join(backend, 'storage');
const folders = ['tee-assets', 'tee-requests', 'tee-results'];
const hash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

function statIfPresent(filename) {
  try { return fs.statSync(filename); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function destination(filename) {
  const relative = path.relative(sourceRoot, path.resolve(filename));
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !folders.includes(relative.split(path.sep)[0])) return null;
  return path.join(targetRoot, relative);
}

function collectFiles(directory, files = []) {
  if (!statIfPresent(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing storage symlink: ${filename}`);
    if (entry.isDirectory()) collectFiles(filename, files);
    else if (entry.isFile()) files.push(filename);
    else throw new Error(`Unsupported storage entry: ${filename}`);
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply')) throw new Error('Usage: node scripts/migrate-tee-preview-storage.js [--apply]');
  const apply = args.includes('--apply');
  const connection = mysql.createConnection({
    host: process.env.MAIN_DB_HOST || 'localhost',
    user: process.env.MAIN_DB_USER || 'root',
    password: process.env.MAIN_DB_PASSWORD || '123456',
    database: process.env.MAIN_DB_NAME || 'r01_prod'
  });
  const query = (sql, params = []) => new Promise((resolve, reject) => connection.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
  try {
    const active = await query("SELECT COUNT(*) AS count FROM tee_delivery_attempts WHERE status = 'RUNNING'");
    if (Number(active[0].count)) throw new Error('Active TEE attempts exist; migration requires an idle window');
    const updates = [];
    const materials = await query('SELECT id, data_file_path, weight_file_path FROM tee_asset_materials');
    const requests = await query('SELECT transaction_id, buyer_weight_file_path FROM delivery_secure_jobs WHERE buyer_weight_file_path IS NOT NULL');
    for (const [table, key, rows, columns] of [
      ['tee_asset_materials', 'id', materials, ['data_file_path', 'weight_file_path']],
      ['delivery_secure_jobs', 'transaction_id', requests, ['buyer_weight_file_path']]
    ]) {
      for (const row of rows) for (const column of columns) {
        if (!row[column]) continue;
        const target = destination(row[column]);
        if (!target) continue;
        if (!fs.statSync(row[column]).isFile()) throw new Error(`Referenced source is not a file: ${row[column]}`);
        updates.push({ table, key, id: row[key], column, source: row[column], target });
      }
    }
    const files = folders.flatMap(folder => collectFiles(path.join(sourceRoot, folder)));
    const pending = [];
    for (const source of files) {
      const target = destination(source);
      const targetStat = statIfPresent(target);
      if (targetStat) {
        if (!targetStat.isFile() || hash(source) !== hash(target)) throw new Error(`Destination conflict; no overwrite allowed: ${target}`);
      } else pending.push({ source, target });
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', sourceRoot, targetRoot,
      scannedFiles: files.length, filesToCopy: pending.length, databasePathsToUpdate: updates.length }, null, 2));
    if (!apply) return;
    for (const { source, target } of pending) {
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(target, fs.statSync(source).mode & 0o777 & ~0o022);
    }
    for (const source of files) {
      if (hash(source) !== hash(destination(source))) throw new Error(`Copy verification failed: ${source}`);
    }
    await query('START TRANSACTION');
    try {
      for (const item of updates) {
        const result = await query(`UPDATE ${item.table} SET ${item.column} = ? WHERE ${item.key} = ? AND ${item.column} = ?`, [item.target, item.id, item.source]);
        if (result.affectedRows !== 1) throw new Error('Storage reference changed during migration; database changes rolled back');
      }
      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
    console.log('Migration complete; file hashes verified. Preview source files were retained.');
  } finally {
    await new Promise(resolve => connection.end(resolve));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
