#!/usr/bin/env node
/*
 * Backfill historical FINGERPRINT assets from their descriptions.
 * These are text fingerprints, deliberately marked description_backfill so
 * they are never confused with a fingerprint generated from the original file.
 *
 * Usage:
 *   MYSQL_PASSWORD=... node backend/scripts/backfill-omniprint-description-fingerprints.js
 */
const mysql = require('mysql2/promise');
const axios = require('axios');

const dbConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'r01_prod'
};
const textApi = process.env.OMNIPRINT_TEXT_URL || 'http://127.0.0.1:8110';

async function main() {
  if (!dbConfig.password) throw new Error('缺少 MYSQL_PASSWORD');
  const db = await mysql.createConnection(dbConfig);
  try {
    const [assets] = await db.execute(
      `SELECT id,file_hash,asset_name,description
       FROM asset_registrations
       WHERE UPPER(algorithm) = 'FINGERPRINT'
         AND (omniprint_fingerprint IS NULL OR omniprint_fingerprint = '')
         AND TRIM(COALESCE(description, '')) <> ''
       ORDER BY id`
    );

    for (const asset of assets) {
      const response = await axios.post(`${textApi}/fingerprint`, {
        asset_id: String(asset.file_hash),
        text: String(asset.description),
        save_output: false
      }, { timeout: 300000 });
      const result = response.data || {};
      if (!result.fingerprint || !result.fingerprint_bits) throw new Error(`资产 ${asset.id} 的 OmniPrint 返回不完整`);
      await db.execute(
        `UPDATE asset_registrations
         SET omniprint_fingerprint = ?, omniprint_fingerprint_bits = ?,
             omniprint_modality = 'text', omniprint_source = 'description_backfill',
             omniprint_generated_at = NOW()
         WHERE id = ?`,
        [result.fingerprint, result.fingerprint_bits, asset.id]
      );
      console.log(`backfilled id=${asset.id} asset=${asset.asset_name} bits=${result.fingerprint_bits}`);
    }
    console.log(`completed: ${assets.length} asset(s)`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.response?.data || error.message || error);
  process.exitCode = 1;
});
