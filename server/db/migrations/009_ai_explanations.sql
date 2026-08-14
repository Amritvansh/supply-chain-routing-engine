-- Migration 009: ai_explanations
--
-- ARCHITECTURAL RULE — READ CAREFULLY:
--
-- This is a LEAF TABLE by design. It references orders(id) but NO
-- transactional table may ever reference ai_explanations back.
-- Do NOT add a foreign key from orders, shipments, or any other
-- table pointing INTO this table.
--
-- The deterministic checkout transaction (checkoutTransaction.js)
-- must NEVER read from, write to, or depend on this table.
-- If Gemini is down, checkout must still succeed.
--
-- This table exists solely for the async AI explainability layer.
-- It can be truncated or rebuilt at any time without affecting
-- order or inventory integrity.

CREATE TABLE IF NOT EXISTS ai_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) UNIQUE,
  explanation_text TEXT NOT NULL,
  model_used TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'gemini',
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
