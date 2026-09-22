import { Router } from 'express';
import { z } from 'zod';
import { conflict, notFound } from '../../lib/errors';
import { created, ok, paginationSchema, queryBool, skipTake, paginated, uuidParam } from '../../lib/http';
import { prisma, Prisma } from '../../lib/prisma';
import { codeSchema, level, optionalText, requiredText, searchQuery } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { AuditActions, auditContext, recordAudit } from '../../services/audit.service';
import { deleteDecayPolicy, listDecayPolicies, recordPracticeAtomically, saveDecayPolicy } from './decay.service';
import { DEFAULT_ENGINE_CONFIG, engineConfigSchema } from './engine/config';
import { analyzeSkillGap } from './engine/skill-gap';
import { computeCompetencyUpdate } from './engine/update';
import { getEngineConfig, getEngineConfigMeta, resetEngineConfig, saveEngineConfig } from './engine-config.service';
import { buildPassport, loadCompetencyTimeline } from './passport.service';
import { loadEmployeeAnalysis } from './profile.service';

export const competenciesRouter = Router();
competenciesRouter.use(authenticate);

const descriptorSchema = z.strictObject({
  foundation: optionalText(500),
  developing: optionalText(500),
  proficient: optionalText(500),
  expert: optionalText(500),
});

/** `RADAR METEOROLOGY` style code derived from a name when none is supplied. */
const deriveCode = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

const createSchema = z.strictObject({
  name: requiredText(2, 100, 'Name'),
  code: codeSchema.optional(),
  description: requiredText(10, 1000, 'Description'),
  category: requiredText(2, 60, 'Category'),
  levelDescriptors: descriptorSchema.optional(),
  isActive: z.boolean().optional(),
});
const updateSchema = z
  .strictObject({
    name: requiredText(2, 100, 'Name'),
    code: codeSchema,
    description: requiredText(10, 1000, 'Description'),
    category: requiredText(2, 60, 'Category'),
    levelDescriptors: descriptorSchema.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

const listQuery = paginationSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  q: searchQuery,
  category: z.string().trim().max(60).optional(),
  includeInactive: queryBool,
});

// ---------------------------------------------------------------------------------------------
// Signed-in employee: competencies, timeline, passport (must be declared before `/:id`)
// ---------------------------------------------------------------------------------------------

/** GET /api/competencies/me - my competencies against my role's requirements. */
competenciesRouter.get('/me', async (req, res) => {
  const analysis = await loadEmployeeAnalysis(currentUser(req).id);
  ok(res, {
    jobRole: analysis.jobRole,
    summary: analysis.summary,
    competencies: analysis.records,
    additional: analysis.additional,
  });
});

/** GET /api/competencies/me/history?competencyId= - the competency timeline (35% → 52% → 72%). */
competenciesRouter.get('/me/history', async (req, res) => {
  const { competencyId } = z.object({ competencyId: z.string().uuid().optional() }).parse(req.query);
  ok(res, await loadCompetencyTimeline(currentUser(req).id, competencyId));
});

/** GET /api/competencies/me/passport - the Competency Passport. */
competenciesRouter.get('/me/passport', async (req, res) => {
  ok(res, await buildPassport(currentUser(req).id));
});

// ---------------------------------------------------------------------------------------------
// Engine configuration and simulator
// ---------------------------------------------------------------------------------------------

/** GET /api/competencies/engine/config - thresholds and formula weights in force (read-only for everyone). */
competenciesRouter.get('/engine/config', async (_req, res) => {
  const [config, meta] = await Promise.all([getEngineConfig(), getEngineConfigMeta()]);
  ok(res, { config, defaults: DEFAULT_ENGINE_CONFIG, ...meta });
});

/** PUT /api/competencies/engine/config - admin: change thresholds / weights (validated). */
competenciesRouter.put('/engine/config', requireRole('ADMIN'), async (req, res) => {
  const user = currentUser(req);
  const config = engineConfigSchema.parse(req.body);
  const before = await getEngineConfig();
  await saveEngineConfig(config, user.id);
  await recordAudit(auditContext(req), {
    action: AuditActions.ENGINE_CONFIG_UPDATED,
    entityType: 'SystemSetting',
    entityId: 'engine.config',
    metadata: { before, after: config } as unknown as Prisma.InputJsonValue,
  });
  ok(res, { config, ...(await getEngineConfigMeta()) });
});

/** POST /api/competencies/engine/config/reset - admin: restore the default configuration. */
competenciesRouter.post('/engine/config/reset', requireRole('ADMIN'), async (req, res) => {
  const config = await resetEngineConfig();
  await recordAudit(auditContext(req), { action: AuditActions.ENGINE_CONFIG_UPDATED, entityType: 'SystemSetting', entityId: 'engine.config', metadata: { reset: true } });
  ok(res, { config, ...(await getEngineConfigMeta()) });
});

const simulateSchema = z.strictObject({
  config: engineConfigSchema.optional(),
  requiredLevel: level,
  currentLevel: level,
  importance: z.number().int().min(1).max(5).default(3),
  roleCriticality: z.number().int().min(1).max(5).default(3),
  assessmentScore: z.number().min(0).max(100).optional(),
  trainerEvaluationScore: z.number().min(0).max(100).optional(),
  practicalScore: z.number().min(0).max(100).optional(),
  ceiling: level.optional(),
});

/**
 * POST /api/competencies/engine/simulate - what-if calculator for administrators and trainers.
 * Runs the real engine functions (optionally with an unsaved configuration) without touching any data.
 */
competenciesRouter.post('/engine/simulate', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  const input = simulateSchema.parse(req.body);
  const config = input.config ?? (await getEngineConfig());
  const gapInput = {
    competencyId: 'simulation',
    competencyCode: 'SIM',
    competencyName: 'Simulated competency',
    category: 'Simulation',
    requiredLevel: input.requiredLevel,
    importance: input.importance,
    roleCriticality: input.roleCriticality,
  };
  const update = computeCompetencyUpdate(
    {
      previousLevel: input.currentLevel,
      assessmentScore: input.assessmentScore ?? null,
      trainerEvaluationScore: input.trainerEvaluationScore ?? null,
      practicalScore: input.practicalScore ?? null,
      ceiling: input.ceiling ?? null,
    },
    config,
  );
  ok(res, {
    before: analyzeSkillGap({ ...gapInput, currentLevel: input.currentLevel }, config),
    update,
    after: analyzeSkillGap({ ...gapInput, currentLevel: update.newLevel }, config),
  });
});

// ---------------------------------------------------------------------------------------------
// Competency decay policies (administration)
// ---------------------------------------------------------------------------------------------

const decayPolicySchema = z.strictObject({
  decayEnabled: z.boolean().default(true),
  halfLifeDays: z.number().int().min(1, 'The half-life must be at least 1 day').max(3650),
  minimumSafeLevel: level,
  recertificationIntervalDays: z.number().int().min(0, 'Use 0 to switch recertification off').max(3650),
  criticality: z.number().int().min(1).max(5),
  isSimulation: z.boolean().default(false),
  notes: optionalText(500).nullable().optional(),
});

/**
 * GET /api/competencies/decay/policies - every competency with its freshness policy.
 * Trainers may read it: it explains why a trainee's competency is at risk.
 */
competenciesRouter.get('/decay/policies', requireRole('ADMIN', 'TRAINER'), async (_req, res) => {
  const config = await getEngineConfig();
  ok(res, { policies: await listDecayPolicies(config), defaults: config.decay });
});

/** PUT /api/competencies/:id/decay-policy - admin: configure how a competency loses freshness. */
competenciesRouter.put('/:id/decay-policy', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const input = decayPolicySchema.parse(req.body);
  const competency = await prisma.competency.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!competency) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');

  const policy = await saveDecayPolicy(id, input, currentUser(req).id);
  await recordAudit(auditContext(req), {
    action: AuditActions.DECAY_POLICY_UPDATED,
    entityType: 'CompetencyDecayPolicy',
    entityId: id,
    metadata: { competency: competency.name, ...input } as unknown as Prisma.InputJsonValue,
  });
  ok(res, { policy });
});

/** DELETE /api/competencies/:id/decay-policy - admin: stop this competency decaying at all. */
competenciesRouter.delete('/:id/decay-policy', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  await deleteDecayPolicy(id);
  await recordAudit(auditContext(req), { action: AuditActions.DECAY_POLICY_UPDATED, entityType: 'CompetencyDecayPolicy', entityId: id, metadata: { removed: true } });
  ok(res, { removed: true });
});

const practiceSchema = z.strictObject({
  userId: z.uuid(),
  competencyId: z.uuid(),
  practicedAt: z.coerce.date().optional(),
  source: z.enum(['COURSE_COMPLETION', 'ASSESSMENT', 'TRAINER_EVALUATION', 'OPERATIONAL_DUTY', 'REFRESHER', 'MANUAL_ENTRY']).default('MANUAL_ENTRY'),
  note: optionalText(500).optional(),
});

/**
 * POST /api/competencies/practice - record that a competency was used.
 *
 * This resets the decay clock without claiming the competency was re-verified:
 * only an assessment does that, which recertification tracks separately.
 */
competenciesRouter.post('/practice', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  const input = practiceSchema.parse(req.body);
  const practicedAt = input.practicedAt ?? new Date();
  if (practicedAt.getTime() > Date.now() + 60_000) throw conflict('PRACTICE_IN_FUTURE', 'A practice date cannot be in the future');

  const record = await recordPracticeAtomically({
    userId: input.userId,
    competencyId: input.competencyId,
    practicedAt,
    source: input.source,
    note: input.note ?? null,
    recordedById: currentUser(req).id,
  });
  await recordAudit(auditContext(req), {
    action: AuditActions.COMPETENCY_PRACTICE_RECORDED,
    entityType: 'CompetencyPracticeRecord',
    entityId: record.id,
    metadata: { userId: input.userId, competencyId: input.competencyId, source: input.source } as unknown as Prisma.InputJsonValue,
  });
  created(res, { record });
});

// ---------------------------------------------------------------------------------------------
// Competency framework CRUD
// ---------------------------------------------------------------------------------------------

/** GET /api/competencies - the competency framework. */
competenciesRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const query = listQuery.parse(req.query);
  const showInactive = Boolean(query.includeInactive) && user.role === 'ADMIN';

  const where: Prisma.CompetencyWhereInput = {
    ...(showInactive ? {} : { isActive: true }),
    ...(query.category ? { category: query.category } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { code: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, items, categories] = await Promise.all([
    prisma.competency.count({ where }),
    prisma.competency.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      ...skipTake(query),
      include: { _count: { select: { courses: true, roles: true, employees: true } } },
    }),
    prisma.competency.findMany({ where: showInactive ? {} : { isActive: true }, distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
  ]);

  paginated(
    res,
    items.map(({ _count, ...competency }) => ({ ...competency, courseCount: _count.courses, roleCount: _count.roles, employeeCount: _count.employees })),
    query.page,
    query.pageSize,
    total,
    { categories: categories.map((row) => row.category) },
  );
});

/** POST /api/competencies - admin */
competenciesRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const input = createSchema.parse(req.body);
  const code = input.code ?? deriveCode(input.name);
  if (code.length < 2) throw conflict('INVALID_CODE', 'A code could not be derived from the name; please provide one');
  const competency = await prisma.competency.create({
    data: {
      name: input.name,
      code,
      description: input.description,
      category: input.category,
      levelDescriptors: input.levelDescriptors ?? Prisma.JsonNull,
      isActive: input.isActive ?? true,
    },
  });
  await recordAudit(auditContext(req), { action: AuditActions.COMPETENCY_CREATED, entityType: 'Competency', entityId: competency.id, metadata: { name: competency.name } });
  created(res, competency);
});

/** GET /api/competencies/:id - detail with mapped courses (and role requirements for admins). */
competenciesRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const id = uuidParam(req, 'id');
  const competency = await prisma.competency.findUnique({
    where: { id },
    include: {
      courses: {
        where: { course: { status: 'PUBLISHED', deletedAt: null } },
        include: { course: { select: { id: true, title: true, difficulty: true, durationMinutes: true } } },
        orderBy: { levelFrom: 'asc' },
      },
    },
  });
  if (!competency || (!competency.isActive && user.role !== 'ADMIN')) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');

  const base = {
    ...competency,
    courses: competency.courses.map((mapping) => ({ ...mapping.course, levelFrom: mapping.levelFrom, levelTo: mapping.levelTo })),
  };
  if (user.role !== 'ADMIN') {
    ok(res, base);
    return;
  }

  const [roles, stats] = await Promise.all([
    prisma.roleCompetency.findMany({
      where: { competencyId: id },
      include: { role: { select: { id: true, name: true, criticality: true } } },
      orderBy: { requiredLevel: 'desc' },
    }),
    prisma.employeeCompetency.aggregate({ where: { competencyId: id }, _avg: { currentLevel: true }, _count: true }),
  ]);
  ok(res, {
    ...base,
    roles: roles.map((mapping) => ({
      roleId: mapping.roleId,
      name: mapping.role.name,
      criticality: mapping.role.criticality,
      requiredLevel: mapping.requiredLevel,
      importance: mapping.importance,
    })),
    stats: { employeesAssessed: stats._count, averageLevel: Math.round((stats._avg.currentLevel ?? 0) * 10) / 10 },
  });
});

/** PATCH /api/competencies/:id - admin (also used to deactivate / reactivate). */
competenciesRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const input = updateSchema.parse(req.body);
  if (!(await prisma.competency.findUnique({ where: { id }, select: { id: true } }))) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');
  const { levelDescriptors, ...rest } = input;
  const competency = await prisma.competency.update({
    where: { id },
    data: { ...rest, ...(levelDescriptors !== undefined ? { levelDescriptors: levelDescriptors ?? Prisma.JsonNull } : {}) },
  });
  await recordAudit(auditContext(req), { action: AuditActions.COMPETENCY_UPDATED, entityType: 'Competency', entityId: id, metadata: { changes: Object.keys(input) } });
  ok(res, competency);
});

/** DELETE /api/competencies/:id - admin; competencies with any usage can only be deactivated. */
competenciesRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const competency = await prisma.competency.findUnique({
    where: { id },
    include: { _count: { select: { courses: true, roles: true, employees: true, history: true } } },
  });
  if (!competency) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');
  const usage = competency._count;
  if (usage.courses + usage.roles + usage.employees + usage.history > 0) {
    throw conflict(
      'COMPETENCY_IN_USE',
      'This competency is used by courses, roles or employee records. Deactivate it instead of deleting it.',
      { courses: usage.courses, roles: usage.roles, employees: usage.employees },
    );
  }
  await prisma.competency.delete({ where: { id } });
  await recordAudit(auditContext(req), { action: AuditActions.COMPETENCY_DELETED, entityType: 'Competency', entityId: id, metadata: { name: competency.name } });
  ok(res, { deleted: true });
});
