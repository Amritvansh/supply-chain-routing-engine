/**
 * Shared Redis Client
 *
 * Singleton ioredis instance used by all services that need Redis.
 * The health-check route creates its own short-lived client by design,
 * but the lock service and any future caching layers share this one.
 *
 * @module services/redisClient
 */

'use strict';

const Redis = require('ioredis');
const env = require('../config/env');

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    // Exponential backoff capped at 2 seconds
    return Math.min(times * 200, 2000);
  },
  lazyConnect: false,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  if (env.NODE_ENV !== 'test') {
    console.log('[Redis] Connected to', env.REDIS_URL);
  }
});

module.exports = redis;
