/**
 * Supply Chain Routing Engine — Express Application
 *
 * Member 2 (API & Logistics Orchestration Lead)
 *
 * Configures Express with middleware stack and mounts all /api/v1 routes.
 *
 * ARCHITECTURAL NOTE:
 *   POST /api/v1/orders/checkout  → synchronous deterministic path (no AI)
 *   GET  /api/v1/orders/:id/explain → asynchronous AI path (Gemini, decoupled)
 *   These two paths must never be coupled. Checkout never awaits Gemini.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const env = require('./config/env');
const apiRouter = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const requestIdMiddleware = require('./middleware/requestId');
const logger = require('./services/logger');

const app = express();

// ─── Security & Parsing Middleware ───────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Request ID Generation (must be before logger and routes) ─
app.use(requestIdMiddleware);

// ─── Structured Logging ─────────────────────────────────────
// Pino-based structured request logging with requestId correlation
app.use(requestLogger);

// ─── API Routes ──────────────────────────────────────────────
app.use('/api/v1', apiRouter);

// ─── 404 Catch-All ───────────────────────────────────────────
app.use((req, res, next) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
});

// ─── Centralized Error Handler ───────────────────────────────
app.use(errorHandler);

// ─── Start Server ────────────────────────────────────────────
if (require.main === module) {
  const PORT = env.PORT;
  app.listen(PORT, () => {
    logger.info({ port: PORT, env: env.NODE_ENV }, 'Supply Chain Routing Engine started');
    logger.info({ url: `http://localhost:${PORT}/api/v1/health` }, 'Health endpoint');
  });
}

// Export for testing
module.exports = app;
