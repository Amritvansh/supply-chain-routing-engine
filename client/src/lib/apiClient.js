/**
 * API Client — Thin transport layer for /api/v1 endpoints
 *
 * Uses VITE_API_URL from environment. Never contains business logic.
 * All methods return parsed JSON or throw a structured error.
 *
 * ARCHITECTURAL NOTE:
 *   checkout() → synchronous deterministic path (no AI)
 *   getExplanation() → asynchronous AI path (decoupled)
 *   The frontend should call these separately — never block
 *   checkout rendering on an explanation result.
 */

const BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1`;

/**
 * Generic fetch wrapper with consistent error handling.
 * @param {string} endpoint - path after /api/v1
 * @param {RequestInit} options - fetch options
 * @returns {Promise<any>} parsed JSON body
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body?.error?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = body?.error?.code || 'UNKNOWN_ERROR';
    error.body = body;
    throw error;
  }

  return response.json();
}

// ─── Public API Methods ────────────────────────────────────

/**
 * Submit a checkout order (synchronous deterministic path).
 * @param {Object} orderData - { items, customerLocation, idempotencyKey }
 */
export function checkout(orderData) {
  return request('/orders/checkout', {
    method: 'POST',
    headers: { 'Idempotency-Key': orderData.idempotencyKey },
    body: JSON.stringify(orderData),
  });
}

/**
 * Fetch a single order by ID.
 * @param {string} id - order UUID
 */
export function getOrder(id) {
  return request(`/orders/${id}`);
}

/**
 * Fetch the AI explanation for an order (asynchronous AI path).
 * May return a Gemini-generated or fallback_template explanation.
 * @param {string} id - order UUID
 */
export function getExplanation(id) {
  return request(`/orders/${id}/explain`);
}

/**
 * Fetch all warehouses with inventory summary.
 */
export function getWarehouses() {
  return request('/warehouses');
}

/**
 * Fetch aggregated map data for the Control Tower.
 */
export function getMapData() {
  return request('/dashboard/map-data');
}

/**
 * Trigger a server-side flash-sale stress test.
 * @param {Object} params - { sku, qty, concurrency }
 */
export function triggerFlashTest(params) {
  return request('/orders/flash-test', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
