import type { Request, Response } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env';

function limiter(overrides: Partial<Options> & { limit: number }) {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down and try again shortly.',
      });
    },
    ...overrides,
  });
}

/** Baseline protection for the whole API. */
export const apiLimiter = limiter({ limit: env.RATE_LIMIT_MAX });

/** Strict limit for the credential endpoints that create or change something (register, change-password); every request counts. */
export const authLimiter = limiter({ limit: env.AUTH_RATE_LIMIT_MAX });

/**
 * Sign-in: only FAILED attempts count. A whole office signing in at nine o'clock behind one address must not lock itself out
 * with its own successes, while guessing passwords is still stopped. (The token refresh is not limited here: refresh tokens
 * are unguessable random values, the global limiter covers floods, and every anonymous page load makes one refresh attempt.)
 */
export const createLoginLimiter = (limit: number) => limiter({ limit, skipSuccessfulRequests: true });
export const loginLimiter = createLoginLimiter(env.AUTH_RATE_LIMIT_MAX);

/** Public certificate verification: generous for legitimate use, hostile to enumeration. */
export const verifyLimiter = limiter({ limit: 60, windowMs: 60 * 1000 });

/**
 * Cap on AI requests per signed-in user per hour (each one costs money and takes seconds). Keyed by user,
 * not by IP, so a shared office network is not throttled as one person. Requests that fail (validation,
 * missing key, upstream errors) do not use up the allowance. Must run after `authenticate`.
 */
export const createAiLimiter = (limit: number) =>
  limiter({
    limit,
    windowMs: 60 * 60 * 1000,
    keyGenerator: (req) => req.user?.id ?? 'anonymous',
    skipFailedRequests: true,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        code: 'AI_RATE_LIMITED',
        message: 'You have reached the hourly limit for AI requests. Please try again later.',
      });
    },
  });
export const aiLimiter = createAiLimiter(env.AI_RATE_LIMIT_PER_HOUR);

/** Factory used by tests to exercise the 429 response shape with a tiny limit. */
export const createLimiter = limiter;
