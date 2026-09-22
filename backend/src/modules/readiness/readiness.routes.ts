import { Router, type Request } from 'express';
import { z } from 'zod';
import { created, ok, uuidParam } from '../../lib/http';
import { level, optionalText, requiredText } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { AuditActions, auditContext, recordAudit } from '../../services/audit.service';
import { asOfQuery, resolveAsOf, type AsOf } from '../competencies/decay.service';
import { getEngineConfig } from '../competencies/engine-config.service';
import { loadReadinessOverview } from './overview.service';
import { assignPreparation, createEvent, deleteEvent, listAssignments, listEvents, loadEvent, loadEventReadiness, loadReadinessCalendar, updateEvent } from './readiness.service';

export const readinessRouter = Router();
readinessRouter.use(authenticate);

async function requestedAsOf(req: Request): Promise<AsOf> {
  return resolveAsOf(asOfQuery.parse(req.query), await getEngineConfig());
}

const hazardTypes = ['MONSOON', 'CYCLONE', 'HEATWAVE', 'FLOOD', 'WINTER', 'THUNDERSTORM', 'OTHER'] as const;
const statuses = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

const eventSchema = z.strictObject({
  name: requiredText(3, 120, 'Name'),
  description: optionalText(1000).nullable().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  hazardType: z.enum(hazardTypes).default('OTHER'),
  priority: z.number().int().min(1).max(5).default(3),
  status: z.enum(statuses).optional(),
  isSimulation: z.boolean().default(false),
  departmentIds: z.array(z.uuid()).max(50).default([]),
  requirements: z
    .array(z.strictObject({ competencyId: z.uuid(), requiredLevel: level, importance: z.number().int().min(1).max(5).default(3) }))
    .min(1, 'An event needs at least one competency')
    .max(50),
});

/**
 * GET /api/readiness/overview - everything the Operational Readiness dashboard shows.
 *
 * An aggregation of the same engine functions that produce the individual
 * screens, so every headline can be traced back to a person and a competency.
 * The headline index is a demonstration metric, and the response says so.
 */
readinessRouter.get('/overview', requireRole('ADMIN'), async (req, res) => {
  ok(res, await loadReadinessOverview({ asOf: await requestedAsOf(req) }));
});

/**
 * GET /api/readiness/calendar - every upcoming event with its headline readiness.
 *
 * Readiness is measured at each event's start date, because that is when the
 * organisation has to be ready; `?offsetDays=` simulates a different date.
 */
readinessRouter.get('/calendar', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  ok(res, await loadReadinessCalendar({ asOf: await requestedAsOf(req) }));
});

/** GET /api/readiness/events - the configured readiness calendar. */
readinessRouter.get('/events', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  const query = z.object({ status: z.enum(statuses).optional(), includeCompleted: z.coerce.boolean().optional() }).parse(req.query);
  ok(res, { events: await listEvents(query) });
});

/** GET /api/readiness/events/:id - one event's definition. */
readinessRouter.get('/events/:id', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  ok(res, { event: await loadEvent(uuidParam(req, 'id')) });
});

/** GET /api/readiness/events/:id/readiness - who is ready, who is short, and on what. */
readinessRouter.get('/events/:id/readiness', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  ok(res, await loadEventReadiness(uuidParam(req, 'id'), { asOf: await requestedAsOf(req) }));
});

/** POST /api/readiness/events - admin: add an event to the readiness calendar. */
readinessRouter.post('/events', requireRole('ADMIN'), async (req, res) => {
  const input = eventSchema.parse(req.body);
  const event = await createEvent(input, currentUser(req).id);
  await recordAudit(auditContext(req), { action: AuditActions.READINESS_EVENT_CREATED, entityType: 'ReadinessEvent', entityId: event.id, metadata: { name: event.name, hazardType: event.hazardType } });
  created(res, { event });
});

/** PUT /api/readiness/events/:id - admin: change an event. Requirements are replaced wholesale. */
readinessRouter.put('/events/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const event = await updateEvent(id, eventSchema.parse(req.body));
  await recordAudit(auditContext(req), { action: AuditActions.READINESS_EVENT_UPDATED, entityType: 'ReadinessEvent', entityId: id, metadata: { name: event.name } });
  ok(res, { event });
});

/** DELETE /api/readiness/events/:id - admin: remove an event and its assignments. */
readinessRouter.delete('/events/:id', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  await deleteEvent(id);
  await recordAudit(auditContext(req), { action: AuditActions.READINESS_EVENT_DELETED, entityType: 'ReadinessEvent', entityId: id });
  ok(res, { deleted: true });
});

/**
 * POST /api/readiness/events/:id/assign - assign preparation to everyone who is short.
 * Idempotent: running it again adds only the people who have fallen behind since.
 */
readinessRouter.post('/events/:id/assign', requireRole('ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const result = await assignPreparation(id, currentUser(req).id);
  await recordAudit(auditContext(req), { action: AuditActions.READINESS_PREPARATION_ASSIGNED, entityType: 'ReadinessEvent', entityId: id, metadata: result });
  ok(res, result);
});

/** GET /api/readiness/assignments/me - what the signed-in user has been asked to prepare. */
readinessRouter.get('/assignments/me', async (req, res) => {
  ok(res, { assignments: await listAssignments({ userId: currentUser(req).id }) });
});

/** GET /api/readiness/events/:id/assignments - admin and trainer view of an event's assignments. */
readinessRouter.get('/events/:id/assignments', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  ok(res, { assignments: await listAssignments({ eventId: uuidParam(req, 'id') }) });
});
