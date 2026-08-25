/**
 * Input Validation — Algorithm-level sanity guards
 *
 * Reusable validation for routingEngine and binPacking inputs.
 * These guards reject clearly invalid data before it reaches
 * the algorithm core, preventing:
 *   - excessively large item arrays (DoS)
 *   - zero/negative quantities
 *   - invalid SKU identifiers
 *   - unrealistic dimensions/weights
 *   - impossible volumes
 *
 * Limits are documented here as the single source of truth.
 *
 * These are ALGORITHM-LEVEL guards, not HTTP-level validation.
 * HTTP validation is handled by the route layer (Member 2).
 *
 * @module algorithms/inputValidation
 */

'use strict';

/**
 * Project-level limits for algorithm inputs.
 * Documented here as the single source of truth.
 */
const LIMITS = {
  /** Maximum number of distinct line items in a single order */
  MAX_ITEMS_PER_ORDER: 100,

  /** Maximum quantity per line item */
  MAX_QTY_PER_ITEM: 10000,

  /** Maximum number of warehouses to evaluate */
  MAX_WAREHOUSES: 500,

  /** Maximum allowed dimension in cm (5 meters) */
  MAX_DIMENSION_CM: 500,

  /** Maximum allowed weight per unit in kg (500 kg) */
  MAX_WEIGHT_KG: 500,

  /** Minimum dimension in cm (must be positive) */
  MIN_DIMENSION_CM: 0.1,

  /** Minimum weight in kg (must be positive) */
  MIN_WEIGHT_KG: 0.001,

  /** SKU must be a non-empty string, max 100 characters */
  MAX_SKU_LENGTH: 100,
};

/**
 * Validate order items for the routing engine and bin packing.
 *
 * @param {Array<Object>} orderItems - Items to validate
 * @throws {Error} with a descriptive message if validation fails
 */
function validateOrderItems(orderItems) {
  if (!Array.isArray(orderItems)) {
    throw new Error('orderItems must be an array.');
  }

  if (orderItems.length === 0) {
    throw new Error('orderItems must contain at least one item.');
  }

  if (orderItems.length > LIMITS.MAX_ITEMS_PER_ORDER) {
    throw new Error(
      `Order exceeds maximum of ${LIMITS.MAX_ITEMS_PER_ORDER} distinct line items (received ${orderItems.length}).`
    );
  }

  for (let i = 0; i < orderItems.length; i++) {
    const item = orderItems[i];
    const label = item.sku || item.name || `item[${i}]`;

    // SKU validation
    if (!item.sku || typeof item.sku !== 'string') {
      throw new Error(`${label}: sku must be a non-empty string.`);
    }
    if (item.sku.length > LIMITS.MAX_SKU_LENGTH) {
      throw new Error(
        `${label}: sku exceeds maximum length of ${LIMITS.MAX_SKU_LENGTH} characters.`
      );
    }
    if (!/^[A-Za-z0-9_-]+$/.test(item.sku)) {
      throw new Error(
        `${label}: sku contains invalid characters. Only alphanumeric, hyphens, and underscores are allowed.`
      );
    }

    // Quantity validation
    const qty = item.qty;
    if (qty === undefined || qty === null) {
      throw new Error(`${label}: qty is required.`);
    }
    if (typeof qty !== 'number' || !Number.isFinite(qty)) {
      throw new Error(`${label}: qty must be a finite number.`);
    }
    if (!Number.isInteger(qty)) {
      throw new Error(`${label}: qty must be an integer (received ${qty}).`);
    }
    if (qty < 1) {
      throw new Error(`${label}: qty must be at least 1 (received ${qty}).`);
    }
    if (qty > LIMITS.MAX_QTY_PER_ITEM) {
      throw new Error(
        `${label}: qty ${qty} exceeds maximum of ${LIMITS.MAX_QTY_PER_ITEM}.`
      );
    }

    // Dimension validation (required for bin packing)
    validateDimension(item, 'length_cm', label);
    validateDimension(item, 'width_cm', label);
    validateDimension(item, 'height_cm', label);

    // Weight validation
    if (item.weight_kg === undefined || item.weight_kg === null) {
      throw new Error(`${label}: weight_kg is required.`);
    }
    const wt = Number(item.weight_kg);
    if (!Number.isFinite(wt)) {
      throw new Error(`${label}: weight_kg must be a finite number.`);
    }
    if (wt < LIMITS.MIN_WEIGHT_KG) {
      throw new Error(
        `${label}: weight_kg must be at least ${LIMITS.MIN_WEIGHT_KG} (received ${item.weight_kg}).`
      );
    }
    if (wt > LIMITS.MAX_WEIGHT_KG) {
      throw new Error(
        `${label}: weight_kg ${item.weight_kg} exceeds maximum of ${LIMITS.MAX_WEIGHT_KG}.`
      );
    }
  }
}

/**
 * Validate a single dimension field on an item.
 *
 * @param {Object} item
 * @param {string} field - e.g. 'length_cm'
 * @param {string} label - human-readable item label for errors
 */
function validateDimension(item, field, label) {
  const raw = item[field];
  if (raw === undefined || raw === null) {
    throw new Error(`${label}: ${field} is required.`);
  }
  const val = Number(raw);
  if (!Number.isFinite(val)) {
    throw new Error(`${label}: ${field} must be a finite number.`);
  }
  if (val < LIMITS.MIN_DIMENSION_CM) {
    throw new Error(
      `${label}: ${field} must be at least ${LIMITS.MIN_DIMENSION_CM} cm (received ${raw}).`
    );
  }
  if (val > LIMITS.MAX_DIMENSION_CM) {
    throw new Error(
      `${label}: ${field} ${raw} cm exceeds maximum of ${LIMITS.MAX_DIMENSION_CM} cm.`
    );
  }
}

/**
 * Validate warehouses array for the routing engine.
 *
 * @param {Array<Object>} warehouses
 * @throws {Error} with a descriptive message if validation fails
 */
function validateWarehouses(warehouses) {
  if (!Array.isArray(warehouses)) {
    throw new Error('warehouses must be an array.');
  }

  if (warehouses.length > LIMITS.MAX_WAREHOUSES) {
    throw new Error(
      `Warehouse count ${warehouses.length} exceeds maximum of ${LIMITS.MAX_WAREHOUSES}.`
    );
  }
}

module.exports = {
  validateOrderItems,
  validateWarehouses,
  LIMITS,
};
