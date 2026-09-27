-- Migration 013: customer_orders
-- Extends the orders table with customer-identifying fields
-- so we can tie orders to authenticated users and store
-- shipping details for the customer tracking experience.
--
-- user_id is nullable with ON DELETE SET NULL so orphaned orders
-- survive if a user account is deleted.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pincode TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
