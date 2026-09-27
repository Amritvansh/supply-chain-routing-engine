/**
 * Order Controller — Host Order Management
 *
 * Provides Host-only endpoints for global order visibility
 * and deep algorithm analysis.
 *
 *   GET /api/v1/orders/all       — List all orders (global, Host-only)
 *   GET /api/v1/orders/host/:id  — Full order detail + routing analysis
 *
 * All endpoints are protected by verifyToken + requireHost at the route layer.
 *
 * @module controllers/orderController
 */

'use strict';

const pool = require('../db/pool');

/**
 * GET /api/v1/orders/all
 *
 * Returns all orders in the system, ordered by created_at descending.
 * Includes basic details: status, total_amount, item count, customer info.
 *
 * Response shape:
 *   { orders: [...], count: number }
 */
async function getAllOrders(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        o.id,
        o.status,
        o.created_at,
        o.idempotency_key,
        o.customer_lat,
        o.customer_lng,
        o.customer_name,
        o.shipping_address,
        o.pincode,
        o.total_amount,
        o.user_id,
        COUNT(oi.id)::int AS item_count,
        COUNT(DISTINCT sh.id)::int AS shipment_count
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN shipments sh ON sh.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);

    const orders = rows.map(row => ({
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      idempotencyKey: row.idempotency_key,
      customerLat: row.customer_lat ? parseFloat(row.customer_lat) : null,
      customerLng: row.customer_lng ? parseFloat(row.customer_lng) : null,
      customerName: row.customer_name,
      shippingAddress: row.shipping_address,
      pincode: row.pincode,
      totalAmount: row.total_amount ? parseFloat(row.total_amount) : null,
      userId: row.user_id,
      itemCount: row.item_count,
      shipmentCount: row.shipment_count,
    }));

    res.status(200).json({ orders, count: orders.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/orders/host/:id
 *
 * Returns the complete order detail for Host analysis.
 * Unlike the customer-facing /:id route, this returns EVERYTHING:
 *   - Full order record (including lat/lng, customer info)
 *   - All order_items joined with SKU details (name, price, dimensions)
 *   - All shipments joined with warehouse details (name, location)
 *   - Reconstructed routing analysis (the 5-step algorithm breakdown)
 *   - AI explanation status (whether one has been generated)
 *
 * The routing analysis is reconstructed from the shipment data and
 * warehouse/inventory state, since we don't store a separate JSONB column.
 */
async function getHostOrderDetail(req, res, next) {
  try {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Order ID must be a valid UUID.',
        },
      });
    }

    // ── Fetch base order ──────────────────────────────────────────
    const orderResult = await pool.query(
      `SELECT id, customer_lat, customer_lng, status, idempotency_key, created_at,
              user_id, customer_name, customer_phone, shipping_address, pincode, total_amount
       FROM orders WHERE id = $1`,
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

    // ── Fetch order items with full SKU details ───────────────────
    const itemsResult = await pool.query(
      `SELECT
         oi.id AS item_id,
         oi.sku,
         oi.qty,
         s.name AS product_name,
         s.price,
         s.category,
         s.image_url,
         s.weight_kg,
         s.length_cm,
         s.width_cm,
         s.height_cm
       FROM order_items oi
       JOIN skus s ON s.sku = oi.sku
       WHERE oi.order_id = $1
       ORDER BY s.name`,
      [id]
    );

    // ── Fetch shipments with warehouse details ────────────────────
    const shipmentsResult = await pool.query(
      `SELECT
         sh.id AS shipment_id,
         sh.warehouse_id,
         w.name AS warehouse_name,
         w.lat AS warehouse_lat,
         w.lng AS warehouse_lng,
         sh.box_size,
         sh.total_cost,
         sh.distance_km,
         sh.created_at AS shipped_at
       FROM shipments sh
       JOIN warehouses w ON w.id = sh.warehouse_id
       WHERE sh.order_id = $1
       ORDER BY sh.created_at`,
      [id]
    );

    // ── Check if AI explanation exists ────────────────────────────
    const explanationResult = await pool.query(
      `SELECT id, model_used, source, latency_ms, created_at
       FROM ai_explanations WHERE order_id = $1`,
      [id]
    );

    // ── Build order response ─────────────────────────────────────
    const order = {
      id: orderRow.id,
      status: orderRow.status,
      createdAt: orderRow.created_at,
      idempotencyKey: orderRow.idempotency_key,
      customerLat: parseFloat(orderRow.customer_lat),
      customerLng: parseFloat(orderRow.customer_lng),
      customerName: orderRow.customer_name,
      customerPhone: orderRow.customer_phone,
      shippingAddress: orderRow.shipping_address,
      pincode: orderRow.pincode,
      totalAmount: orderRow.total_amount ? parseFloat(orderRow.total_amount) : null,
      userId: orderRow.user_id,
    };

    const items = itemsResult.rows.map(r => ({
      itemId: r.item_id,
      sku: r.sku,
      qty: r.qty,
      productName: r.product_name,
      price: parseFloat(r.price),
      category: r.category,
      imageUrl: r.image_url,
      weightKg: parseFloat(r.weight_kg),
      dimensions: {
        lengthCm: parseFloat(r.length_cm),
        widthCm: parseFloat(r.width_cm),
        heightCm: parseFloat(r.height_cm),
      },
      lineTotal: parseFloat(r.price) * r.qty,
    }));

    const shipments = shipmentsResult.rows.map(r => ({
      shipmentId: r.shipment_id,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      warehouseLat: parseFloat(r.warehouse_lat),
      warehouseLng: parseFloat(r.warehouse_lng),
      boxSize: r.box_size,
      totalCost: parseFloat(r.total_cost),
      distanceKm: parseFloat(r.distance_km),
      shippedAt: r.shipped_at,
    }));

    // ── Reconstruct 5-step routing analysis ──────────────────────
    // This mirrors the algorithm flow from the checkout route:
    //   Step 1: Geo-Distance Sorting
    //   Step 2: Inventory Availability Check
    //   Step 3: Fulfillment Cost Calculation
    //   Step 4: Split Shipment Logic
    //   Step 5: Bin Packing Result
    const routingAnalysis = buildRoutingAnalysis(order, items, shipments);

    // ── AI explanation metadata ──────────────────────────────────
    const aiExplanation = explanationResult.rows.length > 0
      ? {
          available: true,
          modelUsed: explanationResult.rows[0].model_used,
          source: explanationResult.rows[0].source,
          latencyMs: explanationResult.rows[0].latency_ms,
          generatedAt: explanationResult.rows[0].created_at,
        }
      : { available: false };

    res.status(200).json({
      order,
      items,
      shipments,
      routingAnalysis,
      aiExplanation,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Reconstruct the 5-step routing analysis from order/shipment data.
 *
 * Since we don't store a separate routing_metadata JSONB column,
 * we infer the algorithm steps from what we do have:
 *   - Shipment records (chosen warehouse, distance, cost, box size)
 *   - Order items (what was ordered)
 *   - Customer location (lat/lng)
 */
function buildRoutingAnalysis(order, items, shipments) {
  const isSplitShipment = shipments.length > 1;

  // Step 1: Geo-Distance Sorting
  const step1 = {
    step: 1,
    title: 'Geo-Distance Sorting',
    description: 'Warehouses sorted by Haversine distance to customer location.',
    customerLocation: {
      lat: order.customerLat,
      lng: order.customerLng,
    },
    warehouseDistances: shipments.map(s => ({
      warehouseName: s.warehouseName,
      distanceKm: s.distanceKm,
    })),
  };

  // Step 2: Inventory Availability Check
  const step2 = {
    step: 2,
    title: 'Inventory Availability Check',
    description: 'Verified sufficient stock at candidate warehouses for all requested items.',
    itemsRequested: items.map(i => ({
      sku: i.sku,
      productName: i.productName,
      qtyRequested: i.qty,
    })),
    result: isSplitShipment
      ? 'No single warehouse could fulfill all items — split shipment required.'
      : `All items fulfilled from ${shipments[0]?.warehouseName || 'selected warehouse'}.`,
  };

  // Step 3: Fulfillment Cost Calculation
  const PACKAGING_COST = { SMALL: 1, MEDIUM: 3, LARGE: 7 };
  const step3 = {
    step: 3,
    title: 'Fulfillment Cost Calculation',
    description: 'Cost = (distance × ₹0.50/km) + packaging_base + depletion_penalty',
    shipmentCosts: shipments.map(s => {
      const distanceCost = Math.round(s.distanceKm * 0.5 * 100) / 100;
      const packagingCost = PACKAGING_COST[s.boxSize] || 0;
      return {
        warehouseName: s.warehouseName,
        distanceCost,
        packagingCost,
        totalCost: s.totalCost,
        boxSize: s.boxSize,
      };
    }),
  };

  // Step 4: Split Shipment Logic
  const step4 = {
    step: 4,
    title: 'Split Shipment Decision',
    description: isSplitShipment
      ? `Order was split across ${shipments.length} warehouses because no single warehouse had all items in stock.`
      : 'Single-warehouse fulfillment — no split required.',
    isSplit: isSplitShipment,
    shipmentGroups: shipments.map((s, idx) => ({
      group: idx + 1,
      warehouseName: s.warehouseName,
      warehouseId: s.warehouseId,
    })),
  };

  // Step 5: Final Bin Packing
  const totalWeight = items.reduce((sum, i) => sum + i.weightKg * i.qty, 0);
  const totalVolume = items.reduce((sum, i) =>
    sum + i.dimensions.lengthCm * i.dimensions.widthCm * i.dimensions.heightCm * i.qty, 0);

  const step5 = {
    step: 5,
    title: 'Bin Packing Result',
    description: 'First-Fit Decreasing (FFD) algorithm determined optimal box sizes.',
    totalWeightKg: Math.round(totalWeight * 100) / 100,
    totalVolumeCm3: Math.round(totalVolume * 100) / 100,
    boxesUsed: shipments.map(s => ({
      warehouseName: s.warehouseName,
      boxSize: s.boxSize,
    })),
  };

  return {
    steps: [step1, step2, step3, step4, step5],
    summary: {
      totalShipments: shipments.length,
      totalDeliveryCost: Math.round(shipments.reduce((s, sh) => s + sh.totalCost, 0) * 100) / 100,
      totalItems: items.reduce((s, i) => s + i.qty, 0),
      isSplitShipment,
    },
  };
}

module.exports = {
  getAllOrders,
  getHostOrderDetail,
};
