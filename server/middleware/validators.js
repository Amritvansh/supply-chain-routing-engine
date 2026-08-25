/**
 * Request Validation — Zod Schemas & Middleware
 *
 * Centralized validation for all /api/v1 endpoints using Zod.
 * Replaces inline manual validation scattered across route files.
 *
 * Each schema validates the exact shape expected by its endpoint.
 * The validate() middleware factory wraps schemas into Express
 * middleware that returns 400 with clear error details on failure.
 *
 * SECURITY:
 *   - Validation errors never expose internal stack traces
 *   - Error messages identify the failing field and constraint
 *   - Unknown fields are stripped (Zod .strict() or .passthrough())
 *
 * @module middleware/validators
 */

'use strict';

const { z } = require('zod');

// ─── Shared Primitives ──────────────────────────────────────

const uuidSchema = z
  .string()
  .uuid('Must be a valid UUID');

const latSchema = z
  .number({ required_error: 'Latitude is required', invalid_type_error: 'Latitude must be a number' })
  .finite('Latitude must be a finite number')
  .min(-90, 'Latitude must be between -90 and 90')
  .max(90, 'Latitude must be between -90 and 90');

const lngSchema = z
  .number({ required_error: 'Longitude is required', invalid_type_error: 'Longitude must be a number' })
  .finite('Longitude must be a finite number')
  .min(-180, 'Longitude must be between -180 and 180')
  .max(180, 'Longitude must be between -180 and 180');

// ─── Checkout Schema ────────────────────────────────────────

const checkoutItemSchema = z.object({
  sku: z
    .string({ required_error: 'Item sku is required' })
    .min(1, 'Item sku must be a non-empty string'),
  qty: z
    .number({ required_error: 'Item qty is required', invalid_type_error: 'Item qty must be a number' })
    .int('Item qty must be an integer')
    .min(1, 'Item qty must be at least 1'),
});

const checkoutBodySchema = z.object({
  customerLat: latSchema,
  customerLng: lngSchema,
  items: z
    .array(checkoutItemSchema, { required_error: 'items array is required' })
    .min(1, 'items must be a non-empty array'),
});

// ─── Flash-Test Schema ──────────────────────────────────────

const flashTestBodySchema = z.object({
  sku: z
    .string({ required_error: 'sku is required' })
    .min(1, 'sku must be a non-empty string'),
  qty: z
    .number({ required_error: 'qty is required', invalid_type_error: 'qty must be a number' })
    .int('qty must be an integer')
    .min(1, 'qty must be at least 1'),
  concurrency: z
    .number({ required_error: 'concurrency is required', invalid_type_error: 'concurrency must be a number' })
    .int('concurrency must be an integer')
    .min(1, 'concurrency must be at least 1')
    .max(50, 'concurrency is capped at 50'),
});

// ─── Webhook Schema ─────────────────────────────────────────

const webhookBodySchema = z.object({
  shipment_id: z
    .string({ required_error: 'shipment_id is required' })
    .uuid('shipment_id must be a valid UUID'),
  status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'], {
    errorMap: () => ({ message: 'status must be one of: PICKED_UP, IN_TRANSIT, DELIVERED' }),
  }),
});

// ─── Map-Data Query Schema ──────────────────────────────────

const mapDataQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform(val => (val !== undefined ? parseInt(val, 10) : undefined))
    .pipe(
      z.number()
        .int('limit must be an integer')
        .min(1, 'limit must be at least 1')
        .max(200, 'limit is capped at 200')
        .optional()
    ),
});

// ─── UUID Param Schema ──────────────────────────────────────

const uuidParamSchema = z.object({
  id: uuidSchema,
});

// ─── Middleware Factory ─────────────────────────────────────

/**
 * Creates Express middleware that validates the specified request
 * property against a Zod schema.
 *
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {'body'|'params'|'query'} source - Request property to validate
 * @returns {Function} Express middleware
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: details.map(d => d.field ? `${d.field}: ${d.message}` : d.message).join('; '),
          details,
        },
      });
    }

    // Replace the source with parsed (and potentially transformed) data
    req[source] = result.data;
    next();
  };
}

// ─── Idempotency-Key Header Validator ───────────────────────

/**
 * Validates that the Idempotency-Key header is present.
 * Separated from Zod body validation since headers need special handling.
 */
function validateIdempotencyKey(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    return res.status(400).json({
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required.',
      },
    });
  }
  next();
}

module.exports = {
  // Schemas (exported for testing)
  checkoutBodySchema,
  flashTestBodySchema,
  webhookBodySchema,
  mapDataQuerySchema,
  uuidParamSchema,

  // Pre-built middleware
  validateCheckoutBody: validate(checkoutBodySchema, 'body'),
  validateFlashTestBody: validate(flashTestBodySchema, 'body'),
  validateWebhookBody: validate(webhookBodySchema, 'body'),
  validateMapDataQuery: validate(mapDataQuerySchema, 'query'),
  validateUuidParam: validate(uuidParamSchema, 'params'),
  validateIdempotencyKey,

  // Factory for custom schemas
  validate,
};
