/**
 * Shared Redis Client
 *
 * Singleton instance used by all services that need Redis.
 * Uses real ioredis when REDIS_URL is configured and reachable;
 * automatically falls back to ioredis-mock in local environments.
 *
 * @module services/redisClient
 */

'use strict';

const env = require('../config/env');

let redis;

// If REDIS_URL is not explicitly configured, use in-memory ioredis-mock
if (!process.env.REDIS_URL || process.env.REDIS_URL.trim() === '') {
  const RedisMock = require('ioredis-mock');
  redis = new RedisMock();
  if (env.NODE_ENV !== 'test') {
    console.log('[Redis] Running with in-memory ioredis-mock (local dev)');
  }
} else {
  try {
    const Redis = require('ioredis');
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 300, 1500);
      },
      lazyConnect: true,
      enableReadyCheck: true,
    });

    redis.connect().catch(() => {
      console.warn('[Redis] External Redis unreachable — falling back to ioredis-mock');
      const RedisMock = require('ioredis-mock');
      redis = new RedisMock();
    });

    redis.on('error', (err) => {
      console.warn('[Redis] Connection warning:', err.message);
    });
  } catch {
    const RedisMock = require('ioredis-mock');
    redis = new RedisMock();
  }
}

module.exports = redis;
