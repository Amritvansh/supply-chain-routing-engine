/**
 * Dashboard Routes
 * 
 * GET /api/v1/dashboard/map-data — Aggregated warehouse + active-route data
 *                                  for the Control Tower map overlay
 * 
 * Returns 501 until business logic is implemented in Week 3.
 */
const { Router } = require('express');

const router = Router();

// GET /api/v1/dashboard/map-data
// Week 3: warehouse locations + recent order routes for map overlay
router.get('/map-data', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'GET /api/v1/dashboard/map-data is not yet implemented',
    },
  });
});

module.exports = router;
