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
 * Week 4 additions:
 *   - Rate limiting on POST /checkout (express-rate-limit, separate from Redis SKU locks)
 *   - Zod request validation (replaces manual inline validation)
 *   - Multi-shipment /explain support (per-group explanations for split orders)
 *   - Structured Pino logging with request ID correlation across lifecycle
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
const logger = require('../services/logger');
const {
  InsufficientStockError,
  LockUnavailableError,
  IdempotencyReplay,
  DatabaseTransactionError,
} = require('../errors/checkoutErrors');

// Middleware
const { checkoutRateLimiter } = require('../middleware/rateLimiter');
const {
  validateCheckoutBody,
  validateFlashTestBody,
  validateUuidParam,
  validateIdempotencyKey,
} = require('../middleware/validators');

const router = Router();

/**
 * Maximum concurrency for flash-test endpoint.
 * Prevents unbounded database/Redis load from a single request.
 */
const FLASH_TEST_MAX_CONCURRENCY = 50;

// ─── POST /api/v1/orders/checkout ───────────────────────────────
/**
 * Synchronous deterministic checkout.
 *
 * Middleware chain:
 *   1. checkoutRateLimiter — per-IP traffic protection (429 if exceeded)
 *   2. validateIdempotencyKey — header check (400 if missing)
 *   3. validateCheckoutBody — Zod schema validation (400 if invalid)
 *   4. handler — routing + locks + ACID transaction
 *
 * CRITICAL: This handler does NOT call geminiClient, does NOT await Gemini,
 * does NOT read/write ai_explanations.
 */
router.post('/checkout',
  checkoutRateLimiter,
  validateIdempotencyKey,
  validateCheckoutBody,
  async (req, res, next) => {
    const log = req.log || logger;
    const acquiredLocks = [];

    try {
      const idempotencyKey = req.headers['idempotency-key'];
      const { customerLat, customerLng, items } = req.body;

      log.info({ idempotencyKey, itemCount: items.length }, 'Checkout: request received');

      // ── Step 1: Resolve eligible warehouses with inventory ───
      log.debug('Checkout: resolving warehouses');
      const warehouseResult = await pool.query(`
        SELECT
          w.id, w.name, w.lat, w.lng, w.active,
          i.sku, i.available_qty
        FROM warehouses w
        JOIN inventories i ON i.warehouse_id = w.id
        WHERE w.active = true
        ORDER BY w.name
      `);

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

      // ── Step 2: Calculate distances ──────────────────────────
      const customerLocation = { lat: customerLat, lng: customerLng };

      for (const wh of warehouses) {
        const result = await getDistance(
          { lat: wh.lat, lng: wh.lng },
          customerLocation
        );
        wh.distanceKm = result.distanceKm;
      }

      // ── Step 3: Fetch SKU dimensions for bin-packing ────────
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

      // Build order items with dimensions
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

      // ── Step 4: Run routing engine ──────────────────────────
      log.info('Checkout: running routing engine');
      const routingResult = selectOptimalWarehouse({
        warehouses,
        orderItems,
      });

      if (routingResult.status !== 'ROUTED' &&
          routingResult.status !== 'SPLIT_ROUTED' &&
          routingResult.status !== 'PARTIAL_SPLIT') {
        log.warn({ routingStatus: routingResult.status }, 'Checkout: routing failed');
        return res.status(409).json({
          error: {
            code: routingResult.status,
            message: routingResult.message || 'Routing failed.',
          },
        });
      }

      // ── Step 5: Acquire per-SKU Redis locks ─────────────────
      const sortedSkus = [...new Set(items.map(i => i.sku))].sort();
      log.info({ skus: sortedSkus }, 'Checkout: acquiring locks');

      for (const sku of sortedSkus) {
        const lockResult = await acquireLock(sku);

        recordLockAttempt({
          sku,
          acquired: lockResult.acquired,
          waitedMs: lockResult.waitedMs,
        });

        if (!lockResult.acquired) {
          log.warn({ sku }, 'Checkout: lock unavailable');
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

      log.info('Checkout: locks acquired, executing transaction');

      // ── Step 6: Execute ACID checkout transaction ────────────
      const txnResult = await executeCheckout({
        idempotencyKey,
        customerLat,
        customerLng,
        items,
        routingDecision: routingResult,
      });

      // ── Step 7: Handle idempotency replay ───────────────────
      if (txnResult instanceof IdempotencyReplay) {
        log.info({ orderId: txnResult.existingOrder.order.id }, 'Checkout: idempotency replay');
        return res.status(200).json({
          order: txnResult.existingOrder.order,
          items: txnResult.existingOrder.items,
          shipments: txnResult.existingOrder.shipments,
          replay: true,
        });
      }

      // ── Step 8: Return 201 Created ─────────────────────────
      log.info({ orderId: txnResult.order.id }, 'Checkout: committed successfully');
      res.status(201).json({
        order: txnResult.order,
        items: txnResult.items,
        shipments: txnResult.shipments,
        costBreakdown: txnResult.costBreakdown,
        alternatives: txnResult.alternatives,
        packing: routingResult.packing,
      });

    } catch (err) {
      if (err instanceof InsufficientStockError) {
        log.warn({ sku: err.sku, requested: err.requested, available: err.available }, 'Checkout: insufficient stock');
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
        log.error({ error: err.message }, 'Checkout: transaction error');
        return res.status(500).json({
          error: {
            code: 'TRANSACTION_FAILED',
            message: 'Checkout transaction failed. Please try again.',
          },
        });
      }

      if (err.code === 'REDIS_LOCK_ERROR') {
        log.error({ error: err.message }, 'Checkout: Redis lock error');
        return res.status(500).json({
          error: {
            code: 'LOCK_SERVICE_ERROR',
            message: 'Lock service unavailable. Please try again.',
          },
        });
      }

      next(err);

    } finally {
      for (const lock of acquiredLocks) {
        await releaseLock(lock.sku, lock.token);
      }
    }
  }
);

// ─── GET /api/v1/orders/:id ─────────────────────────────────────
/**
 * Returns an order with its items and shipments.
 */
router.get('/:id',
  validateUuidParam,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const log = req.log || logger;

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
  }
);

// ─── GET /api/v1/orders/:id/explain ─────────────────────────────
/**
 * Returns AI-generated or deterministic explanation(s) of the
 * routing decision for a given order.
 *
 * Supports both single and multi-shipment orders:
 *   - Single shipment: returns flat explanation object (backward compatible)
 *   - Multi-shipment: returns { explanations: [...], multiShipment: true }
 *
 * ARCHITECTURAL RULE: This is the ONLY route that touches
 * the Gemini API or the ai_explanations table.
 */
router.get('/:id/explain',
  validateUuidParam,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const log = req.log || logger;

      log.info({ orderId: id }, 'Explain: request received');

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

      // Fetch all shipments for this order
      const shipmentsResult = await pool.query(
        `SELECT sh.id, sh.warehouse_id, w.name AS warehouse_name,
                sh.box_size, sh.total_cost, sh.distance_km
         FROM shipments sh
         JOIN warehouses w ON w.id = sh.warehouse_id
         WHERE sh.order_id = $1
         ORDER BY sh.created_at ASC`,
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

      const shipments = shipmentsResult.rows;
      const isMultiShipment = shipments.length > 1;

      log.info({ orderId: id, shipmentCount: shipments.length, isMultiShipment }, 'Explain: shipments found');

      // ── Check cached explanation ──────────────────────────
      log.debug({ orderId: id }, 'Explain: checking cache');
      const cached = await getExplanation(id);

      if (cached) {
        log.info({ orderId: id, cached: true }, 'Explain: cache hit');

        // For multi-shipment, explanation_text is a JSON array
        if (isMultiShipment) {
          let explanations;
          try {
            explanations = JSON.parse(cached.explanation_text);
          } catch {
            // Legacy single-string format — wrap as single-element array
            explanations = [{ explanation: cached.explanation_text, shipmentIndex: 0 }];
          }
          return res.status(200).json({
            explanations,
            multiShipment: true,
            modelUsed: cached.model_used,
            source: cached.source,
            latencyMs: cached.latency_ms,
            generatedAt: cached.created_at,
            cached: true,
          });
        }

        // Single shipment — backward compatible flat response
        return res.status(200).json({
          explanation: cached.explanation_text,
          modelUsed: cached.model_used,
          source: cached.source,
          latencyMs: cached.latency_ms,
          generatedAt: cached.created_at,
          cached: true,
        });
      }

      log.info({ orderId: id }, 'Explain: cache miss, generating explanations');

      // ── Cache miss — generate per-shipment explanations ────
      // Fetch all active warehouses for building alternatives context
      const allWarehousesResult = await pool.query(
        'SELECT w.id, w.name, w.lat, w.lng FROM warehouses w WHERE w.active = true'
      );

      if (isMultiShipment) {
        // ── Multi-shipment path ──────────────────────────────
        const explanations = [];
        let overallSource = 'gemini';
        let totalLatencyMs = 0;
        let modelUsed = geminiClient.GEMINI_MODEL;

        for (let i = 0; i < shipments.length; i++) {
          const shipment = shipments[i];
          log.debug({ orderId: id, shipmentIndex: i, warehouseName: shipment.warehouse_name }, 'Explain: generating for shipment group');

          const routingResult = buildRoutingContext(shipment, allWarehousesResult.rows);
          const result = await geminiClient.generateExplanation(routingResult, log);

          if (result.source === 'fallback_template') {
            overallSource = 'fallback_template';
          }
          if (result.modelUsed !== 'n/a') {
            modelUsed = result.modelUsed;
          }
          totalLatencyMs += result.latencyMs;

          explanations.push({
            shipmentIndex: i,
            shipmentId: shipment.id,
            warehouseName: shipment.warehouse_name,
            explanation: result.explanation,
            source: result.source,
          });
        }

        // Cache as JSON array
        await insertExplanation(
          id,
          JSON.stringify(explanations),
          modelUsed,
          overallSource,
          totalLatencyMs
        );

        log.info({ orderId: id, shipmentCount: shipments.length, source: overallSource, latencyMs: totalLatencyMs }, 'Explain: multi-shipment explanations generated');

        return res.status(200).json({
          explanations,
          multiShipment: true,
          modelUsed,
          source: overallSource,
          latencyMs: totalLatencyMs,
          generatedAt: new Date().toISOString(),
          cached: false,
        });
      }

      // ── Single shipment path (backward compatible) ─────────
      const chosenRow = shipments[0];
      const routingResult = buildRoutingContext(chosenRow, allWarehousesResult.rows);

      log.debug({ orderId: id }, 'Explain: calling Gemini');
      const result = await geminiClient.generateExplanation(routingResult, log);

      await insertExplanation(
        id,
        result.explanation,
        result.modelUsed,
        result.source,
        result.latencyMs
      );

      log.info({ orderId: id, source: result.source, latencyMs: result.latencyMs }, 'Explain: explanation generated and cached');

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
  }
);

/**
 * Build a routing-result-like structure for the Gemini prompt
 * from a shipment row and the full warehouse list.
 *
 * @param {Object} shipmentRow - Row from the shipments query
 * @param {Array} allWarehouses - All active warehouses
 * @returns {Object} Routing context matching geminiClient.buildPrompt expectations
 */
function buildRoutingContext(shipmentRow, allWarehouses) {
  return {
    status: 'ROUTED',
    chosen: {
      warehouseId: shipmentRow.warehouse_id,
      name: shipmentRow.warehouse_name,
      distanceKm: parseFloat(shipmentRow.distance_km),
      boxSize: shipmentRow.box_size,
      costBreakdown: {
        distanceCost: Math.round(parseFloat(shipmentRow.distance_km) * 0.5 * 100) / 100,
        packagingCost: { SMALL: 1, MEDIUM: 3, LARGE: 7 }[shipmentRow.box_size] || 0,
        depletionPenalty: 0,
      },
      totalCost: parseFloat(shipmentRow.total_cost),
    },
    alternatives: allWarehouses
      .filter(w => w.id !== shipmentRow.warehouse_id)
      .map(w => ({
        warehouseId: w.id,
        name: w.name,
        distanceKm: null,
        penalty: null,
        totalCost: null,
        rejectionReason: 'Not selected by routing engine',
      })),
  };
}

// ─── POST /api/v1/orders/flash-test ─────────────────────────────
/**
 * Server-side flash-sale stress simulation.
 *
 * Fires N concurrent checkout attempts through the REAL checkout path
 * and returns aggregated performance metrics.
 */
router.post('/flash-test',
  validateFlashTestBody,
  async (req, res, next) => {
    try {
      const { sku, qty, concurrency } = req.body;
      const log = req.log || logger;

      log.info({ sku, qty, concurrency }, 'Flash-test: starting simulation');

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
      const customerLat = 28.6139;
      const customerLng = 77.2090;

      const simulateCheckout = async () => {
        const start = process.hrtime.bigint();
        const idemKey = `flash-test-${crypto.randomUUID()}`;
        const locks = [];

        try {
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

          for (const wh of warehouses) {
            const dist = await getDistance(
              { lat: wh.lat, lng: wh.lng },
              { lat: customerLat, lng: customerLng }
            );
            wh.distanceKm = dist.distanceKm;
          }

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

          const routing = selectOptimalWarehouse({ warehouses, orderItems });
          if (routing.status !== 'ROUTED' && routing.status !== 'SPLIT_ROUTED') {
            const end = process.hrtime.bigint();
            return { status: 409, latencyMs: Number(end - start) / 1_000_000 };
          }

          const lockResult = await acquireLock(sku);
          recordLockAttempt({ sku, acquired: lockResult.acquired, waitedMs: lockResult.waitedMs });

          if (!lockResult.acquired) {
            const end = process.hrtime.bigint();
            return { status: 429, latencyMs: Number(end - start) / 1_000_000 };
          }
          locks.push({ sku, token: lockResult.token });

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

      log.info({
        sku, concurrency, successCount, rateLimited429Count, conflict409Count,
        avgLatencyMs, p95LatencyMs,
      }, 'Flash-test: simulation complete');

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
  }
);

module.exports = router;
