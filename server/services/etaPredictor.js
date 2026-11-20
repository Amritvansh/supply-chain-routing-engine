/**
 * Dynamic Delivery Time (ETA) & Transit Delay Risk Prediction Service
 *
 * Machine Learning inference service for logistics transit time and delay probability.
 * Evaluates OSRM road distance, duration, package dimensions, weight, split shipment status,
 * and time-of-dispatch to predict transit hours and risk category.
 *
 * ARCHITECTURAL CONSTRAINTS:
 *   - Sub-5ms execution time (in-process decision tree ensemble).
 *   - NEVER throws or crashes checkout/quote/tracking (deterministic fallback on any error).
 *   - Completely self-contained; zero external network dependencies.
 *
 * @module services/etaPredictor
 */

'use strict';

let treePredictor = null;

function getPredictor() {
  if (!treePredictor) {
    try {
      treePredictor = require('../ml/treePredictor');
    } catch {
      treePredictor = null;
    }
  }
  return treePredictor;
}

/**
 * Format a delivery timestamp into a clean, human-readable string.
 * e.g., "Friday, Nov 22 by 5:00 PM"
 *
 * @param {Date} date
 * @returns {string}
 */
function formatDeliveryDate(date) {
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  const dateStr = date.toLocaleDateString('en-US', options);
  let hours = date.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${dateStr} by ${hours}:${minutes} ${ampm}`;
}

/**
 * Calculate the top 2 feature importance reasons influencing the ETA.
 *
 * @param {Object} params
 * @returns {[string, string]}
 */
function deriveFeatureImportance({ distanceKm, totalWeightKg, boxSizeNum, isSplit, hour, dayOfWeek }) {
  const factors = [];

  // 1. Distance factor
  if (distanceKm >= 1000) {
    factors.push({
      reason: `Long-haul interstate highway corridor (${Math.round(distanceKm).toLocaleString()} km)`,
      score: 0.95 + (distanceKm / 3000),
    });
  } else if (distanceKm >= 400) {
    factors.push({
      reason: `Regional highway transit (${Math.round(distanceKm).toLocaleString()} km)`,
      score: 0.70 + (distanceKm / 1500),
    });
  } else if (distanceKm <= 50) {
    factors.push({
      reason: `Intra-city short-haul delivery (${Math.round(distanceKm)} km)`,
      score: 0.65,
    });
  } else {
    factors.push({
      reason: `Direct road transit (${Math.round(distanceKm)} km)`,
      score: 0.50,
    });
  }

  // 2. Split shipment factor
  if (isSplit) {
    factors.push({
      reason: 'Multi-warehouse split coordination & parallel staging',
      score: 0.85,
    });
  }

  // 3. Weight & Box Size factor
  if (totalWeightKg >= 15) {
    factors.push({
      reason: `Heavy cargo handling (${totalWeightKg.toFixed(1)} kg payload)`,
      score: 0.60 + (totalWeightKg / 50),
    });
  } else if (boxSizeNum === 3) {
    factors.push({
      reason: 'Large parcel dimension (Tier LARGE packaging)',
      score: 0.55,
    });
  }

  // 4. Timing & Traffic factor
  if ((hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 20)) {
    factors.push({
      reason: 'Peak traffic dispatch window',
      score: 0.45,
    });
  } else if (hour >= 22 || hour <= 5) {
    factors.push({
      reason: 'Overnight line-haul trucking lane',
      score: 0.42,
    });
  }

  // 5. Weekend logistics factor
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    factors.push({
      reason: 'Weekend distribution hub sorting cycle',
      score: 0.40,
    });
  }

  // Sort descending by influence score and pick top 2
  factors.sort((a, b) => b.score - a.score);
  const top1 = factors[0]?.reason || `Road transit (${Math.round(distanceKm)} km)`;
  const top2 = factors[1]?.reason || (isSplit ? 'Split order coordination' : 'Standard warehouse processing');

  return [top1, top2];
}

/**
 * Predict delivery time, estimated date, and delay risk for a shipment.
 *
 * @param {Object} params
 * @param {number} params.distanceKm - Road distance in km
 * @param {number} [params.durationMins] - OSRM driving duration in minutes
 * @param {number} [params.totalWeightKg=1] - Total weight of items in kg
 * @param {string|number} [params.boxSize='MEDIUM'] - 'SMALL' (1), 'MEDIUM' (2), 'LARGE' (3)
 * @param {boolean|number} [params.isSplitShipment=false] - Whether this is a split shipment
 * @param {Date|string|number} [params.timestamp=new Date()] - Dispatch or order timestamp
 * @returns {{
 *   predictedTransitHours: number,
 *   predictedDeliveryDate: string,
 *   predictedDeliveryFormatted: string,
 *   onTimeConfidence: number,
 *   delayRisk: 'LOW' | 'MEDIUM' | 'HIGH',
 *   featureImportance: [string, string]
 * }}
 */
function predictDelivery(params = {}) {
  const p = params || {};
  const safeDistance = Math.max(1, parseFloat(p.distanceKm) || 50);
  const safeWeight = Math.max(0.1, parseFloat(p.totalWeightKg) || 1.5);

  // Box size mapping (SMALL=1, MEDIUM=2, LARGE=3)
  let boxSizeNum = 2;
  if (typeof p.boxSize === 'number') {
    boxSizeNum = Math.min(3, Math.max(1, p.boxSize));
  } else if (typeof p.boxSize === 'string') {
    const upper = p.boxSize.toUpperCase();
    if (upper === 'SMALL') boxSizeNum = 1;
    else if (upper === 'MEDIUM') boxSizeNum = 2;
    else if (upper === 'LARGE') boxSizeNum = 3;
  }

  const isSplit = Boolean(p.isSplitShipment);
  const baseDate = p.timestamp ? new Date(p.timestamp) : new Date();
  const validBaseDate = isNaN(baseDate.getTime()) ? new Date() : baseDate;

  const dayOfWeek = validBaseDate.getDay();
  const hour = validBaseDate.getHours();

  // Approximate OSRM driving duration if not supplied
  const durationMins = p.durationMins != null && !isNaN(p.durationMins)
    ? parseFloat(p.durationMins)
    : Math.round((safeDistance / 45) * 60);

  const featureImportance = deriveFeatureImportance({
    distanceKm: safeDistance,
    totalWeightKg: safeWeight,
    boxSizeNum,
    isSplit,
    hour,
    dayOfWeek,
  });

  try {
    const predictor = getPredictor();
    if (predictor && typeof predictor.predictEta === 'function') {
      const mlResult = predictor.predictEta({
        road_distance_km: safeDistance,
        osrm_duration_mins: durationMins,
        total_weight_kg: safeWeight,
        box_size: boxSizeNum,
        is_split_shipment: isSplit ? 1 : 0,
        day_of_week: dayOfWeek,
        hour_of_day: hour,
      });

      if (mlResult && typeof mlResult.predictedTransitHours === 'number' && !isNaN(mlResult.predictedTransitHours)) {
        const transitHours = Math.max(2, Math.round(mlResult.predictedTransitHours * 10) / 10);
        const delayProb = Math.min(1, Math.max(0, mlResult.isDelayedProb ?? 0.15));

        const delayRisk = delayProb < 0.20 ? 'LOW' : delayProb < 0.50 ? 'MEDIUM' : 'HIGH';
        const onTimeConfidence = Math.min(99, Math.max(50, Math.round((1 - delayProb) * 100)));

        const deliveryDate = new Date(validBaseDate.getTime() + Math.round(transitHours * 3600 * 1000));

        return {
          predictedTransitHours: transitHours,
          predictedDeliveryDate: deliveryDate.toISOString(),
          predictedDeliveryFormatted: formatDeliveryDate(deliveryDate),
          onTimeConfidence,
          delayRisk,
          featureImportance,
        };
      }
    }
  } catch {
    // Silently fall back to deterministic model on any error
  }

  // ─── Deterministic Rule-Based Fallback ─────────────────────
  // distanceKm < 100 ? 24h : distanceKm < 500 ? 48h : distanceKm < 1000 ? 72h : 120h
  const fallbackHours = safeDistance < 100
    ? 24
    : safeDistance < 500
      ? 48
      : safeDistance < 1000
        ? 72
        : 120;

  const adjustedHours = isSplit ? Math.round(fallbackHours * 1.15) : fallbackHours;
  const fallbackDeliveryDate = new Date(validBaseDate.getTime() + adjustedHours * 3600 * 1000);

  return {
    predictedTransitHours: adjustedHours,
    predictedDeliveryDate: fallbackDeliveryDate.toISOString(),
    predictedDeliveryFormatted: formatDeliveryDate(fallbackDeliveryDate),
    onTimeConfidence: 70,
    delayRisk: 'MEDIUM',
    featureImportance,
  };
}

module.exports = {
  predictDelivery,
  formatDeliveryDate,
  deriveFeatureImportance,
};
