/**
 * Inventory Routes — Host Inventory Management
 *
 * HOST-ONLY (verifyToken + requireHost):
 *   GET  /api/v1/inventory        — List all inventory across warehouses
 *   POST /api/v1/inventory/adjust — Upsert stock for a SKU at a warehouse
 */

'use strict';

const { Router } = require('express');
const {
  listInventory,
  setInventory,
} = require('../controllers/inventoryController');
const { verifyToken, requireHost } = require('../middleware/authMiddleware');

const router = Router();

// ── Host-only endpoints ─────────────────────────────────────────────

router.get('/',       verifyToken, requireHost, listInventory);
router.post('/adjust', verifyToken, requireHost, setInventory);

module.exports = router;
