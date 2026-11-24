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
const { predictDelivery } = require('../services/etaPredictor');

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

      const prediction = predictDelivery({
        distanceKm: parseFloat(row.distance_km),
        boxSize: row.box_size,
        timestamp: row.created_at,
      });

      routeMap.get(row.order_id).shipments.push({
        shipmentId: row.shipment_id,
        warehouseId: row.warehouse_id,
        warehouseName: row.warehouse_name,
        warehouseLat: parseFloat(row.warehouse_lat),
        warehouseLng: parseFloat(row.warehouse_lng),
        distanceKm: parseFloat(row.distance_km),
        boxSize: row.box_size,
        totalCost: parseFloat(row.total_cost),
        delayRisk: prediction.delayRisk,
        mlPrediction: prediction,
      });
    }

    // Enrich shipments with road coordinates
    const { getRoadRoute } = require('../services/osrm');
    await Promise.all(
      Array.from(routeMap.values()).flatMap((r) =>
        r.shipments.map(async (sh) => {
          if (sh.warehouseLat && sh.warehouseLng && r.customer.lat && r.customer.lng) {
            try {
              const road = await getRoadRoute(
                { lat: sh.warehouseLat, lng: sh.warehouseLng },
                { lat: r.customer.lat, lng: r.customer.lng }
              );
              sh.coordinates = road.coordinates;
              sh.roadSource = road.source;
            } catch {
              sh.coordinates = [
                [sh.warehouseLng, sh.warehouseLat],
                [r.customer.lng, r.customer.lat],
              ];
            }
          }
        })
      )
    );

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
      recentShipmentsResult,
    ] = await Promise.all([
      // ─── Order counts by status + total revenue ─────────
      pool.query(`
        SELECT
          COUNT(*)::int AS total_orders,
          COALESCE(SUM(CASE WHEN status NOT IN ('CANCELLED','RETURN_REQUESTED') AND (idempotency_key IS NULL OR idempotency_key NOT LIKE 'flash-test-%') THEN total_amount ELSE 0 END), 0) AS total_revenue,
          COUNT(*) FILTER (WHERE status = 'PENDING')::int       AS pending,
          COUNT(*) FILTER (WHERE status = 'ROUTED')::int        AS routed,
          COUNT(*) FILTER (WHERE status IN ('SPLIT_ROUTED', 'SPLIT', 'MULTI_WAREHOUSE_SPLIT'))::int AS split_routed,
          COUNT(*) FILTER (WHERE status = 'FULFILLED')::int     AS fulfilled,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int        AS failed,
          COUNT(*) FILTER (WHERE status = 'CANCELLED')::int     AS cancelled,
          COUNT(*) FILTER (WHERE status = 'RETURN_REQUESTED')::int AS return_requested,
          COUNT(*) FILTER (WHERE status = 'DELIVERED')::int     AS delivered
        FROM orders
      `),

      // ─── Delivery metrics (from shipments, excluding cancelled) ─
      pool.query(`
        SELECT
          COUNT(*)::int AS total_shipments,
          COALESCE(ROUND(AVG(sh.distance_km)::numeric, 2), 0) AS avg_distance_km,
          COALESCE(ROUND(AVG(sh.total_cost)::numeric, 2), 0) AS avg_cost_per_shipment,
          COALESCE(ROUND(SUM(sh.total_cost)::numeric, 2), 0) AS total_delivery_cost
        FROM shipments sh
        JOIN orders o ON o.id = sh.order_id
        WHERE o.status NOT IN ('CANCELLED', 'RETURN_REQUESTED')
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

      // ─── Recent shipments for delay risk categorization ─
      pool.query(`
        SELECT distance_km, box_size, created_at
        FROM shipments
        ORDER BY created_at DESC
        LIMIT 100
      `),
    ]);

    const orderStats = orderStatsResult.rows[0];
    const delivery = deliveryResult.rows[0];
    const lifecycle = lifecycleResult.rows[0];
    const warehouseHealth = warehouseHealthResult.rows[0];

    // Compute delay risk distribution across recent shipments
    let lowRiskCount = 0;
    let medRiskCount = 0;
    let highRiskCount = 0;

    for (const row of (recentShipmentsResult?.rows || [])) {
      const pred = predictDelivery({
        distanceKm: parseFloat(row.distance_km),
        boxSize: row.box_size,
        timestamp: row.created_at,
      });
      if (pred.delayRisk === 'LOW') lowRiskCount++;
      else if (pred.delayRisk === 'HIGH') highRiskCount++;
      else medRiskCount++;
    }
    const atRiskCount = medRiskCount + highRiskCount;

    log.info({
      totalOrders: orderStats.total_orders,
      totalShipments: delivery.total_shipments,
      atRiskShipments: atRiskCount,
    }, 'Dashboard stats: aggregated');

    res.status(200).json({
      ordersByStatus: {
        pending: orderStats.pending,
        routed: orderStats.routed,
        splitRouted: orderStats.split_routed,
        fulfilled: orderStats.fulfilled,
        failed: orderStats.failed,
        cancelled: orderStats.cancelled,
        returnRequested: orderStats.return_requested,
        delivered: orderStats.delivered,
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
      delayRiskSummary: {
        low: lowRiskCount,
        medium: medRiskCount,
        high: highRiskCount,
        atRiskCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/dashboard/road-geometry
 *
 * Returns the OSRM road geometry (array of [lng, lat] coordinates)
 * for a given origin → destination pair. Used by the frontend to
 * draw actual road-following route lines on the MapLibre GL map.
 *
 * Query params:
 *   originLat, originLng   — warehouse coordinates
 *   destLat, destLng       — customer coordinates
 *
 * Response:
 *   { coordinates: [[lng, lat], ...], distanceKm, durationMins, source }
 */
router.get('/road-geometry', async (req, res, next) => {
  try {
    const { originLat, originLng, destLat, destLng } = req.query;

    // Validate required params
    if (!originLat || !originLng || !destLat || !destLng) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PARAMS',
          message: 'Required query params: originLat, originLng, destLat, destLng',
        },
      });
    }

    const origin = { lat: parseFloat(originLat), lng: parseFloat(originLng) };
    const destination = { lat: parseFloat(destLat), lng: parseFloat(destLng) };

    // Validate parsed values
    if (isNaN(origin.lat) || isNaN(origin.lng) || isNaN(destination.lat) || isNaN(destination.lng)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PARAMS',
          message: 'All coordinate params must be valid numbers.',
        },
      });
    }

    const { getRoadRoute } = require('../services/osrm');
    const result = await getRoadRoute(origin, destination);

    res.status(200).json({
      coordinates: result.coordinates,
      distanceKm: result.distanceKm,
      durationMins: result.durationMins,
      source: result.source,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/dashboard/simulate-outage
 *
 * What-If Warehouse Outage Simulator.
 * Takes a warehouseId, temporarily excludes it, and re-runs the routing
 * engine for all active orders to show how they'd be re-routed.
 *
 * CRITICAL: This is 100% READ-ONLY — zero database writes. Pure simulation.
 *
 * Request body: { warehouseId: "uuid" }
 * Response: { disabledWarehouse, affectedOrders, summary }
 */
router.post('/simulate-outage', async (req, res, next) => {
  try {
    const { warehouseId } = req.body;
    if (!warehouseId) {
      return res.status(400).json({
        error: { code: 'MISSING_PARAM', message: 'warehouseId is required' },
      });
    }

    const log = req.log || logger;

    // 1. Fetch the disabled warehouse info
    const disabledWhResult = await pool.query(
      'SELECT id, name, lat, lng FROM warehouses WHERE id = $1',
      [warehouseId]
    );
    if (disabledWhResult.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'WAREHOUSE_NOT_FOUND', message: 'Warehouse not found' },
      });
    }
    const disabledWh = disabledWhResult.rows[0];

    // 2. Fetch all warehouses EXCEPT the disabled one (with inventory)
    const healthyWhResult = await pool.query(`
      SELECT w.id, w.name, w.lat, w.lng,
             json_object_agg(COALESCE(i.sku, '__none__'), COALESCE(i.available_qty, 0))
               FILTER (WHERE i.sku IS NOT NULL) AS inventory
      FROM warehouses w
      LEFT JOIN inventories i ON i.warehouse_id = w.id
      WHERE w.id != $1 AND w.active = true
      GROUP BY w.id, w.name, w.lat, w.lng
    `, [warehouseId]);

    // 3. Fetch active orders that were originally routed through the disabled warehouse
    const affectedOrdersResult = await pool.query(`
      SELECT DISTINCT o.id AS order_id, o.status, o.total_amount, o.created_at,
             o.customer_lat, o.customer_lng,
             sh.warehouse_id AS original_warehouse_id,
             w.name AS original_warehouse_name,
             sh.distance_km AS original_distance,
             sh.total_cost AS original_cost
      FROM orders o
      JOIN shipments sh ON sh.order_id = o.id
      JOIN warehouses w ON w.id = sh.warehouse_id
      WHERE sh.warehouse_id = $1
        AND o.status NOT IN ('CANCELLED', 'RETURN_REQUESTED', 'DELIVERED', 'FULFILLED')
      ORDER BY o.created_at DESC
    `, [warehouseId]);

    // 4. Fetch order items for affected orders
    const affectedOrderIds = affectedOrdersResult.rows.map(r => r.order_id);

    let orderItemsMap = {};
    if (affectedOrderIds.length > 0) {
      const itemsResult = await pool.query(`
        SELECT oi.order_id, oi.sku, oi.qty,
               s.name, s.weight_kg,
               COALESCE(s.length_cm, 10) AS length_cm,
               COALESCE(s.width_cm, 10) AS width_cm,
               COALESCE(s.height_cm, 10) AS height_cm
        FROM order_items oi
        JOIN skus s ON s.sku = oi.sku
        WHERE oi.order_id = ANY($1)
      `, [affectedOrderIds]);

      for (const item of itemsResult.rows) {
        if (!orderItemsMap[item.order_id]) orderItemsMap[item.order_id] = [];
        orderItemsMap[item.order_id].push(item);
      }
    }

    // 5. For each affected order, calculate distance to healthy warehouses and re-route
    const { selectOptimalWarehouse } = require('../algorithms/routingEngine');
    const { calculateHaversineDistance } = require('../services/haversine');
    const { getRoadRoute } = require('../services/osrm');

    const whCoordsMap = new Map();
    for (const wh of healthyWhResult.rows) {
      whCoordsMap.set(wh.id, { lat: parseFloat(wh.lat), lng: parseFloat(wh.lng), name: wh.name });
    }

    const affectedOrders = [];
    let totalCostDelta = 0;
    let totalDistanceDelta = 0;
    let canRerouteAll = true;

    for (const order of affectedOrdersResult.rows) {
      const orderItems = orderItemsMap[order.order_id] || [];
      const custLat = parseFloat(order.customer_lat);
      const custLng = parseFloat(order.customer_lng);

      // Build warehouse list with distances to this customer
      const warehousesWithDist = healthyWhResult.rows.map(wh => {
        const dist = calculateHaversineDistance(
          { lat: custLat, lng: custLng },
          { lat: parseFloat(wh.lat), lng: parseFloat(wh.lng) }
        ).distanceKm;
        return {
          id: wh.id,
          name: wh.name,
          lat: parseFloat(wh.lat),
          lng: parseFloat(wh.lng),
          distanceKm: dist,
          inventory: wh.inventory || {},
        };
      });

      // Run routing engine (READ-ONLY, no DB writes)
      let newRoute = null;
      try {
        if (orderItems.length > 0) {
          newRoute = selectOptimalWarehouse({
            warehouses: warehousesWithDist,
            orderItems: orderItems.map(i => ({
              sku: i.sku,
              name: i.name,
              qty: parseInt(i.qty, 10) || 1,
              length_cm: Number(i.length_cm) || 10,
              width_cm: Number(i.width_cm) || 10,
              height_cm: Number(i.height_cm) || 10,
              weight_kg: Number(i.weight_kg) || 0.5,
            })),
          });
        }
      } catch (err) {
        log.warn({ orderId: order.order_id, err: err.message }, 'Outage sim: routing failed for order');
      }

      const originalCost = parseFloat(order.original_cost) || 0;
      const originalDistance = parseFloat(order.original_distance) || 0;

      if (newRoute && newRoute.chosen) {
        const effectiveNewCost = typeof newRoute.totalCost === 'number'
          ? newRoute.totalCost
          : newRoute.chosen.totalCost;
        const effectiveNewDistance = newRoute.shipmentGroups && newRoute.shipmentGroups.length > 1
          ? newRoute.shipmentGroups.reduce((sum, g) => sum + (g.distanceKm || 0), 0)
          : newRoute.chosen.distanceKm;

        const costDelta = effectiveNewCost - originalCost;
        const distDelta = effectiveNewDistance - originalDistance;
        totalCostDelta += costDelta;
        totalDistanceDelta += distDelta;

        const backupCoords = whCoordsMap.get(newRoute.chosen.warehouseId);
        let roadCoordinates = backupCoords
          ? [[backupCoords.lng, backupCoords.lat], [custLng, custLat]]
          : null;

        if (backupCoords) {
          try {
            const road = await getRoadRoute(
              { lat: backupCoords.lat, lng: backupCoords.lng },
              { lat: custLat, lng: custLng }
            );
            if (road?.coordinates?.length > 1) {
              roadCoordinates = road.coordinates;
            }
          } catch {
            // keep straight line fallback
          }
        }

        // Compute ETA impact label via etaPredictor
        const origPred = predictDelivery({ distanceKm: originalDistance });
        const newPred = predictDelivery({
          distanceKm: effectiveNewDistance,
          isSplitShipment: (newRoute.shipmentGroups?.length || 1) > 1,
        });
        const extraHours = Math.round((newPred.predictedTransitHours || 0) - (origPred.predictedTransitHours || 0));
        const etaImpact = extraHours >= 20
          ? `+${Math.max(1, Math.round(extraHours / 24))} Day${Math.round(extraHours / 24) > 1 ? 's' : ''} Transit Buffer`
          : extraHours > 1
            ? `+${extraHours} hrs Transit Buffer`
            : extraHours < -2
              ? `${extraHours} hrs Faster`
              : 'Same Transit Window';

        const backupHubLabel = newRoute.shipmentGroups && newRoute.shipmentGroups.length > 1
          ? [...new Set(newRoute.shipmentGroups.map(g => g.warehouseName))].join(' + ')
          : newRoute.chosen.name;

        affectedOrders.push({
          orderId: order.order_id,
          status: order.status,
          customerLat: custLat,
          customerLng: custLng,
          originalWarehouseId: order.original_warehouse_id,
          originalHub: order.original_warehouse_name,
          originalWarehouseLat: parseFloat(disabledWh.lat),
          originalWarehouseLng: parseFloat(disabledWh.lng),
          newWarehouseId: newRoute.chosen.warehouseId,
          newHub: backupHubLabel,
          newWarehouseLat: backupCoords?.lat ?? null,
          newWarehouseLng: backupCoords?.lng ?? null,
          roadCoordinates,
          originalCost: Math.round(originalCost * 100) / 100,
          newCost: Math.round(effectiveNewCost * 100) / 100,
          costDelta: Math.round(costDelta * 100) / 100,
          originalDistance: Math.round(originalDistance * 100) / 100,
          newDistance: Math.round(effectiveNewDistance * 100) / 100,
          distanceDelta: Math.round(distDelta * 100) / 100,
          stockFeasibility: 100,
          etaImpact,
          isSplitFailover: (newRoute.shipmentGroups?.length || 1) > 1,
          canReroute: true,
        });
      } else {
        canRerouteAll = false;
        affectedOrders.push({
          orderId: order.order_id,
          status: order.status,
          customerLat: custLat,
          customerLng: custLng,
          originalWarehouseId: order.original_warehouse_id,
          originalHub: order.original_warehouse_name,
          originalWarehouseLat: parseFloat(disabledWh.lat),
          originalWarehouseLng: parseFloat(disabledWh.lng),
          newWarehouseId: null,
          newHub: null,
          newWarehouseLat: null,
          newWarehouseLng: null,
          roadCoordinates: null,
          originalCost: Math.round(originalCost * 100) / 100,
          newCost: null,
          costDelta: null,
          originalDistance: Math.round(originalDistance * 100) / 100,
          newDistance: null,
          distanceDelta: null,
          stockFeasibility: 0,
          etaImpact: 'Stock Unavailable',
          canReroute: false,
          reason: newRoute?.message || 'No eligible backup warehouse has sufficient stock',
        });
      }
    }

    log.info({
      disabledWarehouse: disabledWh.name,
      affectedCount: affectedOrders.length,
      canRerouteAll,
    }, 'Outage simulation completed');

    res.status(200).json({
      disabledWarehouse: {
        id: disabledWh.id,
        name: disabledWh.name,
        lat: parseFloat(disabledWh.lat),
        lng: parseFloat(disabledWh.lng),
      },
      affectedOrders,
      summary: {
        totalAffected: affectedOrders.length,
        canFullyReroute: canRerouteAll,
        rerouteableCount: affectedOrders.filter(o => o.canReroute).length,
        avgCostIncrease: affectedOrders.length > 0
          ? Math.round((totalCostDelta / Math.max(affectedOrders.filter(o => o.canReroute).length, 1)) * 100) / 100
          : 0,
        totalCostDelta: Math.round(totalCostDelta * 100) / 100,
        avgDistanceIncrease: affectedOrders.length > 0
          ? Math.round((totalDistanceDelta / Math.max(affectedOrders.filter(o => o.canReroute).length, 1)) * 100) / 100
          : 0,
      },
      healthyWarehouses: healthyWhResult.rows.map(w => ({
        id: w.id,
        name: w.name,
        lat: parseFloat(w.lat),
        lng: parseFloat(w.lng),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

