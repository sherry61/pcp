const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

let modelHash = {};
try { modelHash = require('../tee/modelHashStorage'); } catch (_) { /* RED */ }

function handle(storage, { name = 'model.c', chunks = [Buffer.from('int main(void){return 0;}')] } = {}) {
  return new Promise((resolve, reject) => {
    storage._handleFile({}, {
      originalname: name,
      stream: Readable.from(chunks)
    }, (error, result) => error ? reject(error) : resolve(result));
  });
}

test('hash-only storage returns SHA-256 and byte count without retaining a file', async () => {
  assert.equal(typeof modelHash.createModelHashStorage, 'function');
  const bytes = Buffer.from('int main(void) { return 0; }\n');
  const result = await handle(modelHash.createModelHashStorage({ maxBytes: 1024 }), {
    chunks: [bytes.subarray(0, 8), bytes.subarray(8)]
  });
  assert.equal(result.modelHash, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.size, bytes.length);
  assert.equal('buffer' in result, false);
  assert.equal('path' in result, false);
  assert.equal('filename' in result, false);
});

test('hash-only storage rejects non-C files', async () => {
  const storage = modelHash.createModelHashStorage({ maxBytes: 1024 });
  await assert.rejects(() => handle(storage, { name: 'model.cpp' }), /\.c file/i);
});

test('hash-only storage rejects an empty C file', async () => {
  const storage = modelHash.createModelHashStorage({ maxBytes: 1024 });
  await assert.rejects(() => handle(storage, { chunks: [] }), /empty/i);
});

test('hash-only storage rejects a file beyond the byte limit', async () => {
  const storage = modelHash.createModelHashStorage({ maxBytes: 4 });
  await assert.rejects(() => handle(storage, { chunks: [Buffer.from('123'), Buffer.from('45')] }), /exceeds/i);
});
