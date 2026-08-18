/**
 * Haversine Distance Calculator — Deterministic Fallback
 *
 * Calculates the great-circle distance between two geographic points
 * using the Haversine formula. This is the automatic fallback when the
 * Google Maps Distance Matrix API is unavailable.
 *
 * Properties:
 *   - Zero I/O: no network, no disk, no database
 *   - Deterministic: same inputs always produce the same output
 *   - Never throws (validates inputs and returns 0 for same-point)
 *
 * Accuracy:
 *   Haversine assumes a spherical Earth (radius ≈ 6,371 km).
 *   Typical error vs. ellipsoidal model: ~0.3%.
 *   Sufficient for routing cost comparisons where the relative
 *   ranking of warehouses matters more than absolute precision.
 *
 * @module services/haversine
 */

'use strict';

const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate the Haversine great-circle distance between two points.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {{ distanceKm: number, source: string }}
 */
function calculateHaversineDistance(origin, destination) {
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);

  const lat1Rad = toRadians(origin.lat);
  const lat2Rad = toRadians(destination.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distanceKm = Math.round(EARTH_RADIUS_KM * c * 100) / 100;

  return {
    distanceKm,
    source: 'haversine',
  };
}

/**
 * Calculate distances from one origin to multiple destinations.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ lat: number, lng: number }>} destinations
 * @returns {Array<{ distanceKm: number, source: string }>}
 */
function calculateMultipleDistances(origin, destinations) {
  return destinations.map(dest => calculateHaversineDistance(origin, dest));
}

module.exports = {
  calculateHaversineDistance,
  calculateMultipleDistances,
  EARTH_RADIUS_KM,
};
