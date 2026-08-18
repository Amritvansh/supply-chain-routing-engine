/**
 * Shared PostgreSQL Connection Pool
 *
 * Single pg.Pool instance used by all route handlers to avoid
 * creating per-request connections. Member 1's aiExplanations.js
 * uses its own per-call Client by design — we do not modify that.
 *
 * @module db/pool
 */

'use strict';

const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Log pool errors (don't crash the process)
pool.on('error', (err) => {
  console.error('[Pool] Unexpected idle client error:', err.message);
});

module.exports = pool;
