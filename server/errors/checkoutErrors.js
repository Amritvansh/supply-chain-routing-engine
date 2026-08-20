/**
 * Checkout Error Types
 *
 * Typed errors for the checkout transaction flow. Member 2's controller
 * will map these to HTTP status codes — we expose structured errors,
 * never raw SQL messages.
 *
 * @module errors/checkoutErrors
 */

'use strict';

/**
 * Thrown when a warehouse does not have enough inventory to fulfill
 * the requested quantity. The UPDATE ... WHERE available_qty >= X
 * returned zero affected rows.
 */
class InsufficientStockError extends Error {
  constructor(sku, requested, available) {
    super(`Insufficient stock for SKU "${sku}": requested ${requested}, available ${available}`);
    this.name = 'InsufficientStockError';
    this.code = 'INSUFFICIENT_STOCK';
    this.sku = sku;
    this.requested = requested;
    this.available = available;
  }
}

/**
 * Thrown when the Redis distributed lock for a SKU cannot be acquired
 * (another checkout is in progress for the same SKU).
 */
class LockUnavailableError extends Error {
  constructor(sku) {
    super(`Lock unavailable for SKU "${sku}": another checkout is in progress`);
    this.name = 'LockUnavailableError';
    this.code = 'LOCK_UNAVAILABLE';
    this.sku = sku;
  }
}

/**
 * Returned (not thrown) when a duplicate idempotency key is detected.
 * The caller should return the previously-created order, not create a new one.
 */
class IdempotencyReplay {
  constructor(existingOrder) {
    this.name = 'IdempotencyReplay';
    this.code = 'IDEMPOTENCY_REPLAY';
    this.existingOrder = existingOrder;
  }
}

/**
 * Thrown when a PostgreSQL transaction fails for reasons other than
 * insufficient stock (e.g., serialization failure, constraint violation).
 * Wraps the underlying database error without exposing SQL internals.
 */
class DatabaseTransactionError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'DatabaseTransactionError';
    this.code = 'DATABASE_TRANSACTION_ERROR';
    this.originalError = originalError;
  }
}

module.exports = {
  InsufficientStockError,
  LockUnavailableError,
  IdempotencyReplay,
  DatabaseTransactionError,
};
