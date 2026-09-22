import { Router } from 'express';
import { z } from 'zod';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { created, ok, paginated, paginationSchema, skipTake } from '../../lib/http';
import { prisma, type Prisma } from '../../lib/prisma';
import { uuid } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { AuditActions, auditContext, recordAudit } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';
import { checkAchievements } from '../achievements/achievements.service';
import { applyCompetencyEvidence } from '../competencies/evidence.service';
import { getEngineConfig } from '../competencies/engine-config.service';
import { EVALUATION_CRITERIA, EVALUATION_LABELS, weightedEvaluationScore } from '../competencies/engine/evaluation';

export const evaluationsRouter = Router();
evaluationsRouter.use(authenticate);

const rating = z.number().int().min(1, 'Rate from 1 to 5').max(5, 'Rate from 1 to 5');

const createSchema = z
  .strictObject({
    traineeId: uuid,
    courseId: uuid.optional(),
    competencyId: uuid.optional(),
    type: z.enum(['EVALUATION', 'PRACTICAL']).default('EVALUATION'),
    technicalKnowledge: rating,
    practicalAbility: rating,
    participation: rating,
    applicationOfKnowledge: rating,
    overallCompetency: rating,
    comments: z.string().trim().max(1500).optional(),
  })
  .refine((value) => value.courseId || value.competencyId, { path: ['courseId'], message: 'Choose the course or the competency this evaluation applies to' });

/** GET /api/evaluations/rubric - criteria, labels and the weights currently in force. */
evaluationsRouter.get('/rubric', async (_req, res) => {
  const config = await getEngineConfig();
  ok(
    res,
    EVALUATION_CRITERIA.map((criterion) => ({ key: criterion, label: EVALUATION_LABELS[criterion], weight: config.evaluationWeights[criterion] })),
  );
});

/** GET /api/evaluations/me - evaluations I have received. */
evaluationsRouter.get('/me', requireRole('TRAINEE'), async (req, res) => {
  const rows = await prisma.trainerEvaluation.findMany({
    where: { traineeId: currentUser(req).id },
    orderBy: { createdAt: 'desc' },
    include: { trainer: { select: { name: true } }, course: { select: { id: true, title: true } }, competency: { select: { id: true, name: true } } },
  });
  ok(res, rows.map(toDto));
});

/** GET /api/evaluations - trainer: evaluations I gave; admin: all. Filter by trainee or course. */
evaluationsRouter.get('/', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const user = currentUser(req);
  const query = paginationSchema.extend({ traineeId: uuid.optional(), courseId: uuid.optional() }).parse(req.query);
  const where: Prisma.TrainerEvaluationWhereInput = {
    ...(user.role === 'TRAINER' ? { trainerId: user.id } : {}),
    ...(query.traineeId ? { traineeId: query.traineeId } : {}),
    ...(query.courseId ? { courseId: query.courseId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.trainerEvaluation.count({ where }),
    prisma.trainerEvaluation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...skipTake(query),
      include: {
        trainee: { select: { id: true, name: true } },
        trainer: { select: { name: true } },
        course: { select: { id: true, title: true } },
        competency: { select: { id: true, name: true } },
      },
    }),
  ]);
  paginated(res, rows.map(toDto), query.page, query.pageSize, total);
});

/**
 * POST /api/evaluations - record a weighted evaluation of a trainee.
 * The weighted score becomes evidence for the competency update engine, so a
 * competency never depends on multiple-choice results alone.
 */
evaluationsRouter.post('/', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const user = currentUser(req);
  const input = createSchema.parse(req.body);

  const trainee = await prisma.user.findFirst({ where: { id: input.traineeId, role: 'TRAINEE', status: 'ACTIVE', deletedAt: null }, select: { id: true, name: true } });
  if (!trainee) throw notFound('TRAINEE_NOT_FOUND', 'Trainee not found');

  if (input.courseId) {
    const course = await prisma.course.findFirst({ where: { id: input.courseId, deletedAt: null }, select: { id: true, trainerId: true } });
    if (!course) throw notFound('COURSE_NOT_FOUND', 'Course not found');
    if (user.role === 'TRAINER' && course.trainerId !== user.id) throw forbidden('NOT_COURSE_OWNER', 'You can only evaluate trainees of your own courses');
    const enrolled = await prisma.enrollment.findFirst({ where: { userId: trainee.id, courseId: course.id, status: { not: 'WITHDRAWN' } }, select: { id: true } });
    if (!enrolled) throw badRequest('NOT_ENROLLED', 'This trainee is not enrolled in the selected course');
  } else if (user.role === 'TRAINER') {
    const shared = await prisma.enrollment.findFirst({ where: { userId: trainee.id, status: { not: 'WITHDRAWN' }, course: { trainerId: user.id, deletedAt: null } }, select: { id: true } });
    if (!shared) throw forbidden('NOT_YOUR_TRAINEE', 'You can only evaluate trainees enrolled in your courses');
  }
  if (input.competencyId) {
    const competency = await prisma.competency.findFirst({ where: { id: input.competencyId, isActive: true }, select: { id: true } });
    if (!competency) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');
  }

  const config = await getEngineConfig();
  const ratings = {
    technicalKnowledge: input.technicalKnowledge,
    practicalAbility: input.practicalAbility,
    participation: input.participation,
    applicationOfKnowledge: input.applicationOfKnowledge,
    overallCompetency: input.overallCompetency,
  };
  const weightedScore = weightedEvaluationScore(ratings, config.evaluationWeights);

  const { evaluation, impacts } = await prisma.$transaction(
    async (tx) => {
      const row = await tx.trainerEvaluation.create({
        data: {
          traineeId: trainee.id,
          trainerId: user.id,
          courseId: input.courseId ?? null,
          competencyId: input.competencyId ?? null,
          type: input.type,
          ...ratings,
          weightedScore,
          weightsUsed: config.evaluationWeights as unknown as Prisma.InputJsonValue,
          comments: input.comments ?? null,
        },
        include: { trainer: { select: { name: true } }, course: { select: { id: true, title: true } }, competency: { select: { id: true, name: true } } },
      });
      const changes = await applyCompetencyEvidence(
        tx,
        {
          kind: input.type === 'PRACTICAL' ? 'PRACTICAL' : 'TRAINER_EVALUATION',
          userId: trainee.id,
          courseId: input.courseId ?? null,
          competencyIds: input.competencyId ? [input.competencyId] : [],
          evaluationId: row.id,
        },
        config,
      );
      return { evaluation: row, impacts: changes };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  await notifyUser(trainee.id, {
    type: 'EVALUATION_RECEIVED',
    title: `New ${input.type === 'PRACTICAL' ? 'practical assessment' : 'trainer evaluation'}: ${weightedScore}%`,
    message: `${user.name} evaluated your performance${evaluation.course ? ` in ${evaluation.course.title}` : ''}.${input.comments ? ` "${input.comments.slice(0, 160)}"` : ''}`,
    link: '/trainee/passport',
  });
  for (const impact of impacts.filter((item) => item.changed)) {
    await notifyUser(trainee.id, {
      type: 'COMPETENCY_UPDATE',
      title: `${impact.competencyName}: ${impact.previousLevel}% → ${impact.newLevel}%`,
      message: impact.explanation,
      link: '/trainee/passport',
    });
  }
  await recordAudit(auditContext(req), { action: AuditActions.EVALUATION_CREATED, entityType: 'TrainerEvaluation', entityId: evaluation.id, metadata: { trainee: trainee.name, weightedScore, type: input.type } });
  await checkAchievements(trainee.id);

  created(res, { evaluation: toDto(evaluation), competencyImpacts: impacts });
});

function toDto(row: {
  id: string;
  type: string;
  technicalKnowledge: number;
  practicalAbility: number;
  participation: number;
  applicationOfKnowledge: number;
  overallCompetency: number;
  weightedScore: number;
  comments: string | null;
  createdAt: Date;
  trainer?: { name: string } | undefined;
  trainee?: { id: string; name: string } | undefined;
  course?: { id: string; title: string } | null | undefined;
  competency?: { id: string; name: string } | null | undefined;
}) {
  return {
    id: row.id,
    type: row.type,
    ratings: {
      technicalKnowledge: row.technicalKnowledge,
      practicalAbility: row.practicalAbility,
      participation: row.participation,
      applicationOfKnowledge: row.applicationOfKnowledge,
      overallCompetency: row.overallCompetency,
    },
    weightedScore: row.weightedScore,
    comments: row.comments,
    createdAt: row.createdAt,
    trainer: row.trainer ?? null,
    trainee: row.trainee ?? null,
    course: row.course ?? null,
    competency: row.competency ?? null,
  };
}
