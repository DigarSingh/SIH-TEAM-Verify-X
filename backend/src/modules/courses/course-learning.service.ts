import { forbidden, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { assessmentState, computeAvailability } from '../assessments/attempts.service';
import { loadAssessment } from '../assessments/assessments.service';
import { toMaterialDto } from './course-content.service';

type Actor = Express.AuthUser;

/**
 * Everything the course player needs: modules with their materials (URLs, text,
 * download links), the learner's progress, the assessment state and the certificate.
 * Available to enrolled trainees, and as a preview to the course's trainer / admins.
 */
export async function getLearningContent(user: Actor, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    include: {
      trainer: { select: { id: true, name: true, designation: true } },
      modules: { orderBy: { position: 'asc' }, include: { materials: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } },
      assessment: { select: { id: true, isPublished: true } },
    },
  });
  if (!course) throw notFound('COURSE_NOT_FOUND', 'Course not found');

  const isManager = user.role === 'ADMIN' || course.trainerId === user.id;
  let enrollment: { id: string; status: string; progress: number; enrolledAt: Date; lastAccessedAt: Date | null; completedModuleIds: string[] } | null = null;

  if (!isManager) {
    if (user.role !== 'TRAINEE') throw forbidden('NOT_ENROLLED', 'Enroll in this course to access its content');
    const row = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } }, include: { moduleProgress: { select: { moduleId: true } } } });
    if (!row || row.status === 'WITHDRAWN') throw forbidden('NOT_ENROLLED', 'Enroll in this course to access its content');
    await prisma.enrollment.update({ where: { id: row.id }, data: { lastAccessedAt: new Date() } });
    enrollment = { id: row.id, status: row.status, progress: row.progress, enrolledAt: row.enrolledAt, lastAccessedAt: row.lastAccessedAt, completedModuleIds: row.moduleProgress.map((entry) => entry.moduleId) };
  }

  let assessment = null;
  if (course.assessment && (isManager || course.assessment.isPublished)) {
    const row = await loadAssessment(course.assessment.id);
    const availability = !isManager ? await computeAvailability(user.id, row) : null;
    assessment = {
      id: row.id,
      title: row.title,
      description: row.description,
      isPublished: row.isPublished,
      timeLimitMinutes: row.timeLimitMinutes,
      passingScore: row.passingScore,
      maxAttempts: row.maxAttempts,
      deadline: row.deadline,
      questionCount: row.questionsPerAttempt ?? row._count.questions,
      availability: availability ? { ...availability, state: assessmentState(availability) } : null,
    };
  }

  const certificate = !isManager
    ? await prisma.certificate.findUnique({ where: { userId_courseId: { userId: user.id, courseId } }, select: { id: true, certificateNumber: true, status: true } })
    : null;
  const completed = new Set(enrollment?.completedModuleIds ?? []);

  return {
    preview: isManager,
    course: {
      id: course.id,
      title: course.title,
      description: course.description,
      category: course.category,
      difficulty: course.difficulty,
      status: course.status,
      durationMinutes: course.durationMinutes,
      outcomes: course.outcomes,
      certificateEnabled: course.certificateEnabled,
      trainer: course.trainer,
    },
    modules: course.modules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      position: module.position,
      durationMinutes: module.durationMinutes,
      completed: completed.has(module.id),
      materials: module.materials.map(toMaterialDto),
    })),
    enrollment,
    assessment,
    certificate,
  };
}
