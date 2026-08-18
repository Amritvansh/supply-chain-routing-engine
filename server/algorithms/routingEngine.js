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

  // If items require a split shipment, return the split condition
  // Full recursive multi-warehouse split routing is deferred to Week 4
  if (packingResult.status === 'SPLIT_SHIPMENT') {
    return {
      status: 'SPLIT_SHIPMENT',
      chosen: null,
      alternatives: [],
      packing: packingResult,
      message: 'Order requires split shipment. Multi-warehouse routing deferred to Week 4.',
    };
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

module.exports = {
  selectOptimalWarehouse,
  checkEligibility,
  getWorstDepletion,
};
