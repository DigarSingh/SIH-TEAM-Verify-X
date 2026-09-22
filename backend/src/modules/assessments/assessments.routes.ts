import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { created, ok, paginated, uuidParam } from '../../lib/http';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { auditContext } from '../../services/audit.service';
import {
  bulkQuestionsSchema,
  createAssessmentSchema,
  createQuestionSchema,
  reorderQuestionsSchema,
  resultsQuery,
  scenariosSchema,
  submitSchema,
  updateAssessmentSchema,
  updateQuestionSchema,
} from './assessments.schemas';
import * as assessments from './assessments.service';
import * as attempts from './attempts.service';
import { getAssessmentResults } from './results.service';

export const assessmentsRouter = Router();
assessmentsRouter.use(authenticate);

/** GET /api/assessments - trainer/admin: assessments of the courses they manage. */
assessmentsRouter.get('/', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const { courseId } = z.object({ courseId: z.string().uuid().optional() }).parse(req.query);
  ok(res, await assessments.listManagedAssessments(currentUser(req), courseId));
});

/** GET /api/assessments/me - trainee: assessments of my courses and what I can do next. */
assessmentsRouter.get('/me', requireRole('TRAINEE'), async (req, res) => {
  ok(res, await attempts.listMyAssessments(currentUser(req)));
});

/** GET /api/assessments/attempts/:attemptId - one attempt with its question-by-question review. */
assessmentsRouter.get('/attempts/:attemptId', async (req, res) => {
  ok(res, await attempts.getAttemptDetail(currentUser(req), uuidParam(req, 'attemptId')));
});

/** GET /api/assessments/:id/scenarios - trainer/admin: the practical component with its marking. */
assessmentsRouter.get('/:id/scenarios', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const id = uuidParam(req, 'id');
  await assessments.loadManagedAssessment(currentUser(req), id);
  ok(res, { scenarios: await assessments.listScenarios(id) });
});

/**
 * PUT /api/assessments/:id/scenarios - trainer/admin: replace the practical component.
 * Refused once answers have been marked against it, so past results stay explainable.
 */
assessmentsRouter.put('/:id/scenarios', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const { scenarios } = scenariosSchema.parse(req.body);
  ok(res, { scenarios: await assessments.replaceScenarios(currentUser(req), uuidParam(req, 'id'), scenarios, auditContext(req)) });
});

/** POST /api/assessments - trainer/admin: create the assessment of a course (optionally with questions). */
assessmentsRouter.post('/', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  created(res, await assessments.createAssessment(currentUser(req), createAssessmentSchema.parse(req.body), auditContext(req)));
});

/** GET /api/assessments/:id - managers get the full question bank; trainees get the rules and their eligibility. */
assessmentsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const id = uuidParam(req, 'id');
  if (user.role === 'TRAINEE') {
    const assessment = await assessments.loadAssessment(id);
    const availability = await attempts.computeAvailability(user.id, assessment);
    if (!assessment.isPublished || !availability.enrollment) {
      // Trainees only see assessments of courses they are enrolled in.
      throw notFound('ASSESSMENT_NOT_FOUND', 'Assessment not found');
    }
    ok(res, {
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      instructions: assessment.instructions,
      courseId: assessment.courseId,
      courseTitle: assessment.course.title,
      passingScore: assessment.passingScore,
      timeLimitMinutes: assessment.timeLimitMinutes,
      maxAttempts: assessment.maxAttempts,
      deadline: assessment.deadline,
      questionCount: assessment.questionsPerAttempt ?? assessment._count.questions,
      availability: { ...availability, state: attempts.assessmentState(availability) },
    });
    return;
  }
  ok(res, await assessments.getManagedAssessment(user, id));
});

/** PATCH /api/assessments/:id - settings, deadline, publish / unpublish. */
assessmentsRouter.patch('/:id', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, await assessments.updateAssessment(currentUser(req), uuidParam(req, 'id'), updateAssessmentSchema.parse(req.body), auditContext(req)));
});

/** DELETE /api/assessments/:id */
assessmentsRouter.delete('/:id', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  await assessments.deleteAssessment(currentUser(req), uuidParam(req, 'id'), auditContext(req));
  ok(res, { deleted: true });
});

// ---- question bank -----------------------------------------------------------------------------------------

/** POST /api/assessments/:id/questions - add one question, or `{ questions: [...] }` in bulk. */
assessmentsRouter.post('/:id/questions', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const list = 'questions' in (req.body ?? {}) ? bulkQuestionsSchema.parse(req.body).questions : [createQuestionSchema.parse(req.body)];
  created(res, await assessments.addQuestions(currentUser(req), uuidParam(req, 'id'), list, auditContext(req)));
});

/** PUT /api/assessments/:id/questions/order */
assessmentsRouter.put('/:id/questions/order', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const { questionIds } = reorderQuestionsSchema.parse(req.body);
  ok(res, await assessments.reorderQuestions(currentUser(req), uuidParam(req, 'id'), questionIds, auditContext(req)));
});

/** PATCH /api/assessments/:id/questions/:questionId */
assessmentsRouter.patch('/:id/questions/:questionId', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, await assessments.updateQuestion(currentUser(req), uuidParam(req, 'id'), uuidParam(req, 'questionId'), updateQuestionSchema.parse(req.body), auditContext(req)));
});

/** DELETE /api/assessments/:id/questions/:questionId */
assessmentsRouter.delete('/:id/questions/:questionId', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, await assessments.deleteQuestion(currentUser(req), uuidParam(req, 'id'), uuidParam(req, 'questionId'), auditContext(req)));
});

// ---- taking an assessment ------------------------------------------------------------------------------------

/** POST /api/assessments/:id/start - begin (or resume) a timed attempt. */
assessmentsRouter.post('/:id/start', requireRole('TRAINEE'), async (req, res) => {
  const payload = await attempts.startAttempt(currentUser(req), uuidParam(req, 'id'), auditContext(req));
  if (payload.resumed) ok(res, payload);
  else created(res, payload);
});

/** POST /api/assessments/:id/submit - score the attempt, update competency, issue the certificate. */
assessmentsRouter.post('/:id/submit', requireRole('TRAINEE'), async (req, res) => {
  ok(res, await attempts.submitAttempt(currentUser(req), uuidParam(req, 'id'), submitSchema.parse(req.body), auditContext(req)));
});

/** GET /api/assessments/:id/results - own history (trainee) or all results + statistics (course trainer / admin). */
assessmentsRouter.get('/:id/results', async (req, res) => {
  const query = resultsQuery.parse(req.query);
  const result = await getAssessmentResults(currentUser(req), uuidParam(req, 'id'), query);
  if (result.scope === 'manager') {
    paginated(res, result.attempts, query.page, query.pageSize, result.total, { assessment: result.assessment, stats: result.stats });
  } else {
    ok(res, { assessment: result.assessment, attempts: result.attempts, availability: result.availability });
  }
});
