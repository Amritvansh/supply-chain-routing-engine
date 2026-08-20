# Frozen API Contract v1 (Week 1–2)

**Status:** FROZEN
**Version:** 1.0.0

This document defines the frozen API contract for the Distributed Supply Chain Routing & Inventory Balancing Engine at the end of Week 1–2. All backend implementations and frontend integrations MUST adhere to this contract.

---

## Global Conventions

- **Base URL:** `/api/v1`
- **Content-Type:** `application/json` (for all POST requests)
- **Error Format:** All errors follow a standard structure:
  ```json
  {
    "error": {
      "code": "ERROR_CODE",
      "message": "Human readable error message"
    }
  }
  ```

---

## 1. System Health

### GET `/api/v1/health`
Checks connectivity to backend databases (PostgreSQL and Redis).

**Response (200 OK)**
```json
{
  "status": "ok",      // or "degraded"
  "db": true,          // PostgreSQL status
  "redis": true        // Redis status
}
```

---

## 2. Warehouses

### GET `/api/v1/warehouses`
Fetches all active warehouses and their grouped inventory.

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

## 3. Orders & Routing

### GET `/api/v1/orders/:id`
Fetches a specific order with its items and shipments.

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
    {
      "id": "uuid",
      "sku": "SKU-001",
      "skuName": "Widget A",
      "qty": 2
    }
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

### GET `/api/v1/orders/:id/explain`
Fetches the asynchronous AI explanation for routing decisions.

**Response (200 OK)**
```json
{
  "explanation": "Markdown text explaining the routing decision...",
  "modelUsed": "gemini-2.0-flash", // or "n/a" for fallback
  "source": "gemini",                // or "fallback_template"
  "latencyMs": 450,
  "generatedAt": "2026-08-18T00:00:00Z",
  "cached": true
}
```

---

## 4. Webhooks

### POST `/api/v1/webhooks/logistics`
Receives simulated logistics status updates. Must follow sequence: `PICKED_UP → IN_TRANSIT → DELIVERED`.

**Request Body**
```json
{
  "shipment_id": "uuid",
  "status": "PICKED_UP"
}
```

**Response (200 OK)**
```json
{
  "event": {
    "id": "uuid",
    "shipmentId": "uuid",
    "status": "PICKED_UP",
    "receivedAt": "2026-08-18T00:00:00Z"
  },
  "message": "Webhook received successfully"
}
```

---

## 5. Dashboard

### GET `/api/v1/dashboard/map-data`
Returns aggregated data for the Control Tower Map.

**Query Parameters**
- `limit` (optional): Max number of recent order routes to return (default 50, max 200).

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
      "healthStatus": "healthy" // or "low_stock"
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

---

## 6. Checkout (Synchronous — No AI)

### POST `/api/v1/orders/checkout`
Deterministic routing + ACID checkout. **Never calls Gemini.** The frontend separately calls `/explain` after receiving the order.

**Required Headers**
- `Idempotency-Key`: Client-generated unique key (returns 400 if missing)

**Request Body**
```json
{
  "customerLat": 19.076,
  "customerLng": 72.877,
  "items": [
    { "sku": "SKU-001", "qty": 2 }
  ]
}
```

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
    "items": [...],
    "totalVolumeCm3": 2000,
    "totalWeightKg": 1.0
  }
}
```

**Response (200 OK) — Idempotency Replay**
```json
{
  "order": { ... },
  "items": [ ... ],
  "shipments": [ ... ],
  "replay": true
}
```

**Error Responses**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `MISSING_IDEMPOTENCY_KEY` | No `Idempotency-Key` header |
| 400 | `INVALID_REQUEST` | Missing or invalid body fields |
| 400 | `UNKNOWN_SKU` | SKU does not exist in the database |
| 409 | `INSUFFICIENT_STOCK` | Warehouse lacks inventory |
| 409 | `NO_ELIGIBLE_WAREHOUSE` | No warehouse can fulfill the order |
| 429 | `LOCK_UNAVAILABLE` | SKU is locked by another checkout |
| 500 | `TRANSACTION_FAILED` | Database transaction error |

---

## 7. Flash-Sale Stress Test

### POST `/api/v1/orders/flash-test`
Server-side flash-sale simulation. Fires N concurrent checkout attempts through the REAL checkout path and returns aggregated metrics.

**Request Body**
```json
{
  "sku": "SKU-001",
  "qty": 1,
  "concurrency": 10
}
```

**Constraints**
- `concurrency` is capped at **50** to prevent unbounded load.
- `qty` must be a positive integer.
- `sku` must exist in the database.

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

**Error Responses**
| Status | Code | Condition |
|--------|------|-----------|
| 400 | `INVALID_REQUEST` | Missing or invalid body fields |
| 400 | `CONCURRENCY_LIMIT` | `concurrency` exceeds 50 |
| 400 | `UNKNOWN_SKU` | SKU does not exist |
