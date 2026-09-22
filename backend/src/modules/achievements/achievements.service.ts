import { prisma, type Db } from '../../lib/prisma';
import { loadEmployeeAnalysis } from '../competencies/profile.service';
import { notifyUser } from '../../services/notification.service';

export interface AchievementDefinition {
  code: string;
  title: string;
  description: string;
  /** Lucide icon name rendered by the web app. */
  icon: string;
  tier: 'bronze' | 'silver' | 'gold';
}

/** Badge catalogue. Awards are computed from real platform data, never granted manually. */
export const ACHIEVEMENT_CATALOG: AchievementDefinition[] = [
  { code: 'FIRST_STEPS', title: 'First Steps', description: 'Enrolled in your first course.', icon: 'footprints', tier: 'bronze' },
  { code: 'COURSE_COMPLETED', title: 'Course Completed', description: 'Completed your first course.', icon: 'circle-check', tier: 'bronze' },
  { code: 'CERTIFIED', title: 'Certified', description: 'Earned your first certificate.', icon: 'award', tier: 'silver' },
  { code: 'FIRST_TIME_PASS', title: 'First-Time Pass', description: 'Passed an assessment on your first attempt.', icon: 'target', tier: 'silver' },
  { code: 'HIGH_ACHIEVER', title: 'High Achiever', description: 'Scored 90% or more in an assessment.', icon: 'star', tier: 'silver' },
  { code: 'PERFECT_SCORE', title: 'Perfect Score', description: 'Scored 100% in an assessment.', icon: 'trophy', tier: 'gold' },
  { code: 'GAP_CLOSER', title: 'Gap Closer', description: 'Reached the required level in a competency.', icon: 'goal', tier: 'silver' },
  { code: 'COMPETENCY_CLIMBER', title: 'Competency Climber', description: 'Gained 30 or more points in a single competency.', icon: 'trending-up', tier: 'silver' },
  { code: 'MULTI_SKILLED', title: 'Multi-Skilled', description: 'Earned certificates in three different courses.', icon: 'layers', tier: 'gold' },
  { code: 'VOICE_OF_LEARNERS', title: 'Voice of the Learner', description: 'Shared feedback on a course.', icon: 'message-square-heart', tier: 'bronze' },
  { code: 'FULLY_QUALIFIED', title: 'Fully Qualified', description: 'Met every competency requirement of your role.', icon: 'shield-check', tier: 'gold' },
];

/**
 * Evaluates every badge for a user and awards the ones newly earned.
 * Idempotent (unique user + code) and safe to call after any learning event.
 * Returns the badges awarded by this call.
 */
export async function checkAchievements(userId: string, db: Db = prisma): Promise<AchievementDefinition[]> {
  const [enrollments, finished, certificates, attempts, feedbackCount, history, existing] = await Promise.all([
    db.enrollment.count({ where: { userId, status: { not: 'WITHDRAWN' } } }),
    db.enrollment.count({ where: { userId, status: { in: ['COMPLETED', 'CERTIFIED'] } } }),
    db.certificate.count({ where: { userId, status: 'VALID' } }),
    db.assessmentAttempt.findMany({ where: { userId, status: 'SUBMITTED' }, select: { percentage: true, passed: true, attemptNumber: true } }),
    db.feedback.count({ where: { userId } }),
    db.competencyHistory.findMany({ where: { userId, NOT: { source: 'BASELINE' } }, select: { competencyId: true, previousLevel: true, newLevel: true } }),
    db.achievement.findMany({ where: { userId }, select: { code: true } }),
  ]);
  const have = new Set(existing.map((row) => row.code));

  const gainByCompetency = new Map<string, number>();
  for (const event of history) gainByCompetency.set(event.competencyId, (gainByCompetency.get(event.competencyId) ?? 0) + (event.newLevel - event.previousLevel));

  const earned = new Set<string>();
  if (enrollments >= 1) earned.add('FIRST_STEPS');
  if (finished >= 1) earned.add('COURSE_COMPLETED');
  if (certificates >= 1) earned.add('CERTIFIED');
  if (certificates >= 3) earned.add('MULTI_SKILLED');
  if (attempts.some((attempt) => attempt.passed && attempt.attemptNumber === 1)) earned.add('FIRST_TIME_PASS');
  if (attempts.some((attempt) => (attempt.percentage ?? 0) >= 90)) earned.add('HIGH_ACHIEVER');
  if (attempts.some((attempt) => (attempt.percentage ?? 0) >= 100)) earned.add('PERFECT_SCORE');
  if ([...gainByCompetency.values()].some((gain) => gain >= 30)) earned.add('COMPETENCY_CLIMBER');
  if (feedbackCount >= 1) earned.add('VOICE_OF_LEARNERS');

  const needsAnalysis = ![have.has('GAP_CLOSER'), have.has('FULLY_QUALIFIED')].every(Boolean);
  if (needsAnalysis) {
    const analysis = await loadEmployeeAnalysis(userId, { db });
    // Only count a requirement as "closed" once the employee has actually been assessed on it.
    if (analysis.records.some((record) => record.assessed && record.met)) earned.add('GAP_CLOSER');
    if (analysis.records.length > 0 && analysis.records.every((record) => record.met)) earned.add('FULLY_QUALIFIED');
  }

  const fresh = ACHIEVEMENT_CATALOG.filter((definition) => earned.has(definition.code) && !have.has(definition.code));
  if (fresh.length === 0) return [];

  const created = await db.achievement.createMany({
    data: fresh.map((definition) => ({ userId, code: definition.code, title: definition.title, description: definition.description })),
    skipDuplicates: true,
  });
  if (created.count > 0) {
    for (const definition of fresh) {
      await notifyUser(
        userId,
        {
          type: 'ACHIEVEMENT',
          title: `Achievement unlocked: ${definition.title}`,
          message: definition.description,
          link: '/trainee/achievements',
          dedupeKey: `achievement:${definition.code}`,
        },
        db,
      );
    }
  }
  return fresh;
}

/** Catalogue merged with what the user has earned. */
export async function listAchievements(userId: string) {
  const awarded = await prisma.achievement.findMany({ where: { userId }, orderBy: { awardedAt: 'desc' } });
  const byCode = new Map(awarded.map((row) => [row.code, row]));
  const items = ACHIEVEMENT_CATALOG.map((definition) => ({
    ...definition,
    earned: byCode.has(definition.code),
    awardedAt: byCode.get(definition.code)?.awardedAt ?? null,
  }));
  return { items, earnedCount: awarded.length, totalCount: ACHIEVEMENT_CATALOG.length };
}
