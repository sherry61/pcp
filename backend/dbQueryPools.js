'use strict';

const mysql = require('mysql');

// Transactional work keeps using its own dedicated connection in main.js.
// Separate autocommit reads from writes so slow background upserts cannot
// hold every order-status and page-loading request behind one connection.
function createDbQueryPools(config, driver = mysql) {
  const reads = driver.createPool({ ...config, connectionLimit: 4, queueLimit: 100, connectTimeout: 10000 });
  const writes = driver.createPool({ ...config, connectionLimit: 8, queueLimit: 100, connectTimeout: 10000 });
  return {
    query(sql, ...args) {
      const text = typeof sql === 'string' ? sql : sql?.sql;
      const pool = /^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i.test(text || '') ? reads : writes;
      return pool.query(sql, ...args);
    },
    getConnection(callback) { return reads.getConnection(callback); },
    end(callback) {
      reads.end(readError => writes.end(writeError => callback?.(readError || writeError)));
    }
  };
}

module.exports = { createDbQueryPools };
