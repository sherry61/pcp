#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { webcrypto } = require('node:crypto');

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
if (!globalThis.window) {
  globalThis.window = globalThis;
}
if (!globalThis.self) {
  globalThis.self = globalThis;
}

const preCrypto = require('../frontend/src/utils/preCrypto');

async function main() {
  const pythonBin = process.env.PRE_INTEROP_PYTHON || 'python3';
  const python = spawnSync(pythonBin, ['scripts/pre_interop_vector.py'], {
    cwd: '/home/super/fqh',
    encoding: 'utf-8'
  });

  if (python.status !== 0) {
    process.stderr.write(python.stderr || 'failed to build PRE vector\n');
    process.exit(python.status || 1);
  }

  const vector = JSON.parse(python.stdout);
  const encryptedZipBuffer = Buffer.from(vector.first_level_zip_base64, 'base64');
  const privateKeyText = JSON.stringify(vector.buyer_private_key_file);

  try {
    const result = await preCrypto.decryptPreResultArchive({
      encryptedZipBuffer,
      privateKeyText,
      transactionId: vector.transactionId
    });

    process.stdout.write(JSON.stringify({
      ok: true,
      filename: result.filename,
      entryCount: result.entryCount,
      blobType: result.blob?.type || '',
    }, null, 2));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: error?.message || String(error)
    }, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
});
