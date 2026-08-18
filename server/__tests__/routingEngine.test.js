/**
 * Unit Tests — Routing Engine
 *
 * Tests the warehouse selection algorithm that combines eligibility
 * filtering, bin packing, and cost scoring.
 */

'use strict';

const { selectOptimalWarehouse, checkEligibility, getWorstDepletion } = require('../algorithms/routingEngine');

// ─── Test Fixtures ──────────────────────────────────────────────

/** Small item that fits in SMALL box */
const SMALL_ITEM = {
  sku: 'SKU-PHONE-001',
  name: 'Smartphone',
  length_cm: 16,
  width_cm: 8,
  height_cm: 1,
  weight_kg: 0.2,
  qty: 1,
};

/** Warehouse factory */
function makeWarehouse(id, name, distanceKm, inventory) {
  return { id, name, distanceKm, inventory };
}

describe('routingEngine', () => {
  // ─── Nearest Warehouse Wins ───────────────────────────────────

  describe('nearest warehouse selection', () => {
    test('selects nearest warehouse when all have healthy stock', () => {
      const warehouses = [
        makeWarehouse('w1', 'Far Warehouse', 200, { 'SKU-PHONE-001': 50 }),
        makeWarehouse('w2', 'Near Warehouse', 10, { 'SKU-PHONE-001': 50 }),
        makeWarehouse('w3', 'Mid Warehouse', 80, { 'SKU-PHONE-001': 50 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      expect(result.status).toBe('ROUTED');
      expect(result.chosen.name).toBe('Near Warehouse');
      expect(result.chosen.distanceKm).toBe(10);
    });
  });

  // ─── Depletion Penalty Override ───────────────────────────────

  describe('depletion penalty makes farther warehouse win', () => {
    test('far warehouse with healthy stock beats near warehouse with low stock', () => {
      const warehouses = [
        // Near but will be emptied (penalty 50): cost = 5*0.5 + 1 + 50 = 53.5
        makeWarehouse('w1', 'Near Low-Stock', 5, { 'SKU-PHONE-001': 1 }),
        // Far but healthy stock (penalty 0): cost = 50*0.5 + 1 + 0 = 26
        makeWarehouse('w2', 'Far Healthy', 50, { 'SKU-PHONE-001': 100 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      expect(result.status).toBe('ROUTED');
      expect(result.chosen.name).toBe('Far Healthy');
      expect(result.chosen.costBreakdown.depletionPenalty).toBe(0);
    });

    test('near warehouse with low-stock penalty 10 vs far warehouse', () => {
      const warehouses = [
        // Near, remaining=3 after order → penalty 10: cost = 10*0.5 + 1 + 10 = 16
        makeWarehouse('w1', 'Near LowStock', 10, { 'SKU-PHONE-001': 4 }),
        // Far, remaining=99 → penalty 0: cost = 30*0.5 + 1 + 0 = 16
        makeWarehouse('w2', 'Far Healthy', 30, { 'SKU-PHONE-001': 100 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      // Both cost 16, but the one listed first wins ties (Near LowStock)
      expect(result.status).toBe('ROUTED');
      expect(result.chosen.totalCost).toBe(16);
    });
  });

  // ─── Zero-Stock Exclusion ─────────────────────────────────────

  describe('zero-stock warehouse exclusion', () => {
    test('warehouse with zero stock is excluded from candidates', () => {
      const warehouses = [
        makeWarehouse('w1', 'Empty Warehouse', 5, { 'SKU-PHONE-001': 0 }),
        makeWarehouse('w2', 'Stocked Warehouse', 50, { 'SKU-PHONE-001': 20 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      expect(result.status).toBe('ROUTED');
      expect(result.chosen.name).toBe('Stocked Warehouse');

      // Empty warehouse appears in alternatives with rejection reason
      const rejected = result.alternatives.find(a => a.name === 'Empty Warehouse');
      expect(rejected).toBeDefined();
      expect(rejected.rejectionReason).toContain('Insufficient stock');
    });
  });

  // ─── Insufficient Stock Exclusion ─────────────────────────────

  describe('insufficient stock exclusion', () => {
    test('warehouse with some stock but not enough is excluded', () => {
      const item = { ...SMALL_ITEM, qty: 10 };
      const warehouses = [
        makeWarehouse('w1', 'Low Warehouse', 5, { 'SKU-PHONE-001': 5 }),
        makeWarehouse('w2', 'Full Warehouse', 50, { 'SKU-PHONE-001': 100 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [item],
      });

      expect(result.status).toBe('ROUTED');
      expect(result.chosen.name).toBe('Full Warehouse');

      const rejected = result.alternatives.find(a => a.name === 'Low Warehouse');
      expect(rejected).toBeDefined();
      expect(rejected.rejectionReason).toContain('Insufficient stock');
    });

    test('warehouse missing the SKU entirely is excluded', () => {
      const warehouses = [
        makeWarehouse('w1', 'No SKU', 5, {}),
        makeWarehouse('w2', 'Has SKU', 50, { 'SKU-PHONE-001': 20 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      expect(result.status).toBe('ROUTED');
      expect(result.chosen.name).toBe('Has SKU');

      const rejected = result.alternatives.find(a => a.name === 'No SKU');
      expect(rejected.rejectionReason).toContain('not stocked');
    });
  });

  // ─── Alternatives Array ───────────────────────────────────────

  describe('alternatives array', () => {
    test('alternatives array is always present', () => {
      const warehouses = [
        makeWarehouse('w1', 'Only Warehouse', 10, { 'SKU-PHONE-001': 50 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      expect(result.alternatives).toBeDefined();
      expect(Array.isArray(result.alternatives)).toBe(true);
    });

    test('alternatives contain scored but non-chosen warehouses', () => {
      const warehouses = [
        makeWarehouse('w1', 'Best', 10, { 'SKU-PHONE-001': 50 }),
        makeWarehouse('w2', 'Second', 20, { 'SKU-PHONE-001': 50 }),
        makeWarehouse('w3', 'Third', 30, { 'SKU-PHONE-001': 50 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      expect(result.chosen.name).toBe('Best');
      expect(result.alternatives).toHaveLength(2);

      const secondAlt = result.alternatives.find(a => a.name === 'Second');
      expect(secondAlt).toBeDefined();
      expect(secondAlt.totalCost).toBeGreaterThan(result.chosen.totalCost);
      expect(secondAlt.rejectionReason).toBeNull(); // Not rejected, just not optimal
    });

    test('alternatives contain useful rejection information for ineligible warehouses', () => {
      const warehouses = [
        makeWarehouse('w1', 'Good', 10, { 'SKU-PHONE-001': 50 }),
        makeWarehouse('w2', 'Empty', 5, { 'SKU-PHONE-001': 0 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      const rejected = result.alternatives.find(a => a.name === 'Empty');
      expect(rejected.rejectionReason).toBeTruthy();
      expect(rejected.totalCost).toBeNull();
    });

    test('alternatives have correct shape fields', () => {
      const warehouses = [
        makeWarehouse('w1', 'Winner', 10, { 'SKU-PHONE-001': 50 }),
        makeWarehouse('w2', 'Loser', 30, { 'SKU-PHONE-001': 50 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      const alt = result.alternatives[0];
      expect(alt).toHaveProperty('warehouseId');
      expect(alt).toHaveProperty('name');
      expect(alt).toHaveProperty('distanceKm');
      expect(alt).toHaveProperty('penalty');
      expect(alt).toHaveProperty('totalCost');
      expect(alt).toHaveProperty('rejectionReason');
    });
  });

  // ─── Chosen Shape ─────────────────────────────────────────────

  describe('chosen warehouse shape', () => {
    test('chosen has all required fields', () => {
      const warehouses = [
        makeWarehouse('w1', 'Warehouse A', 25, { 'SKU-PHONE-001': 30 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      const chosen = result.chosen;
      expect(chosen).toHaveProperty('warehouseId', 'w1');
      expect(chosen).toHaveProperty('name', 'Warehouse A');
      expect(chosen).toHaveProperty('distanceKm', 25);
      expect(chosen).toHaveProperty('boxSize');
      expect(chosen).toHaveProperty('costBreakdown');
      expect(chosen).toHaveProperty('totalCost');
      expect(chosen.costBreakdown).toHaveProperty('distanceCost');
      expect(chosen.costBreakdown).toHaveProperty('packagingCost');
      expect(chosen.costBreakdown).toHaveProperty('depletionPenalty');
    });
  });

  // ─── Split Shipment ───────────────────────────────────────────

  describe('split shipment condition', () => {
    test('returns SPLIT_SHIPMENT when items exceed LARGE box', () => {
      const bigItems = [
        {
          sku: 'SKU-BIG-A',
          name: 'Big Item A',
          length_cm: 40,
          width_cm: 40,
          height_cm: 20,
          weight_kg: 8,
          qty: 1,
        },
        {
          sku: 'SKU-BIG-B',
          name: 'Big Item B',
          length_cm: 40,
          width_cm: 40,
          height_cm: 20,
          weight_kg: 8,
          qty: 1,
        },
      ];

      const warehouses = [
        makeWarehouse('w1', 'Warehouse A', 10, { 'SKU-BIG-A': 50, 'SKU-BIG-B': 50 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: bigItems,
      });

      expect(result.status).toBe('SPLIT_SHIPMENT');
      expect(result.packing).toBeDefined();
      expect(result.packing.groups).toBeDefined();
    });
  });

  // ─── No Eligible Warehouse ────────────────────────────────────

  describe('no eligible warehouse', () => {
    test('returns NO_ELIGIBLE_WAREHOUSE when all fail eligibility', () => {
      const warehouses = [
        makeWarehouse('w1', 'Empty A', 10, { 'SKU-PHONE-001': 0 }),
        makeWarehouse('w2', 'Empty B', 20, { 'SKU-PHONE-001': 0 }),
      ];

      const result = selectOptimalWarehouse({
        warehouses,
        orderItems: [SMALL_ITEM],
      });

      expect(result.status).toBe('NO_ELIGIBLE_WAREHOUSE');
      expect(result.chosen).toBeNull();
      expect(result.alternatives).toHaveLength(2);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    test('no warehouses returns NO_WAREHOUSES', () => {
      const result = selectOptimalWarehouse({
        warehouses: [],
        orderItems: [SMALL_ITEM],
      });
      expect(result.status).toBe('NO_WAREHOUSES');
    });

    test('no items returns NO_ITEMS', () => {
      const result = selectOptimalWarehouse({
        warehouses: [makeWarehouse('w1', 'W', 10, {})],
        orderItems: [],
      });
      expect(result.status).toBe('NO_ITEMS');
    });
  });

  // ─── Eligibility Helper ───────────────────────────────────────

  describe('checkEligibility', () => {
    test('eligible when stock is sufficient', () => {
      const wh = makeWarehouse('w1', 'W', 10, { 'SKU-A': 10 });
      const result = checkEligibility(wh, [{ sku: 'SKU-A', qty: 5 }]);
      expect(result.eligible).toBe(true);
    });

    test('ineligible when stock is insufficient', () => {
      const wh = makeWarehouse('w1', 'W', 10, { 'SKU-A': 3 });
      const result = checkEligibility(wh, [{ sku: 'SKU-A', qty: 5 }]);
      expect(result.eligible).toBe(false);
    });

    test('ineligible when SKU not stocked', () => {
      const wh = makeWarehouse('w1', 'W', 10, {});
      const result = checkEligibility(wh, [{ sku: 'SKU-A', qty: 1 }]);
      expect(result.eligible).toBe(false);
    });

    test('multi-SKU: all must be satisfied', () => {
      const wh = makeWarehouse('w1', 'W', 10, { 'SKU-A': 10, 'SKU-B': 2 });
      const items = [
        { sku: 'SKU-A', qty: 5 },
        { sku: 'SKU-B', qty: 3 }, // Only 2 available
      ];
      const result = checkEligibility(wh, items);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('SKU-B');
    });
  });

  // ─── Worst Depletion Helper ───────────────────────────────────

  describe('getWorstDepletion', () => {
    test('returns SKU with lowest remaining stock', () => {
      const wh = makeWarehouse('w1', 'W', 10, { 'SKU-A': 100, 'SKU-B': 5 });
      const items = [
        { sku: 'SKU-A', qty: 1 },
        { sku: 'SKU-B', qty: 3 }, // Remaining: 2
      ];
      const result = getWorstDepletion(wh, items);
      expect(result.sku).toBe('SKU-B');
      expect(result.remaining).toBe(2);
    });
  });
});
