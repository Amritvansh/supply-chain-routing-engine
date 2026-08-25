/**
 * 3D Bin Packing — First-Fit Decreasing (FFD)
 *
 * Implements the bin-packing algorithm from the Hybrid Master Plan §1.3:
 *
 * Box tiers (cumulative volume and weight limits):
 *   SMALL  — 5,000 cm³  /  2 kg
 *   MEDIUM — 20,000 cm³ / 10 kg
 *   LARGE  — 50,000 cm³ / 25 kg
 *
 * Algorithm:
 *   1. Calculate each item's volume (length × width × height × quantity).
 *   2. Sort items by individual volume descending (First-Fit Decreasing).
 *   3. Attempt to fit ALL items into a single box, starting from SMALL
 *      and stepping up through MEDIUM and LARGE.
 *   4. If all items fit in one box → return { status: 'FIT', boxSize, items }.
 *   5. If items overflow LARGE → return { status: 'SPLIT_SHIPMENT', groups }.
 *
 * The algorithm checks BOTH cumulative volume AND cumulative weight.
 * A box tier is only valid if items satisfy both constraints.
 *
 * For SPLIT_SHIPMENT: items are greedily packed into successive LARGE boxes.
 * Full recursive multi-warehouse split routing is deferred to Week 4.
 *
 * @module algorithms/binPacking
 */

'use strict';

const { validateOrderItems } = require('./inputValidation');

/**
 * Box tier definitions ordered from smallest to largest.
 * Each tier has a maximum volume (cm³) and weight (kg).
 */
const BOX_TIERS = [
  { name: 'SMALL',  maxVolumeCm3: 5000,  maxWeightKg: 2  },
  { name: 'MEDIUM', maxVolumeCm3: 20000, maxWeightKg: 10 },
  { name: 'LARGE',  maxVolumeCm3: 50000, maxWeightKg: 25 },
];

/**
 * Calculate the volume of a single unit of an item.
 *
 * @param {Object} item
 * @param {number} item.length_cm
 * @param {number} item.width_cm
 * @param {number} item.height_cm
 * @returns {number} volume in cm³
 */
function itemUnitVolume(item) {
  return item.length_cm * item.width_cm * item.height_cm;
}

/**
 * Calculate the total volume of an item line (unit volume × quantity).
 *
 * @param {Object} item - Must include length_cm, width_cm, height_cm, qty
 * @returns {number} total volume in cm³
 */
function itemTotalVolume(item) {
  return itemUnitVolume(item) * (item.qty || 1);
}

/**
 * Calculate the total weight of an item line (unit weight × quantity).
 *
 * @param {Object} item - Must include weight_kg, qty
 * @returns {number} total weight in kg
 */
function itemTotalWeight(item) {
  return item.weight_kg * (item.qty || 1);
}

/**
 * Check whether a set of items fits within a given box tier.
 *
 * @param {Array<Object>} items - Items with dimensions and weight
 * @param {Object} tier - Box tier with maxVolumeCm3 and maxWeightKg
 * @returns {boolean}
 */
function fitsInTier(items, tier) {
  let totalVolume = 0;
  let totalWeight = 0;

  for (const item of items) {
    totalVolume += itemTotalVolume(item);
    totalWeight += itemTotalWeight(item);
  }

  return totalVolume <= tier.maxVolumeCm3 && totalWeight <= tier.maxWeightKg;
}

/**
 * Pack order items into the smallest possible single box tier.
 *
 * If all items fit in one box, returns { status: 'FIT', boxSize, items }.
 * If items overflow LARGE, splits them into groups using greedy packing
 * and returns { status: 'SPLIT_SHIPMENT', groups }.
 *
 * @param {Array<Object>} orderItems - Array of items, each with:
 *   { sku, name, length_cm, width_cm, height_cm, weight_kg, qty }
 * @returns {Object} Packing result
 */
function packItems(orderItems) {
  if (!orderItems || orderItems.length === 0) {
    throw new Error('packItems requires at least one item.');
  }

  // Input sanity guards (Week 4)
  validateOrderItems(orderItems);

  // Expand items: if qty > 1, treat each unit as a separate packing unit
  // so the FFD sort operates on individual units.
  const expandedItems = [];
  for (const item of orderItems) {
    const qty = item.qty || 1;
    for (let i = 0; i < qty; i++) {
      expandedItems.push({
        ...item,
        qty: 1, // Each expanded item is a single unit
      });
    }
  }

  // Sort by individual volume descending (First-Fit Decreasing)
  expandedItems.sort((a, b) => itemUnitVolume(b) - itemUnitVolume(a));

  // Check if a single oversized item exceeds LARGE capacity
  const largeTier = BOX_TIERS[BOX_TIERS.length - 1];
  for (const item of expandedItems) {
    const vol = itemTotalVolume(item);
    const wt = itemTotalWeight(item);
    if (vol > largeTier.maxVolumeCm3 || wt > largeTier.maxWeightKg) {
      return {
        status: 'OVERSIZED_ITEM',
        oversizedItem: item,
        message: `Item "${item.sku || item.name}" (${vol}cm³, ${wt}kg) exceeds LARGE box capacity.`,
      };
    }
  }

  // Try fitting all items into a single box (smallest tier first)
  for (const tier of BOX_TIERS) {
    if (fitsInTier(expandedItems, tier)) {
      return {
        status: 'FIT',
        boxSize: tier.name,
        items: collapseItems(expandedItems),
        totalVolumeCm3: sumVolume(expandedItems),
        totalWeightKg: sumWeight(expandedItems),
      };
    }
  }

  // Items don't fit in a single LARGE box — split into groups
  const groups = greedySplit(expandedItems, largeTier);

  return {
    status: 'SPLIT_SHIPMENT',
    groups: groups.map(group => {
      // Determine the smallest box that fits this group
      let boxSize = 'LARGE';
      for (const tier of BOX_TIERS) {
        if (fitsInTier(group, tier)) {
          boxSize = tier.name;
          break;
        }
      }
      return {
        boxSize,
        items: collapseItems(group),
        totalVolumeCm3: sumVolume(group),
        totalWeightKg: sumWeight(group),
      };
    }),
  };
}

/**
 * Greedy split: pack expanded items into successive bins.
 * Each bin is at most LARGE-tier capacity.
 *
 * @param {Array<Object>} sortedItems - Already sorted by volume descending
 * @param {Object} maxTier - The largest box tier
 * @returns {Array<Array<Object>>} Array of item groups
 */
function greedySplit(sortedItems, maxTier) {
  const bins = [];

  for (const item of sortedItems) {
    let placed = false;

    // Try to fit into an existing bin
    for (const bin of bins) {
      const testBin = [...bin, item];
      if (fitsInTier(testBin, maxTier)) {
        bin.push(item);
        placed = true;
        break;
      }
    }

    // Open a new bin if needed
    if (!placed) {
      bins.push([item]);
    }
  }

  return bins;
}

/**
 * Collapse expanded single-unit items back into aggregated items
 * with combined quantities (for cleaner output).
 *
 * @param {Array<Object>} expandedItems
 * @returns {Array<Object>}
 */
function collapseItems(expandedItems) {
  const map = new Map();
  for (const item of expandedItems) {
    const key = item.sku || item.name;
    if (map.has(key)) {
      map.get(key).qty += 1;
    } else {
      map.set(key, { ...item, qty: 1 });
    }
  }
  return Array.from(map.values());
}

/**
 * Sum total volume across items.
 * @param {Array<Object>} items
 * @returns {number}
 */
function sumVolume(items) {
  return items.reduce((sum, item) => sum + itemTotalVolume(item), 0);
}

/**
 * Sum total weight across items.
 * @param {Array<Object>} items
 * @returns {number}
 */
function sumWeight(items) {
  return items.reduce((sum, item) => sum + itemTotalWeight(item), 0);
}

module.exports = {
  packItems,
  BOX_TIERS,
  // Exported for testing only:
  itemUnitVolume,
  itemTotalVolume,
  itemTotalWeight,
  fitsInTier,
};
