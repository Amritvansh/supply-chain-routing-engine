/**
 * Warehouse Controller — Host Management Layer
 *
 * Provides CRUD operations for Host administrators to manage warehouses.
 * These endpoints are gated behind verifyToken + requireHost at the route layer.
 *
 * Also contains the existing read-only listing logic (refactored out of the
 * route file for consistency with the productController pattern).
 *
 * @module controllers/warehouseController
 */

'use strict';

const pool = require('../db/pool');

/**
 * GET /api/v1/warehouses
 *
 * Returns all warehouses with their per-SKU inventory breakdown.
 * Used by the Control Tower dashboard and the Host warehouse management page.
 */
async function listWarehouses(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        w.id            AS warehouse_id,
        w.name          AS warehouse_name,
        w.lat,
        w.lng,
        w.active,
        i.sku,
        s.name          AS sku_name,
        i.available_qty,
        i.reserved_qty
      FROM warehouses w
      LEFT JOIN inventories i ON i.warehouse_id = w.id
      LEFT JOIN skus s ON s.sku = i.sku
      ORDER BY w.name, s.name
    `);

    // Group rows by warehouse
    const warehouseMap = new Map();

    for (const row of rows) {
      if (!warehouseMap.has(row.warehouse_id)) {
        warehouseMap.set(row.warehouse_id, {
          id: row.warehouse_id,
          name: row.warehouse_name,
          lat: parseFloat(row.lat),
          lng: parseFloat(row.lng),
          active: row.active,
          inventory: [],
        });
      }

      // Only add inventory if there's a valid SKU join
      if (row.sku) {
        warehouseMap.get(row.warehouse_id).inventory.push({
          sku: row.sku,
          name: row.sku_name,
          availableQty: row.available_qty,
          reservedQty: row.reserved_qty,
        });
      }
    }

    const warehouses = Array.from(warehouseMap.values());

    res.status(200).json({ warehouses });
  } catch (err) {
    next(err);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 *  HOST WAREHOUSE MANAGEMENT
 *  The following endpoints are gated behind verifyToken + requireHost
 *  at the route layer. They allow Host admins to manage warehouses.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * POST /api/v1/warehouses
 *
 * Creates a new warehouse with geographic coordinates.
 *
 * Required body fields: name, lat, lng
 * Optional body fields: id (UUID — auto-generated if omitted), active
 *
 * Returns 201 with the created warehouse on success.
 * Returns 400 if required fields are missing or the ID already exists.
 */
async function createWarehouse(req, res, next) {
  try {
    const { id, name, lat, lng, active } = req.body;

    // ── Validate required fields ────────────────────────────────────
    const missing = [];
    if (!name)       missing.push('name');
    if (lat == null) missing.push('lat');
    if (lng == null) missing.push('lng');

    if (missing.length > 0) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Missing required fields: ${missing.join(', ')}`,
        },
      });
    }

    // Validate lat/lng ranges
    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Latitude must be between -90 and 90.',
        },
      });
    }
    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Longitude must be between -180 and 180.',
        },
      });
    }

    // Build query — allow caller to supply a UUID, or let Postgres generate one
    let query, params;
    if (id) {
      query = `INSERT INTO warehouses (id, name, lat, lng, active)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *`;
      params = [id, name.trim(), lat, lng, active !== false];
    } else {
      query = `INSERT INTO warehouses (name, lat, lng, active)
               VALUES ($1, $2, $3, $4)
               RETURNING *`;
      params = [name.trim(), lat, lng, active !== false];
    }

    const { rows } = await pool.query(query, params);
    const row = rows[0];

    res.status(201).json({
      warehouse: {
        id: row.id,
        name: row.name,
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        active: row.active,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    // PostgreSQL unique_violation — duplicate primary key (id)
    if (err.code === '23505') {
      return res.status(400).json({
        error: {
          code: 'DUPLICATE_WAREHOUSE',
          message: `A warehouse with this ID already exists.`,
        },
      });
    }
    next(err);
  }
}

/**
 * PUT /api/v1/warehouses/:id
 *
 * Updates an existing warehouse's fields.
 * Only the fields present in the request body are updated (partial update).
 *
 * Returns 200 with the updated warehouse on success.
 * Returns 400 if no updatable fields are provided.
 * Returns 404 if the warehouse does not exist.
 */
async function updateWarehouse(req, res, next) {
  try {
    const { id } = req.params;

    // ── Build a dynamic SET clause from the allowed fields ──────────
    const ALLOWED = ['name', 'lat', 'lng', 'active'];

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

    // Validate lat/lng ranges if provided
    if (req.body.lat !== undefined && (req.body.lat < -90 || req.body.lat > 90)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Latitude must be between -90 and 90.',
        },
      });
    }
    if (req.body.lng !== undefined && (req.body.lng < -180 || req.body.lng > 180)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Longitude must be between -180 and 180.',
        },
      });
    }

    // Warehouse ID is the last parameter
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE warehouses SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: {
          code: 'WAREHOUSE_NOT_FOUND',
          message: `Warehouse with ID "${id}" not found.`,
        },
      });
    }

    const row = rows[0];

    res.status(200).json({
      warehouse: {
        id: row.id,
        name: row.name,
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        active: row.active,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/warehouses/:id
 *
 * Soft-deletes a warehouse by setting active = false.
 * This preserves referential integrity with inventories and historical orders.
 *
 * Returns 200 with confirmation on success.
 * Returns 404 if the warehouse does not exist.
 */
async function deleteWarehouse(req, res, next) {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `UPDATE warehouses SET active = false WHERE id = $1 AND active = true RETURNING id, name`,
      [id]
    );

    if (rows.length === 0) {
      // Check if it exists but is already inactive
      const check = await pool.query(`SELECT id, active FROM warehouses WHERE id = $1`, [id]);
      if (check.rows.length > 0 && !check.rows[0].active) {
        return res.status(400).json({
          error: {
            code: 'ALREADY_INACTIVE',
            message: `Warehouse "${id}" is already deactivated.`,
          },
        });
      }
      return res.status(404).json({
        error: {
          code: 'WAREHOUSE_NOT_FOUND',
          message: `Warehouse with ID "${id}" not found.`,
        },
      });
    }

    res.status(200).json({
      message: `Warehouse "${rows[0].name}" (${rows[0].id}) deactivated successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
