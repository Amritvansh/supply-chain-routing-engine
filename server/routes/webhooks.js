/**
 * Webhook Routes — Logistics Status Simulator
 *
 * POST /api/v1/webhooks/logistics          — Simulated inbound shipment status webhook
 * POST /api/v1/webhooks/simulate/:shipmentId — Auto-progress a shipment through all lifecycle states
 * GET  /api/v1/webhooks/events/:shipmentId — Retrieve full event history for a shipment
 *
 * Accepts { shipment_id, status } and validates legal status transitions:
 *   null → PICKED_UP → IN_TRANSIT → DELIVERED
 *
 * Rejects:
 *   - Skipping states (e.g., null → IN_TRANSIT)
 *   - Reversing states (e.g., DELIVERED → IN_TRANSIT)
 *   - Invalid status values
 *
 * Valid events are logged to the webhook_events table.
 *
 * Phase 5 additions:
 *   - Order-level FULFILLED propagation: when a shipment reaches DELIVERED,
 *     checks if ALL sibling shipments are also DELIVERED. If so, updates
 *     the parent order status to FULFILLED.
 *   - POST /simulate/:shipmentId: one-click auto-progression through
 *     PICKED_UP → IN_TRANSIT → DELIVERED (skips already-completed steps).
 *   - GET /events/:shipmentId: returns the full webhook event timeline.
 *
 * This is an internal simulator — no external logistics provider involved.
 */
'use strict';

const { Router } = require('express');
const pool = require('../db/pool');
const logger = require('../services/logger');
const { validateWebhookBody } = require('../middleware/validators');

const router = Router();

/**
 * Legal status progression.
 * Maps each status to the status that must immediately precede it.
 * null means "no prior status exists" (first event for a shipment).
 */
const VALID_TRANSITIONS = {
  PICKED_UP: null,
  IN_TRANSIT: 'PICKED_UP',
  DELIVERED: 'IN_TRANSIT',
};

const VALID_STATUSES = Object.keys(VALID_TRANSITIONS);

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Get the current (latest) webhook status for a shipment.
 * Returns null if no events exist yet.
 */
async function getCurrentStatus(shipmentId) {
  const result = await pool.query(
    `SELECT status FROM webhook_events
     WHERE shipment_id = $1
     ORDER BY received_at DESC
     LIMIT 1`,
    [shipmentId]
  );
  return result.rows.length > 0 ? result.rows[0].status : null;
}

/**
 * After a shipment reaches DELIVERED, check if ALL sibling shipments
 * for the same order are also DELIVERED. If so, update the order
 * status to FULFILLED.
 *
 * Uses a single atomic query: counts sibling shipments that do NOT
 * have a DELIVERED webhook event yet. If count === 0, all are done.
 */
async function propagateOrderFulfillment(shipmentId, log) {
  // Find the parent order
  const orderResult = await pool.query(
    'SELECT order_id FROM shipments WHERE id = $1',
    [shipmentId]
  );

  if (orderResult.rows.length === 0) return null;

  const orderId = orderResult.rows[0].order_id;

  // Count sibling shipments that have NOT yet reached DELIVERED
  const pendingResult = await pool.query(
    `SELECT COUNT(*)::int AS pending
     FROM shipments sh
     WHERE sh.order_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM webhook_events we
         WHERE we.shipment_id = sh.id
           AND we.status = 'DELIVERED'
       )`,
    [orderId]
  );

  const pendingCount = pendingResult.rows[0].pending;

  if (pendingCount === 0) {
    // All shipments delivered — mark order as FULFILLED
    await pool.query(
      `UPDATE orders SET status = 'FULFILLED' WHERE id = $1 AND status != 'FULFILLED'`,
      [orderId]
    );

    log.info({ orderId, shipmentId }, 'Webhook: all shipments delivered — order marked FULFILLED');
    return orderId;
  }

  log.debug({ orderId, pendingCount }, 'Webhook: order still has pending shipments');
  return null;
}

// ─── POST /api/v1/webhooks/logistics ──────────────────────────────
/**
 * Simulated inbound shipment status webhook.
 *
 * Middleware chain:
 *   1. validateWebhookBody — Zod schema validation (400 if invalid)
 *   2. handler — status transition validation + event logging
 *
 * Response:
 *   200 — Transition accepted, event logged
 *   400 — Zod validation failure
 *   404 — Shipment not found
 *   409 — Invalid status transition
 */
router.post('/logistics', validateWebhookBody, async (req, res, next) => {
  try {
    const { shipment_id, status } = req.body;
    const log = req.log || logger;

    log.info({ shipmentId: shipment_id, status }, 'Webhook: status update received');

    // ─── Verify Shipment Exists ──────────────────────────────
    const shipmentResult = await pool.query(
      'SELECT id FROM shipments WHERE id = $1',
      [shipment_id]
    );

    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'SHIPMENT_NOT_FOUND',
          message: `Shipment ${shipment_id} not found.`,
        },
      });
    }

    // ─── Check Current Status ────────────────────────────────
    const currentStatus = await getCurrentStatus(shipment_id);

    // ─── Validate Transition ─────────────────────────────────
    const requiredPreviousStatus = VALID_TRANSITIONS[status];

    if (currentStatus !== requiredPreviousStatus) {
      let reason;
      if (currentStatus === null) {
        reason = `Shipment has no prior status. First event must be PICKED_UP, not "${status}".`;
      } else if (currentStatus === status) {
        reason = `Shipment is already in status "${currentStatus}". Duplicate transition rejected.`;
      } else if (
        VALID_STATUSES.indexOf(status) < VALID_STATUSES.indexOf(currentStatus)
      ) {
        reason = `Cannot reverse from "${currentStatus}" to "${status}".`;
      } else {
        reason = `Cannot skip from "${currentStatus}" to "${status}". Expected "${VALID_STATUSES[VALID_STATUSES.indexOf(currentStatus) + 1]}".`;
      }

      log.warn({ shipmentId: shipment_id, currentStatus, attemptedStatus: status }, 'Webhook: invalid transition');

      return res.status(409).json({
        error: {
          code: 'INVALID_TRANSITION',
          message: reason,
          currentStatus,
          attemptedStatus: status,
        },
      });
    }

    // ─── Log Valid Event ─────────────────────────────────────
    const insertResult = await pool.query(
      `INSERT INTO webhook_events (shipment_id, status)
       VALUES ($1, $2)
       RETURNING id, shipment_id, status, received_at`,
      [shipment_id, status]
    );

    const event = insertResult.rows[0];

    log.info({ eventId: event.id, shipmentId: shipment_id, status }, 'Webhook: transition accepted');

    // ─── Propagate Order Fulfillment ─────────────────────────
    let fulfilledOrderId = null;
    if (status === 'DELIVERED') {
      fulfilledOrderId = await propagateOrderFulfillment(shipment_id, log);
    }

    res.status(200).json({
      event: {
        id: event.id,
        shipmentId: event.shipment_id,
        status: event.status,
        receivedAt: event.received_at,
      },
      message: `Status transition to "${status}" accepted.`,
      ...(fulfilledOrderId ? { orderFulfilled: true, orderId: fulfilledOrderId } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/webhooks/simulate/:shipmentId ──────────────────
/**
 * One-click shipment lifecycle simulation.
 *
 * Auto-progresses a shipment through all remaining states:
 *   null → PICKED_UP → IN_TRANSIT → DELIVERED
 *
 * Skips states that have already been completed. If the shipment
 * is already DELIVERED, returns 200 with a no-op message.
 *
 * This reuses the same transition validation logic as /logistics
 * to guarantee consistency.
 *
 * Response:
 *   200 — Simulation complete, returns array of events created
 *   404 — Shipment not found
 */
router.post('/simulate/:shipmentId', async (req, res, next) => {
  try {
    const { shipmentId } = req.params;
    const log = req.log || logger;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(shipmentId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Shipment ID must be a valid UUID.',
        },
      });
    }

    // Verify shipment exists
    const shipmentResult = await pool.query(
      'SELECT id, order_id FROM shipments WHERE id = $1',
      [shipmentId]
    );

    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'SHIPMENT_NOT_FOUND',
          message: `Shipment ${shipmentId} not found.`,
        },
      });
    }

    log.info({ shipmentId }, 'Webhook simulate: starting auto-progression');

    // Determine current position in the lifecycle
    const currentStatus = await getCurrentStatus(shipmentId);
    const currentIndex = currentStatus
      ? VALID_STATUSES.indexOf(currentStatus)
      : -1;

    // Already fully delivered
    if (currentStatus === 'DELIVERED') {
      return res.status(200).json({
        message: 'Shipment is already DELIVERED. No action taken.',
        events: [],
        shipmentId,
      });
    }

    // Progress through remaining states
    const createdEvents = [];
    const remainingStatuses = VALID_STATUSES.slice(currentIndex + 1);

    for (const nextStatus of remainingStatuses) {
      const insertResult = await pool.query(
        `INSERT INTO webhook_events (shipment_id, status)
         VALUES ($1, $2)
         RETURNING id, shipment_id, status, received_at`,
        [shipmentId, nextStatus]
      );

      const event = insertResult.rows[0];
      createdEvents.push({
        id: event.id,
        shipmentId: event.shipment_id,
        status: event.status,
        receivedAt: event.received_at,
      });

      log.info({ shipmentId, status: nextStatus, eventId: event.id }, 'Webhook simulate: step completed');
    }

    // Propagate order fulfillment after reaching DELIVERED
    let fulfilledOrderId = null;
    if (remainingStatuses.includes('DELIVERED')) {
      fulfilledOrderId = await propagateOrderFulfillment(shipmentId, log);
    }

    res.status(200).json({
      message: `Simulation complete. ${createdEvents.length} event(s) created.`,
      events: createdEvents,
      shipmentId,
      ...(fulfilledOrderId ? { orderFulfilled: true, orderId: fulfilledOrderId } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/webhooks/events/:shipmentId ─────────────────────
/**
 * Retrieve the full webhook event timeline for a shipment.
 *
 * Returns events in chronological order (oldest first).
 *
 * Response:
 *   200 — Array of events
 *   404 — Shipment not found
 */
router.get('/events/:shipmentId', async (req, res, next) => {
  try {
    const { shipmentId } = req.params;
    const log = req.log || logger;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(shipmentId)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_ID',
          message: 'Shipment ID must be a valid UUID.',
        },
      });
    }

    // Verify shipment exists
    const shipmentResult = await pool.query(
      'SELECT id FROM shipments WHERE id = $1',
      [shipmentId]
    );

    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'SHIPMENT_NOT_FOUND',
          message: `Shipment ${shipmentId} not found.`,
        },
      });
    }

    // Fetch all events in chronological order
    const eventsResult = await pool.query(
      `SELECT id, shipment_id, status, received_at
       FROM webhook_events
       WHERE shipment_id = $1
       ORDER BY received_at ASC`,
      [shipmentId]
    );

    const events = eventsResult.rows.map(row => ({
      id: row.id,
      shipmentId: row.shipment_id,
      status: row.status,
      receivedAt: row.received_at,
    }));

    // Derive current status
    const currentStatus = events.length > 0
      ? events[events.length - 1].status
      : null;

    log.info({ shipmentId, eventCount: events.length, currentStatus }, 'Webhook events: fetched');

    res.status(200).json({
      shipmentId,
      currentStatus,
      events,
      count: events.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
