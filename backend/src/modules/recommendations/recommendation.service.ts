import { prisma, type Db } from '../../lib/prisma';
import {
  buildRecommendations,
  type CatalogCourse,
  type LearnerCourseState,
  type LearningPath,
  type Recommendation,
} from '../competencies/engine/recommendation';
import type { AsOf } from '../competencies/decay.service';
import type { EngineConfig } from '../competencies/engine/config';
import { loadEmployeeAnalysis, type EmployeeAnalysis } from '../competencies/profile.service';

/** Published courses with their competency mappings, prerequisites and average rating. */
export async function loadCatalog(db: Db = prisma): Promise<CatalogCourse[]> {
  const [courses, ratings] = await Promise.all([
    db.course.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      select: {
        id: true,
        title: true,
        difficulty: true,
        category: true,
        durationMinutes: true,
        competencies: { select: { competencyId: true, levelFrom: true, levelTo: true } },
        prerequisites: { select: { prerequisiteId: true } },
      },
    }),
    db.feedback.groupBy({ by: ['courseId'], _avg: { rating: true } }),
  ]);
  const ratingByCourse = new Map(ratings.map((row) => [row.courseId, row._avg.rating]));
  const publishedIds = new Set(courses.map((course) => course.id));

  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    difficulty: course.difficulty,
    category: course.category,
    durationMinutes: course.durationMinutes,
    rating: ratingByCourse.get(course.id) ? Math.round((ratingByCourse.get(course.id) as number) * 10) / 10 : null,
    mappings: course.competencies,
    // A prerequisite that is archived/deleted can never be completed, so it must not block anyone.
    prerequisiteIds: course.prerequisites.map((p) => p.prerequisiteId).filter((id) => publishedIds.has(id)),
  }));
}

export async function loadLearnerStates(userId: string, db: Db = prisma): Promise<Map<string, LearnerCourseState>> {
  const enrollments = await db.enrollment.findMany({ where: { userId }, select: { courseId: true, status: true, progress: true } });
  return new Map(enrollments.map((enrollment) => [enrollment.courseId, { status: enrollment.status, progress: enrollment.progress }]));
}

/** A prerequisite course that still has to be completed, named so clients can display it. */
export interface BlockingCourse {
  id: string;
  title: string;
}

type Named<T extends { blockedBy: string[] }> = Omit<T, 'blockedBy'> & { blockedBy: BlockingCourse[] };

export interface RecommendationReport {
  analysis: EmployeeAnalysis;
  recommendations: Named<Recommendation>[];
  learningPaths: (Omit<LearningPath, 'steps'> & { steps: Named<LearningPath['steps'][number]>[] })[];
}

/** Skill gaps → priority → recommended courses → ordered learning paths, for one employee. */
export async function getRecommendationsForUser(
  userId: string,
  options: { limit?: number; config?: EngineConfig; analysis?: EmployeeAnalysis; db?: Db; asOf?: AsOf } = {},
): Promise<RecommendationReport> {
  const db = options.db ?? prisma;
  const analysis =
    options.analysis ??
    (await loadEmployeeAnalysis(userId, {
      ...(options.config ? { config: options.config } : {}),
      ...(options.asOf ? { asOf: options.asOf } : {}),
      db,
    }));
  const [catalog, states] = await Promise.all([loadCatalog(db), loadLearnerStates(userId, db)]);
  const result = buildRecommendations({
    gaps: analysis.records,
    catalog,
    states,
    ...(options.limit ? { limit: options.limit } : {}),
  });

  // The engine reasons with ids; the API names the blocking courses. Unmet prerequisites are always
  // published catalog courses (see loadCatalog), so every id resolves.
  const titleById = new Map(catalog.map((course) => [course.id, course.title]));
  const named = (ids: string[]): BlockingCourse[] => ids.map((id) => ({ id, title: titleById.get(id) ?? 'A prerequisite course' }));

  return {
    analysis,
    recommendations: result.recommendations.map((recommendation) => ({ ...recommendation, blockedBy: named(recommendation.blockedBy) })),
    learningPaths: result.learningPaths.map((path) => ({ ...path, steps: path.steps.map((step) => ({ ...step, blockedBy: named(step.blockedBy) })) })),
  };
}
