import { Router, type Request } from 'express';
import { ok, uuidParam } from '../../lib/http';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { getRecommendationsForUser } from '../recommendations/recommendation.service';
import { assertCanViewEmployee } from '../users/access';
import { asOfQuery, resolveAsOf, type AsOf } from './decay.service';
import { getEngineConfig } from './engine-config.service';

export const skillGapsRouter = Router();
skillGapsRouter.use(authenticate);

/** Skill-gap report: every required competency with gap, severity, priority, reason and recommended training. */
async function skillGapReport(userId: string, asOf: AsOf) {
  const report = await getRecommendationsForUser(userId, { asOf });
  const pathByCompetency = new Map(report.learningPaths.map((path) => [path.competencyId, path]));
  const done = new Set(['COMPLETED', 'CERTIFIED']);

  const gaps = report.analysis.ranked.map((record) => {
    const steps = pathByCompetency.get(record.competencyId)?.steps.filter((step) => !done.has(step.status)) ?? [];
    return {
      ...record,
      recommendedCourses: steps.slice(0, 3).map((step) => ({
        courseId: step.courseId,
        title: step.title,
        stage: step.stage,
        status: step.status,
        locked: step.locked,
        coverage: step.coverage,
      })),
    };
  });

  /**
   * Competencies that have lost their freshness rather than never having been
   * earned. The courses are the same catalogue courses, but the ask is different:
   * maintain what you had, rather than learn something new.
   */
  const refreshers = gaps
    .filter((gap) => gap.freshness.needsRefresher)
    .map((gap) => ({
      competencyId: gap.competencyId,
      competencyName: gap.competencyName,
      status: gap.freshness.status,
      statusLabel: gap.freshness.statusLabel,
      baselineLevel: gap.freshness.baselineLevel,
      effectiveLevel: gap.freshness.effectiveLevel,
      requiredLevel: gap.requiredLevel,
      decayPoints: gap.freshness.decayPoints,
      daysSincePractice: gap.freshness.daysSincePractice,
      recertificationDueAt: gap.freshness.recertificationDueAt,
      reason: gap.freshness.reason,
      courses: gap.recommendedCourses,
    }));

  return {
    userId,
    jobRole: report.analysis.jobRole,
    summary: report.analysis.summary,
    gaps,
    refreshers,
    asOf: report.analysis.asOf,
  };
}

/** Reads an optional simulation date from the query string; defaults to now. */
async function requestedAsOf(req: Request): Promise<AsOf> {
  const query = asOfQuery.parse(req.query);
  return resolveAsOf(query, await getEngineConfig());
}

/**
 * GET /api/skill-gaps/me - the signed-in employee's skill gaps, ranked by training priority.
 *
 * `?asOf=<ISO date>` or `?offsetDays=<n>` runs the same analysis at a simulated
 * date. It is read-only: nothing stored changes, only the answer does.
 */
skillGapsRouter.get('/me', async (req, res) => {
  ok(res, await skillGapReport(currentUser(req).id, await requestedAsOf(req)));
});

/**
 * GET /api/skill-gaps/users/:userId - another employee's report.
 * Admins may view anyone; trainers only trainees enrolled in one of their courses.
 */
skillGapsRouter.get('/users/:userId', requireRole('ADMIN', 'TRAINER'), async (req, res) => {
  const userId = uuidParam(req, 'userId');
  await assertCanViewEmployee(currentUser(req), userId);
  ok(res, await skillGapReport(userId, await requestedAsOf(req)));
});
