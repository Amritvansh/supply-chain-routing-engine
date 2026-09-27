/**
 * Product Routes — Customer Catalog
 *
 * GET /api/v1/products            — List all products (search, filter)
 * GET /api/v1/products/categories — List distinct categories
 * GET /api/v1/products/:sku       — Single product detail
 *
 * These are public endpoints — no authentication required for browsing.
 * The shopping experience should be accessible to anyone.
 */

'use strict';

const { Router } = require('express');
const {
  listProducts,
  getProduct,
  listCategories,
} = require('../controllers/productController');

const router = Router();

// ── List categories (must come before :sku to avoid "categories" being parsed as a SKU)
router.get('/categories', listCategories);

// ── List products with optional search/filter
router.get('/', listProducts);

// ── Single product detail
router.get('/:sku', getProduct);

module.exports = router;
