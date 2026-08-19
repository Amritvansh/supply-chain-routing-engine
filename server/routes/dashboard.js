/**
 * Dashboard Routes
 *
 * GET /api/v1/dashboard/map-data — Aggregated warehouse + active-route data
 *                                  for the Control Tower map overlay
 *
 * Returns warehouse locations with inventory health summaries and recent
 * order routing paths (warehouse → customer coordinates).
 *
 * Uses only existing tables: warehouses, inventories, orders, shipments.
 * No new tables created.
 */
'use strict';

const { Router } = require('express');
const pool = require('../db/pool');

const router = Router();

/**
 * Low-stock threshold — matches the deterministic engine's
 * depletion penalty tier (availableQty <= 5 triggers penalty).
 */
const LOW_STOCK_THRESHOLD = 5;

/**
 * Maximum number of recent order routes to return.
 * Keeps the response size manageable for the map overlay.
 */
const DEFAULT_ROUTE_LIMIT = 50;

/**
 * GET /api/v1/dashboard/map-data
 *
 * Returns warehouse locations with inventory health and recent order routes.
 *
 * Response shape:
 *   {
 *     warehouses: [{
 *       id, name, lat, lng, active,
 *       totalStock, lowStockSkus, healthStatus
 *     }],
 *     routes: [{
 *       orderId, status, createdAt,
 *       customer: { lat, lng },
 *       shipments: [{ shipmentId, warehouseId, warehouseName, warehouseLat, warehouseLng, distanceKm, boxSize, totalCost }]
 *     }]
 *   }
 */
router.get('/map-data', async (req, res, next) => {
  try {
    // ─── Warehouses with Inventory Health ──────────────────
    const warehouseResult = await pool.query(`
      SELECT
        w.id,
        w.name,
        w.lat,
        w.lng,
        w.active,
        COALESCE(SUM(i.available_qty), 0)::int AS total_stock,
        COALESCE(SUM(CASE WHEN i.available_qty <= $1 THEN 1 ELSE 0 END), 0)::int AS low_stock_skus,
        COUNT(i.sku)::int AS total_skus
      FROM warehouses w
      LEFT JOIN inventories i ON i.warehouse_id = w.id
      GROUP BY w.id, w.name, w.lat, w.lng, w.active
      ORDER BY w.name
    `, [LOW_STOCK_THRESHOLD]);

    const warehouses = warehouseResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      active: row.active,
      totalStock: row.total_stock,
      lowStockSkus: row.low_stock_skus,
      healthStatus: row.low_stock_skus > 0 ? 'low_stock' : 'healthy',
    }));

    // ─── Recent Order Routes ──────────────────────────────
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || DEFAULT_ROUTE_LIMIT, 1),
      200
    );

    const ordersResult = await pool.query(`
      SELECT
        o.id AS order_id,
        o.customer_lat,
        o.customer_lng,
        o.status,
        o.created_at,
        sh.id AS shipment_id,
        sh.warehouse_id,
        w.name AS warehouse_name,
        w.lat AS warehouse_lat,
        w.lng AS warehouse_lng,
        sh.distance_km,
        sh.box_size,
        sh.total_cost
      FROM orders o
      JOIN shipments sh ON sh.order_id = o.id
      JOIN warehouses w ON w.id = sh.warehouse_id
      ORDER BY o.created_at DESC
      LIMIT $1
    `, [limit]);

    // Group shipments by order
    const routeMap = new Map();

    for (const row of ordersResult.rows) {
      if (!routeMap.has(row.order_id)) {
        routeMap.set(row.order_id, {
          orderId: row.order_id,
          status: row.status,
          createdAt: row.created_at,
          customer: {
            lat: parseFloat(row.customer_lat),
            lng: parseFloat(row.customer_lng),
          },
          shipments: [],
        });
      }

      routeMap.get(row.order_id).shipments.push({
        shipmentId: row.shipment_id,
        warehouseId: row.warehouse_id,
        warehouseName: row.warehouse_name,
        warehouseLat: parseFloat(row.warehouse_lat),
        warehouseLng: parseFloat(row.warehouse_lng),
        distanceKm: parseFloat(row.distance_km),
        boxSize: row.box_size,
        totalCost: parseFloat(row.total_cost),
      });
    }

    const routes = Array.from(routeMap.values());

    res.status(200).json({ warehouses, routes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
