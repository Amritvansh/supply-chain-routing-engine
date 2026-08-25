/**
 * Redis Distributed Lock — Compare-and-Delete Safe Release
 *
 * Provides per-SKU checkout locking using SETNX + PX with a unique
 * token per acquisition. Release uses a Lua compare-and-delete script
 * to prevent one request from accidentally releasing another's lock.
 *
 * Key format: lock:checkout:{sku}
 * TTL: 5000ms default (auto-expire if holder crashes)
 *
 * @module services/redisLock
 */

'use strict';

const crypto = require('crypto');
const redis = require('./redisClient');

/**
 * Lua script for safe lock release.
 * Only deletes the key if the stored value matches the caller's token.
 * Returns 1 if the lock was released, 0 if the token did not match
 * (meaning the lock was already released or acquired by another holder).
 */
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

/**
 * Attempt to acquire a distributed lock for a checkout SKU.
 *
 * @param {string} sku - The SKU to lock
 * @param {number} [ttlMs=5000] - Lock TTL in milliseconds
 * @returns {Promise<{ acquired: boolean, token: string|null, waitedMs: number }>}
 */
async function acquireLock(sku, ttlMs = 5000) {
  const lockKey = `lock:checkout:${sku}`;
  const token = crypto.randomUUID();
  const startTime = Date.now();

  try {
    // SET key token NX PX ttlMs
    // NX = only set if key does not exist
    // PX = set TTL in milliseconds
    const result = await redis.set(lockKey, token, 'NX', 'PX', ttlMs);

    const waitedMs = Date.now() - startTime;

    if (result === 'OK') {
      return { acquired: true, token, waitedMs };
    }

    return { acquired: false, token: null, waitedMs };
  } catch (err) {
    const waitedMs = Date.now() - startTime;
    // Wrap Redis errors so the caller can distinguish them
    const lockError = new Error(`Redis lock acquisition failed for SKU "${sku}": ${err.message}`);
    lockError.code = 'REDIS_LOCK_ERROR';
    lockError.sku = sku;
    lockError.waitedMs = waitedMs;
    throw lockError;
  }
}

/**
 * Release a distributed lock, but ONLY if the stored token matches.
 *
 * Uses a Lua compare-and-delete script to atomically verify ownership
 * before deleting. This prevents Request A from releasing Request B's lock.
 *
 * @param {string} sku - The SKU whose lock to release
 * @param {string} token - The token returned by acquireLock
 * @returns {Promise<boolean>} true if the lock was successfully released
 */
async function releaseLock(sku, token) {
  const lockKey = `lock:checkout:${sku}`;

  try {
    const result = await redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
    return result === 1;
  } catch (err) {
    // Log but don't throw — the TTL will auto-expire the lock.
    // The caller should not crash if release fails after a successful checkout.
    const logger = require('./logger');
    logger.error({ sku, error: err.message }, 'Redis lock release failed');
    return false;
  }
}

module.exports = { acquireLock, releaseLock };
