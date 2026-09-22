import { Router } from 'express';
import { z } from 'zod';
import { created, ok, paginated, paginationSchema, queryBool, skipTake, uuidParam } from '../../lib/http';
import { prisma, type Prisma } from '../../lib/prisma';
import { isoDate, requiredText, searchQuery, uuid } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { auditContext } from '../../services/audit.service';
import { forecastQuerySchema } from '../ai/ai.schemas';
import { forecastTrainingNeeds } from '../ai/predictive.service';
import { createAnnouncement, deleteAnnouncement, updateAnnouncement } from '../announcements/announcements.service';
import { runRemindersAudited } from '../reminders/reminders.service';
import { adminAnalytics, competencyHeatmap, heatmapCell, PERIOD_DAYS, skillGapAnalytics, trainingNeedDetail, trainingNeeds } from './analytics.service';

/** Everything under /api/admin requires the ADMIN role, enforced here on the server. */
export const adminRouter = Router();
adminRouter.use(authenticate, requireRole('ADMIN'));

const orgFilters = z.object({ departmentId: uuid.optional(), jobRoleId: uuid.optional() });

/** GET /api/admin/analytics - organisation metrics, monthly trends and department comparison. */
adminRouter.get('/analytics', async (req, res) => {
  const { months } = z.object({ months: z.coerce.number().int().min(3).max(24).default(12) }).parse(req.query);
  ok(res, await adminAnalytics(months));
});

/** GET /api/admin/heatmap - competency heatmap (department or role × competency). */
adminRouter.get('/heatmap', async (req, res) => {
  const query = orgFilters
    .extend({
      competencyId: uuid.optional(),
      groupBy: z.enum(['department', 'role']).default('department'),
      period: z.enum(['30d', '90d', '180d', '365d']).default('90d'),
      /** `freshness` decays every level before the grid is built. */
      layer: z.enum(['competency', 'freshness']).default('competency'),
      offsetDays: z.coerce.number().int().min(0).max(3650).optional(),
    })
    .parse(req.query);
  const asOf = query.offsetDays ? new Date(Date.now() + query.offsetDays * 86_400_000) : undefined;
  ok(
    res,
    await competencyHeatmap({
      groupBy: query.groupBy,
      periodDays: PERIOD_DAYS[query.period],
      departmentId: query.departmentId,
      jobRoleId: query.jobRoleId,
      competencyId: query.competencyId,
      layer: query.layer,
      ...(asOf ? { asOf } : {}),
    }),
  );
});

/** GET /api/admin/heatmap/cell - the employees behind one heatmap cell. */
adminRouter.get('/heatmap/cell', async (req, res) => {
  const query = paginationSchema
    .extend({
      competencyId: uuid,
      groupBy: z.enum(['department', 'role']).default('department'),
      groupId: z.string().min(1).max(60).default('all'),
      onlyGaps: queryBool,
    })
    .parse(req.query);
  const result = await heatmapCell({ ...query, onlyGaps: query.onlyGaps ?? true });
  paginated(res, result.employees, query.page, query.pageSize, result.total, {
    competency: result.competency,
    summary: result.summary,
    recommendedCourses: result.recommendedCourses,
  });
});

/** GET /api/admin/training-needs - competencies ranked by organisation-wide training demand. */
adminRouter.get('/training-needs', async (req, res) => {
  ok(res, await trainingNeeds(orgFilters.parse(req.query)));
});

/** GET /api/admin/training-needs/:competencyId - departments, affected employees and courses for one competency. */
adminRouter.get('/training-needs/:competencyId', async (req, res) => {
  ok(res, await trainingNeedDetail(uuidParam(req, 'competencyId'), orgFilters.parse(req.query)));
});

/** GET /api/admin/predictive-needs - trend-based forecast of training needs (calculated from history; no AI service involved). */
adminRouter.get('/predictive-needs', async (req, res) => {
  const { horizon } = forecastQuerySchema.parse(req.query);
  ok(res, await forecastTrainingNeeds(horizon));
});

/** GET /api/admin/skill-gaps - severity distribution and gaps by department / role / competency. */
adminRouter.get('/skill-gaps', async (req, res) => {
  ok(res, await skillGapAnalytics(orgFilters.extend({ competencyId: uuid.optional() }).parse(req.query)));
});

// ---- audit log ----------------------------------------------------------------------------------------------------

/** GET /api/admin/audit-logs - who did what, when (filterable). */
adminRouter.get('/audit-logs', async (req, res) => {
  const query = paginationSchema
    .extend({
      q: searchQuery,
      action: z.string().trim().max(60).optional(),
      entityType: z.string().trim().max(60).optional(),
      userId: uuid.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
    })
    .parse(req.query);

  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.entityType ? { entityType: query.entityType } : {}),
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    ...(query.q
      ? {
          OR: [
            { action: { contains: query.q, mode: 'insensitive' } },
            { entityType: { contains: query.q, mode: 'insensitive' } },
            { entityId: { contains: query.q, mode: 'insensitive' } },
            { user: { name: { contains: query.q, mode: 'insensitive' } } },
            { user: { email: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, rows, actions, entityTypes] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(query), include: { user: { select: { id: true, name: true, email: true, role: true } } } }),
    prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
  ]);
  paginated(res, rows, query.page, query.pageSize, total, { actions: actions.map((row) => row.action), entityTypes: entityTypes.map((row) => row.entityType) });
});

// ---- announcements --------------------------------------------------------------------------------------------------

const announcementBase = {
  title: requiredText(3, 150, 'Title'),
  body: requiredText(3, 2000, 'Message'),
  audience: z.enum(['ALL', 'TRAINEES', 'TRAINERS', 'ADMINS']),
  departmentId: uuid.nullable(),
  expiresAt: isoDate.nullable(),
};

/** GET /api/admin/announcements - every announcement (including expired ones). */
adminRouter.get('/announcements', async (req, res) => {
  const query = paginationSchema.parse(req.query);
  const [total, rows] = await Promise.all([
    prisma.announcement.count(),
    prisma.announcement.findMany({ orderBy: { publishedAt: 'desc' }, ...skipTake(query), include: { createdBy: { select: { name: true } }, department: { select: { name: true } } } }),
  ]);
  paginated(
    res,
    rows.map(({ createdBy, department, ...row }) => ({ ...row, author: createdBy.name, department: department?.name ?? null })),
    query.page,
    query.pageSize,
    total,
  );
});

/** POST /api/admin/announcements - publish and (by default) notify the audience. */
adminRouter.post('/announcements', async (req, res) => {
  const input = z
    .strictObject({
      title: announcementBase.title,
      body: announcementBase.body,
      audience: announcementBase.audience.default('ALL'),
      departmentId: announcementBase.departmentId.optional(),
      expiresAt: announcementBase.expiresAt.optional(),
      notify: z.boolean().default(true),
    })
    .parse(req.body);
  const { notify, ...data } = input;
  created(res, await createAnnouncement(currentUser(req).id, data, notify, auditContext(req)));
});

/** PATCH /api/admin/announcements/:id */
adminRouter.patch('/announcements/:id', async (req, res) => {
  const input = z
    .strictObject(announcementBase)
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
    .parse(req.body);
  ok(res, await updateAnnouncement(uuidParam(req, 'id'), input, auditContext(req)));
});

/** DELETE /api/admin/announcements/:id */
adminRouter.delete('/announcements/:id', async (req, res) => {
  await deleteAnnouncement(uuidParam(req, 'id'), auditContext(req));
  ok(res, { deleted: true });
});

// ---- jobs -----------------------------------------------------------------------------------------------------------

/** POST /api/admin/jobs/reminders - send deadline / stalled-learner / skill-gap reminders now. */
adminRouter.post('/jobs/reminders', async (req, res) => {
  ok(res, await runRemindersAudited(auditContext(req)));
});
