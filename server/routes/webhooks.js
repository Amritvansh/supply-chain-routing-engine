/**
 * Webhook Routes — Logistics Status Simulator
 *
 * POST /api/v1/webhooks/logistics — Simulated inbound shipment status webhook
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
 * This is an internal simulator — no external logistics provider involved.
 *
 * Week 4: Uses Zod validation middleware and Pino structured logging.
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

/**
 * POST /api/v1/webhooks/logistics
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
    const lastEventResult = await pool.query(
      `SELECT status FROM webhook_events
       WHERE shipment_id = $1
       ORDER BY received_at DESC
       LIMIT 1`,
      [shipment_id]
    );

    const currentStatus = lastEventResult.rows.length > 0
      ? lastEventResult.rows[0].status
      : null;

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

    res.status(200).json({
      event: {
        id: event.id,
        shipmentId: event.shipment_id,
        status: event.status,
        receivedAt: event.received_at,
      },
      message: `Status transition to "${status}" accepted.`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
