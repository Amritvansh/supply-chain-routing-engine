-- Migration 008: webhook_events
-- Logs inbound simulated webhook status transitions for shipments.
-- Valid lifecycle: PICKED_UP -> IN_TRANSIT -> DELIVERED
-- Transition validation logic belongs to Member 2's webhook controller,
-- not enforced at the schema level.

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id),
  status TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT now()
);
