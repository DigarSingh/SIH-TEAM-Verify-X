import { Prisma, type UserRole, type UserStatus } from '@prisma/client';
import { generateTemporaryPassword } from '../../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';
import { hashPassword } from '../auth/password';
import { toUserDto, userInclude } from './user.mapper';

/** True when removing/demoting/suspending `userId` would leave the platform without an active administrator. */
async function isLastActiveAdmin(userId: string, db: Db = prisma): Promise<boolean> {
  const others = await db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null, id: { not: userId } } });
  return others === 0;
}

async function loadUser(id: string, db: Db = prisma) {
  const user = await db.user.findFirst({ where: { id, deletedAt: null }, include: userInclude });
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  return user;
}

async function assertReferences(departmentId?: string | null, jobRoleId?: string | null): Promise<void> {
  if (departmentId && !(await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } }))) {
    throw badRequest('INVALID_DEPARTMENT', 'The selected department does not exist');
  }
  if (jobRoleId && !(await prisma.role.findUnique({ where: { id: jobRoleId }, select: { id: true } }))) {
    throw badRequest('INVALID_ROLE', 'The selected role does not exist');
  }
}

function mapUniqueViolation(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = String(error.meta?.['target'] ?? '');
    if (target.includes('employeeId')) throw conflict('EMPLOYEE_ID_TAKEN', 'Another account already uses this employee ID');
    throw conflict('EMAIL_TAKEN', 'Another account already uses this email');
  }
  throw error;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: UserRole;
  password?: string | undefined;
  employeeId?: string | undefined;
  phone?: string | undefined;
  designation?: string | undefined;
  location?: string | undefined;
  joiningDate?: Date | undefined;
  departmentId?: string | undefined;
  jobRoleId?: string | undefined;
}

/** Admin-created account. Without an explicit password a strong temporary one is generated and must be changed at first sign-in. */
export async function createUser(input: CreateUserInput, actor: AuditContext) {
  await assertReferences(input.departmentId, input.jobRoleId);
  const temporaryPassword = input.password ? undefined : generateTemporaryPassword();
  const passwordHash = await hashPassword(input.password ?? (temporaryPassword as string));
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedById: actor.userId ?? null,
        mustChangePassword: true,
        employeeId: input.employeeId ?? null,
        phone: input.phone ?? null,
        designation: input.designation ?? null,
        location: input.location ?? null,
        joiningDate: input.joiningDate ?? null,
        departmentId: input.departmentId ?? null,
        jobRoleId: input.jobRoleId ?? null,
      },
      include: userInclude,
    });
    await recordAudit(actor, { action: AuditActions.USER_CREATED, entityType: 'User', entityId: user.id, metadata: { role: user.role, email: user.email } });
    return { user: toUserDto(user), ...(temporaryPassword ? { temporaryPassword } : {}) };
  } catch (error) {
    return mapUniqueViolation(error);
  }
}

export interface UpdateUserInput {
  name?: string | undefined;
  employeeId?: string | null | undefined;
  phone?: string | null | undefined;
  designation?: string | null | undefined;
  location?: string | null | undefined;
  joiningDate?: Date | null | undefined;
  departmentId?: string | null | undefined;
  jobRoleId?: string | null | undefined;
}

export async function updateUser(id: string, input: UpdateUserInput, actor: AuditContext) {
  await loadUser(id);
  await assertReferences(input.departmentId, input.jobRoleId);
  const data: Prisma.UserUncheckedUpdateInput = {};
  for (const [key, value] of Object.entries(input)) if (value !== undefined) (data as Record<string, unknown>)[key] = value;
  try {
    const user = await prisma.user.update({ where: { id }, data, include: userInclude });
    await recordAudit(actor, { action: AuditActions.USER_UPDATED, entityType: 'User', entityId: id, metadata: { changes: Object.keys(data) } });
    return toUserDto(user);
  } catch (error) {
    return mapUniqueViolation(error);
  }
}

/** Approves a pending registration; optionally assigns department / job role at the same time. */
export async function approveUser(id: string, input: { departmentId?: string | undefined; jobRoleId?: string | undefined }, actor: AuditContext) {
  const existing = await loadUser(id);
  if (existing.status !== 'PENDING' && existing.status !== 'REJECTED') throw conflict('NOT_PENDING', 'Only pending or rejected registrations can be approved');
  await assertReferences(input.departmentId, input.jobRoleId);
  const user = await prisma.user.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      approvedAt: new Date(),
      approvedById: actor.userId ?? null,
      rejectionReason: null,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.jobRoleId ? { jobRoleId: input.jobRoleId } : {}),
    },
    include: userInclude,
  });
  await notifyUser(id, {
    type: 'ACCOUNT',
    title: 'Your account has been approved',
    message: 'Welcome to Capacity Connect. Open your Competency Passport to see your skill gaps and recommended training.',
    link: '/trainee/passport',
  });
  await recordAudit(actor, { action: AuditActions.USER_APPROVED, entityType: 'User', entityId: id, metadata: { email: user.email } });
  return toUserDto(user);
}

export async function rejectUser(id: string, reason: string, actor: AuditContext) {
  const existing = await loadUser(id);
  if (existing.status !== 'PENDING') throw conflict('NOT_PENDING', 'Only pending registrations can be rejected');
  const user = await prisma.user.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason }, include: userInclude });
  await recordAudit(actor, { action: AuditActions.USER_REJECTED, entityType: 'User', entityId: id, metadata: { reason } });
  return toUserDto(user);
}

export async function changeRole(id: string, role: UserRole, actor: AuditContext) {
  if (actor.userId === id) throw forbidden('CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role');
  const existing = await loadUser(id);
  if (existing.role === role) return toUserDto(existing);
  if (existing.role === 'ADMIN' && (await isLastActiveAdmin(id))) throw conflict('LAST_ADMIN', 'At least one active administrator is required');
  const user = await prisma.user.update({ where: { id }, data: { role }, include: userInclude });
  // Sessions carry the role only as a hint; the database value is authoritative on every request.
  await recordAudit(actor, { action: AuditActions.USER_ROLE_CHANGED, entityType: 'User', entityId: id, metadata: { from: existing.role, to: role } });
  await notifyUser(id, { type: 'ACCOUNT', title: 'Your access level changed', message: `Your role is now ${role.toLowerCase()}.` });
  return toUserDto(user);
}

export async function changeStatus(id: string, status: Extract<UserStatus, 'ACTIVE' | 'SUSPENDED'>, actor: AuditContext) {
  if (actor.userId === id) throw forbidden('CANNOT_CHANGE_OWN_STATUS', 'You cannot suspend your own account');
  const existing = await loadUser(id);
  if (existing.status === 'PENDING' || existing.status === 'REJECTED') throw conflict('USE_APPROVAL', 'Approve or reject pending registrations instead');
  if (status === 'SUSPENDED' && existing.role === 'ADMIN' && (await isLastActiveAdmin(id))) throw conflict('LAST_ADMIN', 'At least one active administrator is required');
  const [user] = await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { status, failedLoginCount: 0, lockedUntil: null }, include: userInclude }),
    ...(status === 'SUSPENDED' ? [prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
  ]);
  await recordAudit(actor, { action: AuditActions.USER_STATUS_CHANGED, entityType: 'User', entityId: id, metadata: { from: existing.status, to: status } });
  return toUserDto(user);
}

/** Issues a one-time temporary password (shown once to the administrator) and forces a change at next sign-in. */
export async function resetPassword(id: string, actor: AuditContext) {
  const existing = await loadUser(id);
  const temporaryPassword = generateTemporaryPassword();
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } }),
    prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await recordAudit(actor, { action: AuditActions.USER_PASSWORD_RESET, entityType: 'User', entityId: id, metadata: { email: existing.email } });
  return { temporaryPassword };
}

/**
 * Soft delete: the row is kept so attempts, certificates and audit history stay
 * consistent, while the e-mail / employee id are released and all sessions revoked.
 */
export async function deleteUser(id: string, actor: AuditContext) {
  if (actor.userId === id) throw forbidden('CANNOT_DELETE_SELF', 'You cannot delete your own account');
  const existing = await loadUser(id);
  if (existing.role === 'ADMIN' && (await isLastActiveAdmin(id))) throw conflict('LAST_ADMIN', 'At least one active administrator is required');
  const taughtCourses = await prisma.course.count({ where: { trainerId: id, deletedAt: null, status: 'PUBLISHED' } });
  if (taughtCourses > 0) throw conflict('TRAINER_HAS_COURSES', `This trainer owns ${taughtCourses} published course(s). Reassign or archive them first.`);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'SUSPENDED',
        email: `deleted+${id}@invalid.local`,
        employeeId: null,
        name: 'Deleted user',
        phone: null,
      },
    }),
    prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await recordAudit(actor, { action: AuditActions.USER_DELETED, entityType: 'User', entityId: id, metadata: { email: existing.email, name: existing.name } });
}
