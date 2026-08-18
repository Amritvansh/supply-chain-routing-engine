/**
 * Gemini AI Explanation Client — Async Explainability Layer
 *
 * Generates plain-language explanations of deterministic routing
 * decisions using Google's Gemini API. This module is the bridge
 * between the math-only routing engine and human-readable output.
 *
 * CRITICAL ARCHITECTURAL RULES:
 *   1. This module does NOT make routing decisions.
 *      The routing engine already chose the warehouse, computed costs,
 *      and built the alternatives array. Gemini only translates those
 *      numbers into words.
 *   2. This module must NEVER be called from the checkout path.
 *   3. This module NEVER throws. On any Gemini failure, it returns
 *      a deterministic fallback string built from the same inputs.
 *
 * @module services/geminiClient
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env');

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 3000;

/**
 * Build a structured prompt from routing engine output.
 *
 * The prompt contains ONLY deterministic values already computed
 * by the routing engine — never raw user input.
 *
 * @param {Object} routingResult - Output from selectOptimalWarehouse()
 * @returns {string}
 */
function buildPrompt(routingResult) {
  const { chosen, alternatives } = routingResult;

  const altDescriptions = alternatives
    .map(alt => {
      if (alt.rejectionReason) {
        return `${alt.name} (${alt.distanceKm}km, rejected: ${alt.rejectionReason})`;
      }
      return `${alt.name} (${alt.distanceKm}km, penalty ${alt.penalty}, total cost ${alt.totalCost})`;
    })
    .join('; ');

  return (
    `A warehouse routing engine chose Warehouse ${chosen.name} (${chosen.distanceKm}km) over ` +
    `alternatives [${altDescriptions}]. ` +
    `Chosen warehouse cost breakdown: distance_cost=${chosen.costBreakdown.distanceCost}, ` +
    `packaging_cost=${chosen.costBreakdown.packagingCost}, ` +
    `depletion_penalty=${chosen.costBreakdown.depletionPenalty}. ` +
    `In 2-3 plain-language sentences, explain why this warehouse was chosen over the closer/cheaper ` +
    `alternatives, referencing the specific numbers. No greetings, no markdown, no disclaimers.`
  );
}

/**
 * Build a deterministic fallback explanation from routing data.
 * Used when Gemini is unavailable, times out, or hits quota.
 *
 * @param {Object} routingResult - Output from selectOptimalWarehouse()
 * @returns {string}
 */
function buildFallbackExplanation(routingResult) {
  const { chosen, alternatives } = routingResult;
  const cb = chosen.costBreakdown;

  // Find the closest alternative that was scored (not rejected for stock)
  const scoredAlts = alternatives.filter(a => a.totalCost !== null);

  if (scoredAlts.length === 0) {
    return (
      `Routed to ${chosen.name} (${chosen.distanceKm}km) as the only eligible warehouse. ` +
      `Total cost: ${chosen.totalCost} (distance: ${cb.distanceCost}, ` +
      `packaging: ${cb.packagingCost}, depletion penalty: ${cb.depletionPenalty}).`
    );
  }

  const closestAlt = scoredAlts[0];

  return (
    `Routed to ${chosen.name} (${chosen.distanceKm}km, total cost ${chosen.totalCost}) ` +
    `over ${closestAlt.name} (${closestAlt.distanceKm}km, total cost ${closestAlt.totalCost}) ` +
    `because the combined distance cost (${cb.distanceCost}), packaging cost (${cb.packagingCost}), ` +
    `and depletion penalty (${cb.depletionPenalty}) resulted in a lower overall routing score.`
  );
}

/**
 * Generate an AI explanation for a routing decision.
 *
 * NEVER throws. Returns a result object with source='gemini' on success,
 * or source='fallback_template' on any failure.
 *
 * @param {Object} routingResult - Output from selectOptimalWarehouse()
 * @returns {Promise<{ explanation: string, modelUsed: string, source: string, latencyMs: number }>}
 */
async function generateExplanation(routingResult) {
  const startTime = Date.now();

  // If no API key, skip network call entirely
  if (!env.GEMINI_API_KEY) {
    return {
      explanation: buildFallbackExplanation(routingResult),
      modelUsed: 'n/a',
      source: 'fallback_template',
      latencyMs: Date.now() - startTime,
    };
  }

  try {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = buildPrompt(routingResult);

    // Hard timeout via AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const result = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const text = result.response.text().trim();
    const latencyMs = Date.now() - startTime;

    if (!text) {
      console.warn('[Gemini] Empty response, using fallback');
      return {
        explanation: buildFallbackExplanation(routingResult),
        modelUsed: GEMINI_MODEL,
        source: 'fallback_template',
        latencyMs,
      };
    }

    return {
      explanation: text,
      modelUsed: GEMINI_MODEL,
      source: 'gemini',
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;

    if (err.name === 'AbortError') {
      console.warn(`[Gemini] Request timed out after ${GEMINI_TIMEOUT_MS}ms, using fallback`);
    } else {
      console.warn(`[Gemini] API error: ${err.message}, using fallback`);
    }

    return {
      explanation: buildFallbackExplanation(routingResult),
      modelUsed: 'n/a',
      source: 'fallback_template',
      latencyMs,
    };
  }
}

module.exports = {
  generateExplanation,
  buildPrompt,
  buildFallbackExplanation,
  GEMINI_MODEL,
};
