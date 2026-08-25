# API Contract v2 — Supply Chain Routing Engine

**Status:** FINAL
**Version:** 2.0.0
**Last Updated:** Week 4 — API Hardening

This document is the **definitive source of truth** for all `/api/v1` endpoints. All backend implementations and frontend integrations MUST adhere to this contract.

---

## Global Conventions

- **Base URL:** `/api/v1`
- **Content-Type:** `application/json` (for all POST requests)
- **Request ID:** Every response includes an `X-Request-Id` header for log correlation. Clients may optionally send their own `X-Request-Id` header; if provided, the server echoes it back.
- **Error Format:** All errors follow a standard envelope:
  ```json
  {
    "error": {
      "code": "ERROR_CODE",
      "message": "Human readable error message"
    }
  }
  ```
- **Validation Errors:** Zod-validated endpoints return 400 with additional `details`:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "customerLat: Latitude must be between -90 and 90; items: items must be a non-empty array",
      "details": [
        { "field": "customerLat", "message": "Latitude must be between -90 and 90" },
        { "field": "items", "message": "items must be a non-empty array" }
      ]
    }
  }
  ```

---

## 1. System Health

### GET `/api/v1/health`

Checks connectivity to backend databases (PostgreSQL and Redis).

**Headers:** None required.

**Response (200 OK)**
```json
{
  "status": "ok",
  "db": true,
  "redis": true
}
```

| Field | Type | Values |
|-------|------|--------|
| `status` | string | `"ok"` (all healthy) or `"degraded"` (one or more down) |
| `db` | boolean | PostgreSQL connectivity |
| `redis` | boolean | Redis connectivity |

---

## 2. Warehouses

### GET `/api/v1/warehouses`

Returns all warehouses with per-SKU inventory breakdown.

**Headers:** None required.

**Response (200 OK)**
```json
{
  "warehouses": [
    {
      "id": "uuid",
      "name": "Delhi Hub",
      "lat": 28.6139,
      "lng": 77.209,
      "active": true,
      "inventory": [
        {
          "sku": "SKU-001",
          "name": "Widget A",
          "availableQty": 100,
          "reservedQty": 5
        }
      ]
    }
  ]
}
```

---

## 3. Orders

### GET `/api/v1/orders/:id`

Returns a specific order with its items and shipments.

**Path Parameters:**
| Param | Type | Validation |
|-------|------|------------|
| `id` | UUID | Zod-validated, 400 if invalid |

**Response (200 OK)**
```json
{
  "order": {
    "id": "uuid",
    "customerLat": 28.6139,
    "customerLng": 77.209,
    "status": "ROUTED",
    "idempotencyKey": "idem-123",
    "createdAt": "2026-08-18T00:00:00Z"
  },
  "items": [
    { "id": "uuid", "sku": "SKU-001", "skuName": "Widget A", "qty": 2 }
  ],
  "shipments": [
    {
      "id": "uuid",
      "warehouseId": "uuid",
      "warehouseName": "Delhi Hub",
      "boxSize": "MEDIUM",
      "totalCost": 10.60,
      "distanceKm": 15.20,
      "createdAt": "2026-08-18T00:00:01Z"
    }
  ]
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid UUID format |
| 404 | `ORDER_NOT_FOUND` | Order does not exist |

---

## 4. Checkout (Synchronous — No AI)

### POST `/api/v1/orders/checkout`

Deterministic routing + ACID checkout. **Never calls Gemini.** The frontend separately calls `/explain` after receiving the order.

**Rate Limiting:**
| Config | Value |
|--------|-------|
| Window | 60 seconds |
| Max requests | 30 per IP per window |
| Headers | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After` |

When rate limit is exceeded:
```json
// 429 Too Many Requests
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many checkout requests. Limit: 30 per 60s window. Please retry after the Retry-After period."
  }
}
```

**Required Headers:**
| Header | Type | Required |
|--------|------|----------|
| `Idempotency-Key` | string | Yes — 400 if missing |
| `Content-Type` | `application/json` | Yes |

**Request Body (Zod-validated):**
```json
{
  "customerLat": 19.076,
  "customerLng": 72.877,
  "items": [
    { "sku": "SKU-001", "qty": 2 }
  ]
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `customerLat` | number | Finite, -90 to 90 |
| `customerLng` | number | Finite, -180 to 180 |
| `items` | array | Non-empty |
| `items[].sku` | string | Non-empty |
| `items[].qty` | integer | ≥ 1 |

**Response (201 Created)**
```json
{
  "order": {
    "id": "uuid",
    "customer_lat": "19.076",
    "customer_lng": "72.877",
    "status": "ROUTED",
    "idempotency_key": "idem-123",
    "created_at": "2026-08-20T00:00:00Z"
  },
  "items": [
    { "id": "uuid", "order_id": "uuid", "sku": "SKU-001", "qty": 2 }
  ],
  "shipments": [
    {
      "id": "uuid",
      "order_id": "uuid",
      "warehouse_id": "uuid",
      "box_size": "MEDIUM",
      "total_cost": "10.60",
      "distance_km": "15.20",
      "created_at": "2026-08-20T00:00:01Z"
    }
  ],
  "costBreakdown": {
    "distanceCost": 7.6,
    "packagingCost": 3,
    "depletionPenalty": 0,
    "totalCost": 10.6
  },
  "alternatives": [
    {
      "warehouseId": "uuid",
      "name": "Mumbai Hub",
      "distanceKm": 120,
      "penalty": 10,
      "totalCost": 73,
      "rejectionReason": null
    }
  ],
  "packing": {
    "status": "FIT",
    "boxSize": "MEDIUM",
    "items": ["..."],
    "totalVolumeCm3": 2000,
    "totalWeightKg": 1.0
  }
}
```

**Response (200 OK) — Idempotency Replay**
```json
{
  "order": { "..." },
  "items": ["..."],
  "shipments": ["..."],
  "replay": true
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `MISSING_IDEMPOTENCY_KEY` | No `Idempotency-Key` header |
| 400 | `VALIDATION_ERROR` | Zod schema validation failure |
| 400 | `UNKNOWN_SKU` | SKU does not exist in the database |
| 409 | `INSUFFICIENT_STOCK` | Warehouse lacks inventory |
| 409 | `NO_ELIGIBLE_WAREHOUSE` | No warehouse can fulfill the order |
| 409 | `NO_WAREHOUSES` | No active warehouses available |
| 429 | `LOCK_UNAVAILABLE` | SKU is locked by another checkout |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests in window |
| 500 | `TRANSACTION_FAILED` | Database transaction error |
| 500 | `LOCK_SERVICE_ERROR` | Redis unavailable |

---

## 5. AI Explanation (Asynchronous)

### GET `/api/v1/orders/:id/explain`

Returns AI-generated or deterministic explanation(s) of routing decisions. Supports both single and multi-shipment orders.

**Path Parameters:**
| Param | Type | Validation |
|-------|------|------------|
| `id` | UUID | Zod-validated, 400 if invalid |

**Single Shipment Response (200 OK):**
```json
{
  "explanation": "Plain-language text explaining the routing decision...",
  "modelUsed": "gemini-2.0-flash",
  "source": "gemini",
  "latencyMs": 450,
  "generatedAt": "2026-08-18T00:00:00Z",
  "cached": true
}
```

**Multi-Shipment Response (200 OK):**
```json
{
  "explanations": [
    {
      "shipmentIndex": 0,
      "shipmentId": "uuid",
      "warehouseName": "Delhi Hub",
      "explanation": "Explanation for shipment group 0...",
      "source": "gemini"
    },
    {
      "shipmentIndex": 1,
      "shipmentId": "uuid",
      "warehouseName": "Mumbai Hub",
      "explanation": "Explanation for shipment group 1...",
      "source": "fallback_template"
    }
  ],
  "multiShipment": true,
  "modelUsed": "gemini-2.0-flash",
  "source": "gemini",
  "latencyMs": 1200,
  "generatedAt": "2026-08-18T00:00:00Z",
  "cached": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | `"gemini"` if all groups used AI, `"fallback_template"` if any fell back |
| `modelUsed` | string | Gemini model name or `"n/a"` for fallback |
| `cached` | boolean | `true` if returned from `ai_explanations` cache |
| `multiShipment` | boolean | Present and `true` for split-shipment orders |

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid UUID format |
| 404 | `ORDER_NOT_FOUND` | Order does not exist |
| 404 | `NO_SHIPMENTS` | Order has no shipments yet |

**AI Resilience:**
- Gemini calls have a 3-second hard timeout
- Up to 2 retries with exponential backoff (500ms, 1000ms)
- Circuit breaker trips after 5 consecutive failures → fallback for 60 seconds
- Fallback always returns 200 with `source: "fallback_template"`

---

## 6. Webhooks

### POST `/api/v1/webhooks/logistics`

Receives simulated logistics status updates. Must follow sequence: `PICKED_UP → IN_TRANSIT → DELIVERED`.

**Request Body (Zod-validated):**
```json
{
  "shipment_id": "uuid",
  "status": "PICKED_UP"
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `shipment_id` | UUID string | Valid UUID |
| `status` | enum | `PICKED_UP`, `IN_TRANSIT`, `DELIVERED` |

**Response (200 OK)**
```json
{
  "event": {
    "id": "uuid",
    "shipmentId": "uuid",
    "status": "PICKED_UP",
    "receivedAt": "2026-08-18T00:00:00Z"
  },
  "message": "Status transition to \"PICKED_UP\" accepted."
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Zod validation failure |
| 404 | `SHIPMENT_NOT_FOUND` | Shipment does not exist |
| 409 | `INVALID_TRANSITION` | Illegal status progression |

---

## 7. Dashboard

### GET `/api/v1/dashboard/map-data`

Returns aggregated warehouse and recent order route data for the Control Tower map.

**Query Parameters (Zod-validated):**
| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| `limit` | integer | 50 | 1–200 |

**Response (200 OK)**
```json
{
  "warehouses": [
    {
      "id": "uuid",
      "name": "Delhi Hub",
      "lat": 28.6139,
      "lng": 77.209,
      "active": true,
      "totalStock": 150,
      "lowStockSkus": 0,
      "healthStatus": "healthy"
    }
  ],
  "routes": [
    {
      "orderId": "uuid",
      "status": "ROUTED",
      "createdAt": "2026-08-18T00:00:00Z",
      "customer": { "lat": 28.5, "lng": 77.1 },
      "shipments": [
        {
          "shipmentId": "uuid",
          "warehouseId": "uuid",
          "warehouseName": "Delhi Hub",
          "warehouseLat": 28.6139,
          "warehouseLng": 77.209,
          "distanceKm": 15.20,
          "boxSize": "MEDIUM",
          "totalCost": 10.60
        }
      ]
    }
  ]
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Invalid `limit` query param |

---

## 8. Flash-Sale Stress Test

### POST `/api/v1/orders/flash-test`

Server-side flash-sale simulation. Fires N concurrent checkout attempts through the REAL checkout path and returns aggregated metrics.

**Request Body (Zod-validated):**
```json
{
  "sku": "SKU-001",
  "qty": 1,
  "concurrency": 10
}
```

| Field | Type | Constraints |
|-------|------|-------------|
| `sku` | string | Non-empty, must exist in DB |
| `qty` | integer | ≥ 1 |
| `concurrency` | integer | 1–50 |

**Response (200 OK)**
```json
{
  "successCount": 5,
  "rateLimited429Count": 3,
  "conflict409Count": 2,
  "avgLatencyMs": 45.67,
  "p95LatencyMs": 82.31
}
```

**Error Responses:**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Zod validation failure |
| 400 | `UNKNOWN_SKU` | SKU does not exist |

---

## Response Headers

All responses include:
| Header | Description |
|--------|-------------|
| `X-Request-Id` | Unique request ID for log correlation |

Rate-limited endpoints (`POST /checkout`) additionally include:
| Header | Description |
|--------|-------------|
| `RateLimit-Limit` | Max requests per window |
| `RateLimit-Remaining` | Requests remaining in current window |
| `RateLimit-Reset` | Seconds until window resets |
| `Retry-After` | Seconds to wait (only on 429) |
