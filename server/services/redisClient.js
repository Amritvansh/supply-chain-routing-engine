/**
 * Shared Redis Client
 *
 * Singleton instance used by all services that need Redis.
 * Uses real ioredis when REDIS_URL is configured and reachable;
 * automatically falls back to in-memory ioredis-mock in local environments.
 *
 * Uses a Proxy wrapper so dynamic fallback to ioredis-mock works
 * seamlessly across all consumers without stale module.exports references.
 *
 * @module services/redisClient
 */

'use strict';

const env = require('../config/env');
const RedisMock = require('ioredis-mock');

let activeClient = new RedisMock();

if (!process.env.REDIS_URL || process.env.REDIS_URL.trim() === '') {
  if (env.NODE_ENV !== 'test') {
    console.log('[Redis] Running with in-memory ioredis-mock (local dev)');
  }
} else {
  try {
    const Redis = require('ioredis');
    const realRedis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 2) return null;
        return 300;
      },
      lazyConnect: true,
      enableReadyCheck: true,
    });

    realRedis.connect()
      .then(() => {
        if (env.NODE_ENV !== 'test') {
          console.log('[Redis] Connected to external Redis');
        }
        activeClient = realRedis;
      })
      .catch(() => {
        console.warn('[Redis] External Redis unreachable — falling back to ioredis-mock');
        activeClient = new RedisMock();
      });

    realRedis.on('error', (err) => {
      if (!(activeClient instanceof RedisMock)) {
        console.warn('[Redis] Connection warning, using fallback mock:', err.message);
        activeClient = new RedisMock();
      }
    });
  } catch {
    activeClient = new RedisMock();
  }
}

const redisProxy = new Proxy({}, {
  get(target, prop) {
    const val = activeClient[prop];
    if (typeof val === 'function') {
      return val.bind(activeClient);
    }
    return val;
  },
  set(target, prop, value) {
    activeClient[prop] = value;
    return true;
  }
});

module.exports = redisProxy;
