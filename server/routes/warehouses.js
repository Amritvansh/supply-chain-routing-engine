/**
 * Warehouse Routes — Read + Host Management
 *
 * PUBLIC (no auth):
 *   GET /api/v1/warehouses           — List all warehouses with inventory
 *
 * HOST-ONLY (verifyToken + requireHost):
 *   POST   /api/v1/warehouses        — Create a new warehouse
 *   PUT    /api/v1/warehouses/:id    — Update an existing warehouse
 *   DELETE /api/v1/warehouses/:id    — Deactivate a warehouse (soft delete)
 */

'use strict';

const { Router } = require('express');
const {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} = require('../controllers/warehouseController');
const { verifyToken, requireHost } = require('../middleware/authMiddleware');

const router = Router();

// ── Public endpoints ────────────────────────────────────────────────

router.get('/', listWarehouses);

// ── Host-only endpoints ─────────────────────────────────────────────

router.post('/',      verifyToken, requireHost, createWarehouse);
router.put('/:id',    verifyToken, requireHost, updateWarehouse);
router.delete('/:id', verifyToken, requireHost, deleteWarehouse);

module.exports = router;

