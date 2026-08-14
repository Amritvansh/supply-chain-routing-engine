/**
 * Order Routes
 * 
 * POST /api/v1/orders/checkout    — Deterministic routing + ACID checkout (SYNC, no AI)
 * GET  /api/v1/orders/:id         — Order + items + shipments
 * GET  /api/v1/orders/:id/explain — Cached or freshly-generated AI explanation (ASYNC)
 * POST /api/v1/orders/flash-test  — Server-side flash-sale stress simulation
 * 
 * ARCHITECTURAL NOTE:
 *   checkout and explain are intentionally separate routes with separate
 *   execution paths. checkout must NEVER await Gemini. explain is the only
 *   route that touches ai_explanations or the Gemini API.
 * 
 * All routes return 501 until business logic is implemented in later weeks.
 */
const { Router } = require('express');

const router = Router();

// POST /api/v1/orders/checkout
// Week 3: deterministic routing + ACID checkout (sync path, no AI)
router.post('/checkout', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'POST /api/v1/orders/checkout is not yet implemented',
    },
  });
});

// GET /api/v1/orders/:id
// Week 2: return order + items + shipments
router.get('/:id', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `GET /api/v1/orders/${req.params.id} is not yet implemented`,
    },
  });
});

// GET /api/v1/orders/:id/explain
// Week 2: async AI explanation (Gemini or fallback template)
router.get('/:id/explain', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: `GET /api/v1/orders/${req.params.id}/explain is not yet implemented`,
    },
  });
});

// POST /api/v1/orders/flash-test
// Week 3: server-side flash-sale stress simulation
router.post('/flash-test', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'POST /api/v1/orders/flash-test is not yet implemented',
    },
  });
});

module.exports = router;
