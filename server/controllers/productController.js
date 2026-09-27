/**
 * Product Controller — Customer Catalog Layer
 *
 * Provides customer-safe product browsing endpoints.
 * These endpoints expose ONLY e-commerce information:
 *   - Product name, price, category, images, descriptions
 *   - Aggregate stock availability (in stock / low / out of stock)
 *
 * They NEVER expose:
 *   - Per-warehouse inventory breakdown
 *   - Routing scores, depletion penalties, or cost function internals
 *   - Warehouse identities or locations
 *
 * @module controllers/productController
 */

'use strict';

const pool = require('../db/pool');

/**
 * GET /api/v1/products
 *
 * Returns the product catalog with optional search and category filtering.
 * Stock availability is computed as the aggregate SUM(available_qty)
 * across all warehouses — the customer never sees which warehouse holds what.
 *
 * Query params:
 *   ?q=<search>       — case-insensitive search across name, sku, description
 *   ?category=<name>  — exact category filter
 */
async function listProducts(req, res, next) {
  try {
    const { q, category } = req.query;

    let query = `
      SELECT
        s.sku,
        s.name,
        s.price,
        s.category,
        s.image_url,
        s.description,
        s.length_cm,
        s.width_cm,
        s.height_cm,
        s.weight_kg,
        COALESCE(SUM(i.available_qty), 0)::int AS total_stock
      FROM skus s
      LEFT JOIN inventories i ON i.sku = s.sku
    `;

    const conditions = [];
    const params = [];

    if (q && q.trim().length > 0) {
      params.push(`%${q.trim()}%`);
      const idx = params.length;
      conditions.push(
        `(s.name ILIKE $${idx} OR s.sku ILIKE $${idx} OR s.description ILIKE $${idx})`
      );
    }

    if (category && category.trim().length > 0) {
      params.push(category.trim());
      conditions.push(`s.category = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY s.sku ORDER BY s.name';

    const { rows } = await pool.query(query, params);

    const products = rows.map(row => ({
      sku: row.sku,
      name: row.name,
      price: parseFloat(row.price),
      category: row.category,
      imageUrl: row.image_url,
      description: row.description,
      dimensions: {
        lengthCm: parseFloat(row.length_cm),
        widthCm: parseFloat(row.width_cm),
        heightCm: parseFloat(row.height_cm),
        weightKg: parseFloat(row.weight_kg),
      },
      totalStock: row.total_stock,
      stockStatus:
        row.total_stock === 0 ? 'OUT_OF_STOCK' :
        row.total_stock <= 5  ? 'LOW_STOCK' :
        'IN_STOCK',
    }));

    res.status(200).json({ products, count: products.length });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/products/:sku
 *
 * Returns a single product with its full details and stock status.
 * No internal routing data is exposed.
 */
async function getProduct(req, res, next) {
  try {
    const { sku } = req.params;

    const { rows } = await pool.query(
      `SELECT
         s.sku,
         s.name,
         s.price,
         s.category,
         s.image_url,
         s.description,
         s.length_cm,
         s.width_cm,
         s.height_cm,
         s.weight_kg,
         COALESCE(SUM(i.available_qty), 0)::int AS total_stock
       FROM skus s
       LEFT JOIN inventories i ON i.sku = s.sku
       WHERE s.sku = $1
       GROUP BY s.sku`,
      [sku]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product with SKU "${sku}" not found.`,
        },
      });
    }

    const row = rows[0];

    res.status(200).json({
      product: {
        sku: row.sku,
        name: row.name,
        price: parseFloat(row.price),
        category: row.category,
        imageUrl: row.image_url,
        description: row.description,
        dimensions: {
          lengthCm: parseFloat(row.length_cm),
          widthCm: parseFloat(row.width_cm),
          heightCm: parseFloat(row.height_cm),
          weightKg: parseFloat(row.weight_kg),
        },
        totalStock: row.total_stock,
        stockStatus:
          row.total_stock === 0 ? 'OUT_OF_STOCK' :
          row.total_stock <= 5  ? 'LOW_STOCK' :
          'IN_STOCK',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/products/categories
 *
 * Returns the list of distinct product categories.
 */
async function listCategories(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT category FROM skus ORDER BY category`
    );

    res.status(200).json({
      categories: rows.map(r => r.category),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listProducts,
  getProduct,
  listCategories,
};
