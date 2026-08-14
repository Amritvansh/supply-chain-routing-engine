-- Migration 001: warehouses
-- Warehouse locations for the supply chain routing engine.
-- Each warehouse has a geographic position used by the cost function
-- to compute distance-based routing scores.

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);
