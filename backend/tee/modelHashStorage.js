'use strict';

const crypto = require('node:crypto');

function createModelHashStorage({ maxBytes = 10 * 1024 * 1024 } = {}) {
  const byteLimit = Number(maxBytes);
  if (!Number.isSafeInteger(byteLimit) || byteLimit <= 0) {
    throw new TypeError('maxBytes must be a positive integer');
  }

  return {
    _handleFile(req, file, callback) {
      if (!/\.c$/i.test(String(file?.originalname || ''))) {
        file?.stream?.resume();
        callback(new Error('TEE model must be a .c file'));
        return;
      }

      const hash = crypto.createHash('sha256');
      let size = 0;
      let rejected = null;
      let completed = false;
      const done = (error, result) => {
        if (completed) return;
        completed = true;
        callback(error, result);
      };

      file.stream.on('data', (chunk) => {
        size += chunk.length;
        if (size > byteLimit) {
          rejected = rejected || new Error(`TEE model exceeds ${byteLimit} bytes`);
          return;
        }
        hash.update(chunk);
      });
      file.stream.once('error', (error) => done(error));
      file.stream.once('end', () => {
        if (rejected) return done(rejected);
        if (size === 0) return done(new Error('TEE model file is empty'));
        return done(null, { modelHash: hash.digest('hex'), size });
      });
    },

    _removeFile(req, file, callback) {
      callback(null);
    }
  };
}

module.exports = { createModelHashStorage };
