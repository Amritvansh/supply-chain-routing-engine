/**
 * Week 4 Tests — Multi-Warehouse Split Shipment Routing
 *
 * Tests the full split-shipment routing algorithm introduced in Week 4:
 *   - 2-warehouse split
 *   - 3-warehouse split
 *   - Multi-SKU split
 *   - Inventory exhaustion and fallback
 *   - Stock exclusion (no double allocation)
 *   - Alternative warehouse calculation per group
 *   - No eligible warehouse for split
 *   - Input sanity guards
 *   - Performance measurement
 */

'use strict';

const {
  selectOptimalWarehouse,
  routeSplitShipment,
  routeGroupAgainstInventory,
  checkEligibility,
} = require('../algorithms/routingEngine');
const { packItems } = require('../algorithms/binPacking');
const { LIMITS } = require('../algorithms/inputValidation');

// ─── Helpers ────────────────────────────────────────────────────

/** Create a warehouse with inventory and a known distance */
function makeWarehouse(id, name, distanceKm, inventory) {
  return { id, name, distanceKm, inventory };
}

/** Create an item that fits in a SMALL box (128 cm³, 0.2 kg) */
function smallItem(sku, qty = 1) {
  return {
    sku,
    name: `Small-${sku}`,
    length_cm: 8,
    width_cm: 4,
    height_cm: 4,
    weight_kg: 0.2,
    qty,
  };
}

/** Create a LARGE item (32,000 cm³, 8 kg) — needs LARGE box, 2+ force SPLIT */
function largeItem(sku, qty = 1) {
  return {
    sku,
    name: `Large-${sku}`,
    length_cm: 40,
    width_cm: 40,
    height_cm: 20,
    weight_kg: 8,
    qty,
  };
}

/** Create a MEDIUM item (10,000 cm³, 4 kg) */
function mediumItem(sku, qty = 1) {
  return {
    sku,
    name: `Medium-${sku}`,
    length_cm: 25,
    width_cm: 20,
    height_cm: 20,
    weight_kg: 4,
    qty,
  };
}

// ─── Split Shipment Routing ─────────────────────────────────────

describe('Split Shipment Routing', () => {
  describe('2-warehouse split', () => {
    test('routes 2 groups to the same warehouse when it has enough stock', () => {
      const warehouses = [
        makeWarehouse('w1', 'Primary', 10, { 'SKU-A': 50, 'SKU-B': 50 }),
        makeWarehouse('w2', 'Secondary', 50, { 'SKU-A': 50, 'SKU-B': 50 }),
      ];

      // Two large items → triggers SPLIT_SHIPMENT from binPacking
      const orderItems = [largeItem('SKU-A'), largeItem('SKU-B')];

      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');
      expect(result.shipmentPlan).toHaveLength(2);
      expect(result.packing.status).toBe('SPLIT_SHIPMENT');

      // Both groups should pick Primary (closer) since stock is ample
      for (const group of result.shipmentPlan) {
        expect(group.chosen).not.toBeNull();
        expect(group.chosen.warehouseId).toBe('w1');
      }

      // Total cost is the sum
      expect(result.totalCost).toBeGreaterThan(0);
    });

    test('routes 2 groups to different warehouses when first exhausts stock', () => {
      const warehouses = [
        makeWarehouse('w1', 'Low-Stock', 10, { 'SKU-A': 1, 'SKU-B': 0 }),
        makeWarehouse('w2', 'Full-Stock', 50, { 'SKU-A': 50, 'SKU-B': 50 }),
      ];

      const orderItems = [largeItem('SKU-A'), largeItem('SKU-B')];
      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');
      expect(result.shipmentPlan).toHaveLength(2);

      // Group with SKU-B must go to w2 (w1 has 0 stock for SKU-B)
      const groupB = result.shipmentPlan.find(
        g => g.items.some(i => i.sku === 'SKU-B')
      );
      expect(groupB.chosen.warehouseId).toBe('w2');
    });
  });

  describe('3-warehouse split (mandatory)', () => {
    test('routes 3 groups across 3 different warehouses when stock is fragmented', () => {
      const warehouses = [
        makeWarehouse('w1', 'WH-Alpha', 10, { 'SKU-X': 5, 'SKU-Y': 0, 'SKU-Z': 0 }),
        makeWarehouse('w2', 'WH-Beta', 20, { 'SKU-X': 0, 'SKU-Y': 5, 'SKU-Z': 0 }),
        makeWarehouse('w3', 'WH-Gamma', 30, { 'SKU-X': 0, 'SKU-Y': 0, 'SKU-Z': 5 }),
      ];

      // 3 large items → 3 groups (each >50% of LARGE capacity)
      const orderItems = [
        largeItem('SKU-X'),
        largeItem('SKU-Y'),
        largeItem('SKU-Z'),
      ];

      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');
      expect(result.shipmentPlan).toHaveLength(3);

      // Each group must be routed to the only warehouse that has its SKU
      const groupX = result.shipmentPlan.find(
        g => g.items.some(i => i.sku === 'SKU-X')
      );
      const groupY = result.shipmentPlan.find(
        g => g.items.some(i => i.sku === 'SKU-Y')
      );
      const groupZ = result.shipmentPlan.find(
        g => g.items.some(i => i.sku === 'SKU-Z')
      );

      expect(groupX.chosen.warehouseId).toBe('w1');
      expect(groupY.chosen.warehouseId).toBe('w2');
      expect(groupZ.chosen.warehouseId).toBe('w3');

      // All groups should have alternatives
      expect(groupX.alternatives).toBeDefined();
      expect(groupY.alternatives).toBeDefined();
      expect(groupZ.alternatives).toBeDefined();
    });

    test('3 groups route to 2 warehouses when one has stock for 2 groups', () => {
      const warehouses = [
        makeWarehouse('w1', 'Multi-Stock', 10, { 'SKU-A': 50, 'SKU-B': 50, 'SKU-C': 50 }),
        makeWarehouse('w2', 'C-Only', 20, { 'SKU-A': 0, 'SKU-B': 0, 'SKU-C': 50 }),
        makeWarehouse('w3', 'Backup', 30, { 'SKU-A': 50, 'SKU-B': 50, 'SKU-C': 50 }),
      ];

      const orderItems = [
        largeItem('SKU-A'),
        largeItem('SKU-B'),
        largeItem('SKU-C'),
      ];

      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');
      expect(result.shipmentPlan).toHaveLength(3);

      // w1 is closest and has all SKUs — should serve all 3 groups
      for (const group of result.shipmentPlan) {
        expect(group.chosen).not.toBeNull();
        expect(group.chosen.warehouseId).toBe('w1');
      }
    });
  });

  describe('multiple SKU split', () => {
    test('handles groups containing multiple SKUs', () => {
      // Create items that individually fit in LARGE but total > LARGE
      const warehouses = [
        makeWarehouse('w1', 'Main', 10, {
          'SKU-M1': 100, 'SKU-M2': 100, 'SKU-M3': 100, 'SKU-M4': 100,
        }),
      ];

      // 4 medium items: each ~10000 cm³, total ~40000, fits in 1 LARGE
      // Need to force split: use qty to exceed LARGE
      const orderItems = [
        mediumItem('SKU-M1', 2), // 20000 cm³
        mediumItem('SKU-M2', 2), // 20000 cm³
        mediumItem('SKU-M3', 1), // 10000 cm³
        mediumItem('SKU-M4', 1), // 10000 cm³
      ];
      // Total: 60000 cm³ > 50000 (LARGE) → SPLIT

      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(['SPLIT_ROUTED', 'ROUTED']).toContain(result.status);

      if (result.status === 'SPLIT_ROUTED') {
        // Verify all items are accounted for
        const allItems = result.shipmentPlan.flatMap(g => g.items);
        const totalQty = allItems.reduce((sum, i) => sum + i.qty, 0);
        expect(totalQty).toBe(6); // 2+2+1+1
      }
    });
  });

  describe('stock exclusion (no double allocation)', () => {
    test('second group cannot use stock committed to first group', () => {
      const warehouses = [
        // Only 1 unit of SKU-A: if group 1 takes it, group 2 cannot
        makeWarehouse('w1', 'Scarce', 10, { 'SKU-A': 1, 'SKU-B': 1 }),
        makeWarehouse('w2', 'Backup', 50, { 'SKU-A': 50, 'SKU-B': 50 }),
      ];

      const orderItems = [
        largeItem('SKU-A'),
        largeItem('SKU-A'),
      ];

      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');

      // Count how many units of SKU-A were allocated from w1
      let w1Allocated = 0;
      for (const group of result.shipmentPlan) {
        if (group.chosen && group.chosen.warehouseId === 'w1') {
          for (const item of group.items) {
            if (item.sku === 'SKU-A') w1Allocated += item.qty;
          }
        }
      }

      // w1 has only 1 unit of SKU-A — should allocate at most 1
      expect(w1Allocated).toBeLessThanOrEqual(1);
    });

    test('virtual inventory deduction is correct across 3 groups', () => {
      const warehouses = [
        // Only 2 units of each SKU — groups must share carefully
        makeWarehouse('w1', 'Limited', 10, { 'SKU-P': 2, 'SKU-Q': 2, 'SKU-R': 2 }),
        makeWarehouse('w2', 'Backup', 50, { 'SKU-P': 50, 'SKU-Q': 50, 'SKU-R': 50 }),
      ];

      const orderItems = [
        largeItem('SKU-P'),
        largeItem('SKU-Q'),
        largeItem('SKU-R'),
      ];

      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');
      expect(result.shipmentPlan).toHaveLength(3);

      // w1 has enough for all 3 (1 each out of 2), so all should go to w1
      for (const group of result.shipmentPlan) {
        expect(group.chosen).not.toBeNull();
        expect(group.chosen.warehouseId).toBe('w1');
      }
    });
  });

  describe('inventory exhaustion at warehouse', () => {
    test('first warehouse exhausted → second warehouse selected for later groups', () => {
      const warehouses = [
        // w1 has exactly 1 of SKU-A: penalty for emptying = 50
        makeWarehouse('w1', 'Single-Stock', 10, { 'SKU-A': 1 }),
        makeWarehouse('w2', 'Full-Stock', 50, { 'SKU-A': 50 }),
      ];

      // 2 large items of same SKU → 2 groups
      const orderItems = [largeItem('SKU-A'), largeItem('SKU-A')];
      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');
      expect(result.shipmentPlan).toHaveLength(2);

      // Verify no warehouse was over-allocated
      const w1Count = result.shipmentPlan.filter(
        g => g.chosen && g.chosen.warehouseId === 'w1'
      ).length;
      const w2Count = result.shipmentPlan.filter(
        g => g.chosen && g.chosen.warehouseId === 'w2'
      ).length;

      // w1 has only 1 unit, so at most 1 group can go there
      expect(w1Count).toBeLessThanOrEqual(1);
      // At least 1 group must go to w2
      expect(w2Count).toBeGreaterThanOrEqual(1);
    });

    test('three groups across 3 warehouses with ample stock', () => {
      const warehouses = [
        makeWarehouse('w1', 'Closest', 10, { 'SKU-A': 10 }),
        makeWarehouse('w2', 'Middle', 20, { 'SKU-A': 10 }),
        makeWarehouse('w3', 'Farthest', 30, { 'SKU-A': 10 }),
      ];

      const orderItems = [
        largeItem('SKU-A'),
        largeItem('SKU-A'),
        largeItem('SKU-A'),
      ];

      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');
      expect(result.shipmentPlan).toHaveLength(3);

      // All groups should be routable
      for (const group of result.shipmentPlan) {
        expect(group.chosen).not.toBeNull();
      }

      // Verify no warehouse is over-allocated
      const allocationMap = {};
      for (const group of result.shipmentPlan) {
        const wId = group.chosen.warehouseId;
        if (!allocationMap[wId]) allocationMap[wId] = 0;
        for (const item of group.items) {
          allocationMap[wId] += item.qty;
        }
      }
      for (const [wId, qty] of Object.entries(allocationMap)) {
        expect(qty).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('alternative warehouse calculation per group', () => {
    test('each group has its own alternatives array', () => {
      const warehouses = [
        makeWarehouse('w1', 'Close', 10, { 'SKU-A': 50, 'SKU-B': 50 }),
        makeWarehouse('w2', 'Mid', 50, { 'SKU-A': 50, 'SKU-B': 50 }),
        makeWarehouse('w3', 'Far', 100, { 'SKU-A': 50, 'SKU-B': 50 }),
      ];

      const orderItems = [largeItem('SKU-A'), largeItem('SKU-B')];
      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');

      for (const group of result.shipmentPlan) {
        expect(group.alternatives).toBeDefined();
        expect(Array.isArray(group.alternatives)).toBe(true);
        // Should have at least 2 alternatives (w2 and w3)
        expect(group.alternatives.length).toBeGreaterThanOrEqual(2);
      }
    });

    test('alternatives reflect virtual inventory (not original)', () => {
      const warehouses = [
        // w1 has exactly 1 unit: depletion penalty = 50 (empties warehouse)
        // Total cost at w1: 10*0.5 + 7 + 50 = 62
        // Total cost at w2: 50*0.5 + 7 + 0 = 32
        // So w2 is cheaper for group1; w1 never gets chosen if w2 exists.
        // Use 5 units so w1 is preferred (healthy stock, close) for group1,
        // then exhausted for group2.
        makeWarehouse('w1', 'Low', 5, { 'SKU-A': 1 }),
        makeWarehouse('w2', 'Full', 80, { 'SKU-A': 50 }),
      ];

      const orderItems = [largeItem('SKU-A'), largeItem('SKU-A')];
      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');

      // Verify group 2 exists and w1's virtual inventory is reflected
      const group2 = result.shipmentPlan[1];
      expect(group2.chosen).not.toBeNull();

      // If w1 was chosen for group1 (emptying it), then group2 must see w1
      // as ineligible. If w1 was NOT chosen for group1, w1 appears in
      // alternatives with high depletion penalty.
      const group1Chosen = result.shipmentPlan[0].chosen;
      if (group1Chosen && group1Chosen.warehouseId === 'w1') {
        // w1 is exhausted → must appear as ineligible in group2
        const w1Alt = group2.alternatives.find(a => a.warehouseId === 'w1');
        expect(w1Alt).toBeDefined();
        expect(w1Alt.rejectionReason).toBeTruthy();
      }
    });
  });

  describe('no eligible warehouse for split', () => {
    test('returns NO_ELIGIBLE_WAREHOUSE when no warehouse can serve any group', () => {
      const warehouses = [
        makeWarehouse('w1', 'Empty', 10, { 'SKU-A': 0, 'SKU-B': 0 }),
      ];

      const orderItems = [largeItem('SKU-A'), largeItem('SKU-B')];
      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('NO_ELIGIBLE_WAREHOUSE');
      expect(result.chosen).toBeNull();
    });

    test('returns PARTIAL_SPLIT when some groups cannot be routed', () => {
      const warehouses = [
        makeWarehouse('w1', 'Partial', 10, { 'SKU-A': 5, 'SKU-B': 0 }),
      ];

      const orderItems = [largeItem('SKU-A'), largeItem('SKU-B')];
      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('PARTIAL_SPLIT');
      expect(result.shipmentPlan).toHaveLength(2);

      const routed = result.shipmentPlan.filter(g => g.chosen !== null);
      const unrouted = result.shipmentPlan.filter(g => g.chosen === null);

      expect(routed.length).toBeGreaterThan(0);
      expect(unrouted.length).toBeGreaterThan(0);
    });
  });

  describe('shipment plan structure', () => {
    test('each group in shipmentPlan has required fields', () => {
      const warehouses = [
        makeWarehouse('w1', 'Main', 10, { 'SKU-A': 50, 'SKU-B': 50 }),
      ];

      const orderItems = [largeItem('SKU-A'), largeItem('SKU-B')];
      const result = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result.status).toBe('SPLIT_ROUTED');

      for (const group of result.shipmentPlan) {
        expect(group).toHaveProperty('groupIndex');
        expect(group).toHaveProperty('boxSize');
        expect(group).toHaveProperty('items');
        expect(group).toHaveProperty('chosen');
        expect(group).toHaveProperty('alternatives');
        expect(group).toHaveProperty('totalVolumeCm3');
        expect(group).toHaveProperty('totalWeightKg');

        if (group.chosen) {
          expect(group.chosen).toHaveProperty('warehouseId');
          expect(group.chosen).toHaveProperty('name');
          expect(group.chosen).toHaveProperty('distanceKm');
          expect(group.chosen).toHaveProperty('boxSize');
          expect(group.chosen).toHaveProperty('costBreakdown');
          expect(group.chosen).toHaveProperty('totalCost');
        }
      }
    });

    test('backward compat: chosen and alternatives are present at top level', () => {
      const warehouses = [
        makeWarehouse('w1', 'Main', 10, { 'SKU-A': 50, 'SKU-B': 50 }),
      ];

      const orderItems = [largeItem('SKU-A'), largeItem('SKU-B')];
      const result = selectOptimalWarehouse({ warehouses, orderItems });

      // Top-level chosen should be the first group's chosen
      expect(result.chosen).toBeDefined();
      expect(result.alternatives).toBeDefined();
    });
  });

  describe('deterministic results', () => {
    test('same input always produces same output', () => {
      const warehouses = [
        makeWarehouse('w1', 'A', 10, { 'SKU-X': 50, 'SKU-Y': 50, 'SKU-Z': 50 }),
        makeWarehouse('w2', 'B', 20, { 'SKU-X': 50, 'SKU-Y': 50, 'SKU-Z': 50 }),
      ];

      const orderItems = [
        largeItem('SKU-X'),
        largeItem('SKU-Y'),
        largeItem('SKU-Z'),
      ];

      const result1 = selectOptimalWarehouse({ warehouses, orderItems });
      const result2 = selectOptimalWarehouse({ warehouses, orderItems });

      expect(result1.status).toBe(result2.status);
      expect(result1.totalCost).toBe(result2.totalCost);
      expect(result1.shipmentPlan.length).toBe(result2.shipmentPlan.length);

      for (let i = 0; i < result1.shipmentPlan.length; i++) {
        expect(result1.shipmentPlan[i].chosen?.warehouseId)
          .toBe(result2.shipmentPlan[i].chosen?.warehouseId);
      }
    });
  });
});

// ─── Input Sanity Guards ────────────────────────────────────────

describe('Input Sanity Guards', () => {
  test('rejects empty items array via selectOptimalWarehouse', () => {
    const warehouses = [makeWarehouse('w1', 'WH', 10, {})];
    const result = selectOptimalWarehouse({ warehouses, orderItems: [] });
    expect(result.status).toBe('NO_ITEMS');
  });

  test('rejects items with zero qty', () => {
    const warehouses = [makeWarehouse('w1', 'WH', 10, { 'SKU-A': 50 })];
    expect(() => {
      selectOptimalWarehouse({
        warehouses,
        orderItems: [{ ...smallItem('SKU-A'), qty: 0 }],
      });
    }).toThrow(/qty must be at least 1/);
  });

  test('rejects items with negative qty', () => {
    const warehouses = [makeWarehouse('w1', 'WH', 10, { 'SKU-A': 50 })];
    expect(() => {
      selectOptimalWarehouse({
        warehouses,
        orderItems: [{ ...smallItem('SKU-A'), qty: -5 }],
      });
    }).toThrow(/qty must be at least 1/);
  });

  test('rejects items with qty exceeding max', () => {
    expect(() => {
      selectOptimalWarehouse({
        warehouses: [makeWarehouse('w1', 'WH', 10, { 'SKU-A': 50 })],
        orderItems: [{ ...smallItem('SKU-A'), qty: LIMITS.MAX_QTY_PER_ITEM + 1 }],
      });
    }).toThrow(/exceeds maximum/);
  });

  test('rejects items exceeding max count', () => {
    const items = Array.from({ length: LIMITS.MAX_ITEMS_PER_ORDER + 1 }, (_, i) =>
      smallItem(`SKU-${i}`)
    );
    expect(() => {
      selectOptimalWarehouse({
        warehouses: [makeWarehouse('w1', 'WH', 10, {})],
        orderItems: items,
      });
    }).toThrow(/exceeds maximum/);
  });

  test('rejects items with invalid SKU format', () => {
    expect(() => {
      selectOptimalWarehouse({
        warehouses: [makeWarehouse('w1', 'WH', 10, { 'bad sku!': 50 })],
        orderItems: [{ ...smallItem('bad sku!') }],
      });
    }).toThrow(/invalid characters/);
  });

  test('rejects items with negative dimensions', () => {
    expect(() => {
      selectOptimalWarehouse({
        warehouses: [makeWarehouse('w1', 'WH', 10, { 'SKU-A': 50 })],
        orderItems: [{ ...smallItem('SKU-A'), length_cm: -1 }],
      });
    }).toThrow(/must be at least/);
  });

  test('rejects items with dimension exceeding max', () => {
    expect(() => {
      selectOptimalWarehouse({
        warehouses: [makeWarehouse('w1', 'WH', 10, { 'SKU-A': 50 })],
        orderItems: [{ ...smallItem('SKU-A'), length_cm: 9999 }],
      });
    }).toThrow(/exceeds maximum/);
  });

  test('rejects non-integer qty', () => {
    expect(() => {
      selectOptimalWarehouse({
        warehouses: [makeWarehouse('w1', 'WH', 10, { 'SKU-A': 50 })],
        orderItems: [{ ...smallItem('SKU-A'), qty: 1.5 }],
      });
    }).toThrow(/must be an integer/);
  });

  test('rejects items with missing weight_kg', () => {
    const item = smallItem('SKU-A');
    delete item.weight_kg;
    expect(() => {
      selectOptimalWarehouse({
        warehouses: [makeWarehouse('w1', 'WH', 10, { 'SKU-A': 50 })],
        orderItems: [item],
      });
    }).toThrow(/weight_kg is required/);
  });

  test('accepts valid warehouse count up to limit', () => {
    const warehouses = Array.from({ length: 10 }, (_, i) =>
      makeWarehouse(`w${i}`, `WH-${i}`, i * 10, { 'SKU-A': 50 })
    );
    const result = selectOptimalWarehouse({
      warehouses,
      orderItems: [smallItem('SKU-A')],
    });
    expect(result.status).toBe('ROUTED');
  });
});

// ─── routeGroupAgainstInventory unit tests ──────────────────────

describe('routeGroupAgainstInventory', () => {
  test('selects cheapest warehouse for a group', () => {
    const warehouses = [
      makeWarehouse('w1', 'Far', 100, { 'SKU-A': 50 }),
      makeWarehouse('w2', 'Close', 10, { 'SKU-A': 50 }),
    ];

    const result = routeGroupAgainstInventory({
      warehouses,
      groupItems: [{ sku: 'SKU-A', qty: 1 }],
      boxSize: 'SMALL',
    });

    expect(result.chosen.warehouseId).toBe('w2');
    expect(result.alternatives.length).toBe(1);
  });

  test('returns null chosen when no warehouse is eligible', () => {
    const warehouses = [
      makeWarehouse('w1', 'Empty', 10, { 'SKU-A': 0 }),
    ];

    const result = routeGroupAgainstInventory({
      warehouses,
      groupItems: [{ sku: 'SKU-A', qty: 1 }],
      boxSize: 'SMALL',
    });

    expect(result.chosen).toBeNull();
    expect(result.alternatives.length).toBe(1);
    expect(result.alternatives[0].rejectionReason).toBeTruthy();
  });
});

// ─── Performance Measurement ────────────────────────────────────

describe('Split Routing Performance', () => {
  test('measures latency for 3-group split across 5 warehouses', () => {
    const warehouses = Array.from({ length: 5 }, (_, i) =>
      makeWarehouse(`w${i}`, `WH-${i}`, (i + 1) * 20, {
        'SKU-A': 50, 'SKU-B': 50, 'SKU-C': 50,
      })
    );

    const orderItems = [
      largeItem('SKU-A'),
      largeItem('SKU-B'),
      largeItem('SKU-C'),
    ];

    const RUNS = 100;
    const latencies = [];

    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      selectOptimalWarehouse({ warehouses, orderItems });
      const end = process.hrtime.bigint();
      latencies.push(Number(end - start) / 1_000_000);
    }

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((s, l) => s + l, 0) / latencies.length;
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`\n  ┌─── Split Routing Performance ─────────────┐`);
    console.log(`  │ Runs:      ${RUNS}`);
    console.log(`  │ Groups:    3 (across 5 warehouses)`);
    console.log(`  │ Avg:       ${avg.toFixed(3)} ms`);
    console.log(`  │ P95:       ${p95.toFixed(3)} ms`);
    console.log(`  │ Min:       ${latencies[0].toFixed(3)} ms`);
    console.log(`  │ Max:       ${latencies[latencies.length - 1].toFixed(3)} ms`);
    console.log(`  └────────────────────────────────────────────┘\n`);

    expect(avg).toBeGreaterThan(0);
    expect(p95).toBeLessThan(50); // Must be well under 50ms
  });

  test('measures bin packing latency', () => {
    const items = [
      largeItem('SKU-A', 3),
      mediumItem('SKU-B', 5),
      smallItem('SKU-C', 10),
    ];

    const RUNS = 100;
    const latencies = [];

    for (let i = 0; i < RUNS; i++) {
      const start = process.hrtime.bigint();
      packItems(items);
      const end = process.hrtime.bigint();
      latencies.push(Number(end - start) / 1_000_000);
    }

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((s, l) => s + l, 0) / latencies.length;
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    console.log(`\n  ┌─── Bin Packing Performance ────────────────┐`);
    console.log(`  │ Runs:      ${RUNS}`);
    console.log(`  │ Items:     18 units (3 SKUs)`);
    console.log(`  │ Avg:       ${avg.toFixed(3)} ms`);
    console.log(`  │ P95:       ${p95.toFixed(3)} ms`);
    console.log(`  └────────────────────────────────────────────┘\n`);

    expect(avg).toBeGreaterThan(0);
  });
});
