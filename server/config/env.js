/**
 * Environment Configuration
 *
 * Centralizes all environment variable loading via dotenv.
 * Never hard-code credentials — all sensitive values come from .env.
 */
require('dotenv').config();

const env = {
  // Server
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // PostgreSQL connection string
  DATABASE_URL: process.env.DATABASE_URL,

  // Redis connection string (used for distributed locking)
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Google Maps Distance Matrix API key (optional — falls back to haversine)
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',

  // Google Gemini API key (async AI explainability, free tier)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  // ─── Week 4: Rate Limiting ────────────────────────────────
  // Sliding window duration for checkout rate limiter (ms)
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  // Max checkout requests per IP per window
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX, 10) || 30,

  // ─── Week 4: Gemini Circuit Breaker ───────────────────────
  // Consecutive Gemini failures before tripping the circuit to OPEN
  GEMINI_FAILURE_THRESHOLD: parseInt(process.env.GEMINI_FAILURE_THRESHOLD, 10) || 5,
  // Duration in ms to keep circuit OPEN before testing with HALF_OPEN
  GEMINI_COOLDOWN_MS: parseInt(process.env.GEMINI_COOLDOWN_MS, 10) || 60000,
};

module.exports = env;
