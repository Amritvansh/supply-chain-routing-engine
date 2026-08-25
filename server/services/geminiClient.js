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
 * Week 4 additions:
 *   - Exponential backoff retry (max 2 retries, 3 total attempts)
 *   - Circuit breaker integration (skip Gemini when OPEN)
 *   - Structured Pino logging with request-aware context
 *
 * @module services/geminiClient
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../config/env');
const logger = require('./logger');
const circuitBreaker = require('./geminiCircuitBreaker');

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 3000;

/** Maximum number of retries (2 retries = 3 total attempts) */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff in ms */
const RETRY_BASE_DELAY_MS = 500;

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
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make a single Gemini API call with timeout.
 *
 * @param {string} prompt - The prompt to send
 * @returns {Promise<string>} The generated text
 * @throws {Error} on timeout, API error, or empty response
 */
async function callGemini(prompt) {
  const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  // Hard timeout via AbortController
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const result = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    const text = result.response.text().trim();
    if (!text) {
      throw new Error('Gemini returned empty response');
    }
    return text;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Generate an AI explanation for a routing decision.
 *
 * NEVER throws. Returns a result object with source='gemini' on success,
 * or source='fallback_template' on any failure.
 *
 * Flow:
 *   1. Check circuit breaker — if OPEN, skip to fallback
 *   2. Attempt Gemini call (up to 3 attempts with exponential backoff)
 *   3. On success → record success with circuit breaker, return
 *   4. On all failures → record failure, return fallback
 *
 * @param {Object} routingResult - Output from selectOptimalWarehouse()
 * @param {Object} [log] - Optional Pino child logger for request correlation
 * @returns {Promise<{ explanation: string, modelUsed: string, source: string, latencyMs: number }>}
 */
async function generateExplanation(routingResult, log) {
  const _log = log || logger;
  const startTime = Date.now();

  // If no API key, skip network call entirely
  if (!env.GEMINI_API_KEY) {
    _log.debug('No GEMINI_API_KEY set, using fallback template');
    return {
      explanation: buildFallbackExplanation(routingResult),
      modelUsed: 'n/a',
      source: 'fallback_template',
      latencyMs: Date.now() - startTime,
    };
  }

  // Check circuit breaker
  if (!circuitBreaker.isCallAllowed()) {
    const diagnostics = circuitBreaker.getDiagnostics();
    _log.warn(
      { circuitState: diagnostics.state, consecutiveFailures: diagnostics.consecutiveFailures },
      'Gemini circuit breaker OPEN, using fallback'
    );
    return {
      explanation: buildFallbackExplanation(routingResult),
      modelUsed: 'n/a',
      source: 'fallback_template',
      latencyMs: Date.now() - startTime,
    };
  }

  const prompt = buildPrompt(routingResult);

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        _log.info({ attempt: attempt + 1, delayMs: delay }, 'Retrying Gemini call');
        await sleep(delay);
      }

      const text = await callGemini(prompt);
      const latencyMs = Date.now() - startTime;

      // Success — record with circuit breaker
      circuitBreaker.recordSuccess();
      _log.info(
        { attempt: attempt + 1, latencyMs, source: 'gemini' },
        'Gemini explanation generated'
      );

      return {
        explanation: text,
        modelUsed: GEMINI_MODEL,
        source: 'gemini',
        latencyMs,
      };
    } catch (err) {
      const errMsg = err.name === 'AbortError'
        ? `Request timed out after ${GEMINI_TIMEOUT_MS}ms`
        : err.message;

      _log.warn(
        { attempt: attempt + 1, maxAttempts: MAX_RETRIES + 1, error: errMsg },
        'Gemini call failed'
      );

      // If this was the last attempt, record failure and fallback
      if (attempt === MAX_RETRIES) {
        circuitBreaker.recordFailure();
        const latencyMs = Date.now() - startTime;

        _log.warn(
          { latencyMs, source: 'fallback_template', totalAttempts: MAX_RETRIES + 1 },
          'All Gemini attempts exhausted, using fallback'
        );

        return {
          explanation: buildFallbackExplanation(routingResult),
          modelUsed: 'n/a',
          source: 'fallback_template',
          latencyMs,
        };
      }
    }
  }
}

module.exports = {
  generateExplanation,
  buildPrompt,
  buildFallbackExplanation,
  callGemini,
  GEMINI_MODEL,
  MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
};
