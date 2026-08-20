/**
 * Week 3 Integration Tests — Member 2
 *
 * Tests for:
 *   - POST /api/v1/orders/checkout (sync path, no AI)
 *   - POST /api/v1/orders/flash-test
 *   - Idempotency validation
 *   - Lock contention (429)
 *   - Insufficient stock (409)
 *   - AI decoupling verification
 *
 * Requires:
 *   - PostgreSQL with DATABASE_URL set and migrations applied
 *   - Redis running at REDIS_URL
 *
 * Tests gracefully skip if services are unavailable.
 */

'use strict';

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════
// §0 — SETUP: Detect DB/Redis availability
// ═══════════════════════════════════════════════════════════════

let pool;
let redis;
let dbAvailable = false;
let redisAvailable = false;
let ready = false;
let app;

const TEST_WAREHOUSE_ID = crypto.randomUUID();
const TEST_SKU = `W3-SKU-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  try {
    pool = require('../db/pool');
    await pool.query('SELECT 1');
    dbAvailable = true;
  } catch (err) {
    console.warn('[W3 Tests] DB not available:', err.message);
  }

  try {
    redis = require('../services/redisClient');
    await redis.ping();
    redisAvailable = true;
  } catch (err) {
    console.warn('[W3 Tests] Redis not available:', err.message);
  }

  ready = dbAvailable && redisAvailable;

  if (!ready) {
    console.warn('[W3 Tests] Skipping integration tests — DB or Redis unavailable.');
    return;
  }

  // Insert test warehouse
  await pool.query(
    `INSERT INTO warehouses (id, name, lat, lng, active)
     VALUES ($1, 'W3 Test Warehouse', 28.6139, 77.2090, true)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_WAREHOUSE_ID]
  );

  // Insert test SKU
  await pool.query(
    `INSERT INTO skus (sku, name, length_cm, width_cm, height_cm, weight_kg)
     VALUES ($1, 'W3 Test Widget', 10, 10, 10, 0.5)
     ON CONFLICT (sku) DO NOTHING`,
    [TEST_SKU]
  );

  // Seed inventory
  await pool.query(
    `INSERT INTO inventories (warehouse_id, sku, available_qty, reserved_qty)
     VALUES ($1, $2, 100, 0)
     ON CONFLICT (warehouse_id, sku)
     DO UPDATE SET available_qty = 100, reserved_qty = 0`,
    [TEST_WAREHOUSE_ID, TEST_SKU]
  );

  app = require('../app');
});

afterAll(async () => {
  if (dbAvailable) {
    // Clean up test data in correct FK order
    await pool.query(`DELETE FROM shipments WHERE warehouse_id = $1`, [TEST_WAREHOUSE_ID]);
    await pool.query(`DELETE FROM order_items WHERE sku = $1`, [TEST_SKU]);
    await pool.query(
      `DELETE FROM orders WHERE idempotency_key LIKE 'w3-test-%' OR idempotency_key LIKE 'flash-test-%'`
    );
    await pool.query(`DELETE FROM inventories WHERE warehouse_id = $1`, [TEST_WAREHOUSE_ID]);
    await pool.query(`DELETE FROM lock_audit WHERE sku = $1`, [TEST_SKU]);
    await pool.query(`DELETE FROM warehouses WHERE id = $1`, [TEST_WAREHOUSE_ID]);
    await pool.query(`DELETE FROM skus WHERE sku = $1`, [TEST_SKU]);
    await pool.end();
  }

  if (redisAvailable && redis) {
    const keys = await redis.keys(`lock:checkout:${TEST_SKU}`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  }
});

/** Reset inventory to a known quantity */
async function resetInventory(qty) {
  await pool.query(
    `UPDATE inventories SET available_qty = $1, reserved_qty = 0
     WHERE warehouse_id = $2 AND sku = $3`,
    [qty, TEST_WAREHOUSE_ID, TEST_SKU]
  );
}

// ═══════════════════════════════════════════════════════════════
// §1 — CHECKOUT: VALIDATION
// ═══════════════════════════════════════════════════════════════

const request = require('supertest');

describe('POST /api/v1/orders/checkout — Validation', () => {
  test('returns 400 when Idempotency-Key header is missing', async () => {
    if (!ready) return;
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .send({ customerLat: 28.6, customerLng: 77.2, items: [{ sku: TEST_SKU, qty: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  test('returns 400 when items is empty', async () => {
    if (!ready) return;
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', `w3-test-${crypto.randomUUID()}`)
      .send({ customerLat: 28.6, customerLng: 77.2, items: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  test('returns 400 when customerLat/Lng are missing', async () => {
    if (!ready) return;
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', `w3-test-${crypto.randomUUID()}`)
      .send({ items: [{ sku: TEST_SKU, qty: 1 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });
});

// ═══════════════════════════════════════════════════════════════
// §2 — CHECKOUT: HAPPY PATH
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/orders/checkout — Happy Path', () => {
  test('returns 201 with order, shipments, costBreakdown, alternatives', async () => {
    if (!ready) return;
    await resetInventory(50);

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', `w3-test-${crypto.randomUUID()}`)
      .send({
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 2 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.order).toBeDefined();
    expect(res.body.order.status).toBe('ROUTED');
    expect(res.body.shipments).toBeDefined();
    expect(res.body.shipments.length).toBeGreaterThanOrEqual(1);
    expect(res.body.costBreakdown).toBeDefined();
    expect(res.body.costBreakdown.distanceCost).toBeDefined();
    expect(res.body.costBreakdown.packagingCost).toBeDefined();
    expect(res.body.costBreakdown.depletionPenalty).toBeDefined();
    expect(res.body.alternatives).toBeDefined();
    expect(res.body.packing).toBeDefined();
  });

  test('checkout response contains NO AI explanation text', async () => {
    if (!ready) return;
    await resetInventory(50);

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', `w3-test-${crypto.randomUUID()}`)
      .send({
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 1 }],
      });

    expect(res.status).toBe(201);
    // No AI-related fields should be present
    expect(res.body.explanation).toBeUndefined();
    expect(res.body.modelUsed).toBeUndefined();
    expect(res.body.source).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// §3 — CHECKOUT: AI DECOUPLING VERIFICATION
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/orders/checkout — AI Decoupling', () => {
  test('checkout controller source does NOT reference geminiClient', () => {
    const fs = require('fs');
    const source = fs.readFileSync(
      require.resolve('../routes/orders.js'),
      'utf-8'
    );

    // The checkout handler section specifically must not call gemini
    // We check that the checkout handler (between 'post(\'/checkout\'' and the next route)
    // doesn't invoke generateExplanation
    const checkoutSection = source.split("post('/checkout'")[1]?.split("get('/:id'")[0] || '';
    expect(checkoutSection).not.toContain('generateExplanation');
    expect(checkoutSection).not.toContain('ai_explanations');
  });

  test('checkout succeeds even though Gemini is never called', async () => {
    if (!ready) return;
    await resetInventory(50);

    // This test proves the checkout path works purely with DB + Redis
    // without any dependency on Gemini or Google Maps real API
    const startTime = Date.now();

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', `w3-test-${crypto.randomUUID()}`)
      .send({
        customerLat: 28.6139,
        customerLng: 77.2090,
        items: [{ sku: TEST_SKU, qty: 1 }],
      });

    const latencyMs = Date.now() - startTime;

    expect(res.status).toBe(201);
    expect(res.body.order).toBeDefined();

    // Log performance for reference
    console.log(`  [Checkout Latency] ${latencyMs}ms`);
  });
});

// ═══════════════════════════════════════════════════════════════
// §4 — CHECKOUT: INSUFFICIENT STOCK
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/orders/checkout — Insufficient Stock', () => {
  test('returns 409 when stock is insufficient', async () => {
    if (!ready) return;
    await resetInventory(1);

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', `w3-test-${crypto.randomUUID()}`)
      .send({
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 999 }],
      });

    // Either 409 from routing (NO_ELIGIBLE_WAREHOUSE) or from transaction (INSUFFICIENT_STOCK)
    expect([409]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════
// §5 — CHECKOUT: IDEMPOTENCY
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/orders/checkout — Idempotency', () => {
  test('duplicate key returns 200 with same order (replay)', async () => {
    if (!ready) return;
    await resetInventory(50);
    const idemKey = `w3-test-${crypto.randomUUID()}`;

    // First request
    const res1 = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', idemKey)
      .send({
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 1 }],
      });
    expect(res1.status).toBe(201);

    // Second request with same key
    const res2 = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', idemKey)
      .send({
        customerLat: 19.076,
        customerLng: 72.877,
        items: [{ sku: TEST_SKU, qty: 1 }],
      });

    expect(res2.status).toBe(200);
    expect(res2.body.replay).toBe(true);

    // Verify inventory was only deducted ONCE
    const inv = await pool.query(
      `SELECT available_qty FROM inventories WHERE warehouse_id = $1 AND sku = $2`,
      [TEST_WAREHOUSE_ID, TEST_SKU]
    );
    // Should be 49 (50 - 1), not 48
    expect(inv.rows[0].available_qty).toBe(49);
  });
});

// ═══════════════════════════════════════════════════════════════
// §6 — FLASH-TEST ENDPOINT
// ═══════════════════════════════════════════════════════════════

describe('POST /api/v1/orders/flash-test', () => {
  test('returns 400 for missing sku', async () => {
    if (!ready) return;
    const res = await request(app)
      .post('/api/v1/orders/flash-test')
      .send({ qty: 1, concurrency: 5 });

    expect(res.status).toBe(400);
  });

  test('returns 400 for concurrency exceeding limit', async () => {
    if (!ready) return;
    const res = await request(app)
      .post('/api/v1/orders/flash-test')
      .send({ sku: TEST_SKU, qty: 1, concurrency: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONCURRENCY_LIMIT');
  });

  test('returns 400 for unknown SKU', async () => {
    if (!ready) return;
    const res = await request(app)
      .post('/api/v1/orders/flash-test')
      .send({ sku: 'DOES-NOT-EXIST', qty: 1, concurrency: 3 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNKNOWN_SKU');
  });

  test('executes flash-test with real checkout logic and returns metrics', async () => {
    if (!ready) return;
    await resetInventory(5); // Only 5 in stock

    const res = await request(app)
      .post('/api/v1/orders/flash-test')
      .send({ sku: TEST_SKU, qty: 1, concurrency: 10 });

    expect(res.status).toBe(200);
    expect(res.body.successCount).toBeDefined();
    expect(res.body.rateLimited429Count).toBeDefined();
    expect(res.body.conflict409Count).toBeDefined();
    expect(res.body.avgLatencyMs).toBeDefined();
    expect(res.body.p95LatencyMs).toBeDefined();

    // Total should add up
    const total = res.body.successCount + res.body.rateLimited429Count + res.body.conflict409Count;
    expect(total).toBe(10);

    // No more than 5 should succeed (only 5 in stock)
    expect(res.body.successCount).toBeLessThanOrEqual(5);

    console.log('  [Flash Test Results]', JSON.stringify(res.body, null, 2));
  }, 30000);
});

// ═══════════════════════════════════════════════════════════════
// §7 — PERFORMANCE MEASUREMENT
// ═══════════════════════════════════════════════════════════════

describe('Checkout Performance', () => {
  test('measures end-to-end checkout latency (HTTP)', async () => {
    if (!ready) return;
    await resetInventory(30);

    const latencies = [];
    const RUNS = 10;

    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Idempotency-Key', `w3-test-perf-${crypto.randomUUID()}`)
        .send({
          customerLat: 19.076,
          customerLng: 72.877,
          items: [{ sku: TEST_SKU, qty: 1 }],
        });
      const end = process.hrtime.bigint();

      expect(res.status).toBe(201);
      latencies.push(Number(end - start) / 1_000_000);
    }

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((s, l) => s + l, 0) / latencies.length;
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`\n  ┌─── HTTP Checkout Performance ─────────────┐`);
    console.log(`  │ Runs:      ${RUNS}`);
    console.log(`  │ Avg:       ${avg.toFixed(2)} ms`);
    console.log(`  │ P95:       ${p95.toFixed(2)} ms`);
    console.log(`  │ Min:       ${latencies[0].toFixed(2)} ms`);
    console.log(`  │ Max:       ${latencies[latencies.length - 1].toFixed(2)} ms`);
    console.log(`  └────────────────────────────────────────────┘\n`);

    expect(avg).toBeGreaterThan(0);
  }, 60000);
});
