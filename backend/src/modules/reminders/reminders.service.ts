import { logger } from '../../config/logger';
import { prisma } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';
import { computeAvailability } from '../assessments/attempts.service';
import { loadAssessment } from '../assessments/assessments.service';
import { getRecommendationsForUser } from '../recommendations/recommendation.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const isoWeek = (date: Date) => {
  // Year + week number of the year (good enough as a "once a week" bucket).
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return `${date.getUTCFullYear()}-W${Math.floor((date.getTime() - start) / (7 * DAY_MS))}`;
};

export interface ReminderSummary {
  deadlineReminders: number;
  trainingReminders: number;
  gapNudges: number;
}

/** Windows (days before the deadline) at which a learner is reminded - one notification per window. */
const DEADLINE_WINDOWS = [7, 3, 1];

/**
 * Scheduled reminders. Every notification carries a dedupe key, so running the
 * job twice (or from two instances) never notifies anyone twice.
 */
export async function runReminders(now: Date = new Date()): Promise<ReminderSummary> {
  const summary: ReminderSummary = { deadlineReminders: 0, trainingReminders: 0, gapNudges: 0 };

  // ---- 1. assessment deadlines ---------------------------------------------------------------------
  const horizon = new Date(now.getTime() + Math.max(...DEADLINE_WINDOWS) * DAY_MS);
  const assessments = await prisma.assessment.findMany({
    where: { isPublished: true, deadline: { gt: now, lte: horizon }, course: { deletedAt: null } },
    select: { id: true, title: true, deadline: true, courseId: true, course: { select: { title: true } } },
  });
  for (const item of assessments) {
    const deadline = item.deadline as Date;
    const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
    const window = DEADLINE_WINDOWS.filter((candidate) => daysLeft <= candidate).pop();
    if (window === undefined) continue;
    const assessment = await loadAssessment(item.id);
    const learners = await prisma.enrollment.findMany({ where: { courseId: item.courseId, status: { in: ['ASSESSMENT_PENDING', 'IN_PROGRESS', 'ENROLLED', 'COMPLETED'] } }, select: { userId: true } });
    for (const learner of learners) {
      const availability = await computeAvailability(learner.userId, assessment, now);
      // Only remind people who could still pass it: not already passed, attempts left.
      if (availability.passed || (availability.attemptsRemaining !== null && availability.attemptsRemaining <= 0)) continue;
      const created = await notifyUser(learner.userId, {
        type: 'ASSESSMENT_DEADLINE',
        title: `Assessment due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}: ${item.course.title}`,
        message: availability.eligible
          ? `"${item.title}" closes on ${isoDay(deadline)}. You can take it now.`
          : `"${item.title}" closes on ${isoDay(deadline)}. Finish the course modules first.`,
        link: `/trainee/learn/${item.courseId}`,
        dedupeKey: `deadline:${item.id}:${window}d`,
      });
      summary.deadlineReminders += created;
    }
  }

  // ---- 2. stalled learners -------------------------------------------------------------------------------
  const stalledBefore = new Date(now.getTime() - 14 * DAY_MS);
  const stalled = await prisma.enrollment.findMany({
    where: {
      status: { in: ['ENROLLED', 'IN_PROGRESS'] },
      user: { status: 'ACTIVE', deletedAt: null },
      course: { deletedAt: null, status: 'PUBLISHED' },
      OR: [{ lastAccessedAt: { lt: stalledBefore } }, { lastAccessedAt: null, enrolledAt: { lt: stalledBefore } }],
    },
    select: { id: true, userId: true, progress: true, course: { select: { id: true, title: true } } },
    take: 500,
  });
  for (const enrollment of stalled) {
    summary.trainingReminders += await notifyUser(enrollment.userId, {
      type: 'TRAINING_REMINDER',
      title: `Pick up where you left off: ${enrollment.course.title}`,
      message: `You are ${enrollment.progress}% through this course. A little time each week closes your skill gap.`,
      link: `/trainee/learn/${enrollment.course.id}`,
      dedupeKey: `stalled:${enrollment.id}:${isoWeek(now)}`,
    });
  }

  // ---- 3. high-priority skill gaps with no training under way ---------------------------------------------------------
  const trainees = await prisma.user.findMany({ where: { role: 'TRAINEE', status: 'ACTIVE', deletedAt: null, jobRoleId: { not: null } }, select: { id: true }, take: 2000 });
  for (const trainee of trainees) {
    const report = await getRecommendationsForUser(trainee.id, { limit: 3 });
    const urgent = report.analysis.ranked.filter((record) => !record.met && (record.priorityLevel === 'HIGH' || record.priorityLevel === 'CRITICAL'));
    if (urgent.length === 0) continue;
    const startable = report.recommendations.find((recommendation) => recommendation.ready && recommendation.status === 'NOT_STARTED');
    if (!startable) continue; // already learning, or nothing available yet
    summary.gapNudges += await notifyUser(trainee.id, {
      type: 'COURSE_RECOMMENDATION',
      title: `${urgent.length} high-priority skill gap${urgent.length === 1 ? '' : 's'} to work on`,
      message: `Start with "${startable.title}" to begin closing your ${urgent[0]?.competencyName} gap.`,
      link: `/trainee/courses/${startable.courseId}`,
      dedupeKey: `gap-nudge:${trainee.id}:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
    });
  }

  logger.info({ ...summary }, 'Reminder job finished');
  return summary;
}

/** Admin-triggered run, audited. */
export async function runRemindersAudited(ctx: AuditContext): Promise<ReminderSummary> {
  const summary = await runReminders();
  await recordAudit(ctx, { action: AuditActions.REMINDERS_SENT, entityType: 'System', metadata: { ...summary } });
  return summary;
}
