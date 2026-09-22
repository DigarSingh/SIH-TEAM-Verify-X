import type { EnrollmentStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';
import { checkAchievements } from '../achievements/achievements.service';

const FINISHED: EnrollmentStatus[] = ['COMPLETED', 'CERTIFIED'];

export const isFinished = (status: EnrollmentStatus) => FINISHED.includes(status);

/**
 * Recalculates progress and status from the completed modules.
 *
 *   ENROLLED ─(first module)→ IN_PROGRESS ─(all modules)→ ASSESSMENT_PENDING ─(pass)→ COMPLETED ─(certificate)→ CERTIFIED
 *
 * A course without a published assessment goes straight to COMPLETED when every module is done.
 * Finished and withdrawn enrollments never move backwards.
 */
export async function recomputeEnrollment(db: Db, enrollmentId: string, now: Date = new Date()) {
  const enrollment = await db.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { course: { select: { modules: { select: { id: true } }, assessment: { select: { isPublished: true } } } } },
  });
  const moduleIds = enrollment.course.modules.map((module) => module.id);
  const completed = moduleIds.length === 0 ? 0 : await db.moduleProgress.count({ where: { enrollmentId, moduleId: { in: moduleIds } } });
  const progress = moduleIds.length === 0 ? 0 : Math.round((completed / moduleIds.length) * 100);

  if (isFinished(enrollment.status) || enrollment.status === 'WITHDRAWN') {
    return db.enrollment.update({ where: { id: enrollmentId }, data: { lastAccessedAt: now, ...(enrollment.status === 'WITHDRAWN' ? {} : { progress }) } });
  }

  const assessmentAvailable = Boolean(enrollment.course.assessment?.isPublished);
  let status: EnrollmentStatus;
  if (moduleIds.length > 0 && completed === moduleIds.length) status = assessmentAvailable ? 'ASSESSMENT_PENDING' : 'COMPLETED';
  else if (completed > 0) status = 'IN_PROGRESS';
  else status = 'ENROLLED';

  return db.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progress,
      status,
      lastAccessedAt: now,
      ...(completed > 0 && !enrollment.startedAt ? { startedAt: now } : {}),
      ...(status === 'COMPLETED' && !enrollment.completedAt ? { completedAt: now } : {}),
    },
  });
}

/** Recalculates every active enrollment of a course (after modules were added or removed). */
export async function recomputeCourseEnrollments(db: Db, courseId: string): Promise<void> {
  const enrollments = await db.enrollment.findMany({ where: { courseId, status: { notIn: ['WITHDRAWN', 'COMPLETED', 'CERTIFIED'] } }, select: { id: true } });
  for (const enrollment of enrollments) await recomputeEnrollment(db, enrollment.id);
}

/** Prerequisite courses the learner has not completed yet. */
export async function unmetPrerequisites(userId: string, courseId: string, db: Db = prisma) {
  const prerequisites = await db.coursePrerequisite.findMany({
    where: { courseId },
    include: { prerequisite: { select: { id: true, title: true, status: true, deletedAt: true } } },
  });
  const active = prerequisites.filter((entry) => entry.prerequisite.status === 'PUBLISHED' && !entry.prerequisite.deletedAt);
  if (active.length === 0) return [];
  const finished = await db.enrollment.findMany({
    where: { userId, courseId: { in: active.map((entry) => entry.prerequisiteId) }, status: { in: FINISHED } },
    select: { courseId: true },
  });
  const done = new Set(finished.map((entry) => entry.courseId));
  return active.filter((entry) => !done.has(entry.prerequisiteId)).map((entry) => ({ id: entry.prerequisite.id, title: entry.prerequisite.title }));
}

/** Enrolls a trainee in a published course (idempotent re-enrollment after withdrawal). */
export async function enrollUser(user: Express.AuthUser, courseId: string, ctx: AuditContext) {
  if (user.role !== 'TRAINEE') throw forbidden('ENROLLMENT_NOT_ALLOWED', 'Only trainees can enroll in courses');

  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: { id: true, title: true, status: true, trainerId: true, _count: { select: { modules: true } } },
  });
  if (!course || course.status !== 'PUBLISHED') throw notFound('COURSE_NOT_FOUND', 'Course not found or not open for enrollment');

  const existing = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } } });
  if (existing && existing.status !== 'WITHDRAWN') throw conflict('ALREADY_ENROLLED', 'You are already enrolled in this course');

  const missing = await unmetPrerequisites(user.id, courseId);
  if (missing.length > 0) {
    throw conflict('PREREQUISITES_NOT_MET', `Complete these courses first: ${missing.map((m) => m.title).join(', ')}`, { prerequisites: missing });
  }

  let enrollment;
  try {
    enrollment = existing
      ? await prisma.enrollment.update({ where: { id: existing.id }, data: { status: 'ENROLLED', enrolledAt: new Date(), lastAccessedAt: new Date() } })
      : await prisma.enrollment.create({ data: { userId: user.id, courseId, lastAccessedAt: new Date() } });
  } catch (error) {
    // Two simultaneous enrollment requests: the unique (user, course) constraint decides the winner.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('ALREADY_ENROLLED', 'You are already enrolled in this course');
    throw error;
  }
  enrollment = await recomputeEnrollment(prisma, enrollment.id);

  await notifyUser(user.id, {
    type: 'COURSE_ENROLLMENT',
    title: `Enrolled: ${course.title}`,
    message: 'You are enrolled. Work through the modules, then take the assessment to earn your competency update and certificate.',
    link: `/trainee/learn/${courseId}`,
  });
  await notifyUser(course.trainerId, {
    type: 'COURSE_ENROLLMENT',
    title: 'New enrollment',
    message: `${user.name} enrolled in ${course.title}.`,
    link: `/trainer/courses/${courseId}/trainees`,
  });
  await recordAudit(ctx, { action: AuditActions.COURSE_ENROLLED, entityType: 'Course', entityId: courseId, metadata: { title: course.title } });
  await checkAchievements(user.id);
  return enrollment;
}

async function ownEnrollment(userId: string, enrollmentId: string) {
  const enrollment = await prisma.enrollment.findFirst({ where: { id: enrollmentId, userId }, include: { course: { select: { id: true, title: true } } } });
  if (!enrollment) throw notFound('ENROLLMENT_NOT_FOUND', 'Enrollment not found');
  return enrollment;
}

/** Marks a module as completed (idempotent) and advances the enrollment state. */
export async function completeModule(userId: string, enrollmentId: string, moduleId: string, ctx: AuditContext) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (enrollment.status === 'WITHDRAWN') throw conflict('ENROLLMENT_WITHDRAWN', 'You have withdrawn from this course. Re-enroll to continue.');
  const module = await prisma.module.findFirst({ where: { id: moduleId, courseId: enrollment.courseId }, select: { id: true, title: true } });
  if (!module) throw notFound('MODULE_NOT_FOUND', 'Module not found in this course');

  const alreadyDone = await prisma.moduleProgress.findUnique({ where: { enrollmentId_moduleId: { enrollmentId, moduleId } } });
  if (!alreadyDone) {
    await prisma.moduleProgress.upsert({ where: { enrollmentId_moduleId: { enrollmentId, moduleId } }, create: { enrollmentId, moduleId }, update: {} });
    await recordAudit(ctx, { action: AuditActions.MODULE_COMPLETED, entityType: 'Enrollment', entityId: enrollmentId, metadata: { module: module.title, course: enrollment.course.title } });
  }
  const updated = await recomputeEnrollment(prisma, enrollmentId);

  if (!alreadyDone && updated.status === 'ASSESSMENT_PENDING' && enrollment.status !== 'ASSESSMENT_PENDING') {
    await notifyUser(userId, {
      type: 'ASSESSMENT_DEADLINE',
      title: `Assessment unlocked: ${enrollment.course.title}`,
      message: 'You have completed every module. Take the assessment to earn your certificate and update your competency.',
      link: `/trainee/learn/${enrollment.courseId}`,
      dedupeKey: `assessment-unlocked:${enrollmentId}`,
    });
  }
  return updated;
}

/** Un-marks a module (only while the course is not yet completed). */
export async function uncompleteModule(userId: string, enrollmentId: string, moduleId: string) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (isFinished(enrollment.status)) throw conflict('COURSE_COMPLETED', 'This course is already completed');
  await prisma.moduleProgress.deleteMany({ where: { enrollmentId, moduleId } });
  return recomputeEnrollment(prisma, enrollmentId);
}

export async function withdraw(userId: string, enrollmentId: string, ctx: AuditContext) {
  const enrollment = await ownEnrollment(userId, enrollmentId);
  if (isFinished(enrollment.status)) throw conflict('COURSE_COMPLETED', 'A completed course cannot be withdrawn');
  if (enrollment.status === 'WITHDRAWN') return enrollment;
  const updated = await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: 'WITHDRAWN' } });
  await recordAudit(ctx, { action: AuditActions.ENROLLMENT_WITHDRAWN, entityType: 'Course', entityId: enrollment.courseId, metadata: { title: enrollment.course.title } });
  return updated;
}
