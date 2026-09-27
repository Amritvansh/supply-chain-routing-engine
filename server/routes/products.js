/**
 * Product Routes — Customer Catalog + Host Management
 *
 * PUBLIC (no auth):
 *   GET /api/v1/products            — List all products (search, filter)
 *   GET /api/v1/products/categories — List distinct categories
 *   GET /api/v1/products/:sku       — Single product detail
 *
 * HOST-ONLY (verifyToken + requireHost):
 *   POST   /api/v1/products         — Create a new product
 *   PUT    /api/v1/products/:sku     — Update an existing product
 *   DELETE /api/v1/products/:sku     — Delete a product
 */

'use strict';

const { Router } = require('express');
const {
  listProducts,
  getProduct,
  listCategories,
  createProduct,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const { verifyToken, requireHost } = require('../middleware/authMiddleware');

const router = Router();

// ── Public endpoints ────────────────────────────────────────────────

// List categories (must come before :sku to avoid "categories" being parsed as a SKU)
router.get('/categories', listCategories);

// List products with optional search/filter
router.get('/', listProducts);

// Single product detail
router.get('/:sku', getProduct);

// ── Host-only endpoints ─────────────────────────────────────────────

router.post('/',       verifyToken, requireHost, createProduct);
router.put('/:sku',    verifyToken, requireHost, updateProduct);
router.delete('/:sku', verifyToken, requireHost, deleteProduct);

module.exports = router;

