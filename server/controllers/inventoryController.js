/**
 * Inventory Controller — Host Inventory Management
 *
 * Provides Host-only endpoints to view and adjust stock levels
 * across all warehouses.
 *
 *   GET  /api/v1/inventory        — List all inventory rows
 *   POST /api/v1/inventory/adjust — Upsert stock for a given SKU + warehouse
 *
 * All endpoints are protected by verifyToken + requireHost at the route layer.
 *
 * @module controllers/inventoryController
 */

'use strict';

const pool = require('../db/pool');

/**
 * GET /api/v1/inventory
 *
 * Returns all inventory rows joined with product names (from `skus`)
 * and warehouse names (from `warehouses`).
 *
 * Response shape:
 *   {
 *     inventory: [
 *       {
 *         id, sku, productName, warehouseId, warehouseName,
 *         availableQty, reservedQty
 *       }
 *     ],
 *     count: number
 *   }
 */
async function listInventory(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        i.id,
        i.sku,
        s.name          AS product_name,
        s.category      AS product_category,
        s.price         AS product_price,
        i.warehouse_id,
        w.name          AS warehouse_name,
        w.active        AS warehouse_active,
        i.available_qty,
        i.reserved_qty
      FROM inventories i
      JOIN skus s       ON s.sku = i.sku
      JOIN warehouses w ON w.id  = i.warehouse_id
      ORDER BY w.name, s.name
    `);

    const inventory = rows.map(row => ({
      id: row.id,
      sku: row.sku,
      productName: row.product_name,
      productCategory: row.product_category,
      productPrice: parseFloat(row.product_price),
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      warehouseActive: row.warehouse_active,
      availableQty: row.available_qty,
      reservedQty: row.reserved_qty,
    }));

    res.status(200).json({ inventory, count: inventory.length });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/inventory/adjust
 *
 * Upserts inventory for a given SKU at a given warehouse.
 * If the row exists, updates `available_qty`.
 * If the row does not exist, inserts a new row.
 *
 * Uses PostgreSQL ON CONFLICT on the (warehouse_id, sku) unique constraint.
 *
 * Required body fields: sku, warehouse_id, quantity
 *
 * Returns 200 with the upserted inventory row on success.
 * Returns 400 if required fields are missing or quantity is negative.
 */
async function setInventory(req, res, next) {
  try {
    const { sku, warehouse_id, quantity } = req.body;

    // ── Validate required fields ──────────────────────────────────────
    const missing = [];
    if (!sku)          missing.push('sku');
    if (!warehouse_id) missing.push('warehouse_id');
    if (quantity == null) missing.push('quantity');

    if (missing.length > 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Missing required fields: ${missing.join(', ')}`,
        },
      });
    }

    const qty = parseInt(quantity, 10);

    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Quantity must be a non-negative integer.',
        },
      });
    }

    // ── Verify that the SKU exists ────────────────────────────────────
    const skuCheck = await pool.query('SELECT sku FROM skus WHERE sku = $1', [sku]);
    if (skuCheck.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'SKU_NOT_FOUND',
          message: `Product with SKU "${sku}" does not exist.`,
        },
      });
    }

    // ── Verify that the warehouse exists ──────────────────────────────
    const whCheck = await pool.query('SELECT id FROM warehouses WHERE id = $1', [warehouse_id]);
    if (whCheck.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'WAREHOUSE_NOT_FOUND',
          message: `Warehouse with ID "${warehouse_id}" does not exist.`,
        },
      });
    }

    // ── Upsert the inventory row ──────────────────────────────────────
    const { rows } = await pool.query(
      `INSERT INTO inventories (warehouse_id, sku, available_qty, reserved_qty)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (warehouse_id, sku)
       DO UPDATE SET available_qty = $3
       RETURNING *`,
      [warehouse_id, sku, qty]
    );

    const row = rows[0];

    // Fetch joined names for the response
    const detail = await pool.query(
      `SELECT s.name AS product_name, w.name AS warehouse_name
       FROM skus s, warehouses w
       WHERE s.sku = $1 AND w.id = $2`,
      [sku, warehouse_id]
    );

    res.status(200).json({
      message: `Stock updated: ${detail.rows[0].product_name} at ${detail.rows[0].warehouse_name} → ${qty} units`,
      inventory: {
        id: row.id,
        sku: row.sku,
        productName: detail.rows[0].product_name,
        warehouseId: row.warehouse_id,
        warehouseName: detail.rows[0].warehouse_name,
        availableQty: row.available_qty,
        reservedQty: row.reserved_qty,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listInventory,
  setInventory,
};
