/**
 * Integration Tests — ACID Checkout Transaction
 *
 * Tests the full checkout flow: inventory deduction, order/item/shipment
 * creation, idempotency, concurrency safety, and AI decoupling.
 *
 * Requires:
 *   - PostgreSQL with DATABASE_URL set and migrations applied
 *   - Redis running at REDIS_URL
 *
 * Tests gracefully skip individual assertions if services are unavailable.
 */

'use strict';

const crypto = require('crypto');

let pool;
let redis;
let executeCheckout;
let acquireLock;
let releaseLock;
let IdempotencyReplay;
let InsufficientStockError;

let dbAvailable = false;
let redisAvailable = false;
let ready = false;

// ── Test fixtures ────────────────────────────────────────────
const TEST_WAREHOUSE_ID = crypto.randomUUID();
const TEST_SKU = `TEST-SKU-${crypto.randomUUID().slice(0, 8)}`;
const TEST_SKU_2 = `TEST-SKU-${crypto.randomUUID().slice(0, 8)}`;

function makeIdempotencyKey() {
  return `test-idem-${crypto.randomUUID()}`;
}

function makeRoutingDecision(overrides = {}) {
  return {
    status: 'ROUTED',
    chosen: {
      warehouseId: TEST_WAREHOUSE_ID,
      name: 'Test Warehouse',
      distanceKm: 100,
      boxSize: 'MEDIUM',
      totalCost: 58,
      costBreakdown: {
        distanceCost: 50,
        packagingCost: 3,
        depletionPenalty: 0,
        totalCost: 53,
      },
      ...overrides,
    },
    alternatives: [],
    packing: { status: 'FITS', boxSize: 'MEDIUM' },
  };
}

// ── Setup / Teardown ─────────────────────────────────────────

beforeAll(async () => {
  try {
    pool = require('../db/pool');
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    console.warn('[Checkout Tests] DB not available:', err.message);
  }

  try {
    redis = require('../services/redisClient');
    await redis.ping();
    redisAvailable = true;
  } catch (err) {
    console.warn('[Checkout Tests] Redis not available:', err.message);
  }

  if (dbAvailable) {
    ({ executeCheckout } = require('../db/transactions/checkoutTransaction'));
    ({
      IdempotencyReplay,
      InsufficientStockError,
    } = require('../errors/checkoutErrors'));
  }

  if (redisAvailable) {
    ({ acquireLock, releaseLock } = require('../services/redisLock'));
  }

  ready = dbAvailable && redisAvailable;

  if (dbAvailable) {
    // Insert test warehouse
    await pool.query(
      `INSERT INTO warehouses (id, name, lat, lng, active)
       VALUES ($1, 'Concurrency Test Warehouse', 28.6139, 77.2090, true)
       ON CONFLICT (id) DO NOTHING`,
      [TEST_WAREHOUSE_ID]
    );

    // Insert test SKUs
    await pool.query(
      `INSERT INTO skus (sku, name, length_cm, width_cm, height_cm, weight_kg)
       VALUES ($1, 'Test Product A', 10, 10, 10, 0.5)
       ON CONFLICT (sku) DO NOTHING`,
      [TEST_SKU]
    );

    await pool.query(
      `INSERT INTO skus (sku, name, length_cm, width_cm, height_cm, weight_kg)
       VALUES ($1, 'Test Product B', 15, 15, 15, 1.0)
       ON CONFLICT (sku) DO NOTHING`,
      [TEST_SKU_2]
    );
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await pool.query(`DELETE FROM shipments WHERE warehouse_id = $1`, [TEST_WAREHOUSE_ID]);
    await pool.query(
      `DELETE FROM order_items WHERE sku IN ($1, $2)`,
      [TEST_SKU, TEST_SKU_2]
    );
    await pool.query(
      `DELETE FROM orders WHERE idempotency_key LIKE 'test-idem-%'`
    );
    await pool.query(
      `DELETE FROM inventories WHERE warehouse_id = $1`,
      [TEST_WAREHOUSE_ID]
    );
    await pool.query(`DELETE FROM lock_audit WHERE sku LIKE 'TEST-%'`);
    await pool.query(`DELETE FROM warehouses WHERE id = $1`, [TEST_WAREHOUSE_ID]);
    await pool.query(`DELETE FROM skus WHERE sku IN ($1, $2)`, [TEST_SKU, TEST_SKU_2]);
    await pool.end();
  }

  if (redisAvailable && redis) {
    const keys = await redis.keys('lock:checkout:TEST-*');
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  }
});

/** Reset inventory to a known quantity before each test */
async function resetInventory(sku, qty) {
  await pool.query(
    `INSERT INTO inventories (warehouse_id, sku, available_qty, reserved_qty)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (warehouse_id, sku)
     DO UPDATE SET available_qty = $3, reserved_qty = 0`,
    [TEST_WAREHOUSE_ID, sku, qty]
  );
}

// ── Tests ────────────────────────────────────────────────────

describe('ACID Checkout Transaction', () => {
  test('successfully creates an order and deducts inventory', async () => {
    if (!ready) return;
    await resetInventory(TEST_SKU, 20);

    const result = await executeCheckout({
      idempotencyKey: makeIdempotencyKey(),
      customerLat: 19.076,
      customerLng: 72.877,
      items: [{ sku: TEST_SKU, qty: 3 }],
      routingDecision: makeRoutingDecision(),
    });

    expect(result.order).toBeDefined();
    expect(result.order.status).toBe('ROUTED');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sku).toBe(TEST_SKU);
    expect(result.items[0].qty).toBe(3);
    expect(result.shipments).toHaveLength(1);
    expect(result.shipments[0].box_size).toBe('MEDIUM');
    expect(result.costBreakdown).toBeDefined();
    expect(result.alternatives).toBeDefined();

    // Verify inventory was actually deducted
    const inv = await pool.query(
      `SELECT available_qty, reserved_qty FROM inventories
       WHERE warehouse_id = $1 AND sku = $2`,
      [TEST_WAREHOUSE_ID, TEST_SKU]
    );
    expect(inv.rows[0].available_qty).toBe(17); // 20 - 3
    expect(inv.rows[0].reserved_qty).toBe(3);
  });

  test('throws InsufficientStockError when stock is too low', async () => {
    if (!ready) return;
    await resetInventory(TEST_SKU, 2);

    await expect(
      executeCheckout({
        idempotencyKey: makeIdempotencyKey(),
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 5 }],
        routingDecision: makeRoutingDecision(),
      })
    ).rejects.toThrow(InsufficientStockError);

    // Verify inventory was NOT deducted (rollback)
    const inv = await pool.query(
      `SELECT available_qty, reserved_qty FROM inventories
       WHERE warehouse_id = $1 AND sku = $2`,
      [TEST_WAREHOUSE_ID, TEST_SKU]
    );
    expect(inv.rows[0].available_qty).toBe(2);
    expect(inv.rows[0].reserved_qty).toBe(0);
  });

  test('throws InsufficientStockError with zero stock', async () => {
    if (!ready) return;
    await resetInventory(TEST_SKU, 0);

    await expect(
      executeCheckout({
        idempotencyKey: makeIdempotencyKey(),
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 1 }],
        routingDecision: makeRoutingDecision(),
      })
    ).rejects.toThrow(InsufficientStockError);
  });
});

describe('Idempotency', () => {
  test('returns IdempotencyReplay on duplicate key', async () => {
    if (!ready) return;
    await resetInventory(TEST_SKU, 50);
    const key = makeIdempotencyKey();

    // First checkout
    const first = await executeCheckout({
      idempotencyKey: key,
      customerLat: 19.076,
      customerLng: 72.877,
      items: [{ sku: TEST_SKU, qty: 1 }],
      routingDecision: makeRoutingDecision(),
    });
    expect(first.order).toBeDefined();

    // Replay with same key
    const replay = await executeCheckout({
      idempotencyKey: key,
      customerLat: 19.076,
      customerLng: 72.877,
      items: [{ sku: TEST_SKU, qty: 1 }],
      routingDecision: makeRoutingDecision(),
    });

    expect(replay).toBeInstanceOf(IdempotencyReplay);
    expect(replay.existingOrder.order.id).toBe(first.order.id);

    // Inventory deducted only ONCE
    const inv = await pool.query(
      `SELECT available_qty FROM inventories
       WHERE warehouse_id = $1 AND sku = $2`,
      [TEST_WAREHOUSE_ID, TEST_SKU]
    );
    expect(inv.rows[0].available_qty).toBe(49); // 50 - 1, not 50 - 2
  });

  test('only one order from multiple concurrent replays', async () => {
    if (!ready) return;
    await resetInventory(TEST_SKU, 100);
    const key = makeIdempotencyKey();

    const params = {
      idempotencyKey: key,
      customerLat: 19.076,
      customerLng: 72.877,
      items: [{ sku: TEST_SKU, qty: 1 }],
      routingDecision: makeRoutingDecision(),
    };

    // 5 concurrent requests with the same key
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => executeCheckout(params))
    );

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const realOrders = fulfilled.filter(
      r => !(r.value instanceof IdempotencyReplay)
    );

    // Exactly one real order
    expect(realOrders.length).toBe(1);

    // Exactly one order row in DB
    const orderCount = await pool.query(
      `SELECT COUNT(*) FROM orders WHERE idempotency_key = $1`,
      [key]
    );
    expect(parseInt(orderCount.rows[0].count)).toBe(1);
  });
});

describe('Concurrency — Oversell Prevention', () => {
  test(
    '20 concurrent requests for 10-unit SKU: exactly 10 succeed, 0 remaining, never negative',
    async () => {
      if (!ready) return;

      const STOCK = 10;
      const CONCURRENT = 20;

      // Clean up any orders from prior tests that used TEST_SKU
      await pool.query(
        `DELETE FROM shipments WHERE order_id IN (
           SELECT o.id FROM orders o
           JOIN order_items oi ON oi.order_id = o.id
           WHERE oi.sku = $1
         )`,
        [TEST_SKU]
      );
      await pool.query(
        `DELETE FROM order_items WHERE sku = $1`,
        [TEST_SKU]
      );
      await pool.query(
        `DELETE FROM orders WHERE idempotency_key LIKE 'test-idem-%'
           AND id NOT IN (SELECT order_id FROM order_items)`
      );

      await resetInventory(TEST_SKU, STOCK);

      const promises = Array.from({ length: CONCURRENT }, () =>
        executeCheckout({
          idempotencyKey: makeIdempotencyKey(),
          customerLat: 19.076,
          customerLng: 72.877,
          items: [{ sku: TEST_SKU, qty: 1 }],
          routingDecision: makeRoutingDecision(),
        })
      );

      const results = await Promise.allSettled(promises);

      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');

      // Exactly STOCK should succeed
      expect(successes.length).toBe(STOCK);
      expect(failures.length).toBe(CONCURRENT - STOCK);

      // All failures should be InsufficientStockError
      for (const failure of failures) {
        expect(failure.reason).toBeInstanceOf(InsufficientStockError);
      }

      // Verify final inventory: 0 available, STOCK reserved
      const inv = await pool.query(
        `SELECT available_qty, reserved_qty FROM inventories
         WHERE warehouse_id = $1 AND sku = $2`,
        [TEST_WAREHOUSE_ID, TEST_SKU]
      );
      expect(inv.rows[0].available_qty).toBe(0);
      expect(inv.rows[0].reserved_qty).toBe(STOCK);

      // Verify exactly STOCK orders were created for this SKU
      const orderCount = await pool.query(
        `SELECT COUNT(*) FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE oi.sku = $1
           AND o.idempotency_key LIKE 'test-idem-%'`,
        [TEST_SKU]
      );
      expect(parseInt(orderCount.rows[0].count)).toBe(STOCK);
    },
    30000
  );

  test('never allows negative inventory', async () => {
    if (!ready) return;
    await resetInventory(TEST_SKU, 1);

    const promises = Array.from({ length: 10 }, () =>
      executeCheckout({
        idempotencyKey: makeIdempotencyKey(),
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 1 }],
        routingDecision: makeRoutingDecision(),
      })
    );

    await Promise.allSettled(promises);

    const inv = await pool.query(
      `SELECT available_qty, reserved_qty FROM inventories
       WHERE warehouse_id = $1 AND sku = $2`,
      [TEST_WAREHOUSE_ID, TEST_SKU]
    );
    expect(inv.rows[0].available_qty).toBeGreaterThanOrEqual(0);
  }, 15000);
});

describe('AI Decoupling Verification', () => {
  test('checkout succeeds without any AI/Gemini/Maps dependency', async () => {
    if (!ready) return;
    await resetInventory(TEST_SKU, 10);

    // Source-level verification: no AI imports
    const fs = require('fs');
    const txnSource = fs.readFileSync(
      require.resolve('../db/transactions/checkoutTransaction.js'),
      'utf-8'
    );
    expect(txnSource).not.toContain('geminiClient');
    expect(txnSource).not.toContain('ai_explanations');
    expect(txnSource).not.toContain('googleMaps');
    expect(txnSource).not.toContain('gemini');
    expect(txnSource).not.toContain('Gemini');

    // Functional verification: checkout works purely with DB
    const result = await executeCheckout({
      idempotencyKey: makeIdempotencyKey(),
      customerLat: 19.076,
      customerLng: 72.877,
      items: [{ sku: TEST_SKU, qty: 1 }],
      routingDecision: makeRoutingDecision(),
    });

    expect(result.order).toBeDefined();
    expect(result.order.status).toBe('ROUTED');
  });

  test('redisLock.js has zero AI dependencies', () => {
    const fs = require('fs');
    const lockSource = fs.readFileSync(
      require.resolve('../services/redisLock.js'),
      'utf-8'
    );
    expect(lockSource).not.toContain('geminiClient');
    expect(lockSource).not.toContain('ai_explanations');
    expect(lockSource).not.toContain('googleMaps');
  });
});

describe('Performance Measurement', () => {
  test('measures synchronous transaction latency', async () => {
    if (!ready) return;
    await resetInventory(TEST_SKU, 100);

    const latencies = [];
    const RUNS = 20;

    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      await executeCheckout({
        idempotencyKey: makeIdempotencyKey(),
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 1 }],
        routingDecision: makeRoutingDecision(),
      });
      const end = process.hrtime.bigint();
      latencies.push(Number(end - start) / 1_000_000); // ms
    }

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((s, l) => s + l, 0) / latencies.length;
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`\n  ┌─── Transaction Performance ───────────────┐`);
    console.log(`  │ Runs:      ${RUNS}`);
    console.log(`  │ Avg:       ${avg.toFixed(2)} ms`);
    console.log(`  │ P95:       ${p95.toFixed(2)} ms`);
    console.log(`  │ Min:       ${latencies[0].toFixed(2)} ms`);
    console.log(`  │ Max:       ${latencies[latencies.length - 1].toFixed(2)} ms`);
    console.log(`  └────────────────────────────────────────────┘\n`);

    expect(avg).toBeGreaterThan(0);
    expect(p95).toBeGreaterThan(0);
  }, 30000);
});
