/**
 * Authentication Routes
 *
 * Mounted at /api/v1/auth
 *
 *   POST /register  — Create a new user account
 *   POST /login     — Authenticate and receive a JWT
 *   GET  /me        — Get the current user's profile (protected)
 */

'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');

const router = Router();

// Public routes (no JWT required)
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected route (valid JWT required)
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
