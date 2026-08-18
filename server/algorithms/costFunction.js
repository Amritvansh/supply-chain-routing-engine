/**
 * Cost Function — Deterministic Routing Score Calculator
 *
 * Implements the routing cost formula from the Hybrid Master Plan §1.3:
 *
 *   Total Cost = (distance_km × 0.5) + packaging_base_cost(box_size) + depletion_penalty(remaining)
 *
 * Packaging base costs:
 *   SMALL  = 1
 *   MEDIUM = 3
 *   LARGE  = 7
 *
 * Depletion penalty tiers (applied AFTER the order would be fulfilled):
 *   remaining == 0  → 50   (warehouse will be emptied)
 *   remaining < 0   → Infinity (ineligible — should have been filtered before scoring)
 *   remaining <= 5  → 10   (low stock warning)
 *   remaining > 5   → 0    (healthy stock)
 *
 * IMPORTANT: Eligibility (available_qty >= requestedQty) is a hard filter
 * that must be applied BEFORE calling this function. This function assumes
 * the warehouse has already passed the eligibility check. If it receives
 * a negative remaining quantity, it returns Infinity to act as a safety net,
 * but callers should never rely on this — filter first.
 *
 * This module is a pure function with zero I/O. Given identical inputs,
 * it always produces identical output.
 *
 * @module algorithms/costFunction
 */

'use strict';

/**
 * Packaging base cost lookup.
 * Maps box size tier to its fixed cost component.
 * @type {Object<string, number>}
 */
const PACKAGING_BASE_COST = {
  SMALL: 1,
  MEDIUM: 3,
  LARGE: 7,
};

/**
 * Calculate the inventory depletion penalty based on remaining stock
 * after the order would be fulfilled.
 *
 * @param {number} remainingQty - available_qty minus requestedQty
 * @returns {number} penalty score
 */
function calculateDepletionPenalty(remainingQty) {
  if (remainingQty < 0) return Infinity; // Safety net: ineligible
  if (remainingQty === 0) return 50;     // Will empty the warehouse
  if (remainingQty <= 5) return 10;      // Low stock warning
  return 0;                              // Healthy stock
}

/**
 * Calculate the total routing cost for a single warehouse candidate.
 *
 * @param {Object} params
 * @param {number} params.distanceKm     - Distance from warehouse to customer (km)
 * @param {string} params.boxSize        - One of 'SMALL', 'MEDIUM', 'LARGE'
 * @param {number} params.availableQty   - Current available_qty at the warehouse for this SKU
 * @param {number} params.requestedQty   - Quantity the customer is ordering
 * @returns {Object} Structured cost breakdown
 * @returns {number} return.distanceCost      - distance_km × 0.5
 * @returns {number} return.packagingCost     - base cost for the box tier
 * @returns {number} return.depletionPenalty  - penalty based on remaining stock
 * @returns {number} return.totalCost         - sum of all three components
 */
function calculateCost({ distanceKm, boxSize, availableQty, requestedQty }) {
  const distanceCost = distanceKm * 0.5;

  const packagingCost = PACKAGING_BASE_COST[boxSize];
  if (packagingCost === undefined) {
    throw new Error(`Unknown box size: "${boxSize}". Must be SMALL, MEDIUM, or LARGE.`);
  }

  const remainingQty = availableQty - requestedQty;
  const depletionPenalty = calculateDepletionPenalty(remainingQty);

  const totalCost = distanceCost + packagingCost + depletionPenalty;

  return {
    distanceCost: Math.round(distanceCost * 100) / 100,
    packagingCost,
    depletionPenalty,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

module.exports = {
  calculateCost,
  calculateDepletionPenalty,
  PACKAGING_BASE_COST,
};
