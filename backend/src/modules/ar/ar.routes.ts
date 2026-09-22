import { Router } from 'express';
import { created, ok, uuidParam } from '../../lib/http';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { auditContext } from '../../services/audit.service';
import { asOfQuery, resolveAsOf } from '../competencies/decay.service';
import { getEngineConfig } from '../competencies/engine-config.service';
import { attemptListQuery, moduleListQuery, submitAttemptSchema } from './ar.schemas';
import * as ar from './ar.service';

/**
 * AR Instrument Lab.
 *
 * The scoring rules live in the service; these routes only decide who may ask.
 * Note there is no endpoint that accepts a score: a practical is marked from
 * the database, from the components the trainee selected.
 */
export const arRouter = Router();
arRouter.use(authenticate);

/** GET /api/ar/modules - the lab landing page: every module with this trainee's standing on it. */
arRouter.get('/modules', async (req, res) => {
  const query = moduleListQuery.parse(req.query);
  const asOf = resolveAsOf(asOfQuery.parse(req.query), await getEngineConfig());
  ok(res, await ar.listModules(currentUser(req), query, { asOf }));
});

/** GET /api/ar/modules/:idOrKey - one lab: components, guided training and this trainee's attempts. */
arRouter.get('/modules/:idOrKey', async (req, res) => {
  ok(res, await ar.getModule(currentUser(req), String(req.params['idOrKey'])));
});

/** GET /api/ar/refresher - the refresher this trainee should be offered, or null. */
arRouter.get('/refresher', async (req, res) => {
  const asOf = resolveAsOf(asOfQuery.parse(req.query), await getEngineConfig());
  ok(res, { recommendation: await ar.recommendedRefresher(currentUser(req).id, { asOf }) });
});

/** POST /api/ar/modules/:idOrKey/start - begin (or resume) a practical attempt. */
arRouter.post('/modules/:idOrKey/start', requireRole('TRAINEE'), async (req, res) => {
  created(res, await ar.startAttempt(currentUser(req), String(req.params['idOrKey']), auditContext(req)));
});

/**
 * POST /api/ar/modules/:idOrKey/submit - mark the practical.
 *
 * The body carries the components the trainee selected, never a score. Safe to
 * retry with the same `idempotencyKey`.
 */
arRouter.post('/modules/:idOrKey/submit', requireRole('TRAINEE'), async (req, res) => {
  ok(res, await ar.submitAttempt(currentUser(req), String(req.params['idOrKey']), submitAttemptSchema.parse(req.body), auditContext(req)));
});

/** GET /api/ar/attempts/:attemptId - one finished practical, task by task. */
arRouter.get('/attempts/:attemptId', async (req, res) => {
  ok(res, await ar.getAttempt(currentUser(req), uuidParam(req, 'attemptId')));
});

/** GET /api/ar/attempts - trainer and administrator view of practical results. */
arRouter.get('/attempts', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, { attempts: await ar.listAttempts(attemptListQuery.parse(req.query)) });
});

/** GET /api/ar/analytics - administrator: what the AR labs are doing to competency. */
arRouter.get('/analytics', requireRole('ADMIN'), async (_req, res) => {
  ok(res, await ar.arAnalytics());
});
