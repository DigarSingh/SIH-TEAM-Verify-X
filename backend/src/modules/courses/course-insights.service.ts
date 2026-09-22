import type { EnrollmentStatus, Prisma } from '@prisma/client';
import { conflict } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { checkAchievements } from '../achievements/achievements.service';
import { assessmentStats } from '../assessments/results.service';
import { loadCourse, loadManagedCourse } from './courses.service';

type Actor = Express.AuthUser;

const round1 = (value: number) => Math.round(value * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Trainer monitoring
// ---------------------------------------------------------------------------------------------

export async function listCourseTrainees(
  user: Actor,
  courseId: string,
  query: { page: number; pageSize: number; q?: string | undefined; status?: EnrollmentStatus | undefined },
) {
  await loadManagedCourse(user, courseId);
  const where: Prisma.EnrollmentWhereInput = {
    courseId,
    status: query.status ?? { not: 'WITHDRAWN' },
    ...(query.q
      ? {
          user: {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { employeeId: { contains: query.q, mode: 'insensitive' } },
            ],
          },
        }
      : {}),
  };

  const [total, rows, statusCounts] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      orderBy: { enrolledAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { user: { select: { id: true, name: true, email: true, employeeId: true, department: { select: { name: true } }, jobRole: { select: { name: true } } } } },
    }),
    prisma.enrollment.groupBy({ by: ['status'], where: { courseId }, _count: true }),
  ]);

  const userIds = rows.map((row) => row.userId);
  const [attempts, history] = await Promise.all([
    prisma.assessmentAttempt.findMany({
      where: { userId: { in: userIds }, assessment: { courseId }, status: 'SUBMITTED' },
      select: { userId: true, percentage: true, passed: true },
    }),
    prisma.competencyHistory.findMany({
      where: { userId: { in: userIds }, courseId },
      orderBy: { createdAt: 'asc' },
      include: { competency: { select: { name: true } } },
    }),
  ]);

  return {
    total,
    statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count])),
    items: rows.map((row) => {
      const mine = attempts.filter((attempt) => attempt.userId === row.userId);
      return {
        enrollmentId: row.id,
        learner: { id: row.user.id, name: row.user.name, email: row.user.email, employeeId: row.user.employeeId, department: row.user.department?.name ?? null, jobRole: row.user.jobRole?.name ?? null },
        status: row.status,
        progress: row.progress,
        enrolledAt: row.enrolledAt,
        lastAccessedAt: row.lastAccessedAt,
        completedAt: row.completedAt,
        attempts: mine.length,
        bestScore: mine.length === 0 ? null : Math.max(...mine.map((attempt) => attempt.percentage ?? 0)),
        passed: mine.some((attempt) => attempt.passed),
        competencyChanges: history
          .filter((event) => event.userId === row.userId)
          .map((event) => ({ competencyName: event.competency.name, previousLevel: event.previousLevel, newLevel: event.newLevel })),
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Course analytics
// ---------------------------------------------------------------------------------------------

export async function courseAnalytics(user: Actor, courseId: string) {
  const course = await loadManagedCourse(user, courseId);
  const [enrollments, modules, completions, assessment, feedback, history] = await Promise.all([
    prisma.enrollment.findMany({ where: { courseId }, select: { status: true, progress: true, enrolledAt: true, completedAt: true } }),
    prisma.module.findMany({ where: { courseId }, orderBy: { position: 'asc' }, select: { id: true, title: true } }),
    prisma.moduleProgress.groupBy({ by: ['moduleId'], where: { enrollment: { courseId, status: { not: 'WITHDRAWN' } } }, _count: true }),
    prisma.assessment.findUnique({ where: { courseId }, select: { id: true, title: true } }),
    prisma.feedback.aggregate({ where: { courseId }, _avg: { rating: true, trainerRating: true }, _count: true }),
    prisma.competencyHistory.findMany({ where: { courseId }, select: { userId: true, competencyId: true, previousLevel: true, newLevel: true, competency: { select: { name: true } } } }),
  ]);

  const active = enrollments.filter((enrollment) => enrollment.status !== 'WITHDRAWN');
  const finished = active.filter((enrollment) => enrollment.status === 'COMPLETED' || enrollment.status === 'CERTIFIED');
  const byStatus: Record<string, number> = {};
  for (const enrollment of enrollments) byStatus[enrollment.status] = (byStatus[enrollment.status] ?? 0) + 1;

  const completedBy = new Map(completions.map((row) => [row.moduleId, row._count]));
  const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthly = new Map<string, { enrolled: number; completed: number }>();
  for (const enrollment of active) {
    const enrolled = monthly.get(monthKey(enrollment.enrolledAt)) ?? { enrolled: 0, completed: 0 };
    enrolled.enrolled += 1;
    monthly.set(monthKey(enrollment.enrolledAt), enrolled);
    if (enrollment.completedAt) {
      const done = monthly.get(monthKey(enrollment.completedAt)) ?? { enrolled: 0, completed: 0 };
      done.completed += 1;
      monthly.set(monthKey(enrollment.completedAt), done);
    }
  }

  const impact = new Map<string, { name: string; gains: number[] }>();
  for (const event of history) {
    const entry = impact.get(event.competencyId) ?? { name: event.competency.name, gains: [] };
    entry.gains.push(event.newLevel - event.previousLevel);
    impact.set(event.competencyId, entry);
  }

  return {
    course: { id: course.id, title: course.title, status: course.status },
    enrollments: { total: enrollments.length, active: active.length, byStatus },
    completionRate: active.length === 0 ? 0 : round1((finished.length / active.length) * 100),
    averageProgress: active.length === 0 ? 0 : round1(active.reduce((sum, enrollment) => sum + enrollment.progress, 0) / active.length),
    moduleFunnel: modules.map((module) => ({ moduleId: module.id, title: module.title, completed: completedBy.get(module.id) ?? 0 })),
    timeline: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, ...value })),
    assessment: assessment ? { id: assessment.id, title: assessment.title, ...(await assessmentStats(assessment.id)) } : null,
    feedback: { count: feedback._count, averageRating: round1(feedback._avg.rating ?? 0), averageTrainerRating: round1(feedback._avg.trainerRating ?? 0) },
    competencyImpact: [...impact.entries()].map(([competencyId, entry]) => ({
      competencyId,
      competencyName: entry.name,
      learners: entry.gains.length,
      averageGain: round1(entry.gains.reduce((sum, gain) => sum + gain, 0) / entry.gains.length),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------------------------

export async function submitFeedback(
  user: Actor,
  courseId: string,
  input: { rating: number; trainerRating?: number | undefined; comment?: string | undefined },
  ctx: AuditContext,
) {
  const course = await loadCourse(courseId);
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } }, select: { status: true } });
  if (!enrollment || enrollment.status === 'WITHDRAWN') throw conflict('NOT_ENROLLED', 'Only learners enrolled in the course can rate it');

  const data = { rating: input.rating, trainerRating: input.trainerRating ?? null, comment: input.comment ?? null };
  const feedback = await prisma.feedback.upsert({
    where: { userId_courseId: { userId: user.id, courseId } },
    create: { userId: user.id, courseId, ...data },
    update: data,
  });
  await recordAudit(ctx, { action: AuditActions.COURSE_UPDATED, entityType: 'Course', entityId: courseId, metadata: { feedback: input.rating, course: course.title } });
  await checkAchievements(user.id);
  return feedback;
}

export async function listFeedback(user: Actor, courseId: string, query: { page: number; pageSize: number }) {
  const course = await loadCourse(courseId);
  const isManager = user.role === 'ADMIN' || course.trainerId === user.id;
  const [total, rows, summary, distribution] = await Promise.all([
    prisma.feedback.count({ where: { courseId } }),
    prisma.feedback.findMany({
      where: { courseId },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { user: { select: { name: true, department: { select: { name: true } } } } },
    }),
    prisma.feedback.aggregate({ where: { courseId }, _avg: { rating: true, trainerRating: true }, _count: true }),
    prisma.feedback.groupBy({ by: ['rating'], where: { courseId }, _count: true }),
  ]);
  const mine = await prisma.feedback.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
  return {
    total,
    summary: {
      count: summary._count,
      averageRating: round1(summary._avg.rating ?? 0),
      averageTrainerRating: round1(summary._avg.trainerRating ?? 0),
      distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: distribution.find((row) => row.rating === rating)?._count ?? 0 })),
    },
    mine,
    items: rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      trainerRating: row.trainerRating,
      comment: row.comment,
      updatedAt: row.updatedAt,
      // Learners see comments anonymously; trainers and admins see who wrote them.
      author: isManager ? { name: row.user.name, department: row.user.department?.name ?? null } : { name: 'Anonymous learner', department: row.user.department?.name ?? null },
    })),
  };
}
