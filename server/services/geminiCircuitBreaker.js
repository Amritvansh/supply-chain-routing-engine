/**
 * Gemini Circuit Breaker — Failure Isolation for AI Explainability
 *
 * Implements a three-state circuit breaker (CLOSED → OPEN → HALF_OPEN)
 * to prevent repeated calls to a failing Gemini API from creating
 * latency pressure on the /explain endpoint.
 *
 * When the circuit is OPEN, callers skip Gemini entirely and use the
 * deterministic fallback template. After a configurable cooldown, the
 * circuit transitions to HALF_OPEN and allows one test call:
 *   - Success → CLOSED (resume normal operation)
 *   - Failure → OPEN (restart cooldown)
 *
 * States:
 *   CLOSED    — Normal. Calls go to Gemini.
 *   OPEN      — Tripped. All calls use fallback immediately.
 *   HALF_OPEN — Testing. One call goes to Gemini; outcome decides next state.
 *
 * Configuration via environment variables:
 *   GEMINI_FAILURE_THRESHOLD — consecutive failures to trip OPEN (default: 5)
 *   GEMINI_COOLDOWN_MS       — time in OPEN before HALF_OPEN (default: 60000)
 *
 * IMPORTANT: This module has NO dependency on Express, Gemini SDK, or
 * any I/O. It is a pure state machine. The caller (geminiClient.js)
 * checks the circuit before making Gemini calls and reports outcomes.
 *
 * @module services/geminiCircuitBreaker
 */

'use strict';

const env = require('../config/env');
const logger = require('./logger');

// ─── States ─────────────────────────────────────────────────
const STATE = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

// ─── Configuration ──────────────────────────────────────────
const FAILURE_THRESHOLD = env.GEMINI_FAILURE_THRESHOLD || 5;
const COOLDOWN_MS = env.GEMINI_COOLDOWN_MS || 60000;

// ─── Internal State ─────────────────────────────────────────
let state = STATE.CLOSED;
let consecutiveFailures = 0;
let lastFailureTime = null;

/**
 * Get the current circuit state. If the circuit is OPEN and the
 * cooldown has elapsed, transitions to HALF_OPEN automatically.
 *
 * @returns {string} One of 'CLOSED', 'OPEN', 'HALF_OPEN'
 */
function getState() {
  if (state === STATE.OPEN && lastFailureTime) {
    const elapsed = Date.now() - lastFailureTime;
    if (elapsed >= COOLDOWN_MS) {
      state = STATE.HALF_OPEN;
      logger.info(
        { elapsed, cooldownMs: COOLDOWN_MS },
        'Gemini circuit breaker transitioning to HALF_OPEN'
      );
    }
  }
  return state;
}

/**
 * Check whether a Gemini call is currently allowed.
 *
 * @returns {boolean} true if calls should proceed, false if fallback should be used
 */
function isCallAllowed() {
  const currentState = getState();
  return currentState === STATE.CLOSED || currentState === STATE.HALF_OPEN;
}

/**
 * Record a successful Gemini call. Resets the circuit to CLOSED.
 */
function recordSuccess() {
  if (state !== STATE.CLOSED) {
    logger.info(
      { previousState: state, consecutiveFailures },
      'Gemini circuit breaker reset to CLOSED after success'
    );
  }
  state = STATE.CLOSED;
  consecutiveFailures = 0;
  lastFailureTime = null;
}

/**
 * Record a failed Gemini call. Increments the failure counter and
 * trips the circuit to OPEN if the threshold is reached.
 */
function recordFailure() {
  consecutiveFailures++;
  lastFailureTime = Date.now();

  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    state = STATE.OPEN;
    logger.warn(
      { consecutiveFailures, threshold: FAILURE_THRESHOLD, cooldownMs: COOLDOWN_MS },
      'Gemini circuit breaker tripped to OPEN'
    );
  } else if (state === STATE.HALF_OPEN) {
    // HALF_OPEN test failed — back to OPEN
    state = STATE.OPEN;
    logger.warn(
      { consecutiveFailures },
      'Gemini circuit breaker HALF_OPEN test failed, returning to OPEN'
    );
  }
}

/**
 * Get diagnostics for monitoring/debugging.
 *
 * @returns {{ state: string, consecutiveFailures: number, lastFailureTime: number|null, config: Object }}
 */
function getDiagnostics() {
  return {
    state: getState(),
    consecutiveFailures,
    lastFailureTime,
    config: {
      failureThreshold: FAILURE_THRESHOLD,
      cooldownMs: COOLDOWN_MS,
    },
  };
}

/**
 * Reset the circuit breaker to initial state. Used only in tests.
 */
function reset() {
  state = STATE.CLOSED;
  consecutiveFailures = 0;
  lastFailureTime = null;
}

module.exports = {
  STATE,
  getState,
  isCallAllowed,
  recordSuccess,
  recordFailure,
  getDiagnostics,
  reset,
};
