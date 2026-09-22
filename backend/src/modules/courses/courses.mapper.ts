import type { EnrollmentStatus, Prisma } from '@prisma/client';

export const courseListInclude = {
  trainer: { select: { id: true, name: true, designation: true } },
  competencies: { include: { competency: { select: { id: true, name: true, code: true } } }, orderBy: { levelFrom: 'asc' as const } },
  assessment: { select: { id: true, isPublished: true } },
  _count: { select: { modules: true, enrollments: true } },
} satisfies Prisma.CourseInclude;

export type CourseListRow = Prisma.CourseGetPayload<{ include: typeof courseListInclude }>;

export interface CourseExtras {
  rating?: { average: number; count: number } | undefined;
  enrollment?: { id: string; status: EnrollmentStatus; progress: number } | null | undefined;
}

/** Cache-busted, API-relative URL of a course thumbnail (the web app prefixes the API origin). */
export function thumbnailUrl(course: { id: string; thumbnailKey: string | null; updatedAt: Date }): string | null {
  return course.thumbnailKey ? `/api/courses/${course.id}/thumbnail?v=${course.updatedAt.getTime()}` : null;
}

export function toCourseListItem(course: CourseListRow, extras: CourseExtras = {}) {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    difficulty: course.difficulty,
    durationMinutes: course.durationMinutes,
    passingScore: course.passingScore,
    certificateEnabled: course.certificateEnabled,
    status: course.status,
    publishedAt: course.publishedAt,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    thumbnailUrl: thumbnailUrl(course),
    trainer: course.trainer,
    moduleCount: course._count.modules,
    enrolledCount: course._count.enrollments,
    hasAssessment: Boolean(course.assessment?.isPublished),
    competencies: course.competencies.map((mapping) => ({
      id: mapping.competency.id,
      name: mapping.competency.name,
      code: mapping.competency.code,
      levelFrom: mapping.levelFrom,
      levelTo: mapping.levelTo,
    })),
    rating: extras.rating ?? { average: 0, count: 0 },
    myEnrollment: extras.enrollment ?? null,
  };
}

export type CourseListItem = ReturnType<typeof toCourseListItem>;
