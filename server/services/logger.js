/**
 * Structured Logger — Pino Configuration
 *
 * Centralized structured logging for the Supply Chain Routing Engine.
 * All modules should import this logger instead of using console.log.
 *
 * Features:
 *   - JSON output in production (machine-readable)
 *   - Pretty-printed output in development (human-readable)
 *   - Request ID correlation via child loggers
 *   - Sensitive data redaction (API keys, passwords, tokens)
 *
 * Usage:
 *   const logger = require('./services/logger');
 *   logger.info({ orderId, step: 'lock_acquire' }, 'Acquiring per-SKU lock');
 *
 *   // With request context:
 *   const log = req.log; // child logger with requestId bound
 *   log.info({ sku }, 'Lock acquired');
 *
 * @module services/logger
 */

'use strict';

const pino = require('pino');
const env = require('../config/env');

const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')),

  // Redact sensitive fields that may appear in log context
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'apiKey',
      'password',
      'token',
      'secret',
      'GEMINI_API_KEY',
      'GOOGLE_MAPS_API_KEY',
    ],
    censor: '[REDACTED]',
  },

  // Base fields included in every log line
  base: {
    service: 'supply-chain-routing-engine',
  },

  // Timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,

  // Pretty print in development (requires pino-pretty installed as devDep)
  ...((!isProduction && !isTest) ? {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname,service',
      },
    },
  } : {}),
});

module.exports = logger;
