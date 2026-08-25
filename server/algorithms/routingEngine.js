/**
 * Routing Engine — Warehouse Selection & Decision Combiner
 *
 * Combines three deterministic subsystems:
 *   1. Eligibility filter (available_qty >= requestedQty)
 *   2. Bin packing (box tier selection)
 *   3. Cost function (distance + packaging + depletion penalty scoring)
 *
 * Produces a ranked decision with the chosen warehouse and a full
 * alternatives array that Member 2 will feed into the Gemini prompt
 * for explainability.
 *
 * This module is the entry point for the deterministic routing core.
 * It has ZERO dependency on Gemini, Redis, Express, or any network service.
 *
 * @module algorithms/routingEngine
 */

'use strict';

const { calculateCost } = require('./costFunction');
const { packItems } = require('./binPacking');
const { validateOrderItems, validateWarehouses } = require('./inputValidation');

/**
 * Select the optimal warehouse for a given order.
 *
 * @param {Object} params
 * @param {Array<Object>} params.warehouses - Available warehouses, each with:
 *   { id, name, lat, lng, distanceKm, inventory: { sku: availableQty, ... } }
 *   NOTE: distanceKm must be pre-calculated by the caller (Member 2's
 *   google Maps / haversine service). This module does not compute distances.
 * @param {Array<Object>} params.orderItems - Items being ordered, each with:
 *   { sku, name, length_cm, width_cm, height_cm, weight_kg, qty }
 * @returns {Object} Routing decision
 */
function selectOptimalWarehouse({ warehouses, orderItems }) {
  // Input sanity guards (Week 4)
  if (warehouses && warehouses.length > 0) {
    validateWarehouses(warehouses);
  }
  if (orderItems && orderItems.length > 0) {
    validateOrderItems(orderItems);
  }

  if (!warehouses || warehouses.length === 0) {
    return {
      status: 'NO_WAREHOUSES',
      chosen: null,
      alternatives: [],
      message: 'No warehouses available for routing.',
    };
  }

  if (!orderItems || orderItems.length === 0) {
    return {
      status: 'NO_ITEMS',
      chosen: null,
      alternatives: [],
      message: 'No items in the order.',
    };
  }

  // Step 1: Determine bin-packing result for the order
  const packingResult = packItems(orderItems);

  // If an individual item is oversized, no warehouse can fulfill it
  if (packingResult.status === 'OVERSIZED_ITEM') {
    return {
      status: 'OVERSIZED_ITEM',
      chosen: null,
      alternatives: [],
      packing: packingResult,
      message: packingResult.message,
    };
  }

  // If items require a split shipment, route each group independently
  if (packingResult.status === 'SPLIT_SHIPMENT') {
    return routeSplitShipment({ warehouses, packingResult });
  }

  // Step 2: For single-box orders, evaluate each warehouse
  const boxSize = packingResult.boxSize;
  const candidates = [];
  const ineligible = [];

  for (const warehouse of warehouses) {
    // Check eligibility: warehouse must have sufficient stock for ALL items
    const eligibilityResult = checkEligibility(warehouse, orderItems);

    if (!eligibilityResult.eligible) {
      ineligible.push({
        warehouseId: warehouse.id,
        name: warehouse.name,
        distanceKm: warehouse.distanceKm,
        rejectionReason: eligibilityResult.reason,
        totalCost: null,
        penalty: null,
      });
      continue;
    }

    // Calculate cost using the item that creates the worst depletion scenario
    // (i.e., the SKU with the lowest remaining stock after fulfillment)
    const worstDepletion = getWorstDepletion(warehouse, orderItems);

    const costBreakdown = calculateCost({
      distanceKm: warehouse.distanceKm,
      boxSize,
      availableQty: worstDepletion.availableQty,
      requestedQty: worstDepletion.requestedQty,
    });

    candidates.push({
      warehouseId: warehouse.id,
      name: warehouse.name,
      distanceKm: warehouse.distanceKm,
      boxSize,
      costBreakdown,
      totalCost: costBreakdown.totalCost,
    });
  }

  // Step 3: No eligible warehouses
  if (candidates.length === 0) {
    return {
      status: 'NO_ELIGIBLE_WAREHOUSE',
      chosen: null,
      alternatives: ineligible,
      packing: packingResult,
      message: 'No warehouse has sufficient inventory to fulfill this order.',
    };
  }

  // Step 4: Rank candidates by totalCost ascending
  candidates.sort((a, b) => a.totalCost - b.totalCost);

  const chosen = candidates[0];

  // Step 5: Build alternatives array (all non-chosen candidates + ineligible)
  const alternatives = [
    ...candidates.slice(1).map(c => ({
      warehouseId: c.warehouseId,
      name: c.name,
      distanceKm: c.distanceKm,
      penalty: c.costBreakdown.depletionPenalty,
      totalCost: c.totalCost,
      rejectionReason: null, // Not rejected, just not optimal
    })),
    ...ineligible,
  ];

  return {
    status: 'ROUTED',
    chosen: {
      warehouseId: chosen.warehouseId,
      name: chosen.name,
      distanceKm: chosen.distanceKm,
      boxSize: chosen.boxSize,
      costBreakdown: chosen.costBreakdown,
      totalCost: chosen.totalCost,
    },
    alternatives,
    packing: packingResult,
  };
}

/**
 * Check whether a warehouse has sufficient inventory for ALL order items.
 *
 * @param {Object} warehouse - Must have inventory: { sku: availableQty, ... }
 * @param {Array<Object>} orderItems - Each with { sku, qty }
 * @returns {{ eligible: boolean, reason: string|null }}
 */
function checkEligibility(warehouse, orderItems) {
  const inventory = warehouse.inventory || {};

  for (const item of orderItems) {
    const available = inventory[item.sku];

    if (available === undefined || available === null) {
      return {
        eligible: false,
        reason: `SKU "${item.sku}" not stocked at this warehouse.`,
      };
    }

    if (available < item.qty) {
      return {
        eligible: false,
        reason: `Insufficient stock for SKU "${item.sku}": need ${item.qty}, have ${available}.`,
      };
    }
  }

  return { eligible: true, reason: null };
}

/**
 * Find the SKU with the worst depletion scenario at this warehouse.
 * The cost function uses this to determine the depletion penalty —
 * the warehouse is only as strong as its weakest-stocked SKU.
 *
 * @param {Object} warehouse - Must have inventory: { sku: availableQty, ... }
 * @param {Array<Object>} orderItems - Each with { sku, qty }
 * @returns {{ availableQty: number, requestedQty: number, sku: string }}
 */
function getWorstDepletion(warehouse, orderItems) {
  const inventory = warehouse.inventory || {};
  let worst = null;

  for (const item of orderItems) {
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

  return worst;
}

/**
 * Route a split shipment: iterate over bin-packing groups, selecting the
 * optimal warehouse for each group while tracking committed stock.
 *
 * Virtual inventory ensures later groups cannot double-allocate stock
 * that earlier groups have already reserved.
 *
 * @param {Object} params
 * @param {Array<Object>} params.warehouses - Available warehouses with inventory
 * @param {Object} params.packingResult - binPacking SPLIT_SHIPMENT result with groups
 * @returns {Object} Split shipment routing decision
 */
function routeSplitShipment({ warehouses, packingResult }) {
  const groups = packingResult.groups;

  // Build virtual inventory: { warehouseId: { sku: availableQty } }
  // This is a deep copy so we can deduct without mutating the input.
  const virtualInventory = {};
  for (const wh of warehouses) {
    virtualInventory[wh.id] = { ...wh.inventory };
  }

  const shipmentPlan = [];
  let totalCost = 0;
  let fullyRoutable = true;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];

    // Build warehouses with virtual (committed-adjusted) inventory
    const virtualWarehouses = warehouses.map(wh => ({
      ...wh,
      inventory: { ...virtualInventory[wh.id] },
    }));

    // Route this group against virtual inventory
    const groupResult = routeGroupAgainstInventory({
      warehouses: virtualWarehouses,
      groupItems: group.items,
      boxSize: group.boxSize,
    });

    if (groupResult.chosen) {
      // Deduct committed stock from virtual inventory
      const chosenId = groupResult.chosen.warehouseId;
      for (const item of group.items) {
        virtualInventory[chosenId][item.sku] =
          (virtualInventory[chosenId][item.sku] || 0) - item.qty;
      }

      totalCost += groupResult.chosen.totalCost;
    } else {
      fullyRoutable = false;
    }

    shipmentPlan.push({
      groupIndex,
      boxSize: group.boxSize,
      items: group.items,
      totalVolumeCm3: group.totalVolumeCm3,
      totalWeightKg: group.totalWeightKg,
      chosen: groupResult.chosen,
      alternatives: groupResult.alternatives,
    });
  }

  // If no groups could be routed at all, return NO_ELIGIBLE_WAREHOUSE
  if (shipmentPlan.every(g => g.chosen === null)) {
    return {
      status: 'NO_ELIGIBLE_WAREHOUSE',
      chosen: null,
      alternatives: [],
      shipmentPlan,
      packing: packingResult,
      message: 'No warehouse has sufficient inventory for any shipment group.',
    };
  }

  return {
    status: fullyRoutable ? 'SPLIT_ROUTED' : 'PARTIAL_SPLIT',
    // Backward compat: `chosen` = first group's warehouse (for callers expecting a single chosen)
    chosen: shipmentPlan[0]?.chosen || null,
    alternatives: shipmentPlan[0]?.alternatives || [],
    shipmentPlan,
    packing: packingResult,
    totalCost: Math.round(totalCost * 100) / 100,
    message: fullyRoutable
      ? `Order split into ${shipmentPlan.length} shipment groups, all routed.`
      : `Order split into ${shipmentPlan.length} groups; some groups could not be routed.`,
  };
}

/**
 * Route a single shipment group against the given warehouses.
 * Mirrors the logic in selectOptimalWarehouse but for a pre-determined
 * box size and item set.
 *
 * @param {Object} params
 * @param {Array<Object>} params.warehouses - Warehouses with virtual inventory
 * @param {Array<Object>} params.groupItems - Items in this group (with sku, qty)
 * @param {string} params.boxSize - Pre-determined box size from bin packing
 * @returns {{ chosen: Object|null, alternatives: Array }}
 */
function routeGroupAgainstInventory({ warehouses, groupItems, boxSize }) {
  const candidates = [];
  const ineligible = [];

  for (const warehouse of warehouses) {
    const eligibilityResult = checkEligibility(warehouse, groupItems);

    if (!eligibilityResult.eligible) {
      ineligible.push({
        warehouseId: warehouse.id,
        name: warehouse.name,
        distanceKm: warehouse.distanceKm,
        rejectionReason: eligibilityResult.reason,
        totalCost: null,
        penalty: null,
      });
      continue;
    }

    const worstDepletion = getWorstDepletion(warehouse, groupItems);
    const costBreakdown = calculateCost({
      distanceKm: warehouse.distanceKm,
      boxSize,
      availableQty: worstDepletion.availableQty,
      requestedQty: worstDepletion.requestedQty,
    });

    candidates.push({
      warehouseId: warehouse.id,
      name: warehouse.name,
      distanceKm: warehouse.distanceKm,
      boxSize,
      costBreakdown,
      totalCost: costBreakdown.totalCost,
    });
  }

  if (candidates.length === 0) {
    return { chosen: null, alternatives: ineligible };
  }

  candidates.sort((a, b) => a.totalCost - b.totalCost);
  const chosen = candidates[0];

  const alternatives = [
    ...candidates.slice(1).map(c => ({
      warehouseId: c.warehouseId,
      name: c.name,
      distanceKm: c.distanceKm,
      penalty: c.costBreakdown.depletionPenalty,
      totalCost: c.totalCost,
      rejectionReason: null,
    })),
    ...ineligible,
  ];

  return {
    chosen: {
      warehouseId: chosen.warehouseId,
      name: chosen.name,
      distanceKm: chosen.distanceKm,
      boxSize: chosen.boxSize,
      costBreakdown: chosen.costBreakdown,
      totalCost: chosen.totalCost,
    },
    alternatives,
  };
}

module.exports = {
  selectOptimalWarehouse,
  routeSplitShipment,
  routeGroupAgainstInventory,
  checkEligibility,
  getWorstDepletion,
};
