/**
 * Webhook Routes
 * 
 * POST /api/v1/webhooks/logistics — Simulated inbound shipment status webhook
 * 
 * Accepts { shipment_id, status } and validates legal status transitions:
 *   PICKED_UP → IN_TRANSIT → DELIVERED (no skipping, no reversing)
 * 
 * Returns 501 until business logic is implemented in Week 2.
 */
const { Router } = require('express');

const router = Router();

// POST /api/v1/webhooks/logistics
// Week 2: validate status transitions, log to webhook_events
router.post('/logistics', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'POST /api/v1/webhooks/logistics is not yet implemented',
    },
  });
});

module.exports = router;
