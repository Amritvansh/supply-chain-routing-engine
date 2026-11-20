/**
 * Unit Tests — Dynamic ETA & Delay Risk Prediction (ML Service & Tree Predictor)
 *
 * Verifies:
 *   1. ETA Predictor Service (server/services/etaPredictor.js)
 *      - Output contract & schema validation
 *      - Sensible logistics relationships (distance, split shipment, cargo weight)
 *      - Deterministic rule-based fallback behavior on model failure
 *      - Resilience against null, undefined, and corrupt inputs
 *   2. ML Tree Predictor (server/ml/treePredictor.js)
 *      - GBDT inference return values
 *      - Sub-5ms execution latency requirement
 *      - Feature importance inspection
 */

'use strict';

const {
  predictDelivery,
  formatDeliveryDate,
  deriveFeatureImportance,
} = require('../services/etaPredictor');

const {
  predictEta,
  getFeatureImportance,
} = require('../ml/treePredictor');

describe('ETA Predictor Service (server/services/etaPredictor)', () => {
  const baseParams = {
    distanceKm: 450,
    durationMins: 540,
    totalWeightKg: 4.5,
    boxSize: 'MEDIUM',
    isSplitShipment: false,
    timestamp: new Date('2026-11-20T10:00:00.000Z'),
  };

  test('predictDelivery() returns all required fields', () => {
    const result = predictDelivery(baseParams);

    expect(result).toHaveProperty('predictedTransitHours');
    expect(result).toHaveProperty('predictedDeliveryDate');
    expect(result).toHaveProperty('predictedDeliveryFormatted');
    expect(result).toHaveProperty('onTimeConfidence');
    expect(result).toHaveProperty('delayRisk');
    expect(result).toHaveProperty('featureImportance');
  });

  test('predictedTransitHours is a positive number', () => {
    const result = predictDelivery(baseParams);
    expect(typeof result.predictedTransitHours).toBe('number');
    expect(result.predictedTransitHours).toBeGreaterThan(0);
    expect(Number.isFinite(result.predictedTransitHours)).toBe(true);
  });

  test('predictedDeliveryDate is a valid ISO date string', () => {
    const result = predictDelivery(baseParams);
    expect(typeof result.predictedDeliveryDate).toBe('string');
    const parsedDate = new Date(result.predictedDeliveryDate);
    expect(parsedDate.getTime()).not.toBeNaN();
    expect(parsedDate.toISOString()).toBe(result.predictedDeliveryDate);
    // Predicted delivery date must be in the future relative to the dispatch timestamp
    expect(parsedDate.getTime()).toBeGreaterThan(baseParams.timestamp.getTime());
  });

  test('onTimeConfidence is a number between 0 and 100', () => {
    const result = predictDelivery(baseParams);
    expect(typeof result.onTimeConfidence).toBe('number');
    expect(result.onTimeConfidence).toBeGreaterThanOrEqual(0);
    expect(result.onTimeConfidence).toBeLessThanOrEqual(100);
  });

  test('delayRisk is one of LOW, MEDIUM, or HIGH', () => {
    const result = predictDelivery(baseParams);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.delayRisk);
  });

  test('featureImportance is an array of exactly 2 descriptive strings', () => {
    const result = predictDelivery(baseParams);
    expect(Array.isArray(result.featureImportance)).toBe(true);
    expect(result.featureImportance).toHaveLength(2);
    expect(typeof result.featureImportance[0]).toBe('string');
    expect(typeof result.featureImportance[1]).toBe('string');
    expect(result.featureImportance[0].length).toBeGreaterThan(0);
    expect(result.featureImportance[1].length).toBeGreaterThan(0);
  });

  test('short distance (<100km) predicts faster delivery than long distance (>1000km)', () => {
    const shortDist = predictDelivery({
      ...baseParams,
      distanceKm: 45,
      durationMins: 60,
    });
    const longDist = predictDelivery({
      ...baseParams,
      distanceKm: 1400,
      durationMins: 1680,
    });

    expect(shortDist.predictedTransitHours).toBeLessThan(longDist.predictedTransitHours);
  });

  test('split shipments predict longer or equal transit time than non-split orders', () => {
    const singleShipment = predictDelivery({
      ...baseParams,
      distanceKm: 600,
      isSplitShipment: false,
    });
    const splitShipment = predictDelivery({
      ...baseParams,
      distanceKm: 600,
      isSplitShipment: true,
    });

    expect(splitShipment.predictedTransitHours).toBeGreaterThanOrEqual(
      singleShipment.predictedTransitHours
    );
    // Feature importance for split shipments should cite multi-warehouse coordination
    const importanceText = splitShipment.featureImportance.join(' ');
    expect(importanceText.toLowerCase()).toMatch(/split|multi-warehouse/);
  });

  test('heavy items (>20kg) have higher transit duration and lower or equal on-time confidence', () => {
    const light = predictDelivery({
      ...baseParams,
      distanceKm: 500,
      totalWeightKg: 1.0,
      boxSize: 'SMALL',
    });
    const heavy = predictDelivery({
      ...baseParams,
      distanceKm: 500,
      totalWeightKg: 24.0,
      boxSize: 'LARGE',
    });

    expect(heavy.predictedTransitHours).toBeGreaterThanOrEqual(light.predictedTransitHours);
    expect(heavy.onTimeConfidence).toBeLessThanOrEqual(light.onTimeConfidence);
    // Heavy freight cargo factor should be highlighted in feature importance
    const heavyImportance = heavy.featureImportance.join(' ');
    expect(heavyImportance.toLowerCase()).toMatch(/heavy|cargo|large/);
  });

  test('deterministic fallback works when ML model module fails to load', () => {
    jest.isolateModules(() => {
      jest.doMock('../ml/treePredictor', () => {
        throw new Error('Simulated model load failure: Module not found');
      });

      const { predictDelivery: fallbackPredict } = require('../services/etaPredictor');

      const result = fallbackPredict({
        distanceKm: 250,
        boxSize: 'MEDIUM',
      });

      expect(result).toBeDefined();
      expect(result.delayRisk).toBe('MEDIUM');
      expect(result.onTimeConfidence).toBe(70);
      expect(result.predictedTransitHours).toBe(48); // < 500km fallback tier = 48h
      expect(typeof result.predictedDeliveryDate).toBe('string');
      expect(result.featureImportance).toHaveLength(2);
    });
  });

  test('deterministic fallback triggers if treePredictor.predictEta throws during inference', () => {
    jest.isolateModules(() => {
      jest.doMock('../ml/treePredictor', () => ({
        predictEta: () => {
          throw new Error('Runtime tree traversal failure');
        },
        getFeatureImportance: () => ({}),
      }));

      const { predictDelivery: fallbackPredict } = require('../services/etaPredictor');

      const result = fallbackPredict({
        distanceKm: 850,
      });

      expect(result).toBeDefined();
      expect(result.delayRisk).toBe('MEDIUM');
      expect(result.onTimeConfidence).toBe(70);
      expect(result.predictedTransitHours).toBe(72); // < 1000km fallback tier = 72h
    });
  });

  test('service never throws with invalid, empty, or undefined inputs', () => {
    expect(() => predictDelivery()).not.toThrow();
    expect(() => predictDelivery(null)).not.toThrow();
    expect(() => predictDelivery({})).not.toThrow();
    expect(() => predictDelivery({ distanceKm: -100, totalWeightKg: -5, boxSize: null })).not.toThrow();
    expect(() => predictDelivery({ distanceKm: 'invalid', timestamp: 'not-a-date' })).not.toThrow();

    const emptyResult = predictDelivery({});
    expect(emptyResult.predictedTransitHours).toBeGreaterThan(0);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(emptyResult.delayRisk);
    expect(emptyResult.featureImportance).toHaveLength(2);
  });

  test('formatDeliveryDate formats dates correctly', () => {
    const testDate = new Date('2026-11-20T14:30:00.000Z');
    const formatted = formatDeliveryDate(testDate);
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(5);
    expect(formatted).toMatch(/by \d{1,2}:\d{2} (AM|PM)/);
  });

  test('deriveFeatureImportance returns top 2 factors', () => {
    const factors = deriveFeatureImportance({
      distanceKm: 1500,
      totalWeightKg: 20,
      boxSizeNum: 3,
      isSplit: true,
      hour: 9,
      dayOfWeek: 1,
    });
    expect(Array.isArray(factors)).toBe(true);
    expect(factors).toHaveLength(2);
  });
});

describe('ML Tree Predictor (server/ml/treePredictor)', () => {
  const sampleFeatures = {
    road_distance_km: 750,
    osrm_duration_mins: 850,
    total_weight_kg: 6.0,
    box_size: 2,
    is_split_shipment: 0,
    day_of_week: 3,
    hour_of_day: 14,
  };

  test('predictEta() returns predictedTransitHours and isDelayedProb', () => {
    const result = predictEta(sampleFeatures);

    expect(result).toHaveProperty('predictedTransitHours');
    expect(result).toHaveProperty('isDelayedProb');
    expect(result).toHaveProperty('onTimeConfidence');
    expect(result).toHaveProperty('delayRisk');
  });

  test('predictEta() returns reasonable and bounded values', () => {
    const result = predictEta(sampleFeatures);

    expect(result.predictedTransitHours).toBeGreaterThan(0);
    expect(result.predictedTransitHours).toBeLessThan(300); // Reasonable upper bound for transit hours
    expect(result.isDelayedProb).toBeGreaterThanOrEqual(0);
    expect(result.isDelayedProb).toBeLessThanOrEqual(1);
    expect(result.onTimeConfidence).toBeGreaterThanOrEqual(50);
    expect(result.onTimeConfidence).toBeLessThanOrEqual(100);
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.delayRisk);
  });

  test('predictEta() completes in under 5ms (performance requirement)', () => {
    // Warm-up run
    predictEta(sampleFeatures);

    // Measure 100 consecutive predictions to verify sub-5ms latency
    const iterations = 100;
    const start = process.hrtime.bigint();

    for (let i = 0; i < iterations; i++) {
      predictEta(sampleFeatures);
    }

    const end = process.hrtime.bigint();
    const totalMs = Number(end - start) / 1_000_000;
    const avgMs = totalMs / iterations;

    // Both average latency and total for 100 runs must be well under budget
    expect(avgMs).toBeLessThan(5.0);
    expect(avgMs).toBeLessThan(1.0); // Pure JS tree traversal is typically < 0.1ms
  });

  test('getFeatureImportance() returns feature names with importance scores', () => {
    const importance = getFeatureImportance();

    expect(importance).toBeDefined();

    if (Array.isArray(importance)) {
      expect(importance.length).toBeGreaterThan(0);
      const featureNames = importance.map(f => f.feature || f.name || f);
      expect(featureNames).toContain('road_distance_km');
    } else if (typeof importance === 'object') {
      const featureKeys = Object.keys(importance);
      expect(featureKeys).toContain('road_distance_km');
      expect(featureKeys).toContain('osrm_duration_mins');
      expect(typeof importance.road_distance_km).toBe('number');
    }
  });

  test('predictEta() never throws on missing or empty input', () => {
    expect(() => predictEta()).not.toThrow();
    expect(() => predictEta({})).not.toThrow();
    expect(() => predictEta(null)).not.toThrow();

    const emptyResult = predictEta({});
    expect(emptyResult.predictedTransitHours).toBeGreaterThan(0);
    expect(emptyResult.isDelayedProb).toBeGreaterThanOrEqual(0);
  });
});
