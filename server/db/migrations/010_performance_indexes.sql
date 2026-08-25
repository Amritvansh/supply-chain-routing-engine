-- Migration 010: Performance indexes for Week 3/4 query patterns
--
-- Each index below is justified by an actual query pattern identified
-- in the server/routes/ code. Indexes are created with IF NOT EXISTS
-- for idempotent re-execution.

-- INDEX 1: shipments.order_id
-- Query: SELECT * FROM shipments WHERE order_id = $1
--   Used by: GET /api/v1/orders/:id (orders.js:377)
--            GET /api/v1/orders/:id/explain (orders.js:452)
--            checkoutTransaction.js idempotency replay fetch
--            GET /api/v1/dashboard/map-data (JOIN shipments ON order_id)
-- Why: shipments.order_id has no index. Every order detail fetch and
--   dashboard join performs a sequential scan on shipments. This is the
--   most frequently queried FK join in the system.
-- Write overhead: Minimal — shipments are INSERT-only (one per checkout).
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);

-- INDEX 2: order_items.order_id
-- Query: SELECT * FROM order_items WHERE order_id = $1
--   Used by: GET /api/v1/orders/:id (orders.js:370)
--            checkoutTransaction.js idempotency replay fetch
-- Why: order_items.order_id has no index. Same pattern as shipments —
--   every order detail request joins or filters by order_id.
-- Write overhead: Minimal — order_items are INSERT-only.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- INDEX 3: orders.idempotency_key
-- Query: SELECT ... FROM orders WHERE idempotency_key = $1
--   Used by: checkoutTransaction.js idempotency check (first query in txn)
-- Why: The UNIQUE constraint on idempotency_key already creates an implicit
--   unique index in PostgreSQL, so this is a documentation-only entry.
--   NO additional index is created — it would be redundant.
-- (Retained as comment for audit completeness.)

-- INDEX 4: orders.created_at
-- Query: SELECT ... FROM orders ORDER BY created_at DESC LIMIT $1
--   Used by: GET /api/v1/dashboard/map-data (orders.js:86-106)
-- Why: Dashboard map-data sorts all orders by created_at DESC. Without
--   an index, PostgreSQL must sort the entire orders table.
-- Write overhead: Low — one INSERT per checkout, and the BTree update is O(log n).
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- INDEX 5: inventories composite (warehouse_id, sku)
-- Query: SELECT ... FROM inventories WHERE warehouse_id = $1 AND sku = $2 FOR UPDATE
--   Used by: checkoutTransaction.js atomic inventory deduction
-- Why: The UNIQUE(warehouse_id, sku) constraint already creates an implicit
--   unique index. NO additional index needed.
-- (Retained as comment for audit completeness.)
