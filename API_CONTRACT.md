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

## 6. Future Endpoints (Week 3 Stubs)

The following endpoints exist as stubs returning `501 NOT_IMPLEMENTED` and are explicitly excluded from Week 1–2 completion:

- `POST /api/v1/orders/checkout` (Will handle synchronous checkout)
- `POST /api/v1/orders/flash-test` (Will trigger server-side concurrency tests)
