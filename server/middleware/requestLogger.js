/**
 * Request Logger Middleware
 *
 * Logs structured request information for every incoming HTTP request
 * using Pino. Captures:
 *   - Method, path, status code, response duration
 *   - Request ID (from requestId middleware)
 *
 * Uses the res 'finish' event to capture the actual response status
 * after the handler has completed.
 *
 * SECURITY: Does NOT log request bodies, authorization headers,
 * or any sensitive payload data.
 */

'use strict';

const logger = require('../services/logger');

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Math.round(Number(end - start) / 1e6 * 100) / 100;

    const log = req.log || logger;
    const logData = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    };

    // Use different log levels based on status code
    if (res.statusCode >= 500) {
      log.error(logData, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      log.warn(logData, 'Request completed with client error');
    } else {
      log.info(logData, 'Request completed');
    }
  });

  next();
}

module.exports = requestLogger;
