-- Migration 014: shipment_items
-- Links individual order items to specific shipments.
-- Required for multi-warehouse split shipments where different items
-- in the same order may be fulfilled from different warehouses.
--
-- For single-warehouse orders, all items link to the one shipment.
-- For split orders, each item links to the shipment from its assigned warehouse.

CREATE TABLE IF NOT EXISTS shipment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments(id),
  sku TEXT NOT NULL REFERENCES skus(sku),
  qty INT NOT NULL CHECK (qty > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_items_sku ON shipment_items(sku);

-- Add fulfillment_type to orders to distinguish SINGLE vs SPLIT shipments
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'SINGLE_SHIPMENT';
