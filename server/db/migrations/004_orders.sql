-- Migration 004: orders
-- Each order captures the customer location and carries an idempotency_key
-- to guarantee safe retries during flash-sale concurrency scenarios.
-- Status lifecycle: PENDING -> ROUTED | SPLIT | FAILED | FULFILLED

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_lat DOUBLE PRECISION NOT NULL,
  customer_lng DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
