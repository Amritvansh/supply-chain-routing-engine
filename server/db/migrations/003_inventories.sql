-- Migration 003: inventories
-- One row per warehouse/SKU pair. Tracks both available and reserved quantities.
-- available_qty: units free to sell.
-- reserved_qty: units committed to an order but not yet shipped.
-- This separation prevents double-decrement bugs during concurrent checkouts.

CREATE TABLE IF NOT EXISTS inventories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id),
  sku TEXT REFERENCES skus(sku),
  available_qty INT NOT NULL CHECK (available_qty >= 0),
  reserved_qty INT NOT NULL DEFAULT 0,
  UNIQUE(warehouse_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_inventories_sku ON inventories(sku);
CREATE INDEX IF NOT EXISTS idx_inventories_warehouse ON inventories(warehouse_id);
