# Performance Notes — Week 4

## Index Analysis

Each proposed index is justified by a real query pattern identified in the server route handlers and transaction code. Benchmark data for before/after timing is documented where available.

---

### INDEX 1: `idx_shipments_order_id` on `shipments(order_id)`

**Query:**
```sql
SELECT * FROM shipments WHERE order_id = $1
-- Used by: GET /orders/:id, GET /orders/:id/explain, dashboard map-data, idempotency replay
```

**Why index helps:** `shipments.order_id` is a FK column with no existing index. Every order detail page, AI explanation lookup, and dashboard join requires a full table scan on shipments. This is the most frequently joined FK in the system.

**Expected benefit:** Index converts O(n) sequential scan to O(log n) btree lookup. Critical at scale since shipments grow linearly with orders.

**Write overhead:** Negligible — shipments is INSERT-only (one per checkout), and btree insert is O(log n).

**Benchmark:** Benchmark unavailable — index justified by query pattern, but before/after performance not measured.

---

### INDEX 2: `idx_order_items_order_id` on `order_items(order_id)`

**Query:**
```sql
SELECT * FROM order_items WHERE order_id = $1
-- Used by: GET /orders/:id, idempotency replay in checkoutTransaction.js
```

**Why index helps:** Same pattern as shipments — every order detail request filters by order_id. Without an index, PostgreSQL must scan the entire order_items table.

**Expected benefit:** O(n) → O(log n) per lookup.

**Write overhead:** Negligible — INSERT-only pattern.

**Benchmark:** Benchmark unavailable — index justified by query pattern, but before/after performance not measured.

---

### INDEX 3: `idx_orders_created_at` on `orders(created_at DESC)`

**Query:**
```sql
SELECT ... FROM orders ORDER BY created_at DESC LIMIT $1
-- Used by: GET /api/v1/dashboard/map-data
```

**Why index helps:** The dashboard map-data endpoint sorts all orders by `created_at DESC` with a LIMIT. Without an index, PostgreSQL must sort the entire table before returning the top N. A DESC btree index allows PostgreSQL to use an Index Scan (Backward) to immediately return the most recent rows.

**Expected benefit:** Eliminates the sort step entirely at query time. Matters as orders table grows (each checkout adds a row).

**Write overhead:** Low — one INSERT per checkout.

**Benchmark:** Benchmark unavailable — index justified by query pattern, but before/after performance not measured.

---

### Already-Indexed Patterns (No Action Required)

| Pattern | Existing Index | Source |
|---|---|---|
| `WHERE idempotency_key = $1` | Implicit unique index from `UNIQUE(idempotency_key)` on orders | checkoutTransaction.js |
| `WHERE warehouse_id = $1 AND sku = $2` | Implicit unique index from `UNIQUE(warehouse_id, sku)` on inventories | checkoutTransaction.js |
| `WHERE sku = $1` | `idx_inventories_sku` | Routing warehouse lookup |
| `WHERE warehouse_id = $1` | `idx_inventories_warehouse` | Per-warehouse inventory |
| `WHERE status = $1` | `idx_orders_status` | Dashboard filtering |

---

## Algorithm Performance

Measured via the splitShipment.test.js performance suite (100 runs each):

### Split Routing (3 groups, 5 warehouses)

| Metric | Value |
|---|---|
| Average | 0.059 ms |
| P95 | 0.057 ms |
| Min | 0.023 ms |
| Max | 2.528 ms |

### Bin Packing (18 units, 3 SKUs)

| Metric | Value |
|---|---|
| Average | 0.017 ms |
| P95 | 0.026 ms |

### Checkout Target

The `<50ms` target for `POST /checkout` refers to the **end-to-end HTTP response time**, which includes:

1. Request validation (~0 ms)
2. Database warehouse + inventory fetch (network I/O)
3. Distance calculation (Haversine: ~0 ms, Maps API: variable)
4. **Routing algorithm** (measured: 0.06 ms avg)
5. Redis lock acquisition (network I/O)
6. **ACID PostgreSQL transaction** (measured Week 3: 1.27 ms avg)
7. Lock release (network I/O)

The deterministic algorithm components (routing + bin packing + cost function) contribute **<1 ms total**. The `<50ms` target depends primarily on Redis and PostgreSQL network latency, which are infrastructure-level concerns outside the algorithm scope.
