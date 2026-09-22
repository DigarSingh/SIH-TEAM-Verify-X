import type { RequestHandler } from 'express';
import type { UserRole } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { AppError, forbidden, unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { ACCESS_COOKIE, verifyAccessToken } from '../modules/auth/tokens';

/** Endpoints reachable while a forced password change is pending. */
const PASSWORD_CHANGE_ALLOWLIST = new Set(['POST /api/auth/change-password', 'POST /api/auth/logout', 'GET /api/users/me']);

/**
 * Authenticates the request from the HttpOnly access-token cookie.
 *
 * The token only proves *who* and *which session*; the user's current role and
 * status are always re-read from the database, so a demoted, suspended or
 * deleted user loses access immediately rather than when the token expires.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) throw unauthorized('UNAUTHENTICATED', 'Authentication required');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw unauthorized('TOKEN_EXPIRED', 'Your session has expired');
    throw unauthorized('INVALID_TOKEN', 'Invalid authentication token');
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          deletedAt: true,
          departmentId: true,
          jobRoleId: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
    throw unauthorized('SESSION_INVALID', 'Your session is no longer valid. Please sign in again.');
  }
  const { user } = session;
  if (user.deletedAt || user.status !== 'ACTIVE') {
    throw unauthorized('ACCOUNT_INACTIVE', 'This account is not active');
  }

  if (user.mustChangePassword) {
    const route = `${req.method} ${req.originalUrl.split('?')[0]}`;
    if (!PASSWORD_CHANGE_ALLOWLIST.has(route)) {
      throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must change your temporary password before continuing');
    }
  }

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    sessionId: session.id,
    departmentId: user.departmentId,
    jobRoleId: user.jobRoleId,
  };
  return next();
};

/**
 * Role-based access control. Must run after `authenticate`.
 * Authorization is always enforced here on the server - hiding a menu item in
 * the UI is never treated as access control.
 */
export const requireRole = (...roles: UserRole[]): RequestHandler => {
  const guard: RequestHandler = (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) {
      throw forbidden('FORBIDDEN', `This action requires one of the following roles: ${roles.join(', ')}`);
    }
    return next();
  };
  // The allowed roles are attached so `npm run routes` can report who may call each endpoint.
  return Object.assign(guard, { allowedRoles: roles });
};

/** Returns the authenticated user or throws (for handlers behind `authenticate`). */
export function currentUser(req: Express.Request): Express.AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
