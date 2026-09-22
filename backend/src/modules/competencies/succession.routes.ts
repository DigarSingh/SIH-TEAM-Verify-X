import { Router, type Request } from 'express';
import { z } from 'zod';
import { created, ok, uuidParam } from '../../lib/http';
import { optionalText } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { AuditActions, auditContext, recordAudit } from '../../services/audit.service';
import { asOfQuery, resolveAsOf, type AsOf } from './decay.service';
import { getEngineConfig } from './engine-config.service';
import { createMentorship, listMentorships, loadSuccessionDetail, loadSuccessionReport, updateMentorshipStatus } from './succession.service';

export const successionRouter = Router();
successionRouter.use(authenticate);

async function requestedAsOf(req: Request): Promise<AsOf> {
  return resolveAsOf(asOfQuery.parse(req.query), await getEngineConfig());
}

/**
 * GET /api/succession - knowledge-loss risk for every competency.
 *
 * Identifies where the organisation depends on too few people, using recorded
 * competency levels and recorded retirement dates. It does not predict whether
 * anyone will actually leave. Supports the readiness simulation query parameters.
 */
successionRouter.get('/', requireRole('ADMIN'), async (req, res) => {
  ok(res, await loadSuccessionReport({ asOf: await requestedAsOf(req) }));
});

/** GET /api/succession/competencies/:id - one competency: experts, successors, mentorships, suggestions. */
successionRouter.get('/competencies/:id', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  ok(res, await loadSuccessionDetail(uuidParam(req, 'id'), { asOf: await requestedAsOf(req) }));
});

// ---------------------------------------------------------------------------------------------
// Mentorships
// ---------------------------------------------------------------------------------------------

const createSchema = z.strictObject({
  mentorId: z.uuid(),
  menteeId: z.uuid(),
  competencyId: z.uuid(),
  note: optionalText(500).nullable().optional(),
});

const statusSchema = z.strictObject({ status: z.enum(['NOT_STARTED', 'ACTIVE', 'COMPLETED', 'CANCELLED']) });

const listQuery = z.object({
  competencyId: z.uuid().optional(),
  mentorId: z.uuid().optional(),
  menteeId: z.uuid().optional(),
  status: z.enum(['NOT_STARTED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
});

/** GET /api/succession/mentorships - admins and trainers see the pairings they oversee. */
successionRouter.get('/mentorships', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  ok(res, { mentorships: await listMentorships(listQuery.parse(req.query)) });
});

/** GET /api/succession/mentorships/me - the signed-in user's own mentorships, as mentor and as mentee. */
successionRouter.get('/mentorships/me', async (req, res) => {
  const user = currentUser(req);
  const [asMentee, asMentor] = await Promise.all([listMentorships({ menteeId: user.id }), listMentorships({ mentorId: user.id })]);
  ok(res, { asMentee, asMentor });
});

/** POST /api/succession/mentorships - pair an expert with someone developing the competency. */
successionRouter.post('/mentorships', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  const input = createSchema.parse(req.body);
  const mentorship = await createMentorship({ ...input, createdById: currentUser(req).id });
  await recordAudit(auditContext(req), {
    action: AuditActions.MENTORSHIP_CREATED,
    entityType: 'Mentorship',
    entityId: mentorship.id,
    metadata: { mentorId: input.mentorId, menteeId: input.menteeId, competencyId: input.competencyId },
  });
  created(res, { mentorship });
});

/** PATCH /api/succession/mentorships/:id - move a mentorship through its lifecycle. */
successionRouter.patch('/mentorships/:id', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  const id = uuidParam(req, 'id');
  const { status } = statusSchema.parse(req.body);
  const mentorship = await updateMentorshipStatus(id, status);
  await recordAudit(auditContext(req), { action: AuditActions.MENTORSHIP_UPDATED, entityType: 'Mentorship', entityId: id, metadata: { status } });
  ok(res, { mentorship });
});
