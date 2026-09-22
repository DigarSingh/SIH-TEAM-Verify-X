import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

/**
 * CSRF protection for cookie-authenticated APIs.
 *
 * Every state-changing request must carry a custom header. Browsers do not let a
 * cross-site page add custom headers to a request without a CORS pre-flight, and
 * the pre-flight is refused for origins outside the allow-list. Together with the
 * JSON-only body parser and SameSite cookies this blocks classic CSRF, including
 * login CSRF, without server-side token storage.
 */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'CapacityConnect';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    throw new AppError(403, 'CSRF_REJECTED', 'Missing or invalid X-Requested-With header');
  }
  return next();
};
