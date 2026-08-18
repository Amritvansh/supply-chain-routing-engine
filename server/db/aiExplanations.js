/**
 * AI Explanations — Database Access Helper
 *
 * Provides read/write access to the ai_explanations table for
 * Member 2's Gemini service layer. This module is strictly a
 * data-access helper — it contains NO AI logic, NO Gemini calls,
 * and NO routing logic.
 *
 * ARCHITECTURAL RULE:
 *   The checkout transaction (checkoutTransaction.js) must NEVER
 *   import or call this module. ai_explanations is a leaf table
 *   decoupled from the deterministic core. If this table is empty
 *   or corrupted, no order or inventory data is affected.
 *
 * @module db/aiExplanations
 */

'use strict';

const { Client } = require('pg');
const path = require('path');

// Load .env from the server directory
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/**
 * Get a connected database client.
 * In production, Member 2 will replace this with a shared pool.
 * For now, this helper manages its own connections.
 *
 * @returns {Promise<Client>}
 */
async function getClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  return client;
}

/**
 * Insert (or upsert) an AI explanation for an order.
 *
 * Uses ON CONFLICT (order_id) DO UPDATE to handle the case where
 * a cached fallback is later replaced by a real Gemini explanation.
 *
 * @param {string} orderId     - UUID of the order
 * @param {string} text        - The explanation text
 * @param {string} modelUsed   - e.g. 'gemini-1.5-flash' or 'n/a'
 * @param {string} source      - 'gemini' or 'fallback_template'
 * @param {number|null} latencyMs - Gemini API latency in ms, or null
 * @returns {Promise<Object>} The inserted/updated row
 */
async function insertExplanation(orderId, text, modelUsed, source, latencyMs) {
  const client = await getClient();
  try {
    const { rows } = await client.query(
      `INSERT INTO ai_explanations (order_id, explanation_text, model_used, source, latency_ms)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id) DO UPDATE SET
         explanation_text = EXCLUDED.explanation_text,
         model_used = EXCLUDED.model_used,
         source = EXCLUDED.source,
         latency_ms = EXCLUDED.latency_ms,
         created_at = now()
       RETURNING *`,
      [orderId, text, modelUsed, source, latencyMs]
    );
    return rows[0];
  } finally {
    await client.end();
  }
}

/**
 * Retrieve the cached AI explanation for an order.
 *
 * @param {string} orderId - UUID of the order
 * @returns {Promise<Object|null>} The explanation row, or null if not cached
 */
async function getExplanation(orderId) {
  const client = await getClient();
  try {
    const { rows } = await client.query(
      `SELECT id, order_id, explanation_text, model_used, source, latency_ms, created_at
       FROM ai_explanations
       WHERE order_id = $1`,
      [orderId]
    );
    return rows.length > 0 ? rows[0] : null;
  } finally {
    await client.end();
  }
}

module.exports = {
  insertExplanation,
  getExplanation,
};
