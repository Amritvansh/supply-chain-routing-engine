/**
 * Request ID Middleware
 *
 * Generates a unique request ID for every incoming request and attaches
 * it to the request object and the response headers. Creates a Pino
 * child logger with the requestId bound for downstream correlation.
 *
 * Every log line emitted during a request's lifecycle will include the
 * same requestId, enabling end-to-end tracing across:
 *   checkout → lock → transaction → response
 *   explain  → cache → gemini → fallback → response
 *
 * @module middleware/requestId
 */

'use strict';

const crypto = require('crypto');
const logger = require('../services/logger');

function requestIdMiddleware(req, res, next) {
  // Use client-provided X-Request-Id if present, else generate one
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Create a child logger with the requestId bound
  req.log = logger.child({ requestId });

  next();
}

module.exports = requestIdMiddleware;
