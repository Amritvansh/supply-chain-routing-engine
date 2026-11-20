/**
 * OSRM Road Distance & Geometry Service
 *
 * Queries the public OSRM (Open Source Routing Machine) API to get:
 *   1. Real driving distance (in km, following actual road networks)
 *   2. Estimated driving duration (in minutes)
 *   3. Full road geometry (array of [lng, lat] coordinates that trace
 *      actual highways, turns, and city streets)
 *
 * Uses the free public OSRM demo server backed by OpenStreetMap data.
 * No API key, no signup, no cost.
 *
 * Fallback chain:
 *   Google Maps API (if key set) → OSRM road distance → Haversine (pure math)
 *
 * This service NEVER throws. Every code path returns a valid result.
 * If OSRM is unreachable, it falls back to Haversine with a circuity
 * factor applied for a reasonable road-distance approximation.
 *
 * @module services/osrm
 */

'use strict';

const { calculateHaversineDistance } = require('./haversine');

/**
 * Hard timeout for OSRM API requests.
 * The public demo server is usually fast (~200ms), but we cap at 3s
 * to stay within the checkout latency budget.
 */
const OSRM_TIMEOUT_MS = 3000;

/**
 * Base URL for the OSRM public demo server.
 * Uses the 'driving' profile for road-based routing.
 */
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Circuity factor for Haversine fallback.
 * In real road networks, actual driving distance is typically 1.25× to 1.35×
 * the straight-line (great-circle) distance.
 * We use 1.3 as a standard logistics industry approximation.
 */
const CIRCUITY_FACTOR = 1.3;

/**
 * In-memory LRU cache for OSRM routes to prevent redundant external API calls.
 */
const routeCache = new Map();
const MAX_CACHE_ENTRIES = 1000;

function getCacheKey(origin, destination) {
  const oLat = Number(origin.lat).toFixed(4);
  const oLng = Number(origin.lng).toFixed(4);
  const dLat = Number(destination.lat).toFixed(4);
  const dLng = Number(destination.lng).toFixed(4);
  return `${oLat},${oLng}->${dLat},${dLng}`;
}

/**
 * Get the real driving distance, duration, and road geometry between
 * an origin and a single destination.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ distanceKm: number, durationMins: number, coordinates: Array<[number, number]>, source: string }>}
 */
async function getRoadRoute(origin, destination) {
  const cacheKey = getCacheKey(origin, destination);
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  try {
    // OSRM expects coordinates as lng,lat (not lat,lng)
    const url = `${OSRM_BASE_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(OSRM_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`[OSRM] API returned ${response.status}, falling back to Haversine`);
      return haversineFallbackWithCircuity(origin, destination);
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.warn('[OSRM] Unexpected response structure, falling back to Haversine');
      return haversineFallbackWithCircuity(origin, destination);
    }

    const route = data.routes[0];
    const distanceKm = Math.round((route.distance / 1000) * 100) / 100;
    const durationMins = Math.round(route.duration / 60);
    const coordinates = route.geometry.coordinates; // Array of [lng, lat]

    const result = {
      distanceKm,
      durationMins,
      coordinates,
      source: 'osrm_road',
    };

    // Cache the result
    if (routeCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = routeCache.keys().next().value;
      routeCache.delete(oldestKey);
    }
    routeCache.set(cacheKey, result);

    return result;
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      console.warn('[OSRM] Request timed out after 3s, falling back to Haversine');
    } else {
      console.warn(`[OSRM] Request failed: ${err.message}, falling back to Haversine`);
    }
    return haversineFallbackWithCircuity(origin, destination);
  }
}

/**
 * Get road routes from one origin to multiple destinations.
 *
 * Makes parallel OSRM requests (one per destination) for simplicity.
 * Each destination falls back independently if OSRM fails for it.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ lat: number, lng: number }>} destinations
 * @returns {Promise<Array<{ distanceKm: number, durationMins: number, coordinates: Array<[number, number]>, source: string }>>}
 */
async function getRoadRoutes(origin, destinations) {
  return Promise.all(
    destinations.map(dest => getRoadRoute(origin, dest))
  );
}

/**
 * Haversine fallback with circuity factor applied.
 * Returns a straight-line coordinate pair (no road geometry)
 * but with an estimated road distance.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {{ distanceKm: number, durationMins: number, coordinates: Array<[number, number]>, source: string }}
 */
function haversineFallbackWithCircuity(origin, destination) {
  const haversine = calculateHaversineDistance(origin, destination);
  const roadDistanceKm = Math.round(haversine.distanceKm * CIRCUITY_FACTOR * 100) / 100;

  // Rough estimate: average driving speed ~50 km/h in mixed urban/highway
  const durationMins = Math.round((roadDistanceKm / 50) * 60);

  return {
    distanceKm: roadDistanceKm,
    durationMins,
    // Only two points — frontend will draw a straight line as fallback
    coordinates: [
      [origin.lng, origin.lat],
      [destination.lng, destination.lat],
    ],
    source: 'haversine',
  };
}

module.exports = {
  getRoadRoute,
  getRoadRoutes,
  haversineFallbackWithCircuity,
  OSRM_BASE_URL,
  OSRM_TIMEOUT_MS,
  CIRCUITY_FACTOR,
};
