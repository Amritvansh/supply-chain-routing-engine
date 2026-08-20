/**
 * Order Routes
 *
 * POST /api/v1/orders/checkout    — Deterministic routing + ACID checkout (SYNC, no AI)
 * GET  /api/v1/orders/:id         — Order + items + shipments
 * GET  /api/v1/orders/:id/explain — Cached or freshly-generated AI explanation (ASYNC)
 * POST /api/v1/orders/flash-test  — Server-side flash-sale stress simulation
 *
 * ARCHITECTURAL NOTE:
 *   checkout and explain are intentionally separate routes with separate
 *   execution paths. checkout must NEVER await Gemini. explain is the only
 *   route that touches ai_explanations or the Gemini API.
 *
 * Week 2 implements: GET /:id and GET /:id/explain
 * Week 3 implements: POST /checkout and POST /flash-test
 */
'use strict';

const crypto = require('crypto');
const { Router } = require('express');
const pool = require('../db/pool');
const { getExplanation, insertExplanation } = require('../db/aiExplanations');
const geminiClient = require('../services/geminiClient');
const { getDistance } = require('../services/googleMaps');
const { selectOptimalWarehouse } = require('../algorithms/routingEngine');
const { acquireLock, releaseLock } = require('../services/redisLock');
const { executeCheckout } = require('../db/transactions/checkoutTransaction');
const { recordLockAttempt } = require('../db/lockAudit');
const {
  InsufficientStockError,
  LockUnavailableError,
  IdempotencyReplay,
  DatabaseTransactionError,
} = require('../errors/checkoutErrors');

const router = Router();

/**
 * UUID v4 format validation regex.
 * Used to validate :id parameters before hitting the database.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maximum concurrency for flash-test endpoint.
 * Prevents unbounded database/Redis load from a single request.
 */
const FLASH_TEST_MAX_CONCURRENCY = 50;

// ─── POST /api/v1/orders/checkout ───────────────────────────────
/**
 * Synchronous deterministic checkout.
 *
 * Flow:
 *   1. Validate request body and Idempotency-Key header
 *   2. Resolve eligible warehouses with inventory from DB
 *   3. Calculate distances (Google Maps / Haversine fallback)
 *   4. Run routing engine → chosen warehouse + alternatives + costBreakdown
 *   5. Acquire per-SKU Redis locks (sorted lexicographically to prevent deadlocks)
 *   6. Execute ACID checkout transaction
 *   7. Release locks in finally block
 *   8. Return 201 with deterministic result
 *
 * CRITICAL: This handler does NOT call geminiClient, does NOT await Gemini,
 * does NOT read/write ai_explanations. The frontend will separately call
 * GET /api/v1/orders/:id/explain after receiving the order.
 */
router.post('/checkout', async (req, res, next) => {
  // Track acquired locks for guaranteed cleanup
  const acquiredLocks = [];

  try {
    // ── Step 1: Validate Idempotency-Key header ──────────────
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDEMPOTENCY_KEY',
          message: 'Idempotency-Key header is required.',
        },
      });
    }

    // ── Step 2: Validate request body ────────────────────────
    const { customerLat, customerLng, items } = req.body;

    if (
      customerLat === undefined || customerLng === undefined ||
      typeof customerLat !== 'number' || typeof customerLng !== 'number' ||
      !isFinite(customerLat) || !isFinite(customerLng)
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'customerLat and customerLng must be finite numbers.',
        },
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'items must be a non-empty array of { sku, qty }.',
        },
      });
    }

    for (const item of items) {
      if (!item.sku || typeof item.sku !== 'string') {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Each item must have a string sku.',
          },
        });
      }
      if (!item.qty || typeof item.qty !== 'number' || item.qty < 1 || !Number.isInteger(item.qty)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: `Item "${item.sku}" must have a positive integer qty.`,
          },
        });
      }
    }

    // ── Step 3: Resolve eligible warehouses with inventory ───
    const warehouseResult = await pool.query(`
      SELECT
        w.id, w.name, w.lat, w.lng, w.active,
        i.sku, i.available_qty
      FROM warehouses w
      JOIN inventories i ON i.warehouse_id = w.id
      WHERE w.active = true
      ORDER BY w.name
    `);

    // Group by warehouse and build inventory maps
    const warehouseMap = new Map();
    for (const row of warehouseResult.rows) {
      if (!warehouseMap.has(row.id)) {
        warehouseMap.set(row.id, {
          id: row.id,
          name: row.name,
          lat: parseFloat(row.lat),
          lng: parseFloat(row.lng),
          inventory: {},
        });
      }
      warehouseMap.get(row.id).inventory[row.sku] = row.available_qty;
    }

    const warehouses = Array.from(warehouseMap.values());

    if (warehouses.length === 0) {
      return res.status(409).json({
        error: {
          code: 'NO_WAREHOUSES',
          message: 'No active warehouses available.',
        },
      });
    }

    // ── Step 4: Calculate distances ──────────────────────────
    const customerLocation = { lat: customerLat, lng: customerLng };

    for (const wh of warehouses) {
      const result = await getDistance(
        { lat: wh.lat, lng: wh.lng },
        customerLocation
      );
      wh.distanceKm = result.distanceKm;
    }

    // ── Step 5: Fetch SKU dimensions for bin-packing ────────
    const skuList = items.map(i => i.sku);
    const skuResult = await pool.query(
      `SELECT sku, name, length_cm, width_cm, height_cm, weight_kg
       FROM skus WHERE sku = ANY($1)`,
      [skuList]
    );

    const skuMap = new Map();
    for (const row of skuResult.rows) {
      skuMap.set(row.sku, row);
    }

    // Verify all requested SKUs exist
    for (const item of items) {
      if (!skuMap.has(item.sku)) {
        return res.status(400).json({
          error: {
            code: 'UNKNOWN_SKU',
            message: `SKU "${item.sku}" does not exist.`,
          },
        });
      }
    }

    // Build order items with dimensions for the routing engine
    const orderItems = items.map(item => {
      const sku = skuMap.get(item.sku);
      return {
        sku: item.sku,
        name: sku.name,
        length_cm: sku.length_cm,
        width_cm: sku.width_cm,
        height_cm: sku.height_cm,
        weight_kg: parseFloat(sku.weight_kg),
        qty: item.qty,
      };
    });

    // ── Step 6: Run routing engine ──────────────────────────
    const routingResult = selectOptimalWarehouse({
      warehouses,
      orderItems,
    });

    if (routingResult.status !== 'ROUTED') {
      return res.status(409).json({
        error: {
          code: routingResult.status,
          message: routingResult.message || 'Routing failed.',
        },
      });
    }

    // ── Step 7: Acquire per-SKU Redis locks ─────────────────
    // Sort SKUs lexicographically to prevent distributed deadlocks
    const sortedSkus = [...new Set(items.map(i => i.sku))].sort();

    for (const sku of sortedSkus) {
      const lockResult = await acquireLock(sku);

      // Fire-and-forget audit
      recordLockAttempt({
        sku,
        acquired: lockResult.acquired,
        waitedMs: lockResult.waitedMs,
      });

      if (!lockResult.acquired) {
        // Release any locks already acquired before returning
        for (const lock of acquiredLocks) {
          await releaseLock(lock.sku, lock.token);
        }
        return res.status(429).json({
          error: {
            code: 'LOCK_UNAVAILABLE',
            message: `SKU "${sku}" is currently being checked out by another request. Try again shortly.`,
          },
        });
      }

      acquiredLocks.push({ sku, token: lockResult.token });
    }

    // ── Step 8: Execute ACID checkout transaction ────────────
    const txnResult = await executeCheckout({
      idempotencyKey,
      customerLat,
      customerLng,
      items,
      routingDecision: routingResult,
    });

    // ── Step 9: Handle idempotency replay ───────────────────
    if (txnResult instanceof IdempotencyReplay) {
      return res.status(200).json({
        order: txnResult.existingOrder.order,
        items: txnResult.existingOrder.items,
        shipments: txnResult.existingOrder.shipments,
        replay: true,
      });
    }

    // ── Step 10: Return 201 Created ─────────────────────────
    res.status(201).json({
      order: txnResult.order,
      items: txnResult.items,
      shipments: txnResult.shipments,
      costBreakdown: txnResult.costBreakdown,
      alternatives: txnResult.alternatives,
      packing: routingResult.packing,
    });

  } catch (err) {
    // Map typed errors to HTTP status codes
    if (err instanceof InsufficientStockError) {
      return res.status(409).json({
        error: {
          code: err.code,
          message: err.message,
          sku: err.sku,
          requested: err.requested,
          available: err.available,
        },
      });
    }

    if (err instanceof DatabaseTransactionError) {
      console.error('[Checkout] Transaction error:', err.message);
      return res.status(500).json({
        error: {
          code: 'TRANSACTION_FAILED',
          message: 'Checkout transaction failed. Please try again.',
        },
      });
    }

    if (err.code === 'REDIS_LOCK_ERROR') {
      console.error('[Checkout] Redis lock error:', err.message);
      return res.status(500).json({
        error: {
          code: 'LOCK_SERVICE_ERROR',
          message: 'Lock service unavailable. Please try again.',
        },
      });
    }

    next(err);

  } finally {
    // ── Guaranteed lock cleanup ─────────────────────────────
    for (const lock of acquiredLocks) {
      await releaseLock(lock.sku, lock.token);
    }
  }
});

// ─── GET /api/v1/orders/:id ─────────────────────────────────────
/**
 * Returns an order with its items and shipments.
 *
 * Response shape:
 *   {
 *     order: { id, customerLat, customerLng, status, idempotencyKey, createdAt },
 *     items: [{ id, sku, skuName, qty }],
 *     shipments: [{ id, warehouseId, warehouseName, boxSize, totalCost, distanceKm, createdAt }]
 *   }
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: `"${id}" is not a valid UUID.`,
        },
      });
    }

    // Fetch order
    const orderResult = await pool.query(
      'SELECT id, customer_lat, customer_lng, status, idempotency_key, created_at FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: `Order ${id} not found.`,
        },
      });
    }

    const orderRow = orderResult.rows[0];

    // Fetch order items with SKU names
    const itemsResult = await pool.query(
      `SELECT oi.id, oi.sku, s.name AS sku_name, oi.qty
       FROM order_items oi
       JOIN skus s ON s.sku = oi.sku
       WHERE oi.order_id = $1
       ORDER BY s.name`,
      [id]
    );

    // Fetch shipments with warehouse names
    const shipmentsResult = await pool.query(
      `SELECT sh.id, sh.warehouse_id, w.name AS warehouse_name,
              sh.box_size, sh.total_cost, sh.distance_km, sh.created_at
       FROM shipments sh
       JOIN warehouses w ON w.id = sh.warehouse_id
       WHERE sh.order_id = $1
       ORDER BY sh.created_at`,
      [id]
    );

    res.status(200).json({
      order: {
        id: orderRow.id,
        customerLat: parseFloat(orderRow.customer_lat),
        customerLng: parseFloat(orderRow.customer_lng),
        status: orderRow.status,
        idempotencyKey: orderRow.idempotency_key,
        createdAt: orderRow.created_at,
      },
      items: itemsResult.rows.map(r => ({
        id: r.id,
        sku: r.sku,
        skuName: r.sku_name,
        qty: r.qty,
      })),
      shipments: shipmentsResult.rows.map(r => ({
        id: r.id,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        boxSize: r.box_size,
        totalCost: parseFloat(r.total_cost),
        distanceKm: parseFloat(r.distance_km),
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/orders/:id/explain ─────────────────────────────
/**
 * Returns an AI-generated or deterministic explanation of the
 * routing decision for a given order.
 *
 * Flow:
 *   1. Validate UUID.
 *   2. Verify order exists.
 *   3. Check ai_explanations cache (via M1's helper).
 *   4. Cache hit → return immediately.
 *   5. Cache miss → reconstruct routing context from shipment data.
 *   6. Call geminiClient.generateExplanation().
 *   7. Store result via M1's insertExplanation().
 *   8. Return explanation with metadata.
 *
 * ARCHITECTURAL RULE: This is the ONLY route that touches
 * the Gemini API or the ai_explanations table.
 */
router.get('/:id/explain', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: `"${id}" is not a valid UUID.`,
        },
      });
    }

    // Verify order exists
    const orderResult = await pool.query(
      'SELECT id, customer_lat, customer_lng, status FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'ORDER_NOT_FOUND',
          message: `Order ${id} not found.`,
        },
      });
    }

    // Check explanation cache
    const cached = await getExplanation(id);
    if (cached) {
      return res.status(200).json({
        explanation: cached.explanation_text,
        modelUsed: cached.model_used,
        source: cached.source,
        latencyMs: cached.latency_ms,
        generatedAt: cached.created_at,
        cached: true,
      });
    }

    // Cache miss — reconstruct routing context from shipment data
    const shipmentsResult = await pool.query(
      `SELECT sh.warehouse_id, w.name AS warehouse_name,
              sh.box_size, sh.total_cost, sh.distance_km
       FROM shipments sh
       JOIN warehouses w ON w.id = sh.warehouse_id
       WHERE sh.order_id = $1
       ORDER BY sh.total_cost ASC`,
      [id]
    );

    if (shipmentsResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'NO_SHIPMENTS',
          message: `Order ${id} has no shipments yet. Explanation cannot be generated until checkout is complete.`,
        },
      });
    }

    // Build a routing-result-like structure for the Gemini prompt
    const chosenRow = shipmentsResult.rows[0];

    // Fetch all warehouses to build alternatives
    const allWarehousesResult = await pool.query(
      `SELECT w.id, w.name, w.lat, w.lng
       FROM warehouses w WHERE w.active = true`
    );

    const chosenWarehouse = allWarehousesResult.rows.find(w => w.id === chosenRow.warehouse_id);

    const routingResult = {
      status: 'ROUTED',
      chosen: {
        warehouseId: chosenRow.warehouse_id,
        name: chosenRow.warehouse_name,
        distanceKm: parseFloat(chosenRow.distance_km),
        boxSize: chosenRow.box_size,
        costBreakdown: {
          distanceCost: Math.round(parseFloat(chosenRow.distance_km) * 0.5 * 100) / 100,
          packagingCost: { SMALL: 1, MEDIUM: 3, LARGE: 7 }[chosenRow.box_size] || 0,
          depletionPenalty: 0, // Not stored per-shipment; approximate
        },
        totalCost: parseFloat(chosenRow.total_cost),
      },
      alternatives: allWarehousesResult.rows
        .filter(w => w.id !== chosenRow.warehouse_id)
        .map(w => ({
          warehouseId: w.id,
          name: w.name,
          distanceKm: null,
          penalty: null,
          totalCost: null,
          rejectionReason: 'Not selected by routing engine',
        })),
    };

    // Generate explanation (Gemini or fallback — never throws)
    const result = await geminiClient.generateExplanation(routingResult);

    // Persist to cache via M1's helper
    await insertExplanation(
      id,
      result.explanation,
      result.modelUsed,
      result.source,
      result.latencyMs
    );

    res.status(200).json({
      explanation: result.explanation,
      modelUsed: result.modelUsed,
      source: result.source,
      latencyMs: result.latencyMs,
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/orders/flash-test ─────────────────────────────
/**
 * Server-side flash-sale stress simulation.
 *
 * Fires N concurrent checkout attempts through the REAL checkout path
 * (routing engine → Redis locks → ACID transaction) and returns
 * aggregated performance metrics.
 *
 * Request body:
 *   { sku: string, qty: number, concurrency: number }
 *
 * Concurrency is capped at FLASH_TEST_MAX_CONCURRENCY (50) to prevent
 * unbounded database/Redis load from a single API call.
 *
 * Returns:
 *   { successCount, rateLimited429Count, conflict409Count, avgLatencyMs, p95LatencyMs }
 */
router.post('/flash-test', async (req, res, next) => {
  try {
    const { sku, qty, concurrency } = req.body;

    // ── Validation ───────────────────────────────────────────
    if (!sku || typeof sku !== 'string') {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'sku must be a non-empty string.',
        },
      });
    }

    if (!qty || typeof qty !== 'number' || qty < 1 || !Number.isInteger(qty)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'qty must be a positive integer.',
        },
      });
    }

    if (
      !concurrency || typeof concurrency !== 'number' ||
      concurrency < 1 || !Number.isInteger(concurrency)
    ) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'concurrency must be a positive integer.',
        },
      });
    }

    if (concurrency > FLASH_TEST_MAX_CONCURRENCY) {
      return res.status(400).json({
        error: {
          code: 'CONCURRENCY_LIMIT',
          message: `concurrency is capped at ${FLASH_TEST_MAX_CONCURRENCY}.`,
        },
      });
    }

    // Verify SKU exists
    const skuCheck = await pool.query('SELECT sku FROM skus WHERE sku = $1', [sku]);
    if (skuCheck.rows.length === 0) {
      return res.status(400).json({
        error: {
          code: 'UNKNOWN_SKU',
          message: `SKU "${sku}" does not exist.`,
        },
      });
    }

    // ── Build simulated checkout requests ────────────────────
    // Use a random customer location for all simulated requests
    const customerLat = 28.6139; // Delhi
    const customerLng = 77.2090;

    const simulateCheckout = async () => {
      const start = process.hrtime.bigint();
      const idemKey = `flash-test-${crypto.randomUUID()}`;
      const locks = [];

      try {
        // Resolve warehouses
        const whResult = await pool.query(`
          SELECT w.id, w.name, w.lat, w.lng, i.sku, i.available_qty
          FROM warehouses w
          JOIN inventories i ON i.warehouse_id = w.id
          WHERE w.active = true
        `);

        const whMap = new Map();
        for (const row of whResult.rows) {
          if (!whMap.has(row.id)) {
            whMap.set(row.id, {
              id: row.id, name: row.name,
              lat: parseFloat(row.lat), lng: parseFloat(row.lng),
              inventory: {},
            });
          }
          whMap.get(row.id).inventory[row.sku] = row.available_qty;
        }

        const warehouses = Array.from(whMap.values());

        // Calculate distances
        for (const wh of warehouses) {
          const dist = await getDistance(
            { lat: wh.lat, lng: wh.lng },
            { lat: customerLat, lng: customerLng }
          );
          wh.distanceKm = dist.distanceKm;
        }

        // Fetch SKU dimensions
        const skuData = await pool.query(
          `SELECT sku, name, length_cm, width_cm, height_cm, weight_kg
           FROM skus WHERE sku = $1`,
          [sku]
        );
        const skuInfo = skuData.rows[0];

        const orderItems = [{
          sku, name: skuInfo.name,
          length_cm: skuInfo.length_cm, width_cm: skuInfo.width_cm,
          height_cm: skuInfo.height_cm, weight_kg: parseFloat(skuInfo.weight_kg),
          qty,
        }];

        // Routing
        const routing = selectOptimalWarehouse({ warehouses, orderItems });
        if (routing.status !== 'ROUTED') {
          const end = process.hrtime.bigint();
          return { status: 409, latencyMs: Number(end - start) / 1_000_000 };
        }

        // Lock
        const lockResult = await acquireLock(sku);
        recordLockAttempt({ sku, acquired: lockResult.acquired, waitedMs: lockResult.waitedMs });

        if (!lockResult.acquired) {
          const end = process.hrtime.bigint();
          return { status: 429, latencyMs: Number(end - start) / 1_000_000 };
        }
        locks.push({ sku, token: lockResult.token });

        // Transaction
        const txnResult = await executeCheckout({
          idempotencyKey: idemKey,
          customerLat, customerLng,
          items: [{ sku, qty }],
          routingDecision: routing,
        });

        const end = process.hrtime.bigint();
        const latencyMs = Number(end - start) / 1_000_000;

        if (txnResult instanceof IdempotencyReplay) {
          return { status: 200, latencyMs };
        }

        return { status: 201, latencyMs };

      } catch (err) {
        const end = process.hrtime.bigint();
        const latencyMs = Number(end - start) / 1_000_000;

        if (err instanceof InsufficientStockError) {
          return { status: 409, latencyMs };
        }
        return { status: 500, latencyMs };
      } finally {
        for (const lock of locks) {
          await releaseLock(lock.sku, lock.token);
        }
      }
    };

    // ── Fire concurrent requests ─────────────────────────────
    const results = await Promise.all(
      Array.from({ length: concurrency }, () => simulateCheckout())
    );

    // ── Aggregate metrics ────────────────────────────────────
    let successCount = 0;
    let rateLimited429Count = 0;
    let conflict409Count = 0;
    const latencies = [];

    for (const r of results) {
      latencies.push(r.latencyMs);
      if (r.status === 201 || r.status === 200) successCount++;
      else if (r.status === 429) rateLimited429Count++;
      else if (r.status === 409) conflict409Count++;
    }

    latencies.sort((a, b) => a - b);
    const avgLatencyMs = latencies.length > 0
      ? Math.round((latencies.reduce((s, l) => s + l, 0) / latencies.length) * 100) / 100
      : 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95LatencyMs = latencies.length > 0
      ? Math.round(latencies[Math.min(p95Index, latencies.length - 1)] * 100) / 100
      : 0;

    res.status(200).json({
      successCount,
      rateLimited429Count,
      conflict409Count,
      avgLatencyMs,
      p95LatencyMs,
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
