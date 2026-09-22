import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError, badRequest, conflict, forbidden, unauthorized } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyAdmins } from '../../services/notification.service';
import { toUserDto, userInclude, type UserDto } from '../users/user.mapper';
import type { ChangePasswordInput, LoginInput, RegisterInput } from './auth.schemas';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';
import { signAccessToken } from './tokens';

export interface IssuedTokens {
  accessToken: string;
  /** Present only when the refresh token was rotated. */
  refreshToken?: string;
}

export interface AuthResult extends IssuedTokens {
  user: UserDto;
}

/** A second refresh with the previous token inside this window is a benign multi-tab race, not theft. */
const REFRESH_GRACE_MS = 15_000;

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

function emailDomainAllowed(email: string): boolean {
  if (env.ALLOWED_EMAIL_DOMAINS.length === 0) return true;
  const domain = email.split('@')[1] ?? '';
  return env.ALLOWED_EMAIL_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

async function createSession(userId: string, role: Express.AuthUser['role'], ctx: AuditContext): Promise<Required<IssuedTokens>> {
  const refreshToken = randomToken(32);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: refreshExpiry(),
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
  return { accessToken: signAccessToken({ sub: userId, sid: session.id, role }), refreshToken };
}

/** Self-service registration. Always creates a TRAINEE; elevated roles are granted only by an administrator. */
export async function register(input: RegisterInput, ctx: AuditContext): Promise<{ user: UserDto; requiresApproval: boolean; tokens?: Required<IssuedTokens> }> {
  if (!emailDomainAllowed(input.email)) {
    throw badRequest('EMAIL_DOMAIN_NOT_ALLOWED', `Registration is limited to these email domains: ${env.ALLOWED_EMAIL_DOMAINS.join(', ')}`);
  }

  if (input.departmentId) {
    const department = await prisma.department.findFirst({ where: { id: input.departmentId, isActive: true } });
    if (!department) throw badRequest('INVALID_DEPARTMENT', 'The selected department does not exist');
  }
  if (input.jobRoleId) {
    const jobRole = await prisma.role.findFirst({ where: { id: input.jobRoleId, isActive: true } });
    if (!jobRole) throw badRequest('INVALID_ROLE', 'The selected role does not exist');
  }

  const requiresApproval = env.REGISTRATION_REQUIRES_APPROVAL;
  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        employeeId: input.employeeId ?? null,
        phone: input.phone ?? null,
        designation: input.designation ?? null,
        location: input.location ?? null,
        departmentId: input.departmentId ?? null,
        jobRoleId: input.jobRoleId ?? null,
        role: 'TRAINEE',
        status: requiresApproval ? 'PENDING' : 'ACTIVE',
        approvedAt: requiresApproval ? null : new Date(),
      },
      include: userInclude,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String(error.meta?.['target'] ?? '');
      if (target.includes('employeeId')) throw conflict('EMPLOYEE_ID_TAKEN', 'An account with this employee ID already exists');
      throw conflict('EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw error;
  }

  await recordAudit({ ...ctx, userId: user.id }, { action: AuditActions.USER_REGISTERED, entityType: 'User', entityId: user.id, metadata: { requiresApproval } });

  if (requiresApproval) {
    await notifyAdmins({
      type: 'ACCOUNT',
      title: 'New registration awaiting approval',
      message: `${user.name} (${user.email}) has registered and is waiting for approval.`,
      link: '/admin/users?status=PENDING',
      dedupeKey: `registration:${user.id}`,
    });
    return { user: toUserDto(user), requiresApproval: true };
  }

  const tokens = await createSession(user.id, user.role, ctx);
  return { user: toUserDto(user), requiresApproval: false, tokens };
}

/** Verifies credentials, enforces lock-out and account status, and opens a session. */
export async function login(input: LoginInput, ctx: AuditContext): Promise<AuthResult & Required<IssuedTokens>> {
  const invalid = () => unauthorized('INVALID_CREDENTIALS', 'Incorrect email or password');

  const user = await prisma.user.findFirst({ where: { email: input.email, deletedAt: null }, include: userInclude });
  if (!user) {
    await verifyAgainstDummy(input.password);
    throw invalid();
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000));
    throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= env.MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: lock
        ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + env.LOCKOUT_MINUTES * 60_000) }
        : { failedLoginCount: failed },
    });
    await recordAudit(
      { ...ctx, userId: user.id },
      { action: lock ? AuditActions.USER_LOCKED : AuditActions.USER_LOGIN_FAILED, entityType: 'User', entityId: user.id },
    );
    throw invalid();
  }

  // Status is only revealed to someone who proved they know the password.
  if (user.status === 'PENDING') {
    throw forbidden('ACCOUNT_PENDING', 'Your account is awaiting administrator approval. You will be able to sign in once it is approved.');
  }
  if (user.status === 'REJECTED') {
    throw forbidden('ACCOUNT_REJECTED', 'Your registration was not approved. Please contact the capacity building office.');
  }
  if (user.status === 'SUSPENDED') {
    throw forbidden('ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact an administrator.');
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
  const tokens = await createSession(user.id, user.role, ctx);
  await recordAudit({ ...ctx, userId: user.id }, { action: AuditActions.USER_LOGIN, entityType: 'User', entityId: user.id });

  return { user: toUserDto({ ...user, lastLoginAt: now }), ...tokens };
}

/**
 * Exchanges a refresh token for a new access token and rotates the refresh token.
 * Presenting an already-rotated token outside the grace window revokes the whole
 * session, because it means the token was copied.
 */
export async function refresh(rawToken: string | undefined, ctx: AuditContext): Promise<AuthResult> {
  if (!rawToken) throw unauthorized('NO_REFRESH_TOKEN', 'Not signed in');
  const tokenHash = sha256(rawToken);
  const now = new Date();

  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: { include: userInclude } } });

  if (!session) {
    const reused = await prisma.session.findFirst({ where: { previousTokenHash: tokenHash, revokedAt: null }, include: { user: { include: userInclude } } });
    if (reused) {
      if (now.getTime() - reused.lastUsedAt.getTime() <= REFRESH_GRACE_MS && reused.expiresAt > now && reused.user.status === 'ACTIVE' && !reused.user.deletedAt) {
        // Concurrent refresh from another tab: hand out an access token only.
        return { user: toUserDto(reused.user), accessToken: signAccessToken({ sub: reused.userId, sid: reused.id, role: reused.user.role }) };
      }
      await prisma.session.update({ where: { id: reused.id }, data: { revokedAt: now } });
      await recordAudit({ ...ctx, userId: reused.userId }, { action: AuditActions.SESSION_REUSE_DETECTED, entityType: 'Session', entityId: reused.id });
      throw unauthorized('REFRESH_TOKEN_REUSED', 'Your session was invalidated for security reasons. Please sign in again.');
    }
    throw unauthorized('INVALID_REFRESH_TOKEN', 'Your session is no longer valid. Please sign in again.');
  }

  if (session.revokedAt || session.expiresAt <= now) throw unauthorized('SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  if (session.user.deletedAt || session.user.status !== 'ACTIVE') throw unauthorized('ACCOUNT_INACTIVE', 'This account is not active');

  const refreshToken = randomToken(32);
  const rotated = await prisma.session.updateMany({
    // Optimistic concurrency: only the request holding the current token wins.
    where: { id: session.id, tokenHash, revokedAt: null },
    data: {
      tokenHash: sha256(refreshToken),
      previousTokenHash: tokenHash,
      lastUsedAt: now,
      expiresAt: refreshExpiry(),
      ipAddress: ctx.ip ?? session.ipAddress,
      userAgent: ctx.userAgent ?? session.userAgent,
    },
  });
  if (rotated.count !== 1) throw unauthorized('INVALID_REFRESH_TOKEN', 'Your session is no longer valid. Please sign in again.');

  return {
    user: toUserDto(session.user),
    accessToken: signAccessToken({ sub: session.userId, sid: session.id, role: session.user.role }),
    refreshToken,
  };
}

/** Revokes the current session. Idempotent: an unknown or expired session is not an error. */
export async function logout(params: { sessionId?: string; rawRefreshToken?: string }, ctx: AuditContext): Promise<void> {
  const ids = new Set<string>();
  if (params.sessionId) ids.add(params.sessionId);
  if (params.rawRefreshToken) {
    const session = await prisma.session.findUnique({ where: { tokenHash: sha256(params.rawRefreshToken) }, select: { id: true } });
    if (session) ids.add(session.id);
  }
  if (ids.size === 0) return;

  const sessions = await prisma.session.findMany({ where: { id: { in: [...ids] }, revokedAt: null }, select: { id: true, userId: true } });
  if (sessions.length === 0) return;
  await prisma.session.updateMany({ where: { id: { in: sessions.map((s) => s.id) } }, data: { revokedAt: new Date() } });
  const userId = sessions[0]?.userId;
  await recordAudit({ ...ctx, userId: userId ?? ctx.userId ?? null }, { action: AuditActions.USER_LOGOUT, entityType: 'User', entityId: userId ?? null });
}

/** Changes the password after verifying the current one; all other sessions are signed out. */
export async function changePassword(userId: string, currentSessionId: string, input: ChangePasswordInput, ctx: AuditContext): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(400, 'INCORRECT_PASSWORD', 'The current password is incorrect');
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } }),
    prisma.session.updateMany({ where: { userId, id: { not: currentSessionId }, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await recordAudit({ ...ctx, userId }, { action: AuditActions.PASSWORD_CHANGED, entityType: 'User', entityId: userId });
}
