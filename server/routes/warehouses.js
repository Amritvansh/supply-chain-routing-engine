/**
 * Warehouse Routes
 *
 * GET /api/v1/warehouses — Warehouse list with inventory summary
 *
 * Returns warehouse data joined with inventory and SKU information
 * for the Control Tower dashboard. Each warehouse includes its
 * geographic position and a per-SKU inventory breakdown.
 */
'use strict';

const { Router } = require('express');
const pool = require('../db/pool');

const router = Router();

/**
 * GET /api/v1/warehouses
 *
 * Returns all active warehouses with their inventory summaries.
 * Each warehouse includes an `inventory` array of SKU-level stock data.
 *
 * Response shape:
 *   {
 *     warehouses: [
 *       {
 *         id, name, lat, lng, active,
 *         inventory: [{ sku, name, availableQty, reservedQty }]
 *       }
 *     ]
 *   }
 */
router.get('/', async (req, res, next) => {
  try {
    // Fetch warehouses with their inventory and SKU details
    const { rows } = await pool.query(`
      SELECT
        w.id            AS warehouse_id,
        w.name          AS warehouse_name,
        w.lat,
        w.lng,
        w.active,
        i.sku,
        s.name          AS sku_name,
        i.available_qty,
        i.reserved_qty
      FROM warehouses w
      LEFT JOIN inventories i ON i.warehouse_id = w.id
      LEFT JOIN skus s ON s.sku = i.sku
      ORDER BY w.name, s.name
    `);

    // Group rows by warehouse
    const warehouseMap = new Map();

    for (const row of rows) {
      if (!warehouseMap.has(row.warehouse_id)) {
        warehouseMap.set(row.warehouse_id, {
          id: row.warehouse_id,
          name: row.warehouse_name,
          lat: parseFloat(row.lat),
          lng: parseFloat(row.lng),
          active: row.active,
          inventory: [],
        });
      }

      // Only add inventory if there's a valid SKU join
      if (row.sku) {
        warehouseMap.get(row.warehouse_id).inventory.push({
          sku: row.sku,
          name: row.sku_name,
          availableQty: row.available_qty,
          reservedQty: row.reserved_qty,
        });
      }
    }

    const warehouses = Array.from(warehouseMap.values());

    res.status(200).json({ warehouses });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
