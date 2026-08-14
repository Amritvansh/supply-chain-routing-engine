/**
 * Health Check Route
 * 
 * GET /api/v1/health
 * 
 * Tests real connectivity to PostgreSQL and Redis.
 * Returns actual status — never fakes health.
 * 
 * Response shape:
 *   { status: "ok" | "degraded", db: true|false, redis: true|false }
 * 
 * The endpoint itself always returns 200 so monitoring tools can
 * read the body to determine which dependency is down.
 */
const { Router } = require('express');
const { Pool } = require('pg');
const Redis = require('ioredis');
const env = require('../config/env');

const router = Router();

// Create a shared PG pool for health checks
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 2,               // Minimal pool for health checks only
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

/**
 * Test PostgreSQL connectivity by running SELECT 1.
 * @returns {Promise<boolean>}
 */
async function checkPostgres() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[Health] PostgreSQL check failed:', err.message);
    return false;
  }
}

/**
 * Test Redis connectivity by sending PING.
 * Creates a short-lived connection to avoid keeping a persistent
 * Redis client open just for health checks.
 * @returns {Promise<boolean>}
 */
async function checkRedis() {
  let client;
  try {
    client = new Redis(env.REDIS_URL, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    // Suppress connection error events (we handle them via the catch)
    client.on('error', () => {});

    await client.connect();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (err) {
    console.error('[Health] Redis check failed:', err.message);
    return false;
  } finally {
    if (client) {
      try {
        client.disconnect();
      } catch (_) {
        // Ignore disconnect errors
      }
    }
  }
}

// GET /api/v1/health
router.get('/', async (req, res, next) => {
  try {
    const [db, redis] = await Promise.all([
      checkPostgres(),
      checkRedis(),
    ]);

    const allHealthy = db && redis;

    res.status(200).json({
      status: allHealthy ? 'ok' : 'degraded',
      db,
      redis,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
