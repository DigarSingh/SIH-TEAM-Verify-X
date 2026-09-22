import { Router } from 'express';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors';
import { created, ok, queryBool, uuidParam } from '../../lib/http';
import { codeSchema, nullableText, optionalText, requiredText } from '../../lib/schemas';
import { prisma } from '../../lib/prisma';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { AuditActions, auditContext, recordAudit } from '../../services/audit.service';

export const departmentsRouter = Router();
departmentsRouter.use(authenticate);

const createSchema = z.strictObject({
  name: requiredText(2, 100, 'Name'),
  code: codeSchema,
  description: optionalText(500),
  isActive: z.boolean().optional(),
});
const updateSchema = z
  .strictObject({
    name: requiredText(2, 100, 'Name'),
    code: codeSchema,
    description: nullableText(500),
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/** GET /api/departments - active departments for everyone; `?includeInactive=true` is admin-only. */
departmentsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const { includeInactive } = z.object({ includeInactive: queryBool }).parse(req.query);
  const showAll = Boolean(includeInactive) && user.role === 'ADMIN';
  const departments = await prisma.department.findMany({
    where: showAll ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: { where: { deletedAt: null } } } } },
  });
  ok(
    res,
    departments.map(({ _count, ...department }) => ({ ...department, employeeCount: _count.users })),
  );
});

/** POST /api/departments - admin */
departmentsRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const input = createSchema.parse(req.body);
  const department = await prisma.department.create({
    data: { name: input.name, code: input.code, description: input.description ?? null, isActive: input.isActive ?? true },
  });
  await recordAudit(auditContext(req), { action: AuditActions.DEPARTMENT_CREATED, entityType: 'Department', entityId: department.id, metadata: { name: department.name } });
  created(res, department);
});

/** PATCH /api/departments/:id - admin */
departmentsRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const input = updateSchema.parse(req.body);
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) throw notFound('DEPARTMENT_NOT_FOUND', 'Department not found');
  const department = await prisma.department.update({ where: { id }, data: input });
  await recordAudit(auditContext(req), { action: AuditActions.DEPARTMENT_UPDATED, entityType: 'Department', entityId: id, metadata: { changes: Object.keys(input) } });
  ok(res, department);
});

/** DELETE /api/departments/:id - admin; departments with employees can only be deactivated. */
departmentsRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const existing = await prisma.department.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!existing) throw notFound('DEPARTMENT_NOT_FOUND', 'Department not found');
  if (existing._count.users > 0) {
    throw conflict('DEPARTMENT_IN_USE', `${existing._count.users} user(s) belong to this department. Deactivate it instead of deleting it.`);
  }
  await prisma.department.delete({ where: { id } });
  await recordAudit(auditContext(req), { action: AuditActions.DEPARTMENT_DELETED, entityType: 'Department', entityId: id, metadata: { name: existing.name } });
  ok(res, { deleted: true });
});
