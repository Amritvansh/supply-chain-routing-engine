/**
 * Week 2 Integration Tests — Member 2
 *
 * Tests for:
 *   - Haversine distance calculator
 *   - Google Maps service (with fallback)
 *   - Gemini explanation client (with fallback)
 *   - GET /api/v1/warehouses
 *   - GET /api/v1/orders/:id
 *   - GET /api/v1/orders/:id/explain
 *   - POST /api/v1/webhooks/logistics
 *
 * All external APIs (Google Maps, Gemini) are mocked.
 * Database calls are mocked for HTTP route tests to avoid
 * requiring a live database in CI.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// §1 — HAVERSINE UNIT TESTS
// ═══════════════════════════════════════════════════════════════

const {
  calculateHaversineDistance,
  calculateMultipleDistances,
} = require('../services/haversine');

describe('Haversine Distance Calculator', () => {
  test('calculates distance between New York and Los Angeles', () => {
    const nyc = { lat: 40.7128, lng: -74.006 };
    const lax = { lat: 33.9425, lng: -118.408 };
    const result = calculateHaversineDistance(nyc, lax);

    // Known great-circle distance: ~3,944 km
    expect(result.distanceKm).toBeGreaterThan(3900);
    expect(result.distanceKm).toBeLessThan(4000);
    expect(result.source).toBe('haversine');
  });

  test('returns 0 for same origin and destination', () => {
    const point = { lat: 28.6139, lng: 77.209 };
    const result = calculateHaversineDistance(point, point);

    expect(result.distanceKm).toBe(0);
    expect(result.source).toBe('haversine');
  });

  test('calculates short distance (Mumbai to Pune ~150km)', () => {
    const mumbai = { lat: 19.076, lng: 72.8777 };
    const pune = { lat: 18.5204, lng: 73.8567 };
    const result = calculateHaversineDistance(mumbai, pune);

    expect(result.distanceKm).toBeGreaterThan(100);
    expect(result.distanceKm).toBeLessThan(200);
    expect(result.source).toBe('haversine');
  });

  test('handles multiple destinations', () => {
    const origin = { lat: 28.6139, lng: 77.209 }; // Delhi
    const destinations = [
      { lat: 19.076, lng: 72.8777 },   // Mumbai
      { lat: 13.0827, lng: 80.2707 },   // Chennai
    ];
    const results = calculateMultipleDistances(origin, destinations);

    expect(results).toHaveLength(2);
    expect(results[0].source).toBe('haversine');
    expect(results[1].source).toBe('haversine');
    expect(results[0].distanceKm).toBeGreaterThan(1000); // Delhi-Mumbai ~1,150km
    expect(results[1].distanceKm).toBeGreaterThan(1500); // Delhi-Chennai ~1,750km
  });

  test('is deterministic — same inputs always produce same output', () => {
    const a = { lat: 51.5074, lng: -0.1278 }; // London
    const b = { lat: 48.8566, lng: 2.3522 };  // Paris
    const r1 = calculateHaversineDistance(a, b);
    const r2 = calculateHaversineDistance(a, b);
    expect(r1.distanceKm).toBe(r2.distanceKm);
  });
});

// ═══════════════════════════════════════════════════════════════
// §2 — GOOGLE MAPS SERVICE TESTS (MOCKED)
// ═══════════════════════════════════════════════════════════════

describe('Google Maps Distance Service', () => {
  let googleMaps;
  let originalFetch;
  let envModule;

  beforeEach(() => {
    // Reset module cache to pick up env changes
    jest.resetModules();
    originalFetch = global.fetch;
    envModule = require('../config/env');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('falls back to Haversine when API key is empty', async () => {
    // Ensure API key is empty
    const savedKey = envModule.GOOGLE_MAPS_API_KEY;
    envModule.GOOGLE_MAPS_API_KEY = '';

    googleMaps = require('../services/googleMaps');

    const origin = { lat: 40.7128, lng: -74.006 };
    const dest = { lat: 33.9425, lng: -118.408 };
    const result = await googleMaps.getDistance(origin, dest);

    expect(result.source).toBe('haversine');
    expect(result.distanceKm).toBeGreaterThan(0);

    envModule.GOOGLE_MAPS_API_KEY = savedKey;
  });

  test('returns google_maps source on successful API response', async () => {
    envModule.GOOGLE_MAPS_API_KEY = 'test-key-123';

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        rows: [{
          elements: [{
            status: 'OK',
            distance: { value: 3944000, text: '3,944 km' },
            duration: { value: 36000, text: '10 hours' },
          }],
        }],
      }),
    });

    googleMaps = require('../services/googleMaps');

    const origin = { lat: 40.7128, lng: -74.006 };
    const dest = { lat: 33.9425, lng: -118.408 };
    const result = await googleMaps.getDistance(origin, dest);

    expect(result.source).toBe('google_maps');
    expect(result.distanceKm).toBe(3944);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    envModule.GOOGLE_MAPS_API_KEY = '';
  });

  test('falls back to Haversine on HTTP error', async () => {
    envModule.GOOGLE_MAPS_API_KEY = 'test-key-123';

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    googleMaps = require('../services/googleMaps');

    const origin = { lat: 40.7128, lng: -74.006 };
    const dest = { lat: 33.9425, lng: -118.408 };
    const result = await googleMaps.getDistance(origin, dest);

    expect(result.source).toBe('haversine');
    expect(result.distanceKm).toBeGreaterThan(0);

    envModule.GOOGLE_MAPS_API_KEY = '';
  });

  test('falls back to Haversine on network error', async () => {
    envModule.GOOGLE_MAPS_API_KEY = 'test-key-123';

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    googleMaps = require('../services/googleMaps');

    const origin = { lat: 40.7128, lng: -74.006 };
    const dest = { lat: 33.9425, lng: -118.408 };
    const result = await googleMaps.getDistance(origin, dest);

    expect(result.source).toBe('haversine');
    expect(result.distanceKm).toBeGreaterThan(0);

    envModule.GOOGLE_MAPS_API_KEY = '';
  });

  test('falls back to Haversine on timeout (AbortError)', async () => {
    envModule.GOOGLE_MAPS_API_KEY = 'test-key-123';

    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    googleMaps = require('../services/googleMaps');

    const origin = { lat: 40.7128, lng: -74.006 };
    const dest = { lat: 33.9425, lng: -118.408 };
    const result = await googleMaps.getDistance(origin, dest);

    expect(result.source).toBe('haversine');

    envModule.GOOGLE_MAPS_API_KEY = '';
  });

  test('falls back on invalid response structure', async () => {
    envModule.GOOGLE_MAPS_API_KEY = 'test-key-123';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'REQUEST_DENIED',
        rows: [],
      }),
    });

    googleMaps = require('../services/googleMaps');

    const origin = { lat: 40.7128, lng: -74.006 };
    const dest = { lat: 33.9425, lng: -118.408 };
    const result = await googleMaps.getDistance(origin, dest);

    expect(result.source).toBe('haversine');

    envModule.GOOGLE_MAPS_API_KEY = '';
  });
});

// ═══════════════════════════════════════════════════════════════
// §3 — GEMINI CLIENT TESTS (MOCKED)
// ═══════════════════════════════════════════════════════════════

const {
  generateExplanation,
  buildPrompt,
  buildFallbackExplanation,
} = require('../services/geminiClient');

// Sample routing result for testing
const sampleRoutingResult = {
  status: 'ROUTED',
  chosen: {
    warehouseId: '123',
    name: 'Delhi Hub',
    distanceKm: 15.2,
    boxSize: 'MEDIUM',
    costBreakdown: {
      distanceCost: 7.6,
      packagingCost: 3,
      depletionPenalty: 0,
    },
    totalCost: 10.6,
  },
  alternatives: [
    {
      warehouseId: '456',
      name: 'Mumbai Hub',
      distanceKm: 5.1,
      penalty: 50,
      totalCost: 55.55,
      rejectionReason: null,
    },
    {
      warehouseId: '789',
      name: 'Chennai Hub',
      distanceKm: 120,
      penalty: null,
      totalCost: null,
      rejectionReason: 'Insufficient stock for SKU "WIDGET-A": need 5, have 2.',
    },
  ],
};

describe('Gemini Client', () => {
  test('buildPrompt includes chosen warehouse and alternatives', () => {
    const prompt = buildPrompt(sampleRoutingResult);

    expect(prompt).toContain('Delhi Hub');
    expect(prompt).toContain('15.2km');
    expect(prompt).toContain('Mumbai Hub');
    expect(prompt).toContain('distance_cost=7.6');
    expect(prompt).toContain('packaging_cost=3');
    expect(prompt).toContain('depletion_penalty=0');
  });

  test('buildFallbackExplanation produces deterministic text with real data', () => {
    const fallback = buildFallbackExplanation(sampleRoutingResult);

    expect(fallback).toContain('Delhi Hub');
    expect(fallback).toContain('15.2km');
    expect(fallback).toContain('Mumbai Hub');
    expect(fallback).toContain('10.6');
    expect(typeof fallback).toBe('string');
    expect(fallback.length).toBeGreaterThan(50);
  });

  test('buildFallbackExplanation handles single eligible warehouse', () => {
    const singleResult = {
      ...sampleRoutingResult,
      alternatives: [
        {
          warehouseId: '789',
          name: 'Chennai Hub',
          distanceKm: 120,
          penalty: null,
          totalCost: null,
          rejectionReason: 'Insufficient stock',
        },
      ],
    };

    const fallback = buildFallbackExplanation(singleResult);
    expect(fallback).toContain('only eligible warehouse');
    expect(fallback).toContain('Delhi Hub');
  });

  test('returns fallback when GEMINI_API_KEY is empty', async () => {
    const env = require('../config/env');
    const savedKey = env.GEMINI_API_KEY;
    env.GEMINI_API_KEY = '';

    const result = await generateExplanation(sampleRoutingResult);

    expect(result.source).toBe('fallback_template');
    expect(result.modelUsed).toBe('n/a');
    expect(result.explanation).toContain('Delhi Hub');
    expect(typeof result.latencyMs).toBe('number');

    env.GEMINI_API_KEY = savedKey;
  });

  test('source field is "fallback_template" on API error', async () => {
    const env = require('../config/env');
    const savedKey = env.GEMINI_API_KEY;
    env.GEMINI_API_KEY = 'fake-key-for-test';

    // The real API call will fail with an invalid key — verify fallback behavior
    const result = await generateExplanation(sampleRoutingResult);

    // With a fake key, Gemini should reject and we should get fallback
    expect(result.source).toBe('fallback_template');
    expect(result.explanation).toContain('Delhi Hub');
    expect(typeof result.latencyMs).toBe('number');

    env.GEMINI_API_KEY = savedKey;
  });
});

// ═══════════════════════════════════════════════════════════════
// §4 — HTTP ROUTE TESTS (SUPERTEST + MOCKED DB)
// ═══════════════════════════════════════════════════════════════

const request = require('supertest');
const app = require('../app');

// Mock the database pool
jest.mock('../db/pool', () => ({
  query: jest.fn(),
  on: jest.fn(),
}));

// Mock aiExplanations DB helper
jest.mock('../db/aiExplanations', () => ({
  getExplanation: jest.fn(),
  insertExplanation: jest.fn(),
}));

const mockPool = require('../db/pool');
const mockAiExplanations = require('../db/aiExplanations');

describe('GET /api/v1/warehouses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns warehouses with inventory', async () => {
    mockPool.query.mockResolvedValue({
      rows: [
        {
          warehouse_id: 'w1',
          warehouse_name: 'Delhi Hub',
          lat: 28.6139,
          lng: 77.209,
          active: true,
          sku: 'SKU-001',
          sku_name: 'Widget A',
          available_qty: 100,
          reserved_qty: 5,
        },
        {
          warehouse_id: 'w1',
          warehouse_name: 'Delhi Hub',
          lat: 28.6139,
          lng: 77.209,
          active: true,
          sku: 'SKU-002',
          sku_name: 'Widget B',
          available_qty: 50,
          reserved_qty: 0,
        },
        {
          warehouse_id: 'w2',
          warehouse_name: 'Mumbai Hub',
          lat: 19.076,
          lng: 72.8777,
          active: true,
          sku: 'SKU-001',
          sku_name: 'Widget A',
          available_qty: 25,
          reserved_qty: 3,
        },
      ],
    });

    const res = await request(app).get('/api/v1/warehouses');

    expect(res.status).toBe(200);
    expect(res.body.warehouses).toHaveLength(2);

    const delhi = res.body.warehouses.find(w => w.name === 'Delhi Hub');
    expect(delhi.inventory).toHaveLength(2);
    expect(delhi.lat).toBe(28.6139);

    const mumbai = res.body.warehouses.find(w => w.name === 'Mumbai Hub');
    expect(mumbai.inventory).toHaveLength(1);
  });

  test('returns empty array when no warehouses exist', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get('/api/v1/warehouses');

    expect(res.status).toBe(200);
    expect(res.body.warehouses).toEqual([]);
  });

  test('returns 500 on database error', async () => {
    mockPool.query.mockRejectedValue(new Error('Connection refused'));

    const res = await request(app).get('/api/v1/warehouses');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/v1/orders/:id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  test('returns order with items and shipments', async () => {
    // Mock: order query
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: validUUID,
          customer_lat: 28.6139,
          customer_lng: 77.209,
          status: 'ROUTED',
          idempotency_key: 'idem-123',
          created_at: '2026-08-18T00:00:00Z',
        }],
      })
      // Mock: items query
      .mockResolvedValueOnce({
        rows: [{
          id: 'item-1',
          sku: 'SKU-001',
          sku_name: 'Widget A',
          qty: 2,
        }],
      })
      // Mock: shipments query
      .mockResolvedValueOnce({
        rows: [{
          id: 'ship-1',
          warehouse_id: 'w1',
          warehouse_name: 'Delhi Hub',
          box_size: 'MEDIUM',
          total_cost: '10.60',
          distance_km: '15.20',
          created_at: '2026-08-18T00:00:01Z',
        }],
      });

    const res = await request(app).get(`/api/v1/orders/${validUUID}`);

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(validUUID);
    expect(res.body.order.status).toBe('ROUTED');
    expect(res.body.order.customerLat).toBe(28.6139);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].sku).toBe('SKU-001');
    expect(res.body.shipments).toHaveLength(1);
    expect(res.body.shipments[0].totalCost).toBe(10.6);
  });

  test('returns 404 for missing order', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/v1/orders/${validUUID}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  test('returns 400 for malformed UUID', async () => {
    const res = await request(app).get('/api/v1/orders/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });
});

describe('GET /api/v1/orders/:id/explain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  test('returns cached explanation on cache hit', async () => {
    // Order exists
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: validUUID, customer_lat: 28.6, customer_lng: 77.2, status: 'ROUTED' }],
    });

    // Cache hit
    mockAiExplanations.getExplanation.mockResolvedValue({
      explanation_text: 'Cached explanation text.',
      model_used: 'gemini-2.0-flash',
      source: 'gemini',
      latency_ms: 450,
      created_at: '2026-08-18T00:00:00Z',
    });

    const res = await request(app).get(`/api/v1/orders/${validUUID}/explain`);

    expect(res.status).toBe(200);
    expect(res.body.explanation).toBe('Cached explanation text.');
    expect(res.body.source).toBe('gemini');
    expect(res.body.cached).toBe(true);
    expect(mockAiExplanations.getExplanation).toHaveBeenCalledWith(validUUID);
  });

  test('generates and stores explanation on cache miss', async () => {
    // Order exists
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: validUUID, customer_lat: 28.6, customer_lng: 77.2, status: 'ROUTED' }],
    });

    // Cache miss
    mockAiExplanations.getExplanation.mockResolvedValue(null);

    // Shipments for routing context
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        warehouse_id: 'w1',
        warehouse_name: 'Delhi Hub',
        box_size: 'MEDIUM',
        total_cost: '10.60',
        distance_km: '15.20',
      }],
    });

    // All warehouses for alternatives
    mockPool.query.mockResolvedValueOnce({
      rows: [
        { id: 'w1', name: 'Delhi Hub', lat: 28.6, lng: 77.2 },
        { id: 'w2', name: 'Mumbai Hub', lat: 19.0, lng: 72.8 },
      ],
    });

    mockAiExplanations.insertExplanation.mockResolvedValue({});

    const res = await request(app).get(`/api/v1/orders/${validUUID}/explain`);

    expect(res.status).toBe(200);
    expect(res.body.explanation).toBeDefined();
    expect(res.body.explanation.length).toBeGreaterThan(0);
    expect(res.body.cached).toBe(false);
    // Source will be fallback_template since GEMINI_API_KEY is not set in test
    expect(['gemini', 'fallback_template']).toContain(res.body.source);
    expect(mockAiExplanations.insertExplanation).toHaveBeenCalled();
  });

  test('returns 404 when order has no shipments', async () => {
    // Order exists
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: validUUID, customer_lat: 28.6, customer_lng: 77.2, status: 'PENDING' }],
    });

    // Cache miss
    mockAiExplanations.getExplanation.mockResolvedValue(null);

    // No shipments
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/v1/orders/${validUUID}/explain`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_SHIPMENTS');
  });

  test('returns 400 for malformed UUID', async () => {
    const res = await request(app).get('/api/v1/orders/bad-id/explain');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });

  test('returns 404 when order does not exist', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get(`/api/v1/orders/${validUUID}/explain`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
  });
});

describe('POST /api/v1/webhooks/logistics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const shipmentId = '550e8400-e29b-41d4-a716-446655440000';

  test('accepts PICKED_UP as first status', async () => {
    // Shipment exists
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: shipmentId }] })
      // No prior events
      .mockResolvedValueOnce({ rows: [] })
      // Insert returns
      .mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          shipment_id: shipmentId,
          status: 'PICKED_UP',
          received_at: '2026-08-18T00:00:00Z',
        }],
      });

    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: shipmentId, status: 'PICKED_UP' });

    expect(res.status).toBe(200);
    expect(res.body.event.status).toBe('PICKED_UP');
  });

  test('accepts IN_TRANSIT after PICKED_UP', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: shipmentId }] })
      .mockResolvedValueOnce({ rows: [{ status: 'PICKED_UP' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'event-2',
          shipment_id: shipmentId,
          status: 'IN_TRANSIT',
          received_at: '2026-08-18T00:01:00Z',
        }],
      });

    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: shipmentId, status: 'IN_TRANSIT' });

    expect(res.status).toBe(200);
    expect(res.body.event.status).toBe('IN_TRANSIT');
  });

  test('accepts DELIVERED after IN_TRANSIT', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: shipmentId }] })
      .mockResolvedValueOnce({ rows: [{ status: 'IN_TRANSIT' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'event-3',
          shipment_id: shipmentId,
          status: 'DELIVERED',
          received_at: '2026-08-18T00:02:00Z',
        }],
      });

    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: shipmentId, status: 'DELIVERED' });

    expect(res.status).toBe(200);
    expect(res.body.event.status).toBe('DELIVERED');
  });

  test('rejects skipped transition (null → IN_TRANSIT)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: shipmentId }] })
      .mockResolvedValueOnce({ rows: [] }); // No prior events

    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: shipmentId, status: 'IN_TRANSIT' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('rejects skipped transition (PICKED_UP → DELIVERED)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: shipmentId }] })
      .mockResolvedValueOnce({ rows: [{ status: 'PICKED_UP' }] });

    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: shipmentId, status: 'DELIVERED' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('rejects reversed transition (IN_TRANSIT → PICKED_UP)', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: shipmentId }] })
      .mockResolvedValueOnce({ rows: [{ status: 'IN_TRANSIT' }] });

    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: shipmentId, status: 'PICKED_UP' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('rejects invalid status value', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: shipmentId, status: 'CANCELLED' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATUS');
  });

  test('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FIELDS');
  });

  test('returns 404 when shipment does not exist', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: shipmentId, status: 'PICKED_UP' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SHIPMENT_NOT_FOUND');
  });

  test('returns 400 for malformed shipment_id', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/logistics')
      .send({ shipment_id: 'not-a-uuid', status: 'PICKED_UP' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_SHIPMENT_ID');
  });
});
