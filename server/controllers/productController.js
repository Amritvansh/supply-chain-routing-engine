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

/* ═══════════════════════════════════════════════════════════════════════
 *  HOST PRODUCT MANAGEMENT
 *  The following endpoints are gated behind verifyToken + requireHost
 *  at the route layer. They allow Host admins to manage the catalog.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/v1/products
 *
 * Creates a new product (SKU) in the catalog.
 *
 * Required body fields: sku, name, price, weight_kg
 * Optional body fields: description, category, image_url,
 *                       length_cm, width_cm, height_cm
 *
 * Returns 201 with the created product on success.
 * Returns 400 if required fields are missing or the SKU already exists.
 */
async function createProduct(req, res, next) {
  try {
    const {
      sku, name, description, price, category,
      image_url, weight_kg, length_cm, width_cm, height_cm,
    } = req.body;

    // ── Validate required fields ────────────────────────────────────
    const missing = [];
    if (!sku)       missing.push('sku');
    if (!name)      missing.push('name');
    if (price == null)     missing.push('price');
    if (weight_kg == null) missing.push('weight_kg');

    if (missing.length > 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Missing required fields: ${missing.join(', ')}`,
        },
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO skus (sku, name, description, price, category, image_url,
                         weight_kg, length_cm, width_cm, height_cm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        sku.trim(),
        name.trim(),
        description || null,
        price,
        category || 'Electronics',
        image_url || null,
        weight_kg,
        length_cm || 0,
        width_cm  || 0,
        height_cm || 0,
      ]
    );

    const row = rows[0];

    res.status(201).json({
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
      },
    });
  } catch (err) {
    // PostgreSQL unique_violation — duplicate primary key (sku)
    if (err.code === '23505') {
      return res.status(400).json({
        error: {
          code: 'DUPLICATE_SKU',
          message: `A product with SKU "${req.body.sku}" already exists.`,
        },
      });
    }
    next(err);
  }
}

/**
 * PUT /api/v1/products/:sku
 *
 * Updates an existing product's catalog fields.
 * Only the fields present in the request body are updated (partial update).
 *
 * Returns 200 with the updated product on success.
 * Returns 400 if no updatable fields are provided.
 * Returns 404 if the SKU does not exist.
 */
async function updateProduct(req, res, next) {
  try {
    const { sku } = req.params;

    // ── Build a dynamic SET clause from the allowed fields ──────────
    const ALLOWED = [
      'name', 'description', 'price', 'category',
      'image_url', 'weight_kg', 'length_cm', 'width_cm', 'height_cm',
    ];

    const setClauses = [];
    const params = [];

    for (const field of ALLOWED) {
      if (req.body[field] !== undefined) {
        params.push(req.body[field]);
        setClauses.push(`${field} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No updatable fields provided. Allowed fields: ' + ALLOWED.join(', '),
        },
      });
    }

    // SKU identifier is the last parameter
    params.push(sku);

    const { rows } = await pool.query(
      `UPDATE skus SET ${setClauses.join(', ')} WHERE sku = $${params.length} RETURNING *`,
      params
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
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/products/:sku
 *
 * Hard-deletes a product from the catalog.
 * Related inventory rows in the `inventories` table are expected to
 * cascade or to have been cleared beforehand.
 *
 * Returns 200 with the deleted SKU on success.
 * Returns 404 if the SKU does not exist.
 */
async function deleteProduct(req, res, next) {
  try {
    const { sku } = req.params;

    const { rows } = await pool.query(
      `DELETE FROM skus WHERE sku = $1 RETURNING sku, name`,
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

    res.status(200).json({
      message: `Product "${rows[0].name}" (${rows[0].sku}) deleted successfully.`,
    });
  } catch (err) {
    // Foreign-key violation — product is referenced by inventories / order_items
    if (err.code === '23503') {
      return res.status(400).json({
        error: {
          code: 'PRODUCT_IN_USE',
          message: `Cannot delete SKU "${req.params.sku}" because it is referenced by existing inventory or orders. Remove those references first.`,
        },
      });
    }
    next(err);
  }
}

module.exports = {
  listProducts,
  getProduct,
  listCategories,
  createProduct,
  updateProduct,
  deleteProduct,
};
