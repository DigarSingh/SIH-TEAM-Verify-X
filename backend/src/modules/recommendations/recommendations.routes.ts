import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../lib/http';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { getRecommendationsForUser } from './recommendation.service';

export const recommendationsRouter = Router();
recommendationsRouter.use(authenticate);

/**
 * GET /api/recommendations/me
 * Rule-based course recommendations (with the reasons why) and the ordered
 * Beginner → Intermediate → Advanced learning path for every skill gap.
 */
recommendationsRouter.get('/me', async (req, res) => {
  const { id } = currentUser(req);
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query);
  const report = await getRecommendationsForUser(id, limit ? { limit } : {});
  ok(res, {
    jobRole: report.analysis.jobRole,
    summary: report.analysis.summary,
    recommendations: report.recommendations,
    learningPaths: report.learningPaths,
  });
});
