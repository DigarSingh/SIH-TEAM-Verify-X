import { prisma } from '../../lib/prisma';
import { listMyAssessments } from '../assessments/attempts.service';
import { thumbnailUrl } from '../courses/courses.mapper';
import { getRecommendationsForUser } from '../recommendations/recommendation.service';
import { mean, monthKeys, monthStart, round1 } from '../analytics/org-data';

export interface ActivityItem {
  type: 'ENROLLED' | 'MODULE_COMPLETED' | 'ASSESSMENT' | 'CERTIFICATE' | 'COMPETENCY';
  title: string;
  detail: string | null;
  at: Date;
}

/** Latest things the user did on the platform, newest first (merged from several tables). */
export async function recentActivity(userId: string, limit = 10): Promise<ActivityItem[]> {
  const [enrollments, modules, attempts, certificates, competency] = await Promise.all([
    prisma.enrollment.findMany({ where: { userId }, orderBy: { enrolledAt: 'desc' }, take: limit, select: { enrolledAt: true, course: { select: { title: true } } } }),
    prisma.moduleProgress.findMany({ where: { enrollment: { userId } }, orderBy: { completedAt: 'desc' }, take: limit, select: { completedAt: true, module: { select: { title: true, course: { select: { title: true } } } } } }),
    prisma.assessmentAttempt.findMany({ where: { userId, status: 'SUBMITTED' }, orderBy: { submittedAt: 'desc' }, take: limit, select: { submittedAt: true, percentage: true, passed: true, assessment: { select: { course: { select: { title: true } } } } } }),
    prisma.certificate.findMany({ where: { userId }, orderBy: { issuedAt: 'desc' }, take: limit, select: { issuedAt: true, courseTitle: true } }),
    prisma.competencyHistory.findMany({ where: { userId, NOT: { source: 'BASELINE' } }, orderBy: { createdAt: 'desc' }, take: limit, select: { createdAt: true, previousLevel: true, newLevel: true, competency: { select: { name: true } } } }),
  ]);
  const items: ActivityItem[] = [
    ...enrollments.map((row) => ({ type: 'ENROLLED' as const, title: `Enrolled in ${row.course.title}`, detail: null, at: row.enrolledAt })),
    ...modules.map((row) => ({ type: 'MODULE_COMPLETED' as const, title: `Completed “${row.module.title}”`, detail: row.module.course.title, at: row.completedAt })),
    ...attempts.map((row) => ({
      type: 'ASSESSMENT' as const,
      title: `${row.passed ? 'Passed' : 'Attempted'} the ${row.assessment.course.title} assessment`,
      detail: `${row.percentage ?? 0}%`,
      at: row.submittedAt as Date,
    })),
    ...certificates.map((row) => ({ type: 'CERTIFICATE' as const, title: `Certificate earned: ${row.courseTitle}`, detail: null, at: row.issuedAt })),
    ...competency.map((row) => ({ type: 'COMPETENCY' as const, title: `${row.competency.name} improved`, detail: `${row.previousLevel}% → ${row.newLevel}%`, at: row.createdAt })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/** Everything the trainee dashboard shows, in one round trip. */
export async function traineeDashboard(user: Express.AuthUser) {
  const [report, enrollments, assessments, certificates, unread, activity] = await Promise.all([
    getRecommendationsForUser(user.id),
    prisma.enrollment.findMany({
      where: { userId: user.id, status: { in: ['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING'] }, course: { deletedAt: null } },
      orderBy: [{ lastAccessedAt: { sort: 'desc', nulls: 'last' } }],
      take: 6,
      include: { course: { select: { id: true, title: true, category: true, difficulty: true, thumbnailKey: true, updatedAt: true } } },
    }),
    listMyAssessments(user),
    prisma.certificate.findMany({ where: { userId: user.id, status: 'VALID' }, orderBy: { issuedAt: 'desc' }, take: 3 }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    recentActivity(user.id, 8),
  ]);
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, department: { select: { name: true } } } });
  const { analysis } = report;
  const finished = await prisma.enrollment.count({ where: { userId: user.id, status: { in: ['COMPLETED', 'CERTIFIED'] } } });
  const certificateCount = await prisma.certificate.count({ where: { userId: user.id, status: 'VALID' } });

  return {
    welcome: { name: profile.name, department: profile.department?.name ?? null, jobRole: analysis.jobRole },
    competency: {
      readiness: analysis.summary.readiness,
      averageCurrent: analysis.summary.averageCurrent,
      averageRequired: analysis.summary.averageRequired,
      summary: analysis.summary,
      radar: analysis.records.map((record) => ({ competency: record.competencyName, current: record.currentLevel, required: record.requiredLevel })),
    },
    topGaps: analysis.ranked.filter((record) => !record.met).slice(0, 4),
    recommendations: report.recommendations.slice(0, 4),
    learning: {
      inProgress: enrollments.map((enrollment) => ({
        enrollmentId: enrollment.id,
        status: enrollment.status,
        progress: enrollment.progress,
        lastAccessedAt: enrollment.lastAccessedAt,
        course: {
          id: enrollment.course.id,
          title: enrollment.course.title,
          category: enrollment.course.category,
          difficulty: enrollment.course.difficulty,
          thumbnailUrl: thumbnailUrl({ id: enrollment.course.id, thumbnailKey: enrollment.course.thumbnailKey, updatedAt: enrollment.course.updatedAt }),
        },
      })),
      coursesCompleted: finished,
      certificates: certificateCount,
    },
    upcomingAssessments: assessments.filter((item) => ['AVAILABLE', 'IN_PROGRESS', 'LOCKED'].includes(item.state)).slice(0, 4),
    certificates: certificates.map((certificate) => ({ id: certificate.id, certificateNumber: certificate.certificateNumber, courseTitle: certificate.courseTitle, score: certificate.score, issuedAt: certificate.issuedAt })),
    activity,
    unreadNotifications: unread,
  };
}

/** Everything the trainer dashboard shows. Scoped to the trainer's own courses. */
export async function trainerDashboard(user: Express.AuthUser) {
  const courses = await prisma.course.findMany({
    where: { trainerId: user.id, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, status: true, difficulty: true, updatedAt: true, assessment: { select: { id: true, isPublished: true } } },
  });
  const courseIds = courses.map((course) => course.id);
  const assessmentIds = courses.flatMap((course) => (course.assessment ? [course.assessment.id] : []));
  const since = monthStart(6);
  const stalledBefore = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [enrollments, attempts, history, recentEnrollments, recentAttempts, stalled, scoreTrend] = await Promise.all([
    prisma.enrollment.findMany({ where: { courseId: { in: courseIds }, status: { not: 'WITHDRAWN' } }, select: { courseId: true, userId: true, status: true, progress: true } }),
    prisma.assessmentAttempt.findMany({ where: { assessmentId: { in: assessmentIds }, status: 'SUBMITTED' }, select: { assessmentId: true, percentage: true, passed: true } }),
    prisma.competencyHistory.findMany({ where: { courseId: { in: courseIds } }, select: { competencyId: true, previousLevel: true, newLevel: true, competency: { select: { name: true } } } }),
    prisma.enrollment.findMany({ where: { courseId: { in: courseIds }, status: { not: 'WITHDRAWN' } }, orderBy: { enrolledAt: 'desc' }, take: 6, select: { enrolledAt: true, user: { select: { name: true } }, course: { select: { title: true } } } }),
    prisma.assessmentAttempt.findMany({ where: { assessmentId: { in: assessmentIds }, status: 'SUBMITTED' }, orderBy: { submittedAt: 'desc' }, take: 6, select: { id: true, submittedAt: true, percentage: true, passed: true, user: { select: { name: true } }, assessment: { select: { course: { select: { title: true } } } } } }),
    prisma.enrollment.findMany({
      where: { courseId: { in: courseIds }, status: { in: ['ENROLLED', 'IN_PROGRESS'] }, OR: [{ lastAccessedAt: { lt: stalledBefore } }, { lastAccessedAt: null, enrolledAt: { lt: stalledBefore } }] },
      orderBy: { lastAccessedAt: { sort: 'asc', nulls: 'first' } },
      take: 5,
      select: { userId: true, progress: true, lastAccessedAt: true, enrolledAt: true, user: { select: { name: true } }, course: { select: { id: true, title: true } } },
    }),
    prisma.assessmentAttempt.findMany({ where: { assessmentId: { in: assessmentIds }, status: 'SUBMITTED', submittedAt: { gte: since } }, select: { submittedAt: true, percentage: true } }),
  ]);

  const finished = enrollments.filter((enrollment) => enrollment.status === 'COMPLETED' || enrollment.status === 'CERTIFIED');
  const perCourse = courses.map((course) => {
    const mine = enrollments.filter((enrollment) => enrollment.courseId === course.id);
    const done = mine.filter((enrollment) => enrollment.status === 'COMPLETED' || enrollment.status === 'CERTIFIED').length;
    const courseAttempts = attempts.filter((attempt) => attempt.assessmentId === course.assessment?.id);
    return {
      id: course.id,
      title: course.title,
      status: course.status,
      difficulty: course.difficulty,
      enrolled: mine.length,
      completionRate: mine.length === 0 ? 0 : round1((done / mine.length) * 100),
      averageProgress: mine.length === 0 ? 0 : round1(mine.reduce((sum, enrollment) => sum + enrollment.progress, 0) / mine.length),
      averageScore: mean(courseAttempts.map((attempt) => attempt.percentage ?? 0)),
      hasAssessment: Boolean(course.assessment?.isPublished),
    };
  });

  const impact = new Map<string, { name: string; gains: number[] }>();
  for (const event of history) {
    const entry = impact.get(event.competencyId) ?? { name: event.competency.name, gains: [] };
    entry.gains.push(event.newLevel - event.previousLevel);
    impact.set(event.competencyId, entry);
  }

  const keys = monthKeys(6);
  const trend = keys.map((month) => {
    const scores = scoreTrend.filter((attempt) => attempt.submittedAt && `${attempt.submittedAt.getUTCFullYear()}-${String(attempt.submittedAt.getUTCMonth() + 1).padStart(2, '0')}` === month).map((attempt) => attempt.percentage ?? 0);
    return { month, averageScore: mean(scores), attempts: scores.length };
  });

  return {
    metrics: {
      activeCourses: courses.filter((course) => course.status === 'PUBLISHED').length,
      draftCourses: courses.filter((course) => course.status === 'DRAFT').length,
      totalTrainees: new Set(enrollments.map((enrollment) => enrollment.userId)).size,
      awaitingAssessment: enrollments.filter((enrollment) => enrollment.status === 'ASSESSMENT_PENDING').length,
      completionRate: enrollments.length === 0 ? 0 : round1((finished.length / enrollments.length) * 100),
      averageScore: mean(attempts.map((attempt) => attempt.percentage ?? 0)),
      passRate: attempts.length === 0 ? null : round1((attempts.filter((attempt) => attempt.passed).length / attempts.length) * 100),
      averageCompetencyGain: mean(history.map((event) => event.newLevel - event.previousLevel)),
    },
    courses: perCourse,
    competencyImprovement: [...impact.entries()].map(([competencyId, entry]) => ({ competencyId, competencyName: entry.name, learners: entry.gains.length, averageGain: mean(entry.gains) ?? 0 })),
    scoreTrend: trend,
    recentActivity: [
      ...recentEnrollments.map((row) => ({ type: 'ENROLLED' as const, title: `${row.user.name} enrolled in ${row.course.title}`, detail: null as string | null, at: row.enrolledAt })),
      ...recentAttempts.map((row) => ({ type: 'ASSESSMENT' as const, title: `${row.user.name} ${row.passed ? 'passed' : 'attempted'} ${row.assessment.course.title}`, detail: `${row.percentage ?? 0}%`, at: row.submittedAt as Date })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 8),
    needsAttention: stalled.map((row) => ({
      userId: row.userId,
      name: row.user.name,
      courseId: row.course.id,
      courseTitle: row.course.title,
      progress: row.progress,
      lastActiveAt: row.lastAccessedAt ?? row.enrolledAt,
    })),
  };
}
