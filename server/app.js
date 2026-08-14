/**
 * Supply Chain Routing Engine — Express Application
 * 
 * Member 2 (API & Logistics Orchestration Lead) — Week 1
 * 
 * Configures Express with middleware stack and mounts all /api/v1 routes.
 * Business logic is NOT implemented in Week 1 — route stubs return 501.
 * 
 * ARCHITECTURAL NOTE:
 *   POST /api/v1/orders/checkout  → synchronous deterministic path (no AI)
 *   GET  /api/v1/orders/:id/explain → asynchronous AI path (Gemini, decoupled)
 *   These two paths must never be coupled. Checkout never awaits Gemini.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const apiRouter = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');

const app = express();

// ─── Security & Parsing Middleware ───────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());

// ─── Logging ─────────────────────────────────────────────────
// Morgan for HTTP request logging (concise dev format)
app.use(morgan('dev'));
// Custom request logger for structured duration tracking
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
    console.log(`[Server] Supply Chain Routing Engine running on http://localhost:${PORT}`);
    console.log(`[Health] http://localhost:${PORT}/api/v1/health`);
    console.log(`[Env]    ${env.NODE_ENV}`);
  });
}

// Export for testing
module.exports = app;
