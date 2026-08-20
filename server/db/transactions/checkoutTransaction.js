/**
 * ACID Checkout Transaction
 *
 * Strict PostgreSQL transaction for the deterministic checkout path.
 * This is the single source of truth for inventory mutation.
 *
 * Flow:
 *   BEGIN
 *     → check idempotency key (short-circuit if replay)
 *     → SELECT FOR UPDATE (row-level lock on inventory rows)
 *     → UPDATE inventories SET available_qty = available_qty - qty,
 *                               reserved_qty = reserved_qty + qty
 *       WHERE available_qty >= qty  (atomic oversell guard)
 *     → check affected row count (0 rows → InsufficientStockError)
 *     → INSERT order
 *     → INSERT order_items
 *     → INSERT shipments
 *   COMMIT
 *
 * CRITICAL DESIGN RULES:
 *   1. This module has ZERO dependency on any AI or external API service.
 *      It imports only pool.js and the checkout error types.
 *   2. The inventory UPDATE is the guard — we never read qty into JS
 *      and check it separately. The WHERE clause in the UPDATE itself
 *      enforces available_qty >= requested.
 *   3. Idempotency uses the existing orders.idempotency_key UNIQUE
 *      constraint — no extra table needed.
 *
 * @module db/transactions/checkoutTransaction
 */

'use strict';

const pool = require('../pool');
const {
  InsufficientStockError,
  IdempotencyReplay,
  DatabaseTransactionError,
} = require('../../errors/checkoutErrors');

/**
 * Execute a checkout transaction.
 *
 * @param {Object} params
 * @param {string} params.idempotencyKey - Client-provided idempotency key
 * @param {number} params.customerLat - Customer latitude
 * @param {number} params.customerLng - Customer longitude
 * @param {Array<Object>} params.items - Order items, each:
 *   { sku: string, qty: number }
 * @param {Object} params.routingDecision - Output from routingEngine:
 *   { chosen: { warehouseId, boxSize, totalCost, distanceKm, costBreakdown },
 *     alternatives: [...], packing: {...} }
 *
 * @returns {Promise<Object|IdempotencyReplay>} The created order result, or
 *   an IdempotencyReplay instance if the key was already used.
 *
 * @throws {InsufficientStockError} if the warehouse lacks stock
 * @throws {DatabaseTransactionError} for unexpected PostgreSQL failures
 */
async function executeCheckout({
  idempotencyKey,
  customerLat,
  customerLng,
  items,
  routingDecision,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Step 1: Idempotency check ──────────────────────────────
    // Use the UNIQUE constraint on orders.idempotency_key.
    // Check if an order with this key already exists.
    const existingOrder = await client.query(
      `SELECT id, status, created_at FROM orders WHERE idempotency_key = $1`,
      [idempotencyKey]
    );

    if (existingOrder.rows.length > 0) {
      await client.query('ROLLBACK');

      // Fetch the full order + items + shipments for the replay response
      const orderId = existingOrder.rows[0].id;
      const [orderItems, shipments] = await Promise.all([
        client.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]),
        client.query('SELECT * FROM shipments WHERE order_id = $1', [orderId]),
      ]);

      return new IdempotencyReplay({
        order: existingOrder.rows[0],
        items: orderItems.rows,
        shipments: shipments.rows,
      });
    }

    const chosen = routingDecision.chosen;
    const warehouseId = chosen.warehouseId;

    // ── Step 2: Atomic inventory deduction ─────────────────────
    // Lock rows first with SELECT FOR UPDATE to prevent concurrent
    // transactions from reading stale snapshots, then UPDATE.
    for (const item of items) {
      // Row-level lock — blocks other transactions on the same row
      const lockResult = await client.query(
        `SELECT available_qty FROM inventories
         WHERE warehouse_id = $1 AND sku = $2
         FOR UPDATE`,
        [warehouseId, item.sku]
      );

      if (lockResult.rows.length === 0 || lockResult.rows[0].available_qty < item.qty) {
        await client.query('ROLLBACK');
        const actualAvailable = lockResult.rows[0]?.available_qty ?? 0;
        throw new InsufficientStockError(item.sku, item.qty, actualAvailable);
      }

      await client.query(
        `UPDATE inventories
         SET available_qty = available_qty - $1,
             reserved_qty  = reserved_qty  + $1
         WHERE warehouse_id = $2
           AND sku = $3
           AND available_qty >= $1`,
        [item.qty, warehouseId, item.sku]
      );
    }

    // ── Step 3: Insert order ───────────────────────────────────
    const orderResult = await client.query(
      `INSERT INTO orders (customer_lat, customer_lng, status, idempotency_key)
       VALUES ($1, $2, $3, $4)
       RETURNING id, customer_lat, customer_lng, status, idempotency_key, created_at`,
      [customerLat, customerLng, 'ROUTED', idempotencyKey]
    );
    const order = orderResult.rows[0];

    // ── Step 4: Insert order items ─────────────────────────────
    const insertedItems = [];
    for (const item of items) {
      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, sku, qty)
         VALUES ($1, $2, $3)
         RETURNING id, order_id, sku, qty`,
        [order.id, item.sku, item.qty]
      );
      insertedItems.push(itemResult.rows[0]);
    }

    // ── Step 5: Insert shipment ────────────────────────────────
    const shipmentResult = await client.query(
      `INSERT INTO shipments (order_id, warehouse_id, box_size, total_cost, distance_km)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, order_id, warehouse_id, box_size, total_cost, distance_km, created_at`,
      [
        order.id,
        warehouseId,
        chosen.boxSize,
        chosen.totalCost,
        chosen.distanceKm,
      ]
    );
    const shipment = shipmentResult.rows[0];

    // ── Step 6: Commit ─────────────────────────────────────────
    await client.query('COMMIT');

    return {
      order,
      items: insertedItems,
      shipments: [shipment],
      costBreakdown: chosen.costBreakdown,
      alternatives: routingDecision.alternatives,
    };
  } catch (err) {
    // If it's already one of our typed errors, re-throw as-is
    if (
      err instanceof InsufficientStockError ||
      err instanceof IdempotencyReplay
    ) {
      throw err;
    }

    // Handle unique constraint violation on idempotency_key
    // (concurrent insert race — another request just committed the same key)
    if (err.code === '23505' && err.constraint?.includes('idempotency')) {
      await client.query('ROLLBACK');

      // Fetch the order that won the race
      const existingOrder = await client.query(
        `SELECT id, status, created_at FROM orders WHERE idempotency_key = $1`,
        [idempotencyKey]
      );

      if (existingOrder.rows.length > 0) {
        const orderId = existingOrder.rows[0].id;
        const [orderItems, shipments] = await Promise.all([
          client.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]),
          client.query('SELECT * FROM shipments WHERE order_id = $1', [orderId]),
        ]);

        return new IdempotencyReplay({
          order: existingOrder.rows[0],
          items: orderItems.rows,
          shipments: shipments.rows,
        });
      }
    }

    // Any other error — rollback and wrap
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackErr) {
      // Rollback itself failed — nothing we can do
    }

    throw new DatabaseTransactionError(
      `Checkout transaction failed: ${err.message}`,
      err
    );
  } finally {
    client.release();
  }
}

module.exports = { executeCheckout };
