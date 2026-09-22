import { Router } from 'express';
import { z } from 'zod';
import { notFound, unauthorized } from '../../lib/errors';
import { created, ok, paginated, paginationSchema, skipTake, uuidParam } from '../../lib/http';
import { prisma, type Prisma } from '../../lib/prisma';
import { emailSchema, isoDate, level, nullableText, optionalText, requiredText, searchQuery } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { auditContext } from '../../services/audit.service';
import { passwordSchema } from '../auth/password';
import { adjustCompetencyLevel } from '../competencies/adjustment.service';
import { buildPassport } from '../competencies/passport.service';
import { assertCanViewEmployee } from './access';
import { profileRouter } from './profile.routes';
import { toUserDto, userInclude } from './user.mapper';
import * as usersService from './users.service';

export const usersRouter = Router();
usersRouter.use(authenticate);

const roleEnum = z.enum(['TRAINEE', 'TRAINER', 'ADMIN']);
const statusEnum = z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']);
const uuid = z.string().uuid();

// ---------------------------------------------------------------------------------------------
// Signed-in user
// ---------------------------------------------------------------------------------------------

/** GET /api/users/me - the signed-in user (also used by the web app to restore a session). */
usersRouter.get('/me', async (req, res) => {
  const { id } = currentUser(req);
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  if (!user) throw unauthorized();
  const unreadNotifications = await prisma.notification.count({ where: { userId: id, isRead: false } });
  ok(res, { ...toUserDto(user), unreadNotifications });
});

const updateMeSchema = z
  .strictObject({
    name: requiredText(2, 100, 'Name'),
    phone: nullableText(20),
    designation: nullableText(100),
    location: nullableText(100),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/** PATCH /api/users/me - basic details. Department, role and employee id are managed by administrators. */
usersRouter.patch('/me', async (req, res) => {
  const { id } = currentUser(req);
  const input = updateMeSchema.parse(req.body);
  const user = await prisma.user.update({ where: { id }, data: input, include: userInclude });
  ok(res, toUserDto(user));
});

usersRouter.use('/me', profileRouter);

// ---------------------------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------------------------

const listQuery = paginationSchema.extend({
  q: searchQuery,
  role: roleEnum.optional(),
  status: statusEnum.optional(),
  departmentId: uuid.optional(),
  jobRoleId: uuid.optional(),
  sort: z.enum(['name', 'createdAt', 'lastLoginAt']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/** GET /api/users - admin: search and filter all accounts. */
usersRouter.get('/', requireRole('ADMIN'), async (req, res) => {
  const query = listQuery.parse(req.query);
  const base: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.jobRoleId ? { jobRoleId: query.jobRoleId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { employeeId: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const where: Prisma.UserWhereInput = { ...base, ...(query.status ? { status: query.status } : {}) };

  const [total, users, statusRows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { [query.sort]: query.order } as Prisma.UserOrderByWithRelationInput,
      ...skipTake(query),
    }),
    prisma.user.groupBy({ by: ['status'], where: base, _count: true }),
  ]);
  const statusCounts = { PENDING: 0, ACTIVE: 0, REJECTED: 0, SUSPENDED: 0 } as Record<string, number>;
  for (const row of statusRows) statusCounts[row.status] = row._count;
  paginated(res, users.map(toUserDto), query.page, query.pageSize, total, { statusCounts });
});

const createSchema = z.strictObject({
  name: requiredText(2, 100, 'Name'),
  email: emailSchema,
  role: roleEnum.default('TRAINEE'),
  password: passwordSchema.optional(),
  employeeId: optionalText(30),
  phone: optionalText(20),
  designation: optionalText(100),
  location: optionalText(100),
  joiningDate: isoDate.optional(),
  departmentId: uuid.optional(),
  jobRoleId: uuid.optional(),
});

/** POST /api/users - admin: create an account (temporary password is generated unless supplied). */
usersRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  created(res, await usersService.createUser(createSchema.parse(req.body), auditContext(req)));
});

/** GET /api/users/:id - admin */
usersRouter.get('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { ...userInclude, _count: { select: { enrollments: true, certificates: true, attempts: true } } },
  });
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  const { _count, ...rest } = user;
  ok(res, { ...toUserDto(rest), stats: { enrollments: _count.enrollments, certificates: _count.certificates, assessmentAttempts: _count.attempts } });
});

const updateSchema = z
  .strictObject({
    name: requiredText(2, 100, 'Name'),
    employeeId: nullableText(30),
    phone: nullableText(20),
    designation: nullableText(100),
    location: nullableText(100),
    joiningDate: isoDate.nullable(),
    departmentId: uuid.nullable(),
    jobRoleId: uuid.nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/** PATCH /api/users/:id - admin */
usersRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  ok(res, await usersService.updateUser(uuidParam(req, 'id'), updateSchema.parse(req.body), auditContext(req)));
});

/** POST /api/users/:id/approve - admin: approve a pending registration (optionally assigning department / role). */
usersRouter.post('/:id/approve', requireRole('ADMIN'), async (req, res) => {
  const input = z.strictObject({ departmentId: uuid.optional(), jobRoleId: uuid.optional() }).parse(req.body ?? {});
  ok(res, await usersService.approveUser(uuidParam(req, 'id'), input, auditContext(req)));
});

/** POST /api/users/:id/reject - admin */
usersRouter.post('/:id/reject', requireRole('ADMIN'), async (req, res) => {
  const { reason } = z.strictObject({ reason: requiredText(3, 300, 'Reason') }).parse(req.body);
  ok(res, await usersService.rejectUser(uuidParam(req, 'id'), reason, auditContext(req)));
});

/** PATCH /api/users/:id/role - admin: change access role (TRAINEE / TRAINER / ADMIN). */
usersRouter.patch('/:id/role', requireRole('ADMIN'), async (req, res) => {
  const { role } = z.strictObject({ role: roleEnum }).parse(req.body);
  ok(res, await usersService.changeRole(uuidParam(req, 'id'), role, auditContext(req)));
});

/** PATCH /api/users/:id/status - admin: suspend or reactivate. */
usersRouter.patch('/:id/status', requireRole('ADMIN'), async (req, res) => {
  const { status } = z.strictObject({ status: z.enum(['ACTIVE', 'SUSPENDED']) }).parse(req.body);
  ok(res, await usersService.changeStatus(uuidParam(req, 'id'), status, auditContext(req)));
});

/** POST /api/users/:id/reset-password - admin: issue a one-time temporary password. */
usersRouter.post('/:id/reset-password', requireRole('ADMIN'), async (req, res) => {
  ok(res, await usersService.resetPassword(uuidParam(req, 'id'), auditContext(req)));
});

/** DELETE /api/users/:id - admin: soft delete. */
usersRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  await usersService.deleteUser(uuidParam(req, 'id'), auditContext(req));
  ok(res, { deleted: true });
});

/** PUT /api/users/:id/competencies/:competencyId - admin: record a baseline or correct a competency level. */
usersRouter.put('/:id/competencies/:competencyId', requireRole('ADMIN'), async (req, res) => {
  const input = z.strictObject({ level, reason: requiredText(3, 300, 'Reason') }).parse(req.body);
  ok(
    res,
    await adjustCompetencyLevel({ userId: uuidParam(req, 'id'), competencyId: uuidParam(req, 'competencyId'), level: input.level, reason: input.reason, actor: auditContext(req) }),
  );
});

/** GET /api/users/:id/passport - admin, or a trainer for trainees enrolled in their courses. */
usersRouter.get('/:id/passport', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  const id = uuidParam(req, 'id');
  await assertCanViewEmployee(currentUser(req), id);
  ok(res, await buildPassport(id));
});
