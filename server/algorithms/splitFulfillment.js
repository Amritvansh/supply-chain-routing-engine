/**
 * Split Fulfillment — Multi-Warehouse Inventory-Based Order Splitting
 *
 * Implements the core logic for splitting an order across multiple warehouses
 * when no single warehouse can fulfill the complete order.
 *
 * Decision Flow:
 *   1. Check if ANY single warehouse can fulfill the entire order.
 *   2. If yes → return SINGLE_WAREHOUSE result (existing behavior).
 *   3. If no  → evaluate multi-warehouse split fulfillment.
 *   4. For each unfulfilled item/quantity, find the cheapest eligible warehouse.
 *   5. Run FFD bin-packing independently for each shipment group.
 *   6. Apply configurable split-shipment penalty.
 *
 * This module is a pure function with zero I/O. Given identical inputs,
 * it always produces identical output.
 *
 * @module algorithms/splitFulfillment
 */

'use strict';

const { calculateCost } = require('./costFunction');
const { packItems } = require('./binPacking');

/**
 * Configurable split-shipment penalty.
 * Applied per additional shipment beyond the first to discourage
 * unnecessary splitting when a single warehouse is viable.
 */
const SPLIT_SHIPMENT_PENALTY = 15;

/**
 * Evaluate multi-warehouse fulfillment for an order.
 *
 * Single-warehouse-first: If any warehouse can fulfill everything,
 * this function returns null (caller should use the standard routing path).
 *
 * @param {Object} params
 * @param {Array<Object>} params.warehouses - Available warehouses with:
 *   { id, name, lat, lng, distanceKm, inventory: { sku: availableQty, ... } }
 * @param {Array<Object>} params.orderItems - Items being ordered with:
 *   { sku, name, length_cm, width_cm, height_cm, weight_kg, qty }
 * @returns {Object|null} Split fulfillment plan or null if single WH is possible
 */
function evaluateMultiWarehouseFulfillment({ warehouses, orderItems }) {
  if (!warehouses || warehouses.length === 0 || !orderItems || orderItems.length === 0) {
    return null;
  }

  // ── Step 1: Check if any single warehouse can fulfill everything ──
  const singleWarehouseCandidate = findSingleWarehouseCandidate(warehouses, orderItems);
  if (singleWarehouseCandidate) {
    // A single warehouse can do it — caller should use standard routing
    return null;
  }

  // ── Step 2: Build fulfillment assignments ─────────────────────────
  // For each item+qty, greedily assign to the cheapest eligible warehouse
  const assignments = buildFulfillmentAssignments(warehouses, orderItems);

  if (!assignments) {
    // Total inventory across all warehouses is insufficient
    return {
      status: 'INSUFFICIENT_TOTAL_INVENTORY',
      shipmentGroups: [],
      totalCost: Infinity,
      message: 'Insufficient total inventory across all warehouses to fulfill this order.',
    };
  }

  // ── Step 3: Group assignments by warehouse ────────────────────────
  const warehouseGroups = groupByWarehouse(assignments, orderItems);

  // ── Step 4: Run bin-packing and cost calculation per group ────────
  const shipmentGroups = [];
  let totalCost = 0;

  for (const group of warehouseGroups) {
    const warehouse = warehouses.find(w => w.id === group.warehouseId);
    if (!warehouse) continue;

    // Run FFD bin-packing independently for this shipment group
    let packingResult;
    try {
      packingResult = packItems(group.items);
    } catch (err) {
      // If packing fails for a group, the entire split is invalid
      return {
        status: 'PACKING_FAILED',
        shipmentGroups: [],
        totalCost: Infinity,
        message: `Packaging failed for warehouse "${warehouse.name}": ${err.message}`,
      };
    }

    // Calculate cost using worst depletion across this group's items
    const boxSize = packingResult.status === 'FIT'
      ? packingResult.boxSize
      : 'LARGE'; // Split within a split — use LARGE as fallback

    const worstDepletion = getWorstDepletionForGroup(warehouse, group.items);
    const costBreakdown = calculateCost({
      distanceKm: warehouse.distanceKm,
      boxSize,
      availableQty: worstDepletion.availableQty,
      requestedQty: worstDepletion.requestedQty,
    });

    // Apply split penalty for each additional shipment beyond the first
    const groupCost = costBreakdown.totalCost;
    totalCost += groupCost;

    shipmentGroups.push({
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      distanceKm: warehouse.distanceKm,
      items: group.items,
      boxSize,
      costBreakdown,
      totalCost: Math.round(groupCost * 100) / 100,
      packing: packingResult,
    });
  }

  // Add split penalty for additional shipments
  const splitPenalty = (shipmentGroups.length - 1) * SPLIT_SHIPMENT_PENALTY;
  totalCost += splitPenalty;

  return {
    status: 'MULTI_WAREHOUSE_SPLIT',
    fulfillmentType: 'SPLIT_SHIPMENT',
    shipmentGroups,
    shipmentCount: shipmentGroups.length,
    splitPenalty,
    totalCost: Math.round(totalCost * 100) / 100,
    message: `Order split into ${shipmentGroups.length} shipments across multiple warehouses.`,
  };
}

/**
 * Check if any single warehouse can fulfill all order items.
 *
 * @param {Array<Object>} warehouses
 * @param {Array<Object>} orderItems
 * @returns {Object|null} The warehouse that can fulfill, or null
 */
function findSingleWarehouseCandidate(warehouses, orderItems) {
  for (const warehouse of warehouses) {
    const inventory = warehouse.inventory || {};
    let canFulfill = true;

    for (const item of orderItems) {
      const available = inventory[item.sku];
      if (available === undefined || available === null || available < item.qty) {
        canFulfill = false;
        break;
      }
    }

    if (canFulfill) {
      return warehouse;
    }
  }
  return null;
}

/**
 * Build fulfillment assignments: for each item/qty, find the best warehouse.
 *
 * Uses a greedy approach: for each SKU, allocate as much as possible from
 * the cheapest eligible warehouse, then move to the next cheapest.
 * Tracks virtual inventory to prevent double-allocation.
 *
 * @param {Array<Object>} warehouses
 * @param {Array<Object>} orderItems
 * @returns {Array<Object>|null} Assignments array or null if impossible
 */
function buildFulfillmentAssignments(warehouses, orderItems) {
  // Build virtual inventory (deep copy to avoid mutation)
  const virtualInventory = {};
  for (const wh of warehouses) {
    virtualInventory[wh.id] = { ...wh.inventory };
  }

  const assignments = []; // { sku, qty, warehouseId }

  for (const item of orderItems) {
    let remaining = item.qty;

    // Find all warehouses that have this SKU, sorted by cost (distance as proxy)
    const candidates = warehouses
      .filter(wh => {
        const available = virtualInventory[wh.id]?.[item.sku] || 0;
        return available > 0;
      })
      .sort((a, b) => {
        // Sort by distance (primary cost driver) for greedy assignment
        return (a.distanceKm || 0) - (b.distanceKm || 0);
      });

    for (const warehouse of candidates) {
      if (remaining <= 0) break;

      const available = virtualInventory[warehouse.id][item.sku] || 0;
      const allocate = Math.min(remaining, available);

      if (allocate > 0) {
        assignments.push({
          sku: item.sku,
          name: item.name,
          length_cm: item.length_cm,
          width_cm: item.width_cm,
          height_cm: item.height_cm,
          weight_kg: item.weight_kg,
          qty: allocate,
          warehouseId: warehouse.id,
        });

        // Deduct from virtual inventory
        virtualInventory[warehouse.id][item.sku] -= allocate;
        remaining -= allocate;
      }
    }

    // If we couldn't fulfill the full quantity, the order is infeasible
    if (remaining > 0) {
      return null;
    }
  }

  return assignments;
}

/**
 * Group assignments by warehouse ID into shipment groups.
 *
 * @param {Array<Object>} assignments - { sku, qty, warehouseId, ... }
 * @param {Array<Object>} orderItems - Original order items (for dimension data)
 * @returns {Array<Object>} Groups: [{ warehouseId, items: [...] }]
 */
function groupByWarehouse(assignments, orderItems) {
  const groupMap = new Map();

  for (const assignment of assignments) {
    if (!groupMap.has(assignment.warehouseId)) {
      groupMap.set(assignment.warehouseId, {
        warehouseId: assignment.warehouseId,
        items: [],
      });
    }

    // Build full item object with dimensions for bin-packing
    groupMap.get(assignment.warehouseId).items.push({
      sku: assignment.sku,
      name: assignment.name,
      length_cm: assignment.length_cm,
      width_cm: assignment.width_cm,
      height_cm: assignment.height_cm,
      weight_kg: assignment.weight_kg,
      qty: assignment.qty,
    });
  }

  return Array.from(groupMap.values());
}

/**
 * Find the worst depletion scenario for a set of items at a warehouse.
 *
 * @param {Object} warehouse
 * @param {Array<Object>} items - Items assigned to this warehouse
 * @returns {{ availableQty: number, requestedQty: number }}
 */
function getWorstDepletionForGroup(warehouse, items) {
  const inventory = warehouse.inventory || {};
  let worst = null;

  for (const item of items) {
    const available = inventory[item.sku] || 0;
    const remaining = available - item.qty;

    if (worst === null || remaining < worst.remaining) {
      worst = {
        sku: item.sku,
        availableQty: available,
        requestedQty: item.qty,
        remaining,
      };
    }
  }

  return worst || { availableQty: 0, requestedQty: 0, remaining: 0 };
}

module.exports = {
  evaluateMultiWarehouseFulfillment,
  findSingleWarehouseCandidate,
  buildFulfillmentAssignments,
  groupByWarehouse,
  getWorstDepletionForGroup,
  SPLIT_SHIPMENT_PENALTY,
};
