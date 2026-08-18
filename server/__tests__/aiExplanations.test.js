/**
 * Unit Tests — AI Explanations Database Helper
 *
 * Tests the data-access layer for the ai_explanations leaf table.
 * These tests require a live PostgreSQL connection with migrations applied.
 * If DATABASE_URL is not set, tests are skipped.
 */

'use strict';

const path = require('path');

// Load .env for DATABASE_URL
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const hasDb = !!process.env.DATABASE_URL;

// Conditionally skip the entire suite if no database is available
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('aiExplanations (requires PostgreSQL)', () => {
  const { Client } = require('pg');
  const { insertExplanation, getExplanation } = require('../db/aiExplanations');

  let testOrderId;
  let pgClient;

  beforeAll(async () => {
    pgClient = new Client({ connectionString: process.env.DATABASE_URL });
    await pgClient.connect();

    // Create a test order to satisfy the foreign key constraint
    const { rows } = await pgClient.query(
      `INSERT INTO orders (customer_lat, customer_lng, status, idempotency_key)
       VALUES (19.076, 72.877, 'PENDING', $1)
       RETURNING id`,
      [`test-idem-key-${Date.now()}`]
    );
    testOrderId = rows[0].id;
  });

  afterAll(async () => {
    // Clean up: remove the test explanation and order
    if (testOrderId) {
      await pgClient.query('DELETE FROM ai_explanations WHERE order_id = $1', [testOrderId]);
      await pgClient.query('DELETE FROM orders WHERE id = $1', [testOrderId]);
    }
    await pgClient.end();
  });

  test('getExplanation returns null for an order with no explanation', async () => {
    const result = await getExplanation(testOrderId);
    expect(result).toBeNull();
  });

  test('insertExplanation stores an explanation and returns it', async () => {
    const result = await insertExplanation(
      testOrderId,
      'Routed to Mumbai warehouse because it was closest with healthy stock.',
      'gemini-1.5-flash',
      'gemini',
      245
    );

    expect(result).toBeDefined();
    expect(result.order_id).toBe(testOrderId);
    expect(result.explanation_text).toContain('Mumbai');
    expect(result.model_used).toBe('gemini-1.5-flash');
    expect(result.source).toBe('gemini');
    expect(result.latency_ms).toBe(245);
  });

  test('getExplanation retrieves a stored explanation', async () => {
    const result = await getExplanation(testOrderId);

    expect(result).not.toBeNull();
    expect(result.order_id).toBe(testOrderId);
    expect(result.explanation_text).toContain('Mumbai');
    expect(result.source).toBe('gemini');
  });

  test('insertExplanation upserts on conflict (replaces existing)', async () => {
    const result = await insertExplanation(
      testOrderId,
      'Updated explanation with more detail.',
      'gemini-1.5-flash',
      'fallback_template',
      null
    );

    expect(result.explanation_text).toContain('Updated');
    expect(result.source).toBe('fallback_template');
    expect(result.latency_ms).toBeNull();
  });
});

// Always-running test to confirm module exports exist
describe('aiExplanations module exports', () => {
  test('exports insertExplanation and getExplanation functions', () => {
    const mod = require('../db/aiExplanations');
    expect(typeof mod.insertExplanation).toBe('function');
    expect(typeof mod.getExplanation).toBe('function');
  });
});
