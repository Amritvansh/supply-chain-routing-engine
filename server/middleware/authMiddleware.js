/**
 * Authentication & Authorization Middleware
 *
 * Three middleware functions for the JWT-based auth layer:
 *
 *   verifyToken     — Validates the Bearer token and attaches req.user
 *   requireHost     — Gates routes to users with role === 'host'
 *   requireCustomer — Gates routes to users with role === 'customer'
 *
 * Error responses follow the project's standard envelope:
 *   { error: { code, message } }
 */

'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Verify JWT from the Authorization header.
 *
 * Expects: Authorization: Bearer <token>
 *
 * On success, attaches the decoded payload to req.user:
 *   { id: UUID, role: 'customer' | 'host', iat, exp }
 *
 * On failure, returns 401.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed authorization token',
      },
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    // Handle specific JWT errors for better debugging
    let message = 'Invalid or expired token';
    if (err.name === 'TokenExpiredError') {
      message = 'Token has expired — please log in again';
    } else if (err.name === 'JsonWebTokenError') {
      message = 'Invalid token signature';
    }

    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message,
      },
    });
  }
}

/**
 * Require the authenticated user to have role === 'host'.
 * Must be placed AFTER verifyToken in the middleware chain.
 */
function requireHost(req, res, next) {
  if (!req.user || req.user.role !== 'host') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'This endpoint requires Host privileges',
      },
    });
  }
  next();
}

/**
 * Require the authenticated user to have role === 'customer'.
 * Must be placed AFTER verifyToken in the middleware chain.
 */
function requireCustomer(req, res, next) {
  if (!req.user || req.user.role !== 'customer') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'This endpoint requires Customer privileges',
      },
    });
  }
  next();
}

module.exports = {
  verifyToken,
  requireHost,
  requireCustomer,
};
