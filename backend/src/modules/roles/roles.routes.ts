import { Router } from 'express';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors';
import { created, ok, queryBool, uuidParam } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { codeSchema, level, nullableText, optionalText, requiredText } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { AuditActions, auditContext, recordAudit } from '../../services/audit.service';
import { CRITICALITY_LABELS, IMPORTANCE_LABELS } from '../competencies/engine/skill-gap';

/**
 * Organisational job roles (designations) and their required competencies.
 * NOT to be confused with access roles (TRAINEE / TRAINER / ADMIN).
 */
export const rolesRouter = Router();
rolesRouter.use(authenticate);

const scale = z.number().int().min(1, 'Minimum is 1').max(5, 'Maximum is 5');

const createSchema = z.strictObject({
  name: requiredText(2, 100, 'Name'),
  code: codeSchema,
  description: optionalText(500),
  criticality: scale.default(3),
  isActive: z.boolean().optional(),
});
const updateSchema = z
  .strictObject({
    name: requiredText(2, 100, 'Name'),
    code: codeSchema,
    description: nullableText(500),
    criticality: scale,
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

const requirementSchema = z.strictObject({ requiredLevel: level, importance: scale.default(3) });

const roleSummary = (role: {
  id: string;
  name: string;
  code: string;
  description: string | null;
  criticality: number;
  isActive: boolean;
  _count: { users: number; competencies: number };
}) => ({
  id: role.id,
  name: role.name,
  code: role.code,
  description: role.description,
  criticality: role.criticality,
  criticalityLabel: CRITICALITY_LABELS[role.criticality],
  isActive: role.isActive,
  employeeCount: role._count.users,
  competencyCount: role._count.competencies,
});

/** GET /api/roles - active roles for everyone; `?includeInactive=true` is admin-only. */
rolesRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const { includeInactive } = z.object({ includeInactive: queryBool }).parse(req.query);
  const showAll = Boolean(includeInactive) && user.role === 'ADMIN';
  const roles = await prisma.role.findMany({
    where: showAll ? {} : { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { users: { where: { deletedAt: null } }, competencies: true } } },
  });
  ok(res, roles.map(roleSummary));
});

/** GET /api/roles/:id - role with its required competencies. */
rolesRouter.get('/:id', async (req, res) => {
  const id = uuidParam(req, 'id');
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      _count: { select: { users: { where: { deletedAt: null } }, competencies: true } },
      competencies: { include: { competency: { select: { id: true, code: true, name: true, category: true, isActive: true } } }, orderBy: { competency: { name: 'asc' } } },
    },
  });
  if (!role) throw notFound('ROLE_NOT_FOUND', 'Role not found');
  ok(res, {
    ...roleSummary(role),
    competencies: role.competencies.map((requirement) => ({
      competencyId: requirement.competencyId,
      code: requirement.competency.code,
      name: requirement.competency.name,
      category: requirement.competency.category,
      isActive: requirement.competency.isActive,
      requiredLevel: requirement.requiredLevel,
      importance: requirement.importance,
      importanceLabel: IMPORTANCE_LABELS[requirement.importance],
    })),
  });
});

/** POST /api/roles - admin */
rolesRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const input = createSchema.parse(req.body);
  const role = await prisma.role.create({
    data: { name: input.name, code: input.code, description: input.description ?? null, criticality: input.criticality, isActive: input.isActive ?? true },
  });
  await recordAudit(auditContext(req), { action: AuditActions.ROLE_CREATED, entityType: 'Role', entityId: role.id, metadata: { name: role.name } });
  created(res, role);
});

/** PATCH /api/roles/:id - admin */
rolesRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const input = updateSchema.parse(req.body);
  if (!(await prisma.role.findUnique({ where: { id }, select: { id: true } }))) throw notFound('ROLE_NOT_FOUND', 'Role not found');
  const role = await prisma.role.update({ where: { id }, data: input });
  await recordAudit(auditContext(req), { action: AuditActions.ROLE_UPDATED, entityType: 'Role', entityId: id, metadata: { changes: Object.keys(input) } });
  ok(res, role);
});

/** DELETE /api/roles/:id - admin; roles held by employees can only be deactivated. */
rolesRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound('ROLE_NOT_FOUND', 'Role not found');
  if (role._count.users > 0) throw conflict('ROLE_IN_USE', `${role._count.users} employee(s) hold this role. Deactivate it instead of deleting it.`);
  await prisma.role.delete({ where: { id } });
  await recordAudit(auditContext(req), { action: AuditActions.ROLE_DELETED, entityType: 'Role', entityId: id, metadata: { name: role.name } });
  ok(res, { deleted: true });
});

/** PUT /api/roles/:id/competencies/:competencyId - define (or change) the required level for a role. */
rolesRouter.put('/:id/competencies/:competencyId', requireRole('ADMIN'), async (req, res) => {
  const roleId = uuidParam(req, 'id');
  const competencyId = uuidParam(req, 'competencyId');
  const input = requirementSchema.parse(req.body);
  const [role, competency] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } }),
    prisma.competency.findUnique({ where: { id: competencyId }, select: { id: true, name: true, isActive: true } }),
  ]);
  if (!role) throw notFound('ROLE_NOT_FOUND', 'Role not found');
  if (!competency) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');
  if (!competency.isActive) throw conflict('COMPETENCY_INACTIVE', 'Inactive competencies cannot be mapped to roles');

  const requirement = await prisma.roleCompetency.upsert({
    where: { roleId_competencyId: { roleId, competencyId } },
    create: { roleId, competencyId, requiredLevel: input.requiredLevel, importance: input.importance },
    update: { requiredLevel: input.requiredLevel, importance: input.importance },
  });
  await recordAudit(auditContext(req), {
    action: AuditActions.ROLE_COMPETENCY_MAPPED,
    entityType: 'Role',
    entityId: roleId,
    metadata: { role: role.name, competency: competency.name, requiredLevel: input.requiredLevel, importance: input.importance },
  });
  ok(res, requirement);
});

/** DELETE /api/roles/:id/competencies/:competencyId - remove a requirement from a role. */
rolesRouter.delete('/:id/competencies/:competencyId', requireRole('ADMIN'), async (req, res) => {
  const roleId = uuidParam(req, 'id');
  const competencyId = uuidParam(req, 'competencyId');
  const removed = await prisma.roleCompetency.deleteMany({ where: { roleId, competencyId } });
  if (removed.count === 0) throw notFound('MAPPING_NOT_FOUND', 'This competency is not mapped to the role');
  await recordAudit(auditContext(req), { action: AuditActions.ROLE_COMPETENCY_UNMAPPED, entityType: 'Role', entityId: roleId, metadata: { competencyId } });
  ok(res, { deleted: true });
});
