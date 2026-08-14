/**
 * Warehouse Routes
 * 
 * GET /api/v1/warehouses — Warehouse list + inventory summary
 * 
 * Returns 501 until business logic is implemented in Week 2.
 */
const { Router } = require('express');

const router = Router();

// GET /api/v1/warehouses
// Week 2: join against Member 1's schema for warehouse + inventory data
router.get('/', (req, res) => {
  res.status(501).json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'GET /api/v1/warehouses is not yet implemented',
    },
  });
});

module.exports = router;
