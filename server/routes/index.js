/**
 * API v1 Router Index
 * 
 * Mounts all sub-routers under the /api/v1 prefix.
 * This is the single entry point for all API routes.
 */
const { Router } = require('express');

const healthRouter = require('./health');
const ordersRouter = require('./orders');
const warehousesRouter = require('./warehouses');
const webhooksRouter = require('./webhooks');
const dashboardRouter = require('./dashboard');

const router = Router();

// Health check (fully implemented in Week 1)
router.use('/health', healthRouter);

// Order routes (stubs — business logic in Week 2-3)
router.use('/orders', ordersRouter);

// Warehouse routes (stub — business logic in Week 2)
router.use('/warehouses', warehousesRouter);

// Webhook routes (stub — business logic in Week 2)
router.use('/webhooks', webhooksRouter);

// Dashboard routes (stub — business logic in Week 3)
router.use('/dashboard', dashboardRouter);

module.exports = router;
