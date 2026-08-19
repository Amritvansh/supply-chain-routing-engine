# API Audit — Supply Chain Routing Engine

**Date:** 2026-08-19
**Auditor:** Member 2 — API & Logistics Orchestration Lead
**Scope:** All backend endpoints after Week 1–2 development

---

## Summary

| # | Method | Endpoint | Status |
|---|--------|----------|--------|
| 1 | GET | `/api/v1/health` | **COMPLETE** |
| 2 | GET | `/api/v1/warehouses` | **COMPLETE** |
| 3 | GET | `/api/v1/orders/:id` | **COMPLETE** |
| 4 | GET | `/api/v1/orders/:id/explain` | **COMPLETE** |
| 5 | POST | `/api/v1/webhooks/logistics` | **COMPLETE** |
| 6 | GET | `/api/v1/dashboard/map-data` | **STUB** |
| 7 | POST | `/api/v1/orders/checkout` | **STUB** (Week 3) |
| 8 | POST | `/api/v1/orders/flash-test` | **STUB** (Week 3) |

---

## Detailed Endpoint Audit

### 1. GET /api/v1/health

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **File** | `server/routes/health.js` |
| **Request Headers** | None required |
| **Query Parameters** | None |
| **Request Body** | N/A |
| **Response Body** | `{ status: "ok" \| "degraded", db: boolean, redis: boolean }` |
| **Status Codes** | 200 (always) |
| **Error Format** | 500 via centralized error handler |
| **Database Tables** | None (uses `SELECT 1` probe) |
| **Services** | PostgreSQL pool, Redis (ioredis) |
| **Frontend Consumer** | None currently |
| **External Dependencies** | PostgreSQL, Redis |
| **Tests** | No dedicated test (tested implicitly via server startup) |
| **Problems** | Minor: creates its own PG pool instead of using shared `db/pool.js`. Not a bug — health check pool has max:2 connections. No test coverage. |

### 2. GET /api/v1/warehouses

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **File** | `server/routes/warehouses.js` |
| **Request Headers** | None required |
| **Query Parameters** | None |
| **Request Body** | N/A |
| **Response Body** | `{ warehouses: [{ id, name, lat, lng, active, inventory: [{ sku, name, availableQty, reservedQty }] }] }` |
| **Status Codes** | 200 (success, including empty), 500 (DB error) |
| **Error Format** | `{ error: { code, message } }` via centralized handler |
| **Database Tables** | `warehouses`, `inventories`, `skus` |
| **Services** | `db/pool.js` |
| **Frontend Consumer** | `ControlTowerDashboard.jsx` via `apiClient.getWarehouses()` |
| **External Dependencies** | PostgreSQL |
| **Tests** | 3 tests in `week2Integration.test.js` (success, empty, DB error) |
| **Problems** | None |

### 3. GET /api/v1/orders/:id

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **File** | `server/routes/orders.js` |
| **Request Headers** | None required |
| **Query Parameters** | None |
| **Request Body** | N/A |
| **Response Body** | `{ order: { id, customerLat, customerLng, status, idempotencyKey, createdAt }, items: [{ id, sku, skuName, qty }], shipments: [{ id, warehouseId, warehouseName, boxSize, totalCost, distanceKm, createdAt }] }` |
| **Status Codes** | 200 (success), 400 (invalid UUID), 404 (not found), 500 (DB error) |
| **Error Format** | `{ error: { code, message } }` |
| **Database Tables** | `orders`, `order_items`, `skus`, `shipments`, `warehouses` |
| **Services** | `db/pool.js` |
| **Frontend Consumer** | `apiClient.getOrder(id)` |
| **External Dependencies** | PostgreSQL |
| **Tests** | 3 tests in `week2Integration.test.js` (success, 404, 400) |
| **Problems** | None |

### 4. GET /api/v1/orders/:id/explain

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **File** | `server/routes/orders.js` |
| **Request Headers** | None required |
| **Query Parameters** | None |
| **Request Body** | N/A |
| **Response Body** | `{ explanation, modelUsed, source, latencyMs, generatedAt, cached }` |
| **Status Codes** | 200 (success), 400 (invalid UUID), 404 (order not found / no shipments), 500 (DB error) |
| **Error Format** | `{ error: { code, message } }` |
| **Database Tables** | `orders`, `shipments`, `warehouses`, `ai_explanations` |
| **Services** | `db/pool.js`, `db/aiExplanations.js`, `services/geminiClient.js` |
| **Frontend Consumer** | `AIExplanationWidget.jsx` via `apiClient.getExplanation(id)` |
| **External Dependencies** | Google Gemini API (optional — falls back to deterministic template) |
| **Tests** | 5 tests in `week2Integration.test.js` (cache hit, cache miss, no shipments, bad UUID, order not found) |
| **Problems** | None. Gemini failure is handled gracefully. Source field correctly distinguishes `gemini` vs `fallback_template`. |

### 5. POST /api/v1/webhooks/logistics

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **File** | `server/routes/webhooks.js` |
| **Request Headers** | `Content-Type: application/json` |
| **Query Parameters** | None |
| **Request Body** | `{ shipment_id: UUID, status: "PICKED_UP" \| "IN_TRANSIT" \| "DELIVERED" }` |
| **Response Body** | `{ event: { id, shipmentId, status, receivedAt }, message }` |
| **Status Codes** | 200 (accepted), 400 (missing fields / invalid UUID / invalid status), 404 (shipment not found), 409 (invalid transition) |
| **Error Format** | `{ error: { code, message, currentStatus?, attemptedStatus? } }` |
| **Database Tables** | `shipments`, `webhook_events` |
| **Services** | `db/pool.js` |
| **Frontend Consumer** | None currently |
| **External Dependencies** | PostgreSQL |
| **Tests** | 9 tests in `week2Integration.test.js` (3 valid transitions, 4 invalid transitions, missing fields, bad UUID) |
| **Problems** | None |

### 6. GET /api/v1/dashboard/map-data

| Field | Value |
|-------|-------|
| **Status** | **STUB (501)** |
| **File** | `server/routes/dashboard.js` |
| **Response Body** | `{ error: { code: "NOT_IMPLEMENTED", message: "..." } }` |
| **Frontend Consumer** | `apiClient.getMapData()` exists but is not called by `ControlTowerDashboard.jsx` (which uses `getWarehouses()` instead) |
| **Tests** | None |
| **Required Fix** | Implement endpoint to return warehouse locations + recent order routes. Uses existing tables only. |
| **Week** | Week 1–2 (should be implemented now) |

### 7. POST /api/v1/orders/checkout

| Field | Value |
|-------|-------|
| **Status** | **STUB (501)** |
| **File** | `server/routes/orders.js` |
| **Required Fix** | None — Week 3 endpoint |
| **Week** | **Week 3** — Do not implement |

### 8. POST /api/v1/orders/flash-test

| Field | Value |
|-------|-------|
| **Status** | **STUB (501)** |
| **File** | `server/routes/orders.js` |
| **Required Fix** | None — Week 3 endpoint |
| **Week** | **Week 3** — Do not implement |

---

## Fix Table

| Endpoint | Status | Problem | Required Fix | Week |
|----------|--------|---------|-------------|------|
| `/api/v1/dashboard/map-data` | STUB | Returns 501 | Implement with warehouse + route data | Week 1–2 |
| `/api/v1/orders/checkout` | STUB | Week 3 endpoint | Do not implement now | Week 3 |
| `/api/v1/orders/flash-test` | STUB | Week 3 endpoint | Do not implement now | Week 3 |

---

## Frontend API Usage Audit

### apiClient.js Methods

| Method | Endpoint | Used By | Status |
|--------|----------|---------|--------|
| `checkout(orderData)` | POST `/orders/checkout` | OrderSimulator (Week 3) | Correct contract, unused |
| `getOrder(id)` | GET `/orders/:id` | Not yet wired | Correct contract |
| `getExplanation(id)` | GET `/orders/:id/explain` | `AIExplanationWidget.jsx` | ✅ Correct |
| `getWarehouses()` | GET `/warehouses` | `ControlTowerDashboard.jsx` | ✅ Correct |
| `getMapData()` | GET `/dashboard/map-data` | Not yet wired (endpoint is stub) | Correct contract |
| `triggerFlashTest(params)` | POST `/orders/flash-test` | OrderSimulator (Week 3) | Correct contract, unused |

### Missing Methods (Optional)

| Method | Endpoint | Notes |
|--------|----------|-------|
| `getHealth()` | GET `/health` | Not used by any component — add for completeness |
| `sendLogisticsWebhook(data)` | POST `/webhooks/logistics` | Not used by any component — add for completeness |

### Direct Fetch Calls Outside apiClient

None found. All frontend API calls go through `apiClient.js`. ✅

---

## Error Format Consistency

All endpoints use: `{ error: { code, message } }`
Centralized error handler in `middleware/errorHandler.js` enforces this.
Stack traces only in `NODE_ENV=development`.
No SQL, API keys, or secrets exposed in error responses. ✅

---

## Security Audit

- `.env` excluded via `.gitignore` ✅
- `.env.example` files contain placeholders only ✅
- API keys loaded via `config/env.js`, never sent to frontend ✅
- `helmet` middleware enabled ✅
- CORS enabled ✅
- No secrets in committed code ✅
