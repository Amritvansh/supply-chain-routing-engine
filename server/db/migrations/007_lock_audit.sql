-- Migration 007: lock_audit
-- Observability table for Redis distributed lock contention.
-- Every lock attempt (success or failure) is recorded here so that
-- Member 2's stress-test scripts can graph contention rates and wait times.
-- This table is append-only and is never read on the checkout critical path.

CREATE TABLE IF NOT EXISTS lock_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  acquired BOOLEAN NOT NULL,
  waited_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
