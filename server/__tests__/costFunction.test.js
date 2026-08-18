/**
 * Unit Tests — Cost Function
 *
 * Tests the deterministic routing cost formula from the Hybrid Master Plan.
 */

'use strict';

const {
  calculateCost,
  calculateDepletionPenalty,
  PACKAGING_BASE_COST,
} = require('../algorithms/costFunction');

describe('costFunction', () => {
  // ─── Distance Cost ──────────────────────────────────────────────

  describe('distance cost', () => {
    test('calculates distance cost as distanceKm × 0.5', () => {
      const result = calculateCost({
        distanceKm: 100,
        boxSize: 'SMALL',
        availableQty: 50,
        requestedQty: 1,
      });
      expect(result.distanceCost).toBe(50);
    });

    test('zero distance produces zero distance cost', () => {
      const result = calculateCost({
        distanceKm: 0,
        boxSize: 'SMALL',
        availableQty: 50,
        requestedQty: 1,
      });
      expect(result.distanceCost).toBe(0);
    });

    test('handles fractional distances with precision', () => {
      const result = calculateCost({
        distanceKm: 33.33,
        boxSize: 'SMALL',
        availableQty: 50,
        requestedQty: 1,
      });
      expect(result.distanceCost).toBe(16.67); // 33.33 * 0.5 = 16.665 → rounded to 16.67
    });
  });

  // ─── Packaging Cost ─────────────────────────────────────────────

  describe('packaging cost', () => {
    test('SMALL box has packaging cost 1', () => {
      const result = calculateCost({
        distanceKm: 10,
        boxSize: 'SMALL',
        availableQty: 50,
        requestedQty: 1,
      });
      expect(result.packagingCost).toBe(1);
    });

    test('MEDIUM box has packaging cost 3', () => {
      const result = calculateCost({
        distanceKm: 10,
        boxSize: 'MEDIUM',
        availableQty: 50,
        requestedQty: 1,
      });
      expect(result.packagingCost).toBe(3);
    });

    test('LARGE box has packaging cost 7', () => {
      const result = calculateCost({
        distanceKm: 10,
        boxSize: 'LARGE',
        availableQty: 50,
        requestedQty: 1,
      });
      expect(result.packagingCost).toBe(7);
    });

    test('throws on unknown box size', () => {
      expect(() =>
        calculateCost({
          distanceKm: 10,
          boxSize: 'XLARGE',
          availableQty: 50,
          requestedQty: 1,
        })
      ).toThrow('Unknown box size');
    });
  });

  // ─── Depletion Penalty ──────────────────────────────────────────

  describe('depletion penalty', () => {
    test('remaining < 0 returns Infinity (safety net)', () => {
      expect(calculateDepletionPenalty(-1)).toBe(Infinity);
    });

    test('remaining == 0 returns 50 (will empty warehouse)', () => {
      expect(calculateDepletionPenalty(0)).toBe(50);
    });

    test('remaining == 1 returns 10 (low stock)', () => {
      expect(calculateDepletionPenalty(1)).toBe(10);
    });

    test('remaining == 5 returns 10 (low stock boundary)', () => {
      expect(calculateDepletionPenalty(5)).toBe(10);
    });

    test('remaining == 6 returns 0 (healthy stock)', () => {
      expect(calculateDepletionPenalty(6)).toBe(0);
    });

    test('remaining == 100 returns 0 (healthy stock)', () => {
      expect(calculateDepletionPenalty(100)).toBe(0);
    });
  });

  // ─── Low Inventory Penalty via calculateCost ────────────────────

  describe('low inventory penalty integration', () => {
    test('order that empties warehouse gets penalty 50', () => {
      const result = calculateCost({
        distanceKm: 10,
        boxSize: 'SMALL',
        availableQty: 5,
        requestedQty: 5,
      });
      expect(result.depletionPenalty).toBe(50);
    });

    test('order leaving 3 units gets penalty 10', () => {
      const result = calculateCost({
        distanceKm: 10,
        boxSize: 'SMALL',
        availableQty: 8,
        requestedQty: 5,
      });
      expect(result.depletionPenalty).toBe(10);
    });

    test('order leaving 20 units gets penalty 0', () => {
      const result = calculateCost({
        distanceKm: 10,
        boxSize: 'SMALL',
        availableQty: 25,
        requestedQty: 5,
      });
      expect(result.depletionPenalty).toBe(0);
    });
  });

  // ─── Combined Score ─────────────────────────────────────────────

  describe('combined total cost', () => {
    test('totalCost is the sum of all three components', () => {
      // distanceKm=20 → distanceCost=10
      // boxSize=MEDIUM → packagingCost=3
      // available=10, requested=5 → remaining=5 → depletionPenalty=10
      const result = calculateCost({
        distanceKm: 20,
        boxSize: 'MEDIUM',
        availableQty: 10,
        requestedQty: 5,
      });
      expect(result.distanceCost).toBe(10);
      expect(result.packagingCost).toBe(3);
      expect(result.depletionPenalty).toBe(10);
      expect(result.totalCost).toBe(23);
    });

    test('healthy stock, close warehouse, small box = low cost', () => {
      const result = calculateCost({
        distanceKm: 4,
        boxSize: 'SMALL',
        availableQty: 100,
        requestedQty: 1,
      });
      // 4*0.5 + 1 + 0 = 3
      expect(result.totalCost).toBe(3);
    });

    test('far warehouse with empty-stock penalty is expensive', () => {
      const result = calculateCost({
        distanceKm: 200,
        boxSize: 'LARGE',
        availableQty: 3,
        requestedQty: 3,
      });
      // 200*0.5 + 7 + 50 = 157
      expect(result.totalCost).toBe(157);
    });
  });

  // ─── Determinism ────────────────────────────────────────────────

  describe('deterministic output', () => {
    test('identical inputs always produce identical output', () => {
      const params = {
        distanceKm: 42.7,
        boxSize: 'MEDIUM',
        availableQty: 15,
        requestedQty: 10,
      };

      const result1 = calculateCost(params);
      const result2 = calculateCost(params);
      const result3 = calculateCost(params);

      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
    });
  });

  // ─── Return Shape ───────────────────────────────────────────────

  describe('return shape', () => {
    test('returns all required fields', () => {
      const result = calculateCost({
        distanceKm: 50,
        boxSize: 'SMALL',
        availableQty: 20,
        requestedQty: 1,
      });
      expect(result).toHaveProperty('distanceCost');
      expect(result).toHaveProperty('packagingCost');
      expect(result).toHaveProperty('depletionPenalty');
      expect(result).toHaveProperty('totalCost');
      expect(typeof result.distanceCost).toBe('number');
      expect(typeof result.packagingCost).toBe('number');
      expect(typeof result.depletionPenalty).toBe('number');
      expect(typeof result.totalCost).toBe('number');
    });
  });
});
