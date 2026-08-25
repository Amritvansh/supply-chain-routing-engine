/**
 * Rate Limiter Middleware — Checkout Traffic Protection
 *
 * Applies per-IP rate limiting to POST /api/v1/orders/checkout to
 * prevent API abuse and excessive request traffic.
 *
 * This is SEPARATE from the per-SKU Redis distributed lock:
 *   - Redis lock → protects inventory atomicity for a specific SKU
 *   - Rate limiter → protects the API server from request flooding
 *
 * Configuration:
 *   Window:      60 seconds (sliding)
 *   Max:         30 requests per IP per window
 *   Status:      429 Too Many Requests
 *   Headers:     RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After
 *
 * Override via environment variables:
 *   RATE_LIMIT_WINDOW_MS — window duration in milliseconds (default: 60000)
 *   RATE_LIMIT_MAX       — max requests per window (default: 30)
 *
 * @module middleware/rateLimiter
 */

'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const logger = require('../services/logger');

/**
 * Rate limiter configured for the checkout endpoint.
 *
 * Uses the in-memory store (default). For multi-instance deployments,
 * replace with rate-limit-redis.
 */
const checkoutRateLimiter = rateLimit({
  // Sliding window duration
  windowMs: env.RATE_LIMIT_WINDOW_MS || 60000,

  // Max requests per IP per window
  max: env.RATE_LIMIT_MAX || 30,

  // Standard rate-limit headers (draft-6)
  standardHeaders: true,

  // Disable X-RateLimit-* legacy headers
  legacyHeaders: false,

  // Custom 429 response matching the project's error envelope
  handler: (req, res, _next, options) => {
    const log = req.log || logger;
    log.warn({
      ip: req.ip,
      limit: options.max,
      windowMs: options.windowMs,
    }, 'Checkout rate limit exceeded');

    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many checkout requests. Limit: ${options.max} per ${Math.round(options.windowMs / 1000)}s window. Please retry after the Retry-After period.`,
      },
    });
  },

  // Skip rate limiting for non-checkout requests
  // (This limiter is applied only to the checkout route via the router, but
  //  this skip function provides defense-in-depth)
  skip: (req) => req.method !== 'POST',

  // Use X-Forwarded-For in production (behind reverse proxy)
  // keyGenerator defaults to req.ip which respects trust proxy
});

module.exports = { checkoutRateLimiter };
