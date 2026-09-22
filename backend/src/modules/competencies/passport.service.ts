import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { loadEmployeeAnalysis } from './profile.service';

const round1 = (value: number) => Math.round(value * 10) / 10;

export interface TimelineEvent {
  id: string;
  competencyId: string;
  competencyName: string;
  previousLevel: number;
  newLevel: number;
  delta: number;
  source: string;
  courseTitle: string | null;
  explanation: string | null;
  createdAt: Date;
}

/** Competency change events, oldest first. Optionally limited to one competency. */
export async function loadCompetencyTimeline(userId: string, competencyId?: string): Promise<TimelineEvent[]> {
  const events = await prisma.competencyHistory.findMany({
    where: { userId, ...(competencyId ? { competencyId } : {}) },
    orderBy: { createdAt: 'asc' },
    include: { competency: { select: { name: true } }, course: { select: { title: true } } },
  });
  return events.map((event) => ({
    id: event.id,
    competencyId: event.competencyId,
    competencyName: event.competency.name,
    previousLevel: event.previousLevel,
    newLevel: event.newLevel,
    delta: event.newLevel - event.previousLevel,
    source: event.source,
    courseTitle: event.course?.title ?? null,
    explanation: (event.details as { explanation?: string } | null)?.explanation ?? null,
    createdAt: event.createdAt,
  }));
}

/** The values a competency moved through, e.g. [35, 52, 72]. */
export function progression(events: Pick<TimelineEvent, 'previousLevel' | 'newLevel' | 'source'>[], currentLevel: number): number[] {
  if (events.length === 0) return [currentLevel];
  const levels = events.map((event) => event.newLevel);
  const first = events[0];
  // A baseline entry has no meaningful "previous" value; any other first event starts from its previous level.
  if (first && first.source !== 'BASELINE') levels.unshift(first.previousLevel);
  return levels;
}

/**
 * The Competency Passport: one employee's verified competencies against role
 * requirements, the training and assessments behind them, certificates, the
 * progression of every competency, and the gaps that remain.
 */
export async function buildPassport(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      employeeId: true,
      designation: true,
      location: true,
      joiningDate: true,
      department: { select: { id: true, name: true, code: true } },
      jobRole: { select: { id: true, name: true, code: true, criticality: true } },
    },
  });
  if (!user) throw notFound('USER_NOT_FOUND', 'Employee not found');

  const [analysis, timeline, enrollments, attempts, certificates, evaluations] = await Promise.all([
    loadEmployeeAnalysis(userId),
    loadCompetencyTimeline(userId),
    prisma.enrollment.findMany({
      where: { userId, status: { not: 'WITHDRAWN' } },
      include: { course: { select: { id: true, title: true, durationMinutes: true, category: true } } },
      orderBy: { enrolledAt: 'desc' },
    }),
    prisma.assessmentAttempt.findMany({
      where: { userId, status: 'SUBMITTED' },
      orderBy: { submittedAt: 'desc' },
      include: { assessment: { select: { id: true, title: true, course: { select: { id: true, title: true } } } } },
    }),
    prisma.certificate.findMany({ where: { userId, status: 'VALID' }, orderBy: { issuedAt: 'desc' } }),
    prisma.trainerEvaluation.findMany({
      where: { traineeId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { trainer: { select: { name: true } }, course: { select: { title: true } } },
    }),
  ]);

  // ---- per-competency progression ---------------------------------------------------------
  const eventsByCompetency = new Map<string, TimelineEvent[]>();
  for (const event of timeline) {
    const list = eventsByCompetency.get(event.competencyId) ?? [];
    list.push(event);
    eventsByCompetency.set(event.competencyId, list);
  }
  const competencies = analysis.records.map((record) => {
    const events = eventsByCompetency.get(record.competencyId) ?? [];
    return { ...record, progression: progression(events, record.currentLevel), events };
  });

  // ---- training -----------------------------------------------------------------------------
  const completed = enrollments.filter((enrollment) => enrollment.status === 'COMPLETED' || enrollment.status === 'CERTIFIED');
  const inProgress = enrollments.filter((enrollment) => ['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING'].includes(enrollment.status));

  // ---- assessments: best attempt per assessment -------------------------------------------------
  const bestByAssessment = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    const current = bestByAssessment.get(attempt.assessmentId);
    if (!current || (attempt.percentage ?? 0) > (current.percentage ?? 0)) bestByAssessment.set(attempt.assessmentId, attempt);
  }
  const best = [...bestByAssessment.values()];
  const averageScore = best.length === 0 ? null : round1(best.reduce((sum, attempt) => sum + (attempt.percentage ?? 0), 0) / best.length);

  const remainingGap = analysis.records.reduce((sum, record) => sum + record.gap, 0);

  return {
    employee: user,
    jobRole: analysis.jobRole,
    summary: { ...analysis.summary, remainingGapPoints: remainingGap },
    competencies,
    additionalCompetencies: analysis.additional,
    training: {
      coursesCompleted: completed.length,
      coursesInProgress: inProgress.length,
      learningHours: round1(completed.reduce((sum, enrollment) => sum + enrollment.course.durationMinutes, 0) / 60),
      completed: completed.map((enrollment) => ({
        courseId: enrollment.course.id,
        title: enrollment.course.title,
        category: enrollment.course.category,
        completedAt: enrollment.completedAt,
        status: enrollment.status,
      })),
      inProgress: inProgress.map((enrollment) => ({
        courseId: enrollment.course.id,
        title: enrollment.course.title,
        progress: enrollment.progress,
        status: enrollment.status,
      })),
    },
    assessments: {
      attempted: best.length,
      passed: best.filter((attempt) => attempt.passed).length,
      averageScore,
      bestScore: best.length === 0 ? null : Math.max(...best.map((attempt) => attempt.percentage ?? 0)),
      recent: attempts.slice(0, 5).map((attempt) => ({
        attemptId: attempt.id,
        assessmentTitle: attempt.assessment.title,
        courseTitle: attempt.assessment.course.title,
        percentage: attempt.percentage,
        passed: attempt.passed,
        submittedAt: attempt.submittedAt,
      })),
    },
    certificates: {
      count: certificates.length,
      items: certificates.map((certificate) => ({
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        courseTitle: certificate.courseTitle,
        score: certificate.score,
        issuedAt: certificate.issuedAt,
      })),
    },
    evaluations: evaluations.map((evaluation) => ({
      id: evaluation.id,
      type: evaluation.type,
      weightedScore: evaluation.weightedScore,
      trainerName: evaluation.trainer.name,
      courseTitle: evaluation.course?.title ?? null,
      comments: evaluation.comments,
      createdAt: evaluation.createdAt,
    })),
  };
}
