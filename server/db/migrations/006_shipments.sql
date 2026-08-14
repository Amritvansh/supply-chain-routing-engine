-- Migration 006: shipments
-- Result of the routing engine. One order can produce multiple shipments
-- when the bin-packing algorithm triggers a SPLIT_SHIPMENT.
-- box_size: SMALL | MEDIUM | LARGE (maps to packaging_base_cost tiers).
-- total_cost: the full routing cost score for this shipment leg.
-- distance_km: straight-line or Maps API distance to the customer.

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  warehouse_id UUID REFERENCES warehouses(id),
  box_size TEXT NOT NULL,
  total_cost NUMERIC NOT NULL,
  distance_km NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
