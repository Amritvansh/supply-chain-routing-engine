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
 * @param {string} [params.userId] - Authenticated customer's user ID
 * @param {string} [params.customerName] - Customer's full name
 * @param {string} [params.customerPhone] - Customer's phone number
 * @param {string} [params.shippingAddress] - Full shipping address text
 * @param {string} [params.pincode] - Delivery PIN code
 * @param {number} [params.totalAmount] - Final order total (product + delivery)
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
  userId = null,
  customerName = null,
  customerPhone = null,
  shippingAddress = null,
  pincode = null,
  totalAmount = null,
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

    const isSplit = routingDecision.fulfillmentType === 'SPLIT_SHIPMENT';
    const status = isSplit ? 'MULTI_WAREHOUSE_SPLIT' : 'ROUTED';
    
    // Determine the shipments to create
    const shipmentsData = isSplit 
      ? routingDecision.shipmentGroups
      : [routingDecision.chosen];

    // Build a flat list of all item deductions across all shipments
    const inventoryDeductions = [];
    if (isSplit) {
      for (const group of shipmentsData) {
        for (const item of group.items) {
          inventoryDeductions.push({
            warehouseId: group.warehouseId,
            sku: item.sku,
            qty: item.qty
          });
        }
      }
    } else {
      for (const item of items) {
        inventoryDeductions.push({
          warehouseId: shipmentsData[0].warehouseId,
          sku: item.sku,
          qty: item.qty
        });
      }
    }

    // ── Step 2: Atomic inventory deduction ─────────────────────
    // Lock rows first with SELECT FOR UPDATE to prevent concurrent
    // transactions from reading stale snapshots, then UPDATE.
    
    // Sort deductions to prevent deadlocks when locking multiple rows
    inventoryDeductions.sort((a, b) => {
      if (a.warehouseId !== b.warehouseId) return a.warehouseId.localeCompare(b.warehouseId);
      return a.sku.localeCompare(b.sku);
    });

    for (const deduction of inventoryDeductions) {
      // Row-level lock — blocks other transactions on the same row
      const lockResult = await client.query(
        `SELECT available_qty FROM inventories
         WHERE warehouse_id = $1 AND sku = $2
         FOR UPDATE`,
        [deduction.warehouseId, deduction.sku]
      );

      if (lockResult.rows.length === 0 || lockResult.rows[0].available_qty < deduction.qty) {
        await client.query('ROLLBACK');
        const actualAvailable = lockResult.rows[0]?.available_qty ?? 0;
        throw new InsufficientStockError(deduction.sku, deduction.qty, actualAvailable);
      }

      await client.query(
        `UPDATE inventories
         SET available_qty = available_qty - $1,
             reserved_qty  = reserved_qty  + $1
         WHERE warehouse_id = $2
           AND sku = $3
           AND available_qty >= $1`,
        [deduction.qty, deduction.warehouseId, deduction.sku]
      );
    }

    // ── Step 3: Insert order ───────────────────────────────────
    const orderResult = await client.query(
      `INSERT INTO orders (
         customer_lat, customer_lng, status, idempotency_key,
         user_id, customer_name, customer_phone, shipping_address, pincode, total_amount, fulfillment_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, customer_lat, customer_lng, status, idempotency_key, created_at,
                 user_id, customer_name, customer_phone, shipping_address, pincode, total_amount, fulfillment_type`,
      [
        customerLat, customerLng, status, idempotencyKey,
        userId, customerName, customerPhone, shippingAddress, pincode, totalAmount,
        isSplit ? 'SPLIT_SHIPMENT' : 'SINGLE_SHIPMENT'
      ]
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

    // ── Step 5: Insert shipments and shipment_items ────────────
    const insertedShipments = [];
    for (const shipData of shipmentsData) {
      const shipmentResult = await client.query(
        `INSERT INTO shipments (order_id, warehouse_id, box_size, total_cost, distance_km)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, order_id, warehouse_id, box_size, total_cost, distance_km, created_at`,
        [
          order.id,
          shipData.warehouseId,
          shipData.boxSize,
          shipData.totalCost,
          shipData.distanceKm,
        ]
      );
      const shipment = shipmentResult.rows[0];
      
      // Determine items for this shipment
      const shipItems = isSplit ? shipData.items : items;
      
      for (const item of shipItems) {
        await client.query(
          `INSERT INTO shipment_items (shipment_id, sku, qty)
           VALUES ($1, $2, $3)`,
          [shipment.id, item.sku, item.qty]
        );
      }
      
      insertedShipments.push({
        ...shipment,
        items: shipItems
      });
    }

    // ── Step 6: Commit ─────────────────────────────────────────
    await client.query('COMMIT');

    return {
      order,
      items: insertedItems,
      shipments: insertedShipments,
      fulfillmentType: isSplit ? 'SPLIT_SHIPMENT' : 'SINGLE_SHIPMENT',
      costBreakdown: isSplit ? null : routingDecision.chosen.costBreakdown,
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
