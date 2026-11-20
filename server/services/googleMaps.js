/**
 * Distance Service — Google Maps → OSRM → Haversine Fallback Chain
 *
 * Wraps distance calculation with a three-tier fallback strategy:
 *
 *   1. Google Maps Distance Matrix API (if GOOGLE_MAPS_API_KEY is set)
 *      → Returns road distance from Google's proprietary road network
 *   2. OSRM (Open Source Routing Machine) — FREE, no API key needed
 *      → Returns real driving distance + full road geometry from OpenStreetMap
 *   3. Haversine with Circuity Factor (pure math, zero I/O)
 *      → Returns estimated road distance (haversine × 1.3)
 *
 * This service NEVER throws. Every code path returns a valid
 * { distanceKm, durationMins, coordinates, source } result.
 *
 * The `coordinates` field is an array of [lng, lat] points tracing
 * the actual road path. When only Haversine is available, this contains
 * just the origin and destination (straight line). When OSRM or Google
 * provides data, it contains hundreds of points along real streets.
 *
 * @module services/googleMaps
 */

'use strict';

const env = require('../config/env');
const { calculateHaversineDistance, calculateMultipleDistances } = require('./haversine');
const { getRoadRoute, getRoadRoutes } = require('./osrm');

const GOOGLE_MAPS_TIMEOUT_MS = 3000;
const DISTANCE_MATRIX_BASE_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';

/**
 * Get the driving distance between an origin and a single destination.
 *
 * Fallback chain: Google Maps → OSRM → Haversine
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ distanceKm: number, durationMins: number|null, coordinates: Array<[number,number]>|null, source: string }>}
 */
async function getDistance(origin, destination) {
  // Tier 1: If Google Maps API key is set, try Google first
  if (env.GOOGLE_MAPS_API_KEY) {
    const googleResult = await tryGoogleMaps(origin, destination);
    if (googleResult) return googleResult;
  }

  // Tier 2: OSRM (free, real road distance + geometry)
  const osrmResult = await getRoadRoute(origin, destination);
  return osrmResult;
}

/**
 * Get distances from one origin to multiple destinations.
 *
 * Fallback chain: Google Maps → OSRM → Haversine
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ lat: number, lng: number }>} destinations
 * @returns {Promise<Array<{ distanceKm: number, durationMins: number|null, coordinates: Array<[number,number]>|null, source: string }>>}
 */
async function getDistances(origin, destinations) {
  // Tier 1: Try Google Maps batch API
  if (env.GOOGLE_MAPS_API_KEY) {
    const googleResult = await tryGoogleMapsBatch(origin, destinations);
    if (googleResult) return googleResult;
  }

  // Tier 2: OSRM (parallel requests, each with independent fallback)
  return getRoadRoutes(origin, destinations);
}

/**
 * Attempt to fetch distance from Google Maps Distance Matrix API.
 * Returns null if the request fails (caller should fall through to OSRM).
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ distanceKm: number, durationMins: number|null, coordinates: Array|null, source: string }|null>}
 */
async function tryGoogleMaps(origin, destination) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOOGLE_MAPS_TIMEOUT_MS);

    const url = new URL(DISTANCE_MATRIX_BASE_URL);
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', `${destination.lat},${destination.lng}`);
    url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);
    url.searchParams.set('units', 'metric');

    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[GoogleMaps] API returned ${response.status}, falling back to OSRM`);
      return null;
    }

    const data = await response.json();

    // Validate the response structure
    if (
      data.status !== 'OK' ||
      !data.rows?.[0]?.elements?.[0] ||
      data.rows[0].elements[0].status !== 'OK'
    ) {
      console.warn('[GoogleMaps] Unexpected response structure, falling back to OSRM');
      return null;
    }

    const element = data.rows[0].elements[0];
    const distanceKm = Math.round((element.distance.value / 1000) * 100) / 100;
    const durationMins = element.duration ? Math.round(element.duration.value / 60) : null;

    return {
      distanceKm,
      durationMins,
      // Google Distance Matrix doesn't return geometry — road coordinates
      // will be fetched separately by the frontend via OSRM if needed
      coordinates: null,
      source: 'google_maps',
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[GoogleMaps] Request timed out after 3s, falling back to OSRM');
    } else {
      console.warn(`[GoogleMaps] Request failed: ${err.message}, falling back to OSRM`);
    }
    return null;
  }
}

/**
 * Attempt batch distance fetch from Google Maps.
 * Returns null if request fails.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ lat: number, lng: number }>} destinations
 * @returns {Promise<Array|null>}
 */
async function tryGoogleMapsBatch(origin, destinations) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOOGLE_MAPS_TIMEOUT_MS);

    const destStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');

    const url = new URL(DISTANCE_MATRIX_BASE_URL);
    url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destinations', destStr);
    url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY);
    url.searchParams.set('units', 'metric');

    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[GoogleMaps] API returned ${response.status}, falling back to OSRM`);
      return null;
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.rows?.[0]?.elements) {
      console.warn('[GoogleMaps] Unexpected response, falling back to OSRM');
      return null;
    }

    const elements = data.rows[0].elements;

    return elements.map((el, idx) => {
      if (el.status !== 'OK') {
        // Individual destination failed — will fall through to OSRM for this one
        return {
          distanceKm: calculateHaversineDistance(origin, destinations[idx]).distanceKm,
          durationMins: null,
          coordinates: null,
          source: 'haversine',
        };
      }
      const durationMins = el.duration ? Math.round(el.duration.value / 60) : null;
      return {
        distanceKm: Math.round((el.distance.value / 1000) * 100) / 100,
        durationMins,
        coordinates: null,
        source: 'google_maps',
      };
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[GoogleMaps] Request timed out after 3s, falling back to OSRM');
    } else {
      console.warn(`[GoogleMaps] Request failed: ${err.message}, falling back to OSRM`);
    }
    return null;
  }
}

module.exports = {
  getDistance,
  getDistances,
};

