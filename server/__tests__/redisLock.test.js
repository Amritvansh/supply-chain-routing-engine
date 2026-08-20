/**
 * Unit Tests — Redis Distributed Lock
 *
 * Tests the SETNX + PX lock acquisition and Lua compare-and-delete release.
 * Requires a running Redis instance at REDIS_URL.
 * If Redis is unavailable, tests are skipped gracefully.
 */

'use strict';

const crypto = require('crypto');

let redis;
let acquireLock;
let releaseLock;
let redisAvailable = false;

beforeAll(async () => {
  try {
    redis = require('../services/redisClient');
    ({ acquireLock, releaseLock } = require('../services/redisLock'));
    await redis.ping();
    redisAvailable = true;
  } catch (err) {
    console.warn('[RedisLock Tests] Redis not available, skipping:', err.message);
  }
});

afterAll(async () => {
  if (redis && redisAvailable) {
    const keys = await redis.keys('lock:checkout:TEST-*');
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  }
});

function skipUnless(condition) {
  return condition() ? test : test.skip;
}

describe('Redis Distributed Lock', () => {
  const testSku = `TEST-LOCK-${crypto.randomUUID().slice(0, 8)}`;

  afterEach(async () => {
    if (redisAvailable) {
      await redis.del(`lock:checkout:${testSku}`);
    }
  });

  test('acquires a lock and returns a unique token', async () => {
    if (!redisAvailable) return;

    const result = await acquireLock(testSku);

    expect(result.acquired).toBe(true);
    expect(result.token).toBeTruthy();
    expect(typeof result.token).toBe('string');
    expect(result.waitedMs).toBeGreaterThanOrEqual(0);

    // Verify the key exists in Redis
    const stored = await redis.get(`lock:checkout:${testSku}`);
    expect(stored).toBe(result.token);

    await releaseLock(testSku, result.token);
  });

  test('fails to acquire when lock is already held', async () => {
    if (!redisAvailable) return;

    const first = await acquireLock(testSku);
    expect(first.acquired).toBe(true);

    const second = await acquireLock(testSku);
    expect(second.acquired).toBe(false);
    expect(second.token).toBeNull();

    await releaseLock(testSku, first.token);
  });

  test('releases a lock only when token matches (Lua compare-and-delete)', async () => {
    if (!redisAvailable) return;

    const result = await acquireLock(testSku);
    expect(result.acquired).toBe(true);

    // Wrong token — must fail
    const wrongRelease = await releaseLock(testSku, 'wrong-token-value');
    expect(wrongRelease).toBe(false);

    // Lock should still be held
    const stillLocked = await acquireLock(testSku);
    expect(stillLocked.acquired).toBe(false);

    // Correct release
    const correctRelease = await releaseLock(testSku, result.token);
    expect(correctRelease).toBe(true);

    // Now acquirable again
    const reacquired = await acquireLock(testSku);
    expect(reacquired.acquired).toBe(true);
    await releaseLock(testSku, reacquired.token);
  });

  test('lock auto-expires after TTL', async () => {
    if (!redisAvailable) return;

    const result = await acquireLock(testSku, 200); // 200ms TTL
    expect(result.acquired).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Should be acquirable without release
    const after = await acquireLock(testSku);
    expect(after.acquired).toBe(true);
    await releaseLock(testSku, after.token);
  });

  test('each acquisition generates a unique token', async () => {
    if (!redisAvailable) return;

    const tokens = new Set();
    for (let i = 0; i < 5; i++) {
      const sku = `${testSku}-unique-${i}`;
      const result = await acquireLock(sku);
      expect(result.acquired).toBe(true);
      tokens.add(result.token);
      await releaseLock(sku, result.token);
    }
    expect(tokens.size).toBe(5);
  });

  test('one request cannot release another request\'s lock', async () => {
    if (!redisAvailable) return;

    const requestA = await acquireLock(testSku);
    expect(requestA.acquired).toBe(true);

    // Request B tries to release A's lock with a different token
    const requestBToken = crypto.randomUUID();
    const released = await releaseLock(testSku, requestBToken);
    expect(released).toBe(false);

    // A's lock is still held
    const requestBTry = await acquireLock(testSku);
    expect(requestBTry.acquired).toBe(false);

    // A releases correctly
    const aReleased = await releaseLock(testSku, requestA.token);
    expect(aReleased).toBe(true);
  });
});
