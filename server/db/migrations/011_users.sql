-- Migration 011: users
-- Authentication & authorization table for the Supply Chain Routing Engine.
-- Supports two roles: 'customer' (can place orders) and 'host' (Control Tower access).
-- Email is unique; password is stored as a bcrypt hash.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'host')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fast lookups by email during login
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Fast filtering by role (e.g., admin dashboards)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
