/**
 * Dashboard Routes
 *
 * GET /api/v1/dashboard/map-data — Aggregated warehouse + active-route data
 *                                  for the Control Tower map overlay
 * GET /api/v1/dashboard/stats    — Aggregated KPI stats for the Control Tower
 *
 * Returns warehouse locations with inventory health summaries and recent
 * order routing paths (warehouse → customer coordinates).
 *
 * Uses only existing tables: warehouses, inventories, orders, shipments,
 * webhook_events. No new tables created.
 *
 * Phase 5: Added /stats endpoint for KPI aggregation.
 * Auth: verifyToken + requireHost applied at the router mount level (index.js).
 */
'use strict';

const { Router } = require('express');
const pool = require('../db/pool');
const logger = require('../services/logger');
const { validateMapDataQuery } = require('../middleware/validators');

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
 * Middleware chain:
 *   1. validateMapDataQuery — Zod query param validation (400 if invalid)
 *   2. handler — data aggregation + response
 *
 * Returns warehouse locations with inventory health and recent order routes.
 */
router.get('/map-data', validateMapDataQuery, async (req, res, next) => {
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
    // limit is already validated and transformed by Zod middleware
    const limit = req.query.limit || DEFAULT_ROUTE_LIMIT;

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

/**
 * GET /api/v1/dashboard/stats
 *
 * Aggregated KPI stats for the Host Control Tower dashboard.
 *
 * Returns:
 *   - ordersByStatus: { PENDING, ROUTED, SPLIT_ROUTED, FULFILLED, FAILED }
 *   - totalOrders, totalRevenue
 *   - deliveryMetrics: avgDistanceKm, avgCostPerShipment, totalShipments
 *   - shipmentLifecycle: counts per webhook status stage
 *   - warehouseHealth: { total, active, lowStock, healthy }
 *
 * All data is pulled from existing tables in parallel for performance.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const log = req.log || logger;

    // Run all aggregation queries in parallel
    const [
      orderStatsResult,
      deliveryResult,
      lifecycleResult,
      warehouseHealthResult,
    ] = await Promise.all([
      // ─── Order counts by status + total revenue ─────────
      pool.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(total_amount), 0) AS total_revenue,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int       AS pending,
          COUNT(*) FILTER (WHERE status = 'ROUTED')::int        AS routed,
          COUNT(*) FILTER (WHERE status IN ('SPLIT_ROUTED', 'SPLIT'))::int AS split_routed,
          COUNT(*) FILTER (WHERE status = 'FULFILLED')::int     AS fulfilled,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int        AS failed
        FROM orders
      `),

      // ─── Delivery metrics (from shipments) ──────────────
      pool.query(`
        SELECT
          COUNT(*)::int AS total_shipments,
          COALESCE(ROUND(AVG(distance_km)::numeric, 2), 0) AS avg_distance_km,
          COALESCE(ROUND(AVG(total_cost)::numeric, 2), 0) AS avg_cost_per_shipment,
          COALESCE(ROUND(SUM(total_cost)::numeric, 2), 0) AS total_delivery_cost
        FROM shipments
      `),

      // ─── Shipment lifecycle coverage (from webhook_events) ─
      pool.query(`
        SELECT
          COUNT(DISTINCT shipment_id) FILTER (
            WHERE status = 'PICKED_UP'
          )::int AS picked_up,
          COUNT(DISTINCT shipment_id) FILTER (
            WHERE status = 'IN_TRANSIT'
          )::int AS in_transit,
          COUNT(DISTINCT shipment_id) FILTER (
            WHERE status = 'DELIVERED'
          )::int AS delivered,
          COUNT(DISTINCT shipment_id)::int AS total_tracked
        FROM webhook_events
      `),

      // ─── Warehouse health summary ───────────────────────
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE w.active = true)::int AS active,
          COUNT(*) FILTER (
            WHERE w.active = true
            AND EXISTS (
              SELECT 1 FROM inventories i
              WHERE i.warehouse_id = w.id
                AND i.available_qty <= $1
            )
          )::int AS low_stock
        FROM warehouses w
      `, [LOW_STOCK_THRESHOLD]),
    ]);

    const orderStats = orderStatsResult.rows[0];
    const delivery = deliveryResult.rows[0];
    const lifecycle = lifecycleResult.rows[0];
    const warehouseHealth = warehouseHealthResult.rows[0];

    log.info({
      totalOrders: orderStats.total_orders,
      totalShipments: delivery.total_shipments,
    }, 'Dashboard stats: aggregated');

    res.status(200).json({
      ordersByStatus: {
        pending: orderStats.pending,
        routed: orderStats.routed,
        splitRouted: orderStats.split_routed,
        fulfilled: orderStats.fulfilled,
        failed: orderStats.failed,
      },
      totalOrders: orderStats.total_orders,
      totalRevenue: parseFloat(orderStats.total_revenue),
      deliveryMetrics: {
        totalShipments: delivery.total_shipments,
        avgDistanceKm: parseFloat(delivery.avg_distance_km),
        avgCostPerShipment: parseFloat(delivery.avg_cost_per_shipment),
        totalDeliveryCost: parseFloat(delivery.total_delivery_cost),
      },
      shipmentLifecycle: {
        totalTracked: lifecycle.total_tracked,
        pickedUp: lifecycle.picked_up,
        inTransit: lifecycle.in_transit,
        delivered: lifecycle.delivered,
      },
      warehouseHealth: {
        total: warehouseHealth.total,
        active: warehouseHealth.active,
        lowStock: warehouseHealth.low_stock,
        healthy: warehouseHealth.active - warehouseHealth.low_stock,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

