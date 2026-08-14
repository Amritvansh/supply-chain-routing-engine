-- Migration 005: order_items
-- Line items within an order. Each row links an order to a SKU with a quantity.
-- qty CHECK ensures no zero-quantity line items can be inserted.

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  sku TEXT REFERENCES skus(sku),
  qty INT NOT NULL CHECK (qty > 0)
);
