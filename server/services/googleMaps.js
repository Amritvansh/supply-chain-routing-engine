/**
 * Google Maps Distance Service — with Haversine Fallback
 *
 * Wraps the Google Maps Distance Matrix API for warehouse-to-customer
 * distance calculation. Automatically falls back to the deterministic
 * Haversine calculator when:
 *   - GOOGLE_MAPS_API_KEY is not set
 *   - The API request fails (network error, 4xx/5xx)
 *   - The API request times out (hard 3s limit)
 *   - The API returns an unexpected response shape
 *
 * This service NEVER throws. Every code path returns a valid
 * { distanceKm, source } result. The `source` field ('google_maps'
 * or 'haversine') lets callers and demo audiences see which path
 * was taken.
 *
 * @module services/googleMaps
 */

'use strict';

const env = require('../config/env');
const { calculateHaversineDistance, calculateMultipleDistances } = require('./haversine');

const GOOGLE_MAPS_TIMEOUT_MS = 3000;
const DISTANCE_MATRIX_BASE_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';

/**
 * Get the driving distance between an origin and a single destination
 * using the Google Maps Distance Matrix API, with Haversine fallback.
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ distanceKm: number, source: string }>}
 */
async function getDistance(origin, destination) {
  // Fast path: if no API key, skip the network call entirely
  if (!env.GOOGLE_MAPS_API_KEY) {
    return calculateHaversineDistance(origin, destination);
  }

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
      console.warn(`[GoogleMaps] API returned ${response.status}, falling back to Haversine`);
      return calculateHaversineDistance(origin, destination);
    }

    const data = await response.json();

    // Validate the response structure
    if (
      data.status !== 'OK' ||
      !data.rows?.[0]?.elements?.[0] ||
      data.rows[0].elements[0].status !== 'OK'
    ) {
      console.warn('[GoogleMaps] Unexpected response structure, falling back to Haversine');
      return calculateHaversineDistance(origin, destination);
    }

    const distanceMeters = data.rows[0].elements[0].distance.value;
    const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;

    return {
      distanceKm,
      source: 'google_maps',
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[GoogleMaps] Request timed out after 3s, falling back to Haversine');
    } else {
      console.warn(`[GoogleMaps] Request failed: ${err.message}, falling back to Haversine`);
    }
    return calculateHaversineDistance(origin, destination);
  }
}

/**
 * Get distances from one origin to multiple destinations.
 *
 * When the Google Maps API is unavailable, all destinations fall back
 * to Haversine in a single synchronous pass (no per-destination retry).
 *
 * @param {{ lat: number, lng: number }} origin
 * @param {Array<{ lat: number, lng: number }>} destinations
 * @returns {Promise<Array<{ distanceKm: number, source: string }>>}
 */
async function getDistances(origin, destinations) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return calculateMultipleDistances(origin, destinations);
  }

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
      console.warn(`[GoogleMaps] API returned ${response.status}, falling back to Haversine`);
      return calculateMultipleDistances(origin, destinations);
    }

    const data = await response.json();

    if (data.status !== 'OK' || !data.rows?.[0]?.elements) {
      console.warn('[GoogleMaps] Unexpected response, falling back to Haversine');
      return calculateMultipleDistances(origin, destinations);
    }

    const elements = data.rows[0].elements;

    return elements.map((el, idx) => {
      if (el.status !== 'OK') {
        // Individual destination failed — fall back for just this one
        return calculateHaversineDistance(origin, destinations[idx]);
      }
      return {
        distanceKm: Math.round((el.distance.value / 1000) * 100) / 100,
        source: 'google_maps',
      };
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[GoogleMaps] Request timed out after 3s, falling back to Haversine');
    } else {
      console.warn(`[GoogleMaps] Request failed: ${err.message}, falling back to Haversine`);
    }
    return calculateMultipleDistances(origin, destinations);
  }
}

module.exports = {
  getDistance,
  getDistances,
};
