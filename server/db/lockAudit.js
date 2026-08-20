/**
 * Lock Audit — Database Helper
 *
 * Records every checkout lock attempt (success or failure) into the
 * lock_audit table for observability and stress-test analytics.
 *
 * This is a fire-and-forget operation — a failed audit insert must
 * NEVER corrupt the transactional checkout data.
 *
 * @module db/lockAudit
 */

'use strict';

const pool = require('./pool');

/**
 * Insert a lock audit record.
 *
 * @param {Object} params
 * @param {string} params.sku - The SKU that was locked/attempted
 * @param {boolean} params.acquired - Whether the lock was successfully acquired
 * @param {number} params.waitedMs - Milliseconds spent attempting to acquire
 * @returns {Promise<void>}
 */
async function recordLockAttempt({ sku, acquired, waitedMs }) {
  try {
    await pool.query(
      `INSERT INTO lock_audit (sku, acquired, waited_ms)
       VALUES ($1, $2, $3)`,
      [sku, acquired, waitedMs]
    );
  } catch (err) {
    // Log but never throw — audit failures must not affect checkout correctness
    console.error('[LockAudit] Failed to record lock attempt:', err.message);
  }
}

module.exports = { recordLockAttempt };
