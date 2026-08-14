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
};

module.exports = env;
