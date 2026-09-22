import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@prisma/client';
import { env } from '../../config/env';

export const ACCESS_COOKIE = 'cc_at';
export const REFRESH_COOKIE = 'cc_rt';
const ISSUER = 'capacity-connect';

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  /** Session id - lets a revoked session invalidate its access tokens immediately. */
  sid: string;
  role: UserRole;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  });
}

/** Verifies signature, algorithm, issuer and expiry. Throws jsonwebtoken errors on failure. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER });
  if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded['sid'] !== 'string') {
    throw new jwt.JsonWebTokenError('Malformed access token payload');
  }
  return { sub: decoded.sub, sid: decoded['sid'] as string, role: decoded['role'] as UserRole };
}

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAccessCookie(res: Response, accessToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions(),
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
  });
}

/**
 * Both cookies are HttpOnly (not readable by JavaScript). The refresh cookie is
 * additionally scoped to the auth routes so it is never sent with normal API calls.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  setAccessCookie(res, accessToken);
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions(),
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: '/api/auth' });
}
