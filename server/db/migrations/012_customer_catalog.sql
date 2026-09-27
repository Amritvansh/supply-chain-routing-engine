-- Migration 012: customer_catalog
-- Extends the skus table with customer-facing catalog fields:
--   price, category, image_url, description.
-- These columns power the customer e-commerce shopping experience.
-- The routing engine (bin-packing / cost function) does NOT read these —
-- they are purely for the storefront display layer.

ALTER TABLE skus ADD COLUMN IF NOT EXISTS price NUMERIC NOT NULL DEFAULT 999;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Electronics';
ALTER TABLE skus ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_skus_category ON skus(category);
