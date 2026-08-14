/**
 * Request Logger Middleware
 * 
 * Logs structured request information for every incoming HTTP request:
 *   - Method
 *   - Path
 *   - Status code
 *   - Response duration (ms)
 * 
 * Uses the res 'finish' event to capture the actual response status
 * after the handler has completed.
 */
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6; // nanoseconds → milliseconds

    const log = {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration: `${durationMs.toFixed(2)}ms`,
    };

    // Use different log levels based on status code
    if (res.statusCode >= 500) {
      console.error('[Request]', JSON.stringify(log));
    } else if (res.statusCode >= 400) {
      console.warn('[Request]', JSON.stringify(log));
    } else {
      console.log('[Request]', JSON.stringify(log));
    }
  });

  next();
}

module.exports = requestLogger;
