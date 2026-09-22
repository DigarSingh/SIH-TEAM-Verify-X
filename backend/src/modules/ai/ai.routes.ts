import { Router } from 'express';
import { ok, uuidParam } from '../../lib/http';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { aiLimiter } from '../../middleware/rateLimit';
import { auditContext } from '../../services/audit.service';
import { askCourseAssistant, draftQuiz, explainRecommendations, searchCoursesInPlainLanguage, summariseForecast } from './ai.service';
import { askSchema, forecastQuerySchema, quizDraftSchema, searchRequestSchema } from './ai.schemas';

/**
 * Phase 2 AI features. They sit next to the rule-based framework and never replace it: skill gaps,
 * priorities, competency levels and certificates are computed by the deterministic engine only.
 * Without ANTHROPIC_API_KEY these endpoints answer 503 AI_NOT_CONFIGURED (plain-language search then
 * falls back to a built-in interpreter, and the training-needs forecast never needed AI at all).
 */
export const aiRouter = Router();
aiRouter.use(authenticate);

/** POST /api/ai/courses/:courseId/ask - answers a question from the course's own materials, with sources. */
aiRouter.post('/courses/:courseId/ask', aiLimiter, async (req, res) => {
  const { question } = askSchema.parse(req.body);
  ok(res, await askCourseAssistant(currentUser(req), uuidParam(req, 'courseId'), question, auditContext(req)));
});

/** POST /api/ai/courses/:courseId/quiz-draft - question drafts for the trainer to review (nothing is saved). */
aiRouter.post('/courses/:courseId/quiz-draft', requireRole('TRAINER', 'ADMIN'), aiLimiter, async (req, res) => {
  const input = quizDraftSchema.parse(req.body ?? {});
  ok(res, await draftQuiz(currentUser(req), uuidParam(req, 'courseId'), input, auditContext(req)));
});

/** POST /api/ai/recommendations/me/plan - plain-language explanation of the engine's recommendations. */
aiRouter.post('/recommendations/me/plan', requireRole('TRAINEE'), aiLimiter, async (req, res) => {
  ok(res, await explainRecommendations(currentUser(req), auditContext(req)));
});

/** POST /api/ai/search - plain-language course search: the request becomes filters, results come from the catalogue. */
aiRouter.post('/search', aiLimiter, async (req, res) => {
  const { query } = searchRequestSchema.parse(req.body);
  ok(res, await searchCoursesInPlainLanguage(currentUser(req), query, auditContext(req)));
});

/** POST /api/ai/predictive-needs/summary - a written briefing of the (deterministic) training-needs forecast. */
aiRouter.post('/predictive-needs/summary', requireRole('ADMIN'), aiLimiter, async (req, res) => {
  const { horizon } = forecastQuerySchema.parse(req.body ?? {});
  ok(res, await summariseForecast(horizon, auditContext(req)));
});
