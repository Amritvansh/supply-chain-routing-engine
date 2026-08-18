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

const { Router } = require('express');
const pool = require('../db/pool');
const { getExplanation, insertExplanation } = require('../db/aiExplanations');
const geminiClient = require('../services/geminiClient');

const router = Router();

/**
 * UUID v4 format validation regex.
 * Used to validate :id parameters before hitting the database.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── POST /api/v1/orders/checkout ───────────────────────────────
// Week 3: deterministic routing + ACID checkout (sync path, no AI)
router.post('/checkout', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'POST /api/v1/orders/checkout is not yet implemented',
    },
  });
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
// Week 3: server-side flash-sale stress simulation
router.post('/flash-test', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'POST /api/v1/orders/flash-test is not yet implemented',
    },
  });
});

module.exports = router;
