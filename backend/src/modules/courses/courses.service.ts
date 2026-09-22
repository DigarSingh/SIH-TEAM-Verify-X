import type { CourseStatus, Prisma } from '@prisma/client';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUsers } from '../../services/notification.service';
import { getStorage } from '../../services/storage';
import { unmetPrerequisites } from '../enrollments/enrollments.service';
import { courseListInclude, thumbnailUrl, toCourseListItem, type CourseExtras } from './courses.mapper';
import type { CreateCourseInput, ListCoursesQuery, UpdateCourseInput } from './courses.schemas';

type Actor = Express.AuthUser;
type Mapping = { competencyId: string; levelFrom: number; levelTo: number };

// ---------------------------------------------------------------------------------------------
// Access helpers
// ---------------------------------------------------------------------------------------------

export async function loadCourse(id: string, db: Db = prisma) {
  const course = await db.course.findFirst({ where: { id, deletedAt: null } });
  if (!course) throw notFound('COURSE_NOT_FOUND', 'Course not found');
  return course;
}

/** Only the owning trainer or an administrator may change a course. */
export function assertCanManage(user: Actor, course: { trainerId: string }): void {
  if (user.role === 'ADMIN') return;
  if (user.role === 'TRAINER' && course.trainerId === user.id) return;
  throw forbidden('NOT_COURSE_OWNER', 'You can only manage your own courses');
}

export async function loadManagedCourse(user: Actor, id: string, db: Db = prisma) {
  const course = await loadCourse(id, db);
  assertCanManage(user, course);
  return course;
}

// ---------------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------------

function visibilityFilter(user: Actor, mine: boolean | undefined): Prisma.CourseWhereInput {
  if (user.role === 'ADMIN') return { deletedAt: null, ...(mine ? { trainerId: user.id } : {}) };
  if (user.role === 'TRAINER') {
    return { deletedAt: null, ...(mine ? { trainerId: user.id } : { OR: [{ status: 'PUBLISHED' }, { trainerId: user.id }] }) };
  }
  return { deletedAt: null, status: 'PUBLISHED' };
}

function completionFilter(userId: string, completion: NonNullable<ListCoursesQuery['completion']>): Prisma.CourseWhereInput {
  if (completion === 'NOT_ENROLLED') return { enrollments: { none: { userId, status: { not: 'WITHDRAWN' } } } };
  if (completion === 'COMPLETED') return { enrollments: { some: { userId, status: { in: ['COMPLETED', 'CERTIFIED'] } } } };
  return { enrollments: { some: { userId, status: completion } } };
}

async function extrasFor(userId: string, courseIds: string[]): Promise<Map<string, CourseExtras>> {
  const [ratings, enrollments] = await Promise.all([
    prisma.feedback.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _avg: { rating: true }, _count: true }),
    prisma.enrollment.findMany({ where: { userId, courseId: { in: courseIds }, status: { not: 'WITHDRAWN' } }, select: { id: true, courseId: true, status: true, progress: true } }),
  ]);
  const extras = new Map<string, CourseExtras>();
  for (const id of courseIds) extras.set(id, {});
  for (const row of ratings) extras.get(row.courseId)!.rating = { average: Math.round((row._avg.rating ?? 0) * 10) / 10, count: row._count };
  for (const row of enrollments) extras.get(row.courseId)!.enrollment = { id: row.id, status: row.status, progress: row.progress };
  return extras;
}

export async function listCourses(user: Actor, query: ListCoursesQuery) {
  const and: Prisma.CourseWhereInput[] = [visibilityFilter(user, query.mine)];
  if (query.status && user.role !== 'TRAINEE') and.push({ status: query.status });
  if (query.category) and.push({ category: query.category });
  if (query.difficulty) and.push({ difficulty: query.difficulty });
  if (query.competencyId) and.push({ competencies: { some: { competencyId: query.competencyId } } });
  if (query.departmentId) and.push({ trainer: { departmentId: query.departmentId } });
  if (query.completion) and.push(completionFilter(user.id, query.completion));
  if (query.q) {
    and.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { category: { contains: query.q, mode: 'insensitive' } },
        { competencies: { some: { competency: { name: { contains: query.q, mode: 'insensitive' } } } } },
      ],
    });
  }
  const where: Prisma.CourseWhereInput = { AND: and };

  const orderBy: Prisma.CourseOrderByWithRelationInput[] =
    query.sort === 'title'
      ? [{ title: 'asc' }]
      : query.sort === 'popular'
        ? [{ enrollments: { _count: 'desc' } }, { title: 'asc' }]
        : query.sort === 'duration'
          ? [{ durationMinutes: 'asc' }]
          : [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];

  const [total, rows, categories] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      orderBy,
      include: courseListInclude,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.course.findMany({ where: visibilityFilter(user, false), distinct: ['category'], select: { category: true }, orderBy: { category: 'asc' } }),
  ]);
  const extras = await extrasFor(user.id, rows.map((row) => row.id));
  return {
    items: rows.map((row) => toCourseListItem(row, extras.get(row.id))),
    total,
    categories: categories.map((row) => row.category),
  };
}

// ---------------------------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------------------------

export async function getCourseDetail(user: Actor, id: string) {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...courseListInclude,
      modules: {
        orderBy: { position: 'asc' },
        include: { materials: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true, type: true, mimeType: true, sizeBytes: true, position: true } } },
      },
      prerequisites: { include: { prerequisite: { select: { id: true, title: true, status: true, deletedAt: true } } } },
      assessment: {
        select: { id: true, title: true, description: true, isPublished: true, timeLimitMinutes: true, passingScore: true, maxAttempts: true, deadline: true, questionsPerAttempt: true, _count: { select: { questions: true } } },
      },
    },
  });
  if (!course) throw notFound('COURSE_NOT_FOUND', 'Course not found');

  const canManage = user.role === 'ADMIN' || (user.role === 'TRAINER' && course.trainerId === user.id);
  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: id } }, select: { id: true, status: true, progress: true } });
  const activeEnrollment = enrollment && enrollment.status !== 'WITHDRAWN' ? enrollment : null;

  // Visibility: published courses are open to everyone; drafts/archived only to their managers
  // (and to learners who are already enrolled).
  const visible = course.status === 'PUBLISHED' || canManage || (user.role === 'TRAINER' && course.trainerId === user.id) || Boolean(activeEnrollment);
  if (!visible) throw notFound('COURSE_NOT_FOUND', 'Course not found');

  const [feedback, missing] = await Promise.all([
    prisma.feedback.aggregate({ where: { courseId: id }, _avg: { rating: true, trainerRating: true }, _count: true }),
    user.role === 'TRAINEE' && !activeEnrollment ? unmetPrerequisites(user.id, id) : Promise.resolve([]),
  ]);
  const finishedPrerequisites =
    user.role === 'TRAINEE'
      ? new Set((await prisma.enrollment.findMany({ where: { userId: user.id, courseId: { in: course.prerequisites.map((p) => p.prerequisiteId) }, status: { in: ['COMPLETED', 'CERTIFIED'] } }, select: { courseId: true } })).map((e) => e.courseId))
      : new Set<string>();

  const assessment = course.assessment;
  const showAssessment = assessment && (canManage || assessment.isPublished);
  const base = toCourseListItem(course, {
    rating: { average: Math.round((feedback._avg.rating ?? 0) * 10) / 10, count: feedback._count },
    enrollment: activeEnrollment,
  });

  let eligibility: { allowed: boolean; code?: string; message?: string; missingPrerequisites: { id: string; title: string }[] } | null = null;
  if (user.role === 'TRAINEE') {
    if (activeEnrollment) eligibility = { allowed: false, code: 'ALREADY_ENROLLED', message: 'You are already enrolled in this course', missingPrerequisites: [] };
    else if (course.status !== 'PUBLISHED') eligibility = { allowed: false, code: 'NOT_PUBLISHED', message: 'This course is not open for enrollment', missingPrerequisites: [] };
    else if (missing.length > 0) eligibility = { allowed: false, code: 'PREREQUISITES_NOT_MET', message: `Complete first: ${missing.map((m) => m.title).join(', ')}`, missingPrerequisites: missing };
    else eligibility = { allowed: true, missingPrerequisites: [] };
  }

  return {
    ...base,
    outcomes: course.outcomes,
    canManage,
    eligibility,
    modules: course.modules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      position: module.position,
      durationMinutes: module.durationMinutes,
      materials: module.materials,
    })),
    prerequisites: course.prerequisites
      .filter((entry) => !entry.prerequisite.deletedAt)
      .map((entry) => ({ id: entry.prerequisite.id, title: entry.prerequisite.title, status: entry.prerequisite.status, completed: finishedPrerequisites.has(entry.prerequisiteId) })),
    assessment: showAssessment
      ? {
          id: assessment.id,
          title: assessment.title,
          description: assessment.description,
          isPublished: assessment.isPublished,
          timeLimitMinutes: assessment.timeLimitMinutes,
          passingScore: assessment.passingScore,
          maxAttempts: assessment.maxAttempts,
          deadline: assessment.deadline,
          questionCount: assessment.questionsPerAttempt ?? assessment._count.questions,
          ...(canManage ? { questionBankSize: assessment._count.questions } : {}),
        }
      : null,
    feedback: {
      average: Math.round((feedback._avg.rating ?? 0) * 10) / 10,
      trainerAverage: Math.round((feedback._avg.trainerRating ?? 0) * 10) / 10,
      count: feedback._count,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------------------------

async function assertCompetenciesExist(mappings: Mapping[], db: Db): Promise<void> {
  if (mappings.length === 0) return;
  const found = await db.competency.findMany({ where: { id: { in: mappings.map((m) => m.competencyId) }, isActive: true }, select: { id: true } });
  if (found.length !== new Set(mappings.map((m) => m.competencyId)).size) {
    throw badRequest('INVALID_COMPETENCY', 'One or more selected competencies do not exist or are inactive');
  }
}

/** Prerequisites must exist and must not create a cycle (A requires B requires A). */
async function assertPrerequisitesValid(courseId: string | null, prerequisiteIds: string[], db: Db): Promise<void> {
  if (prerequisiteIds.length === 0) return;
  if (courseId && prerequisiteIds.includes(courseId)) throw badRequest('INVALID_PREREQUISITE', 'A course cannot be its own prerequisite');
  const found = await db.course.findMany({ where: { id: { in: prerequisiteIds }, deletedAt: null }, select: { id: true } });
  if (found.length !== prerequisiteIds.length) throw badRequest('INVALID_PREREQUISITE', 'One or more prerequisite courses do not exist');
  if (!courseId) return; // a brand-new course cannot be anyone's prerequisite yet

  const edges = await db.coursePrerequisite.findMany({ where: { courseId: { not: courseId } }, select: { courseId: true, prerequisiteId: true } });
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.courseId, [...(next.get(edge.courseId) ?? []), edge.prerequisiteId]);
  const seen = new Set<string>();
  const stack = [...prerequisiteIds];
  while (stack.length > 0) {
    const node = stack.pop() as string;
    if (node === courseId) throw conflict('PREREQUISITE_CYCLE', 'These prerequisites would create a circular dependency');
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(next.get(node) ?? []));
  }
}

export async function createCourse(user: Actor, input: CreateCourseInput, ctx: AuditContext) {
  const trainerId = user.role === 'ADMIN' && input.trainerId ? input.trainerId : user.id;
  if (trainerId !== user.id) {
    const trainer = await prisma.user.findFirst({ where: { id: trainerId, role: 'TRAINER', status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!trainer) throw badRequest('INVALID_TRAINER', 'The selected user is not an active trainer');
  }
  await assertCompetenciesExist(input.competencies, prisma);
  await assertPrerequisitesValid(null, input.prerequisiteIds, prisma);

  const moduleMinutes = input.modules.reduce((sum, module) => sum + (module.durationMinutes ?? 0), 0);
  const course = await prisma.course.create({
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes ?? moduleMinutes,
      outcomes: input.outcomes,
      passingScore: input.passingScore,
      certificateEnabled: input.certificateEnabled,
      trainerId,
      competencies: { create: input.competencies },
      prerequisites: { create: input.prerequisiteIds.map((prerequisiteId) => ({ prerequisiteId })) },
      modules: {
        create: input.modules.map((module, index) => ({ title: module.title, description: module.description ?? null, durationMinutes: module.durationMinutes ?? 0, position: index })),
      },
    },
  });
  await recordAudit(ctx, { action: AuditActions.COURSE_CREATED, entityType: 'Course', entityId: course.id, metadata: { title: course.title } });
  return getCourseDetail(user, course.id);
}

export async function updateCourse(user: Actor, id: string, input: UpdateCourseInput, ctx: AuditContext) {
  const course = await loadManagedCourse(user, id);
  if (input.trainerId && user.role !== 'ADMIN') throw forbidden('ADMIN_ONLY', 'Only an administrator can reassign a course to another trainer');
  if (input.trainerId) {
    const trainer = await prisma.user.findFirst({ where: { id: input.trainerId, role: 'TRAINER', status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!trainer) throw badRequest('INVALID_TRAINER', 'The selected user is not an active trainer');
  }
  if (input.competencies) await assertCompetenciesExist(input.competencies, prisma);
  if (input.prerequisiteIds) await assertPrerequisitesValid(id, input.prerequisiteIds, prisma);

  const { competencies, prerequisiteIds, ...scalar } = input;
  await prisma.$transaction(async (tx) => {
    await tx.course.update({ where: { id }, data: scalar });
    if (competencies) {
      await tx.courseCompetency.deleteMany({ where: { courseId: id } });
      await tx.courseCompetency.createMany({ data: competencies.map((mapping) => ({ courseId: id, ...mapping })) });
    }
    if (prerequisiteIds) {
      await tx.coursePrerequisite.deleteMany({ where: { courseId: id } });
      await tx.coursePrerequisite.createMany({ data: prerequisiteIds.map((prerequisiteId) => ({ courseId: id, prerequisiteId })) });
    }
    // Keep the assessment pass mark in step with the course default while nobody has attempted it yet.
    if (input.passingScore !== undefined && input.passingScore !== course.passingScore) {
      const assessment = await tx.assessment.findUnique({ where: { courseId: id }, select: { id: true, _count: { select: { attempts: true } } } });
      if (assessment && assessment._count.attempts === 0) await tx.assessment.update({ where: { id: assessment.id }, data: { passingScore: input.passingScore } });
    }
  });
  await recordAudit(ctx, { action: AuditActions.COURSE_UPDATED, entityType: 'Course', entityId: id, metadata: { changes: Object.keys(input) } });
  return getCourseDetail(user, id);
}

export async function upsertCompetencyMapping(user: Actor, courseId: string, mapping: Mapping, ctx: AuditContext) {
  await loadManagedCourse(user, courseId);
  await assertCompetenciesExist([mapping], prisma);
  await prisma.courseCompetency.upsert({
    where: { courseId_competencyId: { courseId, competencyId: mapping.competencyId } },
    create: { courseId, ...mapping },
    update: { levelFrom: mapping.levelFrom, levelTo: mapping.levelTo },
  });
  await recordAudit(ctx, { action: AuditActions.COURSE_UPDATED, entityType: 'Course', entityId: courseId, metadata: { competencyMapped: mapping } });
  return getCourseDetail(user, courseId);
}

export async function removeCompetencyMapping(user: Actor, courseId: string, competencyId: string, ctx: AuditContext) {
  const course = await loadManagedCourse(user, courseId);
  const remaining = await prisma.courseCompetency.count({ where: { courseId, competencyId: { not: competencyId } } });
  if (course.status === 'PUBLISHED' && remaining === 0) throw conflict('LAST_COMPETENCY', 'A published course must stay mapped to at least one competency');
  const removed = await prisma.courseCompetency.deleteMany({ where: { courseId, competencyId } });
  if (removed.count === 0) throw notFound('MAPPING_NOT_FOUND', 'The course is not mapped to this competency');
  await recordAudit(ctx, { action: AuditActions.COURSE_UPDATED, entityType: 'Course', entityId: courseId, metadata: { competencyUnmapped: competencyId } });
  return getCourseDetail(user, courseId);
}

// ---------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------

/** Notifies trainees whose role requires a competency this course can still improve for them. */
async function notifyRelevantTrainees(course: { id: string; title: string }): Promise<number> {
  const mappings = await prisma.courseCompetency.findMany({ where: { courseId: course.id }, select: { competencyId: true, levelTo: true } });
  if (mappings.length === 0) return 0;
  const ceiling = new Map(mappings.map((m) => [m.competencyId, m.levelTo]));
  const requirements = await prisma.roleCompetency.findMany({ where: { competencyId: { in: [...ceiling.keys()] } }, select: { roleId: true, competencyId: true, requiredLevel: true } });
  if (requirements.length === 0) return 0;

  const trainees = await prisma.user.findMany({
    where: { role: 'TRAINEE', status: 'ACTIVE', deletedAt: null, jobRoleId: { in: [...new Set(requirements.map((r) => r.roleId))] } },
    select: { id: true, jobRoleId: true, competencies: { where: { competencyId: { in: [...ceiling.keys()] } }, select: { competencyId: true, currentLevel: true } } },
  });
  const relevant: string[] = [];
  for (const trainee of trainees) {
    const levels = new Map(trainee.competencies.map((c) => [c.competencyId, c.currentLevel]));
    const helps = requirements.some((requirement) => {
      if (requirement.roleId !== trainee.jobRoleId) return false;
      const current = levels.get(requirement.competencyId) ?? 0;
      return current < requirement.requiredLevel && current < (ceiling.get(requirement.competencyId) ?? 0);
    });
    if (helps) relevant.push(trainee.id);
  }
  return notifyUsers(relevant, {
    type: 'COURSE_RECOMMENDATION',
    title: `New course for your skill gaps: ${course.title}`,
    message: 'A newly published course can help you close one of your competency gaps.',
    link: `/trainee/courses/${course.id}`,
    dedupeKey: `course-published:${course.id}`,
  });
}

export async function changeCourseStatus(user: Actor, id: string, status: CourseStatus, ctx: AuditContext) {
  const course = await loadManagedCourse(user, id);
  if (course.status === status) return { course: await getCourseDetail(user, id), warnings: [] as string[] };

  const warnings: string[] = [];
  if (status === 'PUBLISHED') {
    const [moduleCount, mappingCount, assessment] = await Promise.all([
      prisma.module.count({ where: { courseId: id } }),
      prisma.courseCompetency.count({ where: { courseId: id } }),
      prisma.assessment.findUnique({ where: { courseId: id }, select: { isPublished: true, _count: { select: { questions: true } } } }),
    ]);
    const missing: string[] = [];
    if (moduleCount === 0) missing.push('at least one module');
    if (mappingCount === 0) missing.push('at least one competency mapping');
    if (missing.length > 0) throw unprocessable('COURSE_INCOMPLETE', `Before publishing, add ${missing.join(' and ')}.`, { missing });
    if (!assessment) warnings.push('This course has no assessment, so learners cannot earn a certificate or a competency update.');
    else if (!assessment.isPublished) warnings.push('The course assessment is not published yet, so learners cannot take it.');
    else if (assessment._count.questions === 0) warnings.push('The course assessment has no questions.');
  }

  await prisma.course.update({
    where: { id },
    data: { status, ...(status === 'PUBLISHED' && !course.publishedAt ? { publishedAt: new Date() } : {}) },
  });
  const action = status === 'PUBLISHED' ? AuditActions.COURSE_PUBLISHED : status === 'ARCHIVED' ? AuditActions.COURSE_ARCHIVED : AuditActions.COURSE_UNPUBLISHED;
  await recordAudit(ctx, { action, entityType: 'Course', entityId: id, metadata: { title: course.title, from: course.status, to: status } });
  if (status === 'PUBLISHED' && !course.publishedAt) await notifyRelevantTrainees({ id, title: course.title });
  return { course: await getCourseDetail(user, id), warnings };
}

/** Soft-deletes a course that nobody has enrolled in; otherwise it must be archived instead. */
export async function deleteCourse(user: Actor, id: string, ctx: AuditContext): Promise<void> {
  const course = await loadManagedCourse(user, id);
  const enrollments = await prisma.enrollment.count({ where: { courseId: id } });
  if (enrollments > 0) {
    throw conflict('COURSE_HAS_ENROLLMENTS', `${enrollments} learner(s) have enrolled in this course. Archive it instead of deleting it.`, { enrollments });
  }
  await prisma.course.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
  await recordAudit(ctx, { action: AuditActions.COURSE_DELETED, entityType: 'Course', entityId: id, metadata: { title: course.title } });
}

// ---------------------------------------------------------------------------------------------
// Thumbnail
// ---------------------------------------------------------------------------------------------

export async function setThumbnail(user: Actor, id: string, file: { buffer: Buffer; ext: string; mime: string }, ctx: AuditContext) {
  const course = await loadManagedCourse(user, id);
  const key = `thumbnails/${id}/${crypto.randomUUID()}${file.ext}`;
  const storage = getStorage();
  await storage.put(key, file.buffer, file.mime);
  await prisma.course.update({ where: { id }, data: { thumbnailKey: key } });
  if (course.thumbnailKey) await storage.delete(course.thumbnailKey).catch(() => undefined);
  await recordAudit(ctx, { action: AuditActions.COURSE_UPDATED, entityType: 'Course', entityId: id, metadata: { thumbnail: 'updated' } });
  const updated = await loadCourse(id);
  return { thumbnailUrl: thumbnailUrl(updated) };
}

export async function removeThumbnail(user: Actor, id: string, ctx: AuditContext) {
  const course = await loadManagedCourse(user, id);
  if (!course.thumbnailKey) return;
  await prisma.course.update({ where: { id }, data: { thumbnailKey: null } });
  await getStorage().delete(course.thumbnailKey).catch(() => undefined);
  await recordAudit(ctx, { action: AuditActions.COURSE_UPDATED, entityType: 'Course', entityId: id, metadata: { thumbnail: 'removed' } });
}
