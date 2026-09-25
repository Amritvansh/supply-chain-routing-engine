/**
 * Authentication Controller
 *
 * Handles user registration, login, and profile retrieval.
 *
 * Endpoints:
 *   POST /api/v1/auth/register  — Create a new customer or host account
 *   POST /api/v1/auth/login     — Authenticate and receive a JWT
 *   GET  /api/v1/auth/me        — Return the current user (requires valid JWT)
 *
 * Security:
 *   - Passwords hashed with bcrypt (12 rounds)
 *   - JWT signed with HS256 using env.JWT_SECRET
 *   - Tokens include user id and role in the payload
 *   - Email uniqueness enforced at the database level
 */

'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const env = require('../config/env');

const BCRYPT_ROUNDS = 12;

/**
 * POST /api/v1/auth/register
 *
 * Body: { name, email, password, role? }
 *   - role defaults to 'customer' if not provided
 *   - role must be 'customer' or 'host'
 *
 * Returns: { user: { id, name, email, role, created_at }, token }
 */
async function register(req, res) {
  const { name, email, password, role } = req.body;

  // ─── Input Validation ─────────────────────────────────────
  if (!name || !email || !password) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'name, email, and password are required',
      },
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Password must be at least 6 characters long',
      },
    });
  }

  const userRole = role || 'customer';
  if (!['customer', 'host'].includes(userRole)) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: "Role must be 'customer' or 'host'",
      },
    });
  }

  try {
    // ─── Check for existing user ──────────────────────────────
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'An account with this email already exists',
        },
      });
    }

    // ─── Hash password ────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // ─── Insert user ──────────────────────────────────────────
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name.trim(), email.toLowerCase().trim(), passwordHash, userRole]
    );

    const user = result.rows[0];

    // ─── Generate JWT ─────────────────────────────────────────
    const token = jwt.sign(
      { id: user.id, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
      token,
    });
  } catch (err) {
    // Handle unique constraint violation (race condition)
    if (err.code === '23505') {
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_EMAIL',
          message: 'An account with this email already exists',
        },
      });
    }

    console.error('[Auth] Registration error:', err.message);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Registration failed — please try again',
      },
    });
  }
}

/**
 * POST /api/v1/auth/login
 *
 * Body: { email, password }
 *
 * Returns: { user: { id, name, email, role, created_at }, token }
 */
async function login(req, res) {
  const { email, password } = req.body;

  // ─── Input Validation ─────────────────────────────────────
  if (!email || !password) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'email and password are required',
      },
    });
  }

  try {
    // ─── Find user by email ───────────────────────────────────
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    const user = result.rows[0];

    // ─── Verify password ──────────────────────────────────────
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // ─── Generate JWT ─────────────────────────────────────────
    const token = jwt.sign(
      { id: user.id, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
      token,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Login failed — please try again',
      },
    });
  }
}

/**
 * GET /api/v1/auth/me
 *
 * Requires: verifyToken middleware (sets req.user)
 *
 * Returns: { user: { id, name, email, role, created_at } }
 */
async function getMe(req, res) {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found',
        },
      });
    }

    return res.status(200).json({
      user: result.rows[0],
    });
  } catch (err) {
    console.error('[Auth] Get profile error:', err.message);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to retrieve user profile',
      },
    });
  }
}

module.exports = {
  register,
  login,
  getMe,
};
