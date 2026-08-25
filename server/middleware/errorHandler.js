/**
 * Centralized Error Handler Middleware
 *
 * All errors thrown or passed via next(err) land here.
 * Returns a consistent JSON error envelope:
 *
 *   { error: { code: "ERROR_CODE", message: "Human readable message" } }
 *
 * Stack traces are only included in development mode.
 * Uses Pino structured logging instead of console.error.
 */

'use strict';

const logger = require('../services/logger');
const env = require('../config/env');

function errorHandler(err, req, res, _next) {
  // Default to 500 if no status was set
  const statusCode = err.statusCode || err.status || 500;

  // Build the error code from the error name or a generic fallback
  const code = err.code || err.name || 'INTERNAL_SERVER_ERROR';

  // Human-readable message
  const message = err.message || 'An unexpected error occurred';

  // Structured error logging via Pino
  const log = req.log || logger;
  log.error({
    err: {
      code,
      message,
      ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
    },
    status: statusCode,
    method: req.method,
    path: req.originalUrl,
  }, 'Unhandled error');

  // Build response
  const response = {
    error: {
      code,
      message,
    },
  };

  // Include stack trace only in development
  if (env.NODE_ENV === 'development' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
