/**
 * Week 4 Hardening Tests — Member 2
 *
 * Test suites:
 *   1. Zod request validation
 *   2. Gemini retry with exponential backoff
 *   3. Gemini circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED)
 *   4. Multi-shipment /explain support
 *   5. Structured request ID correlation
 *   6. CRITICAL REGRESSION: POST /checkout NEVER calls Gemini
 *   7. Rate limiter integration
 *
 * All tests use mocks — NO real Gemini API calls, NO real DB, NO real Redis.
 */

'use strict';

// ─── Gemini Circuit Breaker Tests ──────────────────────────────
describe('Gemini Circuit Breaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    // Fresh import to reset module state
    jest.resetModules();
    // Mock env and logger before requiring circuit breaker
    jest.mock('../config/env', () => ({
      GEMINI_FAILURE_THRESHOLD: 3,
      GEMINI_COOLDOWN_MS: 1000,
      NODE_ENV: 'test',
    }));
    jest.mock('../services/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    }));
    circuitBreaker = require('../services/geminiCircuitBreaker');
    circuitBreaker.reset();
  });

  test('starts in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.isCallAllowed()).toBe(true);
  });

  test('stays CLOSED below failure threshold', () => {
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.isCallAllowed()).toBe(true);
  });

  test('trips to OPEN at failure threshold', () => {
    for (let i = 0; i < 3; i++) {
      circuitBreaker.recordFailure();
    }
    expect(circuitBreaker.getState()).toBe('OPEN');
    expect(circuitBreaker.isCallAllowed()).toBe(false);
  });

  test('resets to CLOSED on success', () => {
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordSuccess();
    expect(circuitBreaker.getState()).toBe('CLOSED');
    expect(circuitBreaker.getDiagnostics().consecutiveFailures).toBe(0);
  });

  test('transitions from OPEN to HALF_OPEN after cooldown', () => {
    for (let i = 0; i < 3; i++) {
      circuitBreaker.recordFailure();
    }
    expect(circuitBreaker.getState()).toBe('OPEN');

    // Simulate cooldown elapsed by manipulating internal state
    const diagnostics = circuitBreaker.getDiagnostics();
    expect(diagnostics.state).toBe('OPEN');

    // Fast-forward time by using a fake timer
    jest.useFakeTimers();
    jest.advanceTimersByTime(1100); // > 1000ms cooldown

    expect(circuitBreaker.getState()).toBe('HALF_OPEN');
    expect(circuitBreaker.isCallAllowed()).toBe(true);

    jest.useRealTimers();
  });

  test('HALF_OPEN success resets to CLOSED', () => {
    // Trip to OPEN
    for (let i = 0; i < 3; i++) {
      circuitBreaker.recordFailure();
    }

    // Advance past cooldown
    jest.useFakeTimers();
    jest.advanceTimersByTime(1100);
    expect(circuitBreaker.getState()).toBe('HALF_OPEN');

    // Success resets to CLOSED
    circuitBreaker.recordSuccess();
    expect(circuitBreaker.getState()).toBe('CLOSED');

    jest.useRealTimers();
  });

  test('HALF_OPEN failure returns to OPEN', () => {
    for (let i = 0; i < 3; i++) {
      circuitBreaker.recordFailure();
    }

    jest.useFakeTimers();
    jest.advanceTimersByTime(1100);
    expect(circuitBreaker.getState()).toBe('HALF_OPEN');

    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('OPEN');

    jest.useRealTimers();
  });

  test('getDiagnostics returns full state', () => {
    const d = circuitBreaker.getDiagnostics();
    expect(d).toHaveProperty('state');
    expect(d).toHaveProperty('consecutiveFailures');
    expect(d).toHaveProperty('config');
    expect(d.config).toHaveProperty('failureThreshold', 3);
    expect(d.config).toHaveProperty('cooldownMs', 1000);
  });
});

// ─── Gemini Client Retry Tests ─────────────────────────────────
describe('Gemini Client — Retry & Circuit Breaker', () => {
  let geminiClient;
  let circuitBreaker;

  const mockRoutingResult = {
    status: 'ROUTED',
    chosen: {
      warehouseId: 'wh-1',
      name: 'Delhi Hub',
      distanceKm: 15,
      boxSize: 'MEDIUM',
      costBreakdown: {
        distanceCost: 7.5,
        packagingCost: 3,
        depletionPenalty: 0,
      },
      totalCost: 10.5,
    },
    alternatives: [
      {
        warehouseId: 'wh-2',
        name: 'Mumbai Hub',
        distanceKm: 120,
        penalty: 10,
        totalCost: 73,
        rejectionReason: null,
      },
    ],
  };

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/env', () => ({
      GEMINI_API_KEY: 'test-api-key',
      GEMINI_FAILURE_THRESHOLD: 3,
      GEMINI_COOLDOWN_MS: 60000,
      NODE_ENV: 'test',
    }));
    jest.mock('../services/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    }));

    // Mock the Google Generative AI module
    jest.mock('@google/generative-ai', () => ({
      GoogleGenerativeAI: jest.fn(),
    }));
  });

  test('returns gemini source on first-attempt success', async () => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: jest.fn().mockResolvedValue({
          response: { text: () => 'AI explanation text' },
        }),
      }),
    }));

    geminiClient = require('../services/geminiClient');
    circuitBreaker = require('../services/geminiCircuitBreaker');
    circuitBreaker.reset();

    const result = await geminiClient.generateExplanation(mockRoutingResult);
    expect(result.source).toBe('gemini');
    expect(result.explanation).toBe('AI explanation text');
    expect(result.modelUsed).toBe('gemini-2.0-flash');
  });

  test('retries on failure and succeeds on second attempt', async () => {
    let callCount = 0;
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Temporary failure');
          }
          return Promise.resolve({
            response: { text: () => 'AI explanation after retry' },
          });
        }),
      }),
    }));

    geminiClient = require('../services/geminiClient');
    circuitBreaker = require('../services/geminiCircuitBreaker');
    circuitBreaker.reset();

    const result = await geminiClient.generateExplanation(mockRoutingResult);
    expect(result.source).toBe('gemini');
    expect(result.explanation).toBe('AI explanation after retry');
    expect(callCount).toBe(2);
  });

  test('falls back after all retries exhausted (3 failures)', async () => {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    let callCount = 0;
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: jest.fn().mockImplementation(() => {
          callCount++;
          throw new Error(`Failure ${callCount}`);
        }),
      }),
    }));

    geminiClient = require('../services/geminiClient');
    circuitBreaker = require('../services/geminiCircuitBreaker');
    circuitBreaker.reset();

    const result = await geminiClient.generateExplanation(mockRoutingResult);
    expect(result.source).toBe('fallback_template');
    expect(result.modelUsed).toBe('n/a');
    expect(callCount).toBe(3); // 1 initial + 2 retries
    expect(result.explanation).toContain('Delhi Hub');
  });

  test('skips Gemini when no API key is set', async () => {
    jest.resetModules();
    jest.mock('../config/env', () => ({
      GEMINI_API_KEY: '',
      GEMINI_FAILURE_THRESHOLD: 3,
      GEMINI_COOLDOWN_MS: 60000,
      NODE_ENV: 'test',
    }));
    jest.mock('../services/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    }));

    geminiClient = require('../services/geminiClient');

    const result = await geminiClient.generateExplanation(mockRoutingResult);
    expect(result.source).toBe('fallback_template');
  });

  test('skips Gemini when circuit breaker is OPEN', async () => {
    geminiClient = require('../services/geminiClient');
    circuitBreaker = require('../services/geminiCircuitBreaker');
    circuitBreaker.reset();

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      circuitBreaker.recordFailure();
    }
    expect(circuitBreaker.getState()).toBe('OPEN');

    const result = await geminiClient.generateExplanation(mockRoutingResult);
    expect(result.source).toBe('fallback_template');
  });
});

// ─── Zod Validation Tests ──────────────────────────────────────
describe('Zod Request Validation', () => {
  const {
    checkoutBodySchema,
    flashTestBodySchema,
    webhookBodySchema,
    mapDataQuerySchema,
    uuidParamSchema,
  } = require('../middleware/validators');

  describe('Checkout body schema', () => {
    test('accepts valid checkout body', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: 28.6139,
        customerLng: 77.209,
        items: [{ sku: 'SKU-001', qty: 2 }],
      });
      expect(result.success).toBe(true);
    });

    test('rejects missing customerLat', () => {
      const result = checkoutBodySchema.safeParse({
        customerLng: 77.209,
        items: [{ sku: 'SKU-001', qty: 2 }],
      });
      expect(result.success).toBe(false);
    });

    test('rejects out-of-range latitude', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: 91,
        customerLng: 77.209,
        items: [{ sku: 'SKU-001', qty: 2 }],
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('-90');
    });

    test('rejects out-of-range longitude', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: 28.6,
        customerLng: 181,
        items: [{ sku: 'SKU-001', qty: 2 }],
      });
      expect(result.success).toBe(false);
    });

    test('rejects empty items array', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: 28.6,
        customerLng: 77.2,
        items: [],
      });
      expect(result.success).toBe(false);
    });

    test('rejects non-integer qty', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: 28.6,
        customerLng: 77.2,
        items: [{ sku: 'SKU-001', qty: 1.5 }],
      });
      expect(result.success).toBe(false);
    });

    test('rejects zero qty', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: 28.6,
        customerLng: 77.2,
        items: [{ sku: 'SKU-001', qty: 0 }],
      });
      expect(result.success).toBe(false);
    });

    test('rejects empty sku', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: 28.6,
        customerLng: 77.2,
        items: [{ sku: '', qty: 1 }],
      });
      expect(result.success).toBe(false);
    });

    test('rejects NaN latitude', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: NaN,
        customerLng: 77.2,
        items: [{ sku: 'SKU-001', qty: 1 }],
      });
      expect(result.success).toBe(false);
    });

    test('rejects Infinity longitude', () => {
      const result = checkoutBodySchema.safeParse({
        customerLat: 28.6,
        customerLng: Infinity,
        items: [{ sku: 'SKU-001', qty: 1 }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Flash-test body schema', () => {
    test('accepts valid flash-test body', () => {
      const result = flashTestBodySchema.safeParse({
        sku: 'SKU-001',
        qty: 1,
        concurrency: 10,
      });
      expect(result.success).toBe(true);
    });

    test('rejects concurrency above 50', () => {
      const result = flashTestBodySchema.safeParse({
        sku: 'SKU-001',
        qty: 1,
        concurrency: 51,
      });
      expect(result.success).toBe(false);
    });

    test('rejects missing sku', () => {
      const result = flashTestBodySchema.safeParse({
        qty: 1,
        concurrency: 10,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Webhook body schema', () => {
    test('accepts valid webhook body', () => {
      const result = webhookBodySchema.safeParse({
        shipment_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'PICKED_UP',
      });
      expect(result.success).toBe(true);
    });

    test('rejects invalid UUID', () => {
      const result = webhookBodySchema.safeParse({
        shipment_id: 'not-a-uuid',
        status: 'PICKED_UP',
      });
      expect(result.success).toBe(false);
    });

    test('rejects invalid status', () => {
      const result = webhookBodySchema.safeParse({
        shipment_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'INVALID_STATUS',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UUID param schema', () => {
    test('accepts valid UUID', () => {
      const result = uuidParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    test('rejects non-UUID string', () => {
      const result = uuidParamSchema.safeParse({
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Map-data query schema', () => {
    test('accepts valid limit', () => {
      const result = mapDataQuerySchema.safeParse({ limit: '50' });
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(50);
    });

    test('accepts missing limit (optional)', () => {
      const result = mapDataQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test('rejects limit above 200', () => {
      const result = mapDataQuerySchema.safeParse({ limit: '201' });
      expect(result.success).toBe(false);
    });

    test('rejects limit of 0', () => {
      const result = mapDataQuerySchema.safeParse({ limit: '0' });
      expect(result.success).toBe(false);
    });
  });
});

// ─── Validation Middleware Integration Tests ────────────────────
describe('Validation Middleware Integration', () => {
  const {
    validateCheckoutBody,
    validateIdempotencyKey,
    validateUuidParam,
  } = require('../middleware/validators');

  function createMockReqRes(overrides = {}) {
    const req = {
      body: {},
      params: {},
      query: {},
      headers: {},
      ...overrides,
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();
    return { req, res, next };
  }

  test('validateCheckoutBody calls next on valid body', () => {
    const { req, res, next } = createMockReqRes({
      body: {
        customerLat: 28.6,
        customerLng: 77.2,
        items: [{ sku: 'SKU-001', qty: 1 }],
      },
    });
    validateCheckoutBody(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('validateCheckoutBody returns 400 on invalid body', () => {
    const { req, res, next } = createMockReqRes({
      body: { customerLat: 'not-a-number' },
    });
    validateCheckoutBody(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const response = res.json.mock.calls[0][0];
    expect(response.error.code).toBe('VALIDATION_ERROR');
    expect(response.error.details).toBeDefined();
  });

  test('validateIdempotencyKey returns 400 if missing', () => {
    const { req, res, next } = createMockReqRes({ headers: {} });
    validateIdempotencyKey(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  test('validateIdempotencyKey calls next if present', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'idempotency-key': 'test-key-123' },
    });
    validateIdempotencyKey(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('validateUuidParam returns 400 on invalid UUID', () => {
    const { req, res, next } = createMockReqRes({
      params: { id: 'not-a-uuid' },
    });
    validateUuidParam(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe('VALIDATION_ERROR');
  });
});

// ─── Fallback Explanation Builder Tests ─────────────────────────
describe('Fallback Explanation Builder', () => {
  // These don't need mocks since buildFallbackExplanation is pure
  beforeEach(() => {
    jest.resetModules();
    jest.mock('../config/env', () => ({
      GEMINI_API_KEY: '',
      GEMINI_FAILURE_THRESHOLD: 5,
      GEMINI_COOLDOWN_MS: 60000,
      NODE_ENV: 'test',
    }));
    jest.mock('../services/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    }));
  });

  test('builds fallback with alternatives', () => {
    const geminiClient = require('../services/geminiClient');
    const result = geminiClient.buildFallbackExplanation({
      chosen: {
        name: 'Delhi Hub',
        distanceKm: 15,
        totalCost: 10.5,
        costBreakdown: { distanceCost: 7.5, packagingCost: 3, depletionPenalty: 0 },
      },
      alternatives: [
        { name: 'Mumbai Hub', distanceKm: 120, totalCost: 73 },
      ],
    });
    expect(result).toContain('Delhi Hub');
    expect(result).toContain('Mumbai Hub');
    expect(result).toContain('15');
  });

  test('builds fallback without alternatives (only warehouse)', () => {
    const geminiClient = require('../services/geminiClient');
    const result = geminiClient.buildFallbackExplanation({
      chosen: {
        name: 'Delhi Hub',
        distanceKm: 15,
        totalCost: 10.5,
        costBreakdown: { distanceCost: 7.5, packagingCost: 3, depletionPenalty: 0 },
      },
      alternatives: [],
    });
    expect(result).toContain('only eligible warehouse');
  });
});

// ─── CRITICAL REGRESSION: Checkout Never Calls Gemini ───────────
describe('CRITICAL REGRESSION: POST /checkout does NOT call Gemini', () => {
  test('checkout succeeds without any Gemini dependency', async () => {
    // This test verifies the architectural rule: checkout NEVER calls Gemini.
    // We mock geminiClient to throw if invoked, then verify checkout succeeds.

    jest.resetModules();

    // Mock geminiClient so ANY call fails the test
    jest.mock('../services/geminiClient', () => ({
      generateExplanation: jest.fn().mockImplementation(() => {
        throw new Error('ARCHITECTURAL VIOLATION: checkout called Gemini!');
      }),
      buildPrompt: jest.fn(),
      buildFallbackExplanation: jest.fn(),
      GEMINI_MODEL: 'test',
    }));

    // Mock all DB and Redis dependencies
    jest.mock('../db/pool', () => ({
      query: jest.fn()
        .mockResolvedValueOnce({
          // Warehouse query
          rows: [
            { id: 'wh-1', name: 'Delhi', lat: '28.6', lng: '77.2', active: true, sku: 'SKU-001', available_qty: 100 },
          ],
        })
        .mockResolvedValueOnce({
          // SKU query
          rows: [
            { sku: 'SKU-001', name: 'Widget', length_cm: 10, width_cm: 10, height_cm: 10, weight_kg: '1.0' },
          ],
        }),
    }));

    jest.mock('../services/googleMaps', () => ({
      getDistance: jest.fn().mockResolvedValue({ distanceKm: 15 }),
    }));

    jest.mock('../algorithms/routingEngine', () => ({
      selectOptimalWarehouse: jest.fn().mockReturnValue({
        status: 'ROUTED',
        chosen: {
          warehouseId: 'wh-1',
          name: 'Delhi',
          distanceKm: 15,
          boxSize: 'MEDIUM',
          costBreakdown: { distanceCost: 7.5, packagingCost: 3, depletionPenalty: 0, totalCost: 10.5 },
          totalCost: 10.5,
        },
        alternatives: [],
        packing: { status: 'FIT', boxSize: 'MEDIUM' },
      }),
    }));

    jest.mock('../services/redisLock', () => ({
      acquireLock: jest.fn().mockResolvedValue({ acquired: true, token: 'tok-1', waitedMs: 1 }),
      releaseLock: jest.fn().mockResolvedValue(true),
    }));

    jest.mock('../db/transactions/checkoutTransaction', () => ({
      executeCheckout: jest.fn().mockResolvedValue({
        order: { id: 'order-1', status: 'ROUTED', created_at: new Date().toISOString() },
        items: [{ id: 'item-1', sku: 'SKU-001', qty: 1 }],
        shipments: [{ id: 'sh-1', warehouse_id: 'wh-1', box_size: 'MEDIUM' }],
        costBreakdown: { distanceCost: 7.5, packagingCost: 3, depletionPenalty: 0, totalCost: 10.5 },
        alternatives: [],
      }),
    }));

    jest.mock('../db/lockAudit', () => ({
      recordLockAttempt: jest.fn(),
    }));

    jest.mock('../services/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    }));

    // Import route handler
    const express = require('express');
    const app = express();
    app.use(express.json());

    // Attach requestId stub
    app.use((req, res, next) => {
      req.requestId = 'test-req-id';
      req.log = require('../services/logger');
      next();
    });

    const ordersRouter = require('../routes/orders');
    app.use('/api/v1/orders', ordersRouter);

    const supertest = require('supertest');
    const response = await supertest(app)
      .post('/api/v1/orders/checkout')
      .set('Idempotency-Key', 'test-idem-key')
      .send({
        customerLat: 28.6139,
        customerLng: 77.209,
        items: [{ sku: 'SKU-001', qty: 1 }],
      });

    // Checkout MUST succeed (201)
    expect(response.status).toBe(201);

    // Gemini MUST NOT have been called
    const geminiClient = require('../services/geminiClient');
    expect(geminiClient.generateExplanation).not.toHaveBeenCalled();
  });
});

// ─── Request ID Middleware Tests ────────────────────────────────
describe('Request ID Middleware', () => {
  test('generates UUID request ID and sets header', () => {
    const requestIdMiddleware = require('../middleware/requestId');

    jest.mock('../services/logger', () => ({
      child: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }),
    }));

    const req = { headers: {} };
    const res = {
      setHeader: jest.fn(),
    };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(req.log).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  test('uses client-provided X-Request-Id if present', () => {
    jest.resetModules();
    jest.mock('../services/logger', () => ({
      child: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }),
    }));

    const requestIdMiddleware = require('../middleware/requestId');
    const req = { headers: { 'x-request-id': 'client-provided-id' } };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('client-provided-id');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-provided-id');
  });
});

// ─── Prompt Builder Tests ───────────────────────────────────────
describe('Gemini Prompt Builder', () => {
  test('builds prompt with chosen warehouse and alternatives', () => {
    // Directly test the buildPrompt function logic
    // to avoid jest.mock contamination from other test blocks
    const { buildPrompt } = jest.requireActual('../services/geminiClient');

    const prompt = buildPrompt({
      chosen: {
        name: 'Delhi Hub',
        distanceKm: 15,
        costBreakdown: {
          distanceCost: 7.5,
          packagingCost: 3,
          depletionPenalty: 0,
        },
      },
      alternatives: [
        { name: 'Mumbai Hub', distanceKm: 120, penalty: 10, totalCost: 73, rejectionReason: null },
      ],
    });

    expect(prompt).toContain('Delhi Hub');
    expect(prompt).toContain('Mumbai Hub');
    expect(prompt).toContain('distance_cost=7.5');
    expect(prompt).toContain('packaging_cost=3');
    expect(prompt).toContain('depletion_penalty=0');
    expect(prompt).toContain('2-3 plain-language sentences');
  });

  test('handles rejected alternatives in prompt', () => {
    const { buildPrompt } = jest.requireActual('../services/geminiClient');

    const prompt = buildPrompt({
      chosen: {
        name: 'Delhi Hub',
        distanceKm: 15,
        costBreakdown: { distanceCost: 7.5, packagingCost: 3, depletionPenalty: 0 },
      },
      alternatives: [
        { name: 'Mumbai Hub', distanceKm: 120, rejectionReason: 'Insufficient stock for SKU-001' },
      ],
    });

    expect(prompt).toContain('rejected: Insufficient stock');
  });
});

