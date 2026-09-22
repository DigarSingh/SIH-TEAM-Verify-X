import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { ok, uuidParam } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { auditContext } from '../../services/audit.service';
import { listMyAssessments } from '../assessments/attempts.service';
import { thumbnailUrl } from '../courses/courses.mapper';
import { completeModule, uncompleteModule, withdraw } from './enrollments.service';

export const enrollmentsRouter = Router();
enrollmentsRouter.use(authenticate, requireRole('TRAINEE'));

const statusFilter = z.enum(['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING', 'COMPLETED', 'CERTIFIED', 'WITHDRAWN']);

/** GET /api/enrollments/me - my courses with progress, the next module and assessment state. */
enrollmentsRouter.get('/me', async (req, res) => {
  const user = currentUser(req);
  const { status } = z.object({ status: statusFilter.optional() }).parse(req.query);
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.id, course: { deletedAt: null }, ...(status ? { status } : { status: { not: 'WITHDRAWN' } }) },
    orderBy: [{ lastAccessedAt: { sort: 'desc', nulls: 'last' } }, { enrolledAt: 'desc' }],
    include: {
      moduleProgress: { select: { moduleId: true } },
      course: {
        select: {
          id: true,
          title: true,
          category: true,
          difficulty: true,
          durationMinutes: true,
          thumbnailKey: true,
          updatedAt: true,
          certificateEnabled: true,
          trainer: { select: { id: true, name: true } },
          modules: { orderBy: { position: 'asc' }, select: { id: true, title: true } },
        },
      },
    },
  });
  const [assessments, certificates] = await Promise.all([
    listMyAssessments(user),
    prisma.certificate.findMany({ where: { userId: user.id, courseId: { in: enrollments.map((e) => e.courseId) } }, select: { id: true, courseId: true, certificateNumber: true, status: true } }),
  ]);
  const assessmentByCourse = new Map(assessments.map((assessment) => [assessment.courseId, assessment]));
  const certificateByCourse = new Map(certificates.map((certificate) => [certificate.courseId, certificate]));

  ok(
    res,
    enrollments.map((enrollment) => {
      const done = new Set(enrollment.moduleProgress.map((entry) => entry.moduleId));
      const next = enrollment.course.modules.find((module) => !done.has(module.id)) ?? null;
      const assessment = assessmentByCourse.get(enrollment.courseId);
      return {
        id: enrollment.id,
        status: enrollment.status,
        progress: enrollment.progress,
        enrolledAt: enrollment.enrolledAt,
        startedAt: enrollment.startedAt,
        completedAt: enrollment.completedAt,
        lastAccessedAt: enrollment.lastAccessedAt,
        course: {
          id: enrollment.course.id,
          title: enrollment.course.title,
          category: enrollment.course.category,
          difficulty: enrollment.course.difficulty,
          durationMinutes: enrollment.course.durationMinutes,
          thumbnailUrl: thumbnailUrl({ id: enrollment.course.id, thumbnailKey: enrollment.course.thumbnailKey, updatedAt: enrollment.course.updatedAt }),
          trainer: enrollment.course.trainer,
        },
        modulesTotal: enrollment.course.modules.length,
        modulesCompleted: done.size,
        nextModule: next,
        assessment: assessment
          ? { id: assessment.assessmentId, state: assessment.state, deadline: assessment.deadline, bestScore: assessment.bestScore, attemptsRemaining: assessment.attemptsRemaining, inProgressAttemptId: assessment.inProgressAttemptId }
          : null,
        certificate: certificateByCourse.get(enrollment.courseId) ?? null,
      };
    }),
  );
});

/** GET /api/enrollments/me/:courseId - my enrollment in one course. */
enrollmentsRouter.get('/me/:courseId', async (req, res) => {
  const user = currentUser(req);
  const courseId = uuidParam(req, 'courseId');
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } }, include: { moduleProgress: { select: { moduleId: true } } } });
  if (!enrollment || enrollment.status === 'WITHDRAWN') throw notFound('ENROLLMENT_NOT_FOUND', 'You are not enrolled in this course');
  const { moduleProgress, ...rest } = enrollment;
  ok(res, { ...rest, completedModuleIds: moduleProgress.map((entry) => entry.moduleId) });
});

/** POST /api/enrollments/:id/modules/:moduleId/complete - mark a module complete (idempotent). */
enrollmentsRouter.post('/:id/modules/:moduleId/complete', async (req, res) => {
  ok(res, await completeModule(currentUser(req).id, uuidParam(req, 'id'), uuidParam(req, 'moduleId'), auditContext(req)));
});

/** DELETE /api/enrollments/:id/modules/:moduleId/complete - un-mark a module. */
enrollmentsRouter.delete('/:id/modules/:moduleId/complete', async (req, res) => {
  ok(res, await uncompleteModule(currentUser(req).id, uuidParam(req, 'id'), uuidParam(req, 'moduleId')));
});

/** POST /api/enrollments/:id/withdraw */
enrollmentsRouter.post('/:id/withdraw', async (req, res) => {
  ok(res, await withdraw(currentUser(req).id, uuidParam(req, 'id'), auditContext(req)));
});
