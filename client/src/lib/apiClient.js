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

import storage from './storage';

const BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1`;

/**
 * Generic fetch wrapper with consistent error handling.
 * Automatically attaches JWT from storage if available.
 * @param {string} endpoint - path after /api/v1
 * @param {RequestInit} options - fetch options
 * @returns {Promise<any>} parsed JSON body
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;

  // Auto-attach JWT token if present
  const token = storage.getItem('auth_token');

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body?.error?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = body?.error?.code || 'UNKNOWN_ERROR';
    error.body = body;
    error.retryAfter = response.headers.get('Retry-After');
    throw error;
  }

  return response.json();
}

// ─── Authentication API Methods ────────────────────────────

/**
 * Register a new user account.
 * @param {{ name: string, email: string, password: string, role?: string }} data
 */
export function authRegister(data) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Login with email and password.
 * @param {{ email: string, password: string }} data
 */
export function authLogin(data) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Get the current authenticated user's profile.
 * Requires a valid JWT in localStorage.
 */
export function authGetMe() {
  return request('/auth/me');
}

// ─── Order & Checkout API Methods ──────────────────────────

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
export function getExplanation(id, refresh = false) {
  return request(`/orders/${id}/explain${refresh ? '?refresh=true' : ''}`);
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
 * Fetch real driving road geometry (OSRM array of [lng, lat] coordinates).
 * @param {number} originLat
 * @param {number} originLng
 * @param {number} destLat
 * @param {number} destLng
 * @returns {Promise<{ coordinates: Array<[number, number]>, distanceKm: number, durationMins: number, source: string }>}
 */
export function getRoadGeometry(originLat, originLng, destLat, destLng) {
  return request(`/orders/road-geometry?originLat=${originLat}&originLng=${originLng}&destLat=${destLat}&destLng=${destLng}`);
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

/**
 * Check backend health (PostgreSQL + Redis connectivity).
 */
export function getHealth() {
  return request('/health');
}

/**
 * Send a simulated logistics webhook status update.
 * @param {{ shipment_id: string, status: string }} data
 */
export function sendLogisticsWebhook(data) {
  return request('/webhooks/logistics', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Fetch aggregated KPI stats for the Control Tower dashboard.
 * Requires Host JWT.
 */
export function getDashboardStats() {
  return request('/dashboard/stats');
}

/**
 * Auto-progress a shipment through the full lifecycle (PICKED_UP → IN_TRANSIT → DELIVERED).
 * Requires Host JWT.
 * @param {string} shipmentId - shipment UUID
 */
export function simulateShipment(shipmentId) {
  return request(`/webhooks/simulate/${shipmentId}`, {
    method: 'POST',
  });
}

/**
 * Fetch the full webhook event timeline for a shipment.
 * @param {string} shipmentId - shipment UUID
 */
export function getShipmentEvents(shipmentId) {
  return request(`/webhooks/events/${shipmentId}`);
}

// ─── Product Catalog API Methods ───────────────────────────

/**
 * List products with optional search and category filter.
 * @param {{ q?: string, category?: string }} params
 */
export function getProducts(params = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  const query = qs.toString();
  return request(`/products${query ? `?${query}` : ''}`);
}

/**
 * Fetch a single product by SKU.
 * @param {string} sku
 */
export function getProduct(sku) {
  return request(`/products/${sku}`);
}

/**
 * Fetch all product categories.
 */
export function getCategories() {
  return request('/products/categories');
}

// ─── Host Product Management API Methods ───────────────────

/**
 * Create a new product in the catalog.
 * Requires Host JWT.
 * @param {Object} data - { sku, name, price, weight_kg, description?, category?, image_url?, length_cm?, width_cm?, height_cm? }
 */
export function createProduct(data) {
  return request('/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing product by SKU.
 * Requires Host JWT. Only provided fields are updated.
 * @param {string} sku
 * @param {Object} data - partial product fields
 */
export function updateProduct(sku, data) {
  return request(`/products/${sku}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a product by SKU.
 * Requires Host JWT.
 * @param {string} sku
 */
export function deleteProduct(sku) {
  return request(`/products/${sku}`, {
    method: 'DELETE',
  });
}

// ─── Host Warehouse Management API Methods ─────────────────

/**
 * Create a new warehouse.
 * Requires Host JWT.
 * @param {Object} data - { name, lat, lng, id?, active? }
 */
export function createWarehouse(data) {
  return request('/warehouses', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update an existing warehouse by ID.
 * Requires Host JWT. Only provided fields are updated.
 * @param {string} id - warehouse UUID
 * @param {Object} data - partial warehouse fields
 */
export function updateWarehouse(id, data) {
  return request(`/warehouses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Deactivate a warehouse by ID (soft delete).
 * Requires Host JWT.
 * @param {string} id - warehouse UUID
 */
export function deleteWarehouse(id) {
  return request(`/warehouses/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Get a delivery quote without placing an order.
 * @param {Object} data - { customerLat, customerLng, items }
 */
export function getQuote(data) {
  return request('/orders/quote', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Fetch the authenticated customer's order history.
 */
export function getMyOrders() {
  return request('/orders/my-orders');
}

/**
 * Fetch customer-facing order tracking data.
 * @param {string} id - order UUID
 */
export function trackOrder(id) {
  return request(`/orders/track/${id}`);
}

/**
 * Cancel an active customer order.
 * @param {string} id - order UUID
 * @param {string} reason - cancellation reason
 */
export function cancelOrder(id, reason) {
  return request(`/orders/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Request return and refund for a delivered order.
 * @param {string} id - order UUID
 * @param {string} reason - return reason
 * @param {string} refundMethod - 'Original Payment Source' | 'Store Credit'
 */
export function returnOrder(id, reason, refundMethod) {
  return request(`/orders/${id}/return`, {
    method: 'POST',
    body: JSON.stringify({ reason, refundMethod }),
  });
}

// ─── Host Inventory Management API Methods ─────────────────

/**
 * Fetch all inventory rows with product and warehouse names.
 * Requires Host JWT.
 */
export function getInventory() {
  return request('/inventory');
}

/**
 * Upsert stock for a given SKU at a given warehouse.
 * Requires Host JWT.
 * @param {Object} data - { sku, warehouse_id, quantity }
 */
export function adjustInventory(data) {
  return request('/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Host Order Management API Methods ──────────────────────

/**
 * Fetch all orders globally (Host-only).
 * Returns { orders: [...], count: number }
 */
export function getAllOrders() {
  return request('/orders/all');
}

/**
 * Fetch full order detail with routing analysis (Host-only).
 * Returns { order, items, shipments, routingAnalysis, aiExplanation }
 * @param {string} id - order UUID
 */
export function getHostOrderDetail(id) {
  return request(`/orders/host/${id}`);
}

/**
 * Simulate a warehouse outage (What-If Analysis).
 * Returns re-routing analysis for affected orders.
 * Requires Host JWT. ZERO database writes — pure simulation.
 * @param {string} warehouseId - warehouse UUID to simulate as offline
 */
export function simulateOutage(warehouseId) {
  return request('/dashboard/simulate-outage', {
    method: 'POST',
    body: JSON.stringify({ warehouseId }),
  });
}

/**
 * Translate an array of UI strings to a target Indian language via Gemini.
 * @param {string[]} texts
 * @param {string} targetLang - 'hi' | 'ta' | 'te' | 'mr' | 'bn' | 'gu' | 'kn' | 'en'
 */
export function translateTexts(texts, targetLang) {
  return request('/translate', {
    method: 'POST',
    body: JSON.stringify({ texts, targetLang }),
  });
}

