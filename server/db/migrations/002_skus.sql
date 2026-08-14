-- Migration 002: skus
-- Product catalog, normalized out of inventories so that
-- dimensions and weight live in exactly one place.
-- The bin-packing algorithm reads from this table to determine box sizing.

CREATE TABLE IF NOT EXISTS skus (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  length_cm NUMERIC NOT NULL,
  width_cm NUMERIC NOT NULL,
  height_cm NUMERIC NOT NULL,
  weight_kg NUMERIC NOT NULL
);
