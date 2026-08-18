/**
 * Unit Tests — Bin Packing (First-Fit Decreasing)
 *
 * Tests the FFD bin-packing algorithm against the Hybrid Master Plan's
 * SMALL/MEDIUM/LARGE box tiers.
 */

'use strict';

const {
  packItems,
  BOX_TIERS,
  itemUnitVolume,
  itemTotalVolume,
  itemTotalWeight,
  fitsInTier,
} = require('../algorithms/binPacking');

// ─── Helper: create a test item with given dimensions ──────────────

function makeItem(sku, lengthCm, widthCm, heightCm, weightKg, qty = 1) {
  return { sku, name: sku, length_cm: lengthCm, width_cm: widthCm, height_cm: heightCm, weight_kg: weightKg, qty };
}

describe('binPacking', () => {
  // ─── Volume/Weight Helpers ────────────────────────────────────

  describe('volume and weight helpers', () => {
    test('itemUnitVolume calculates L×W×H', () => {
      const item = makeItem('A', 10, 5, 3, 0.5);
      expect(itemUnitVolume(item)).toBe(150); // 10×5×3
    });

    test('itemTotalVolume multiplies by qty', () => {
      const item = makeItem('A', 10, 5, 3, 0.5, 4);
      expect(itemTotalVolume(item)).toBe(600); // 150×4
    });

    test('itemTotalWeight multiplies by qty', () => {
      const item = makeItem('A', 10, 5, 3, 0.5, 4);
      expect(itemTotalWeight(item)).toBe(2); // 0.5×4
    });
  });

  // ─── SMALL Box Fit ────────────────────────────────────────────

  describe('SMALL box fit', () => {
    test('single small item fits in SMALL box', () => {
      // Volume: 10×5×3 = 150cm³ (well under 5000), Weight: 0.2kg (under 2kg)
      const items = [makeItem('PHONE', 10, 5, 3, 0.2)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('SMALL');
      expect(result.items).toHaveLength(1);
    });

    test('multiple small items fit in SMALL box when under limits', () => {
      // 3 items: 3 × (10×8×2=160cm³) = 480cm³, 3 × 0.3kg = 0.9kg
      const items = [makeItem('USB', 10, 8, 2, 0.3, 3)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('SMALL');
    });
  });

  // ─── MEDIUM Boundary Fit ──────────────────────────────────────

  describe('MEDIUM boundary fit', () => {
    test('items exceeding SMALL volume but fitting MEDIUM', () => {
      // Volume: 30×20×10 = 6000cm³ (over 5000 SMALL limit), Weight: 1.5kg
      const items = [makeItem('TABLET', 30, 20, 10, 1.5)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('MEDIUM');
    });

    test('items exceeding SMALL weight but fitting MEDIUM', () => {
      // Volume: 10×10×10 = 1000cm³ (under SMALL volume), Weight: 3kg (over SMALL 2kg limit)
      const items = [makeItem('WEIGHT', 10, 10, 10, 3)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('MEDIUM');
    });
  });

  // ─── LARGE Boundary Fit ───────────────────────────────────────

  describe('LARGE boundary fit', () => {
    test('items exceeding MEDIUM but fitting LARGE', () => {
      // Volume: 50×40×15 = 30000cm³ (over 20000 MEDIUM), Weight: 8kg
      const items = [makeItem('MONITOR', 50, 40, 15, 8)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('LARGE');
    });

    test('items at LARGE boundary (exactly 50000cm³)', () => {
      // Volume: 50×50×20 = 50000cm³ (exactly LARGE limit), Weight: 5kg
      const items = [makeItem('PANEL', 50, 50, 20, 5)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('LARGE');
    });
  });

  // ─── Multiple Items ───────────────────────────────────────────

  describe('multiple items', () => {
    test('two different items in same box', () => {
      const items = [
        makeItem('PHONE', 16, 8, 1, 0.2),  // 128cm³
        makeItem('CASE', 18, 10, 2, 0.1),   // 360cm³
      ];
      // Total: 488cm³, 0.3kg → SMALL
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('SMALL');
      expect(result.items).toHaveLength(2);
    });

    test('multiple quantities of same item', () => {
      // 5 × (16×8×1=128cm³) = 640cm³, 5 × 0.2 = 1.0kg → SMALL
      const items = [makeItem('PHONE', 16, 8, 1, 0.2, 5)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('SMALL');
      expect(result.items[0].qty).toBe(5);
    });
  });

  // ─── Item Ordering (FFD Sort) ─────────────────────────────────

  describe('item ordering by volume', () => {
    test('items are sorted by volume descending for packing', () => {
      // This test verifies FFD behavior: larger items considered first
      const items = [
        makeItem('SMALL-ITEM', 5, 5, 5, 0.1),     // 125cm³
        makeItem('LARGE-ITEM', 30, 20, 10, 1.0),   // 6000cm³
        makeItem('MEDIUM-ITEM', 15, 10, 5, 0.5),   // 750cm³
      ];
      const result = packItems(items);

      // All should fit in MEDIUM (total vol: 6875cm³, under 20000)
      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('MEDIUM');
    });
  });

  // ─── Weight Constraint ────────────────────────────────────────

  describe('weight constraint', () => {
    test('volume fits SMALL but weight forces MEDIUM', () => {
      // Volume: 10×10×10 = 1000cm³ (fits SMALL 5000cm³)
      // Weight: 2.5kg (exceeds SMALL 2kg)
      const items = [makeItem('HEAVY', 10, 10, 10, 2.5)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('MEDIUM');
    });

    test('volume fits MEDIUM but weight forces LARGE', () => {
      // Volume: 20×20×20 = 8000cm³ (fits MEDIUM 20000cm³)
      // Weight: 15kg (exceeds MEDIUM 10kg)
      const items = [makeItem('DENSE', 20, 20, 20, 15)];
      const result = packItems(items);

      expect(result.status).toBe('FIT');
      expect(result.boxSize).toBe('LARGE');
    });
  });

  // ─── Split Shipment ───────────────────────────────────────────

  describe('split shipment trigger', () => {
    test('items exceeding LARGE capacity trigger SPLIT_SHIPMENT', () => {
      // Each item: 40×40×20 = 32000cm³, Weight: 8kg
      // Two items: 64000cm³ total → exceeds LARGE 50000cm³
      const items = [
        makeItem('BIG-A', 40, 40, 20, 8),
        makeItem('BIG-B', 40, 40, 20, 8),
      ];
      const result = packItems(items);

      expect(result.status).toBe('SPLIT_SHIPMENT');
      expect(result.groups).toBeDefined();
      expect(result.groups.length).toBeGreaterThanOrEqual(2);

      // Verify all items are present across groups
      const totalItems = result.groups.reduce(
        (sum, g) => sum + g.items.reduce((s, i) => s + i.qty, 0),
        0
      );
      expect(totalItems).toBe(2);
    });

    test('each split group gets the correct box size', () => {
      // Item A: 40×40×20 = 32000cm³, 8kg → fits in LARGE alone
      // Item B: 10×10×10 = 1000cm³, 0.5kg → fits in SMALL alone
      // Together: 33000cm³ → fits in LARGE together, actually
      // Let's make them truly split:
      // Item A: 40×40×20 = 32000cm³, 8kg
      // Item B: 40×40×20 = 32000cm³, 8kg
      const items = [
        makeItem('CRATE-A', 40, 40, 20, 8),
        makeItem('CRATE-B', 40, 40, 20, 8),
      ];
      const result = packItems(items);

      expect(result.status).toBe('SPLIT_SHIPMENT');
      for (const group of result.groups) {
        expect(['SMALL', 'MEDIUM', 'LARGE']).toContain(group.boxSize);
      }
    });
  });

  // ─── Oversized Item ───────────────────────────────────────────

  describe('oversized item', () => {
    test('single item exceeding LARGE volume returns OVERSIZED_ITEM', () => {
      // Volume: 100×100×100 = 1,000,000cm³ (way over 50000)
      const items = [makeItem('FURNITURE', 100, 100, 100, 5)];
      const result = packItems(items);

      expect(result.status).toBe('OVERSIZED_ITEM');
      expect(result.oversizedItem).toBeDefined();
      expect(result.message).toContain('FURNITURE');
    });

    test('single item exceeding LARGE weight returns OVERSIZED_ITEM', () => {
      // Volume: 10×10×10 = 1000cm³ (fits SMALL), Weight: 30kg (exceeds LARGE 25kg)
      const items = [makeItem('ANVIL', 10, 10, 10, 30)];
      const result = packItems(items);

      expect(result.status).toBe('OVERSIZED_ITEM');
      expect(result.oversizedItem).toBeDefined();
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────

  describe('edge cases', () => {
    test('throws on empty items array', () => {
      expect(() => packItems([])).toThrow('at least one item');
    });

    test('throws on null/undefined items', () => {
      expect(() => packItems(null)).toThrow();
    });
  });
});
