import type { Difficulty, EnrollmentStatus } from '@prisma/client';
import { rankGaps, type PriorityLevel, type SkillGap } from './skill-gap';

/**
 * Rule-based course recommendation and learning-path construction.
 *
 * Pure functions: given a learner's skill gaps, the published course catalogue
 * (each course mapped to competencies and competency levels) and the learner's
 * enrollments, they produce ranked recommendations with the reasons WHY, plus an
 * ordered Beginner → Intermediate → Advanced path per competency gap.
 * There is no model or randomness: the same inputs always give the same output.
 */

export type LearningStatus = 'NOT_STARTED' | 'STARTED' | 'IN_PROGRESS' | 'ASSESSMENT_PENDING' | 'COMPLETED' | 'CERTIFIED';

export interface CatalogCourse {
  id: string;
  title: string;
  difficulty: Difficulty;
  category: string;
  durationMinutes: number;
  /** Average learner rating (1-5) if any feedback exists. */
  rating: number | null;
  mappings: { competencyId: string; levelFrom: number; levelTo: number }[];
  prerequisiteIds: string[];
}

export interface LearnerCourseState {
  status: EnrollmentStatus;
  progress: number;
}

export interface RecommendationInput {
  gaps: SkillGap[];
  catalog: CatalogCourse[];
  /** Enrollment state per course id. */
  states: Map<string, LearnerCourseState>;
  /** Learner is "ready" for a course when its entry level is at most this far above their current level. */
  readinessSlack?: number;
  limit?: number;
}

export interface AddressedGap {
  competencyId: string;
  competencyName: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  priorityLevel: PriorityLevel;
  /** Points of the gap this course can close (overlap of the course band and the gap band). */
  coverage: number;
  courseLevelFrom: number;
  courseLevelTo: number;
}

export interface Recommendation {
  courseId: string;
  title: string;
  difficulty: Difficulty;
  category: string;
  durationMinutes: number;
  rating: number | null;
  rank: number;
  score: number;
  status: LearningStatus;
  progress: number;
  /** Prerequisites satisfied (or none). */
  ready: boolean;
  /** Prerequisite course ids that still have to be completed. */
  blockedBy: string[];
  addresses: AddressedGap[];
  /** Plain-language explanation of why the course was recommended. */
  reasons: string[];
}

export interface PathStep {
  order: number;
  stage: Difficulty;
  courseId: string;
  title: string;
  levelFrom: number | null;
  levelTo: number | null;
  /** Points of this competency's gap the step closes. */
  coverage: number;
  status: LearningStatus;
  progress: number;
  locked: boolean;
  blockedBy: string[];
  /** The course is not mapped to this competency; it is here because a later step requires it. */
  addedAsPrerequisite: boolean;
}

export interface LearningPath {
  competencyId: string;
  competencyName: string;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  priorityLevel: PriorityLevel;
  priorityScore: number;
  steps: PathStep[];
  completedSteps: number;
  /** First step that is neither finished nor locked - "what to do next". */
  nextStepCourseId: string | null;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  learningPaths: LearningPath[];
}

const STAGE_ORDER: Record<Difficulty, number> = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 };
const PRIORITY_WEIGHT: Record<PriorityLevel, number> = { LOW: 0.5, MEDIUM: 1, HIGH: 1.5, CRITICAL: 2 };
const DONE: LearningStatus[] = ['COMPLETED', 'CERTIFIED'];

export function learningStatus(state: LearnerCourseState | undefined): LearningStatus {
  switch (state?.status) {
    case 'ENROLLED':
      return 'STARTED';
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'ASSESSMENT_PENDING':
      return 'ASSESSMENT_PENDING';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CERTIFIED':
      return 'CERTIFIED';
    default:
      return 'NOT_STARTED'; // never enrolled, or WITHDRAWN
  }
}

const isDone = (status: LearningStatus) => DONE.includes(status);
const stageLabel = (difficulty: Difficulty) => difficulty.charAt(0) + difficulty.slice(1).toLowerCase();

/** Overlap between what a course teaches (its level band) and what the learner still needs. */
function coverageOf(course: CatalogCourse, gap: SkillGap): { coverage: number; from: number; to: number } | null {
  const mapping = course.mappings.find((m) => m.competencyId === gap.competencyId);
  if (!mapping) return null;
  const coverage = Math.max(0, Math.min(mapping.levelTo, gap.requiredLevel) - Math.max(mapping.levelFrom, gap.currentLevel));
  return { coverage, from: mapping.levelFrom, to: mapping.levelTo };
}

function unmetPrerequisites(course: CatalogCourse, states: Map<string, LearnerCourseState>): string[] {
  return course.prerequisiteIds.filter((id) => !isDone(learningStatus(states.get(id))));
}

export function buildRecommendations(input: RecommendationInput): RecommendationResult {
  const { catalog, states } = input;
  const readinessSlack = input.readinessSlack ?? 20;
  const byId = new Map(catalog.map((course) => [course.id, course]));
  const gaps = rankGaps(input.gaps.filter((gap) => !gap.met));

  // ---- 1. Score every course that can still close part of a gap -------------------------
  const scored = new Map<string, { course: CatalogCourse; score: number; addresses: AddressedGap[] }>();
  for (const gap of gaps) {
    for (const course of catalog) {
      if (isDone(learningStatus(states.get(course.id)))) continue; // already completed / certified
      const overlap = coverageOf(course, gap);
      if (!overlap || overlap.coverage <= 0) continue;

      // Share of the gap the course closes, weighted by how urgent that gap is.
      const contribution = gap.priorityScore * (overlap.coverage / gap.gap) + PRIORITY_WEIGHT[gap.priorityLevel];
      const entry = scored.get(course.id) ?? { course, score: 0, addresses: [] };
      entry.score += contribution;
      entry.addresses.push({
        competencyId: gap.competencyId,
        competencyName: gap.competencyName,
        currentLevel: gap.currentLevel,
        requiredLevel: gap.requiredLevel,
        gap: gap.gap,
        priorityLevel: gap.priorityLevel,
        coverage: overlap.coverage,
        courseLevelFrom: overlap.from,
        courseLevelTo: overlap.to,
      });
      scored.set(course.id, entry);
    }
  }

  // ---- 2. Learning paths ---------------------------------------------------------------------
  const learningPaths = gaps.map((gap) => buildPath(gap, catalog, byId, states));
  const pathPosition = new Map<string, { competencyName: string; step: number; total: number }[]>();
  for (const path of learningPaths) {
    for (const step of path.steps) {
      const list = pathPosition.get(step.courseId) ?? [];
      list.push({ competencyName: path.competencyName, step: step.order, total: path.steps.length });
      pathPosition.set(step.courseId, list);
    }
  }

  // ---- 3. Adjust for readiness, rank, and explain -------------------------------------------------
  const recommendations: Recommendation[] = [...scored.values()].map(({ course, score, addresses }) => {
    const state = states.get(course.id);
    const status = learningStatus(state);
    const blockedBy = unmetPrerequisites(course, states);
    const ready = blockedBy.length === 0;
    const lowestEntry = Math.min(...addresses.map((a) => Math.max(0, a.courseLevelFrom - a.currentLevel)));
    const levelReady = lowestEntry <= readinessSlack;

    let adjusted = score;
    if (!ready) adjusted *= 0.5; // cannot be started yet
    if (!levelReady) adjusted *= 0.7; // a later step for this learner
    if (status === 'IN_PROGRESS' || status === 'ASSESSMENT_PENDING') adjusted *= 1.15; // finish what was started

    const reasons = explain(course, addresses, blockedBy, byId, status, state?.progress ?? 0, pathPosition.get(course.id) ?? [], levelReady);
    return {
      courseId: course.id,
      title: course.title,
      difficulty: course.difficulty,
      category: course.category,
      durationMinutes: course.durationMinutes,
      rating: course.rating,
      rank: 0,
      score: Math.round(adjusted * 10) / 10,
      status,
      progress: state?.progress ?? 0,
      ready,
      blockedBy,
      addresses: addresses.sort((a, b) => b.coverage - a.coverage),
      reasons,
    };
  });

  recommendations.sort(
    (a, b) =>
      b.score - a.score ||
      STAGE_ORDER[a.difficulty] - STAGE_ORDER[b.difficulty] ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      a.title.localeCompare(b.title),
  );
  recommendations.forEach((recommendation, index) => {
    recommendation.rank = index + 1;
  });

  return { recommendations: input.limit ? recommendations.slice(0, input.limit) : recommendations, learningPaths };
}

function explain(
  course: CatalogCourse,
  addresses: AddressedGap[],
  blockedBy: string[],
  byId: Map<string, CatalogCourse>,
  status: LearningStatus,
  progress: number,
  positions: { competencyName: string; step: number; total: number }[],
  levelReady: boolean,
): string[] {
  const reasons: string[] = [];
  for (const address of [...addresses].sort((a, b) => b.coverage - a.coverage)) {
    reasons.push(
      `Addresses your ${address.competencyName} gap: you are at ${address.currentLevel}% and your role requires ${address.requiredLevel}% ` +
        `(${address.gap} points, ${address.priorityLevel.toLowerCase()} priority). This course covers ${address.courseLevelFrom}-${address.courseLevelTo}% ` +
        `and can close up to ${address.coverage} of those points.`,
    );
  }
  const first = positions[0];
  if (first) reasons.push(`Step ${first.step} of ${first.total} in your ${first.competencyName} learning path (${stageLabel(course.difficulty)} stage).`);
  if (blockedBy.length > 0) {
    const names = blockedBy.map((id) => byId.get(id)?.title ?? 'a prerequisite course');
    reasons.push(`Complete ${names.join(' and ')} first - it is a prerequisite.`);
  } else if (!levelReady) {
    reasons.push('This is a later step for you: it builds on courses that come earlier in the path.');
  }
  if (status === 'IN_PROGRESS' || status === 'STARTED') reasons.push(`You are already enrolled (${progress}% complete) - continue where you left off.`);
  if (status === 'ASSESSMENT_PENDING') reasons.push('All modules are complete - take the assessment to earn your competency update and certificate.');
  return reasons;
}

/**
 * Ordered curriculum for one competency: every course mapped to it that either is
 * already done or can still raise the learner towards the required level, sorted
 * Beginner → Intermediate → Advanced, with prerequisites placed before the courses that need them.
 */
function buildPath(gap: SkillGap, catalog: CatalogCourse[], byId: Map<string, CatalogCourse>, states: Map<string, LearnerCourseState>): LearningPath {
  const relevant = catalog
    .filter((course) => {
      const mapping = course.mappings.find((m) => m.competencyId === gap.competencyId);
      if (!mapping) return false;
      if (isDone(learningStatus(states.get(course.id)))) return mapping.levelFrom < gap.requiredLevel;
      return mapping.levelTo > gap.currentLevel && mapping.levelFrom < gap.requiredLevel;
    })
    .sort((a, b) => {
      const ma = a.mappings.find((m) => m.competencyId === gap.competencyId)!;
      const mb = b.mappings.find((m) => m.competencyId === gap.competencyId)!;
      return (
        STAGE_ORDER[a.difficulty] - STAGE_ORDER[b.difficulty] ||
        ma.levelFrom - mb.levelFrom ||
        ma.levelTo - mb.levelTo ||
        a.title.localeCompare(b.title)
      );
    });

  const ordered: { course: CatalogCourse; viaPrerequisite: boolean }[] = [];
  const seen = new Set<string>();
  const visit = (course: CatalogCourse, viaPrerequisite: boolean, trail: Set<string>) => {
    if (seen.has(course.id) || trail.has(course.id)) return; // `trail` guards against accidental prerequisite cycles
    trail.add(course.id);
    for (const prerequisiteId of course.prerequisiteIds) {
      const prerequisite = byId.get(prerequisiteId);
      if (prerequisite) visit(prerequisite, true, trail);
    }
    trail.delete(course.id);
    if (!seen.has(course.id)) {
      seen.add(course.id);
      ordered.push({ course, viaPrerequisite });
    }
  };
  for (const course of relevant) visit(course, false, new Set());

  const relevantIds = new Set(relevant.map((course) => course.id));
  const steps: PathStep[] = ordered.map(({ course }, index) => {
    const state = states.get(course.id);
    const mapping = course.mappings.find((m) => m.competencyId === gap.competencyId);
    const blockedBy = unmetPrerequisites(course, states);
    const coverage = mapping ? Math.max(0, Math.min(mapping.levelTo, gap.requiredLevel) - Math.max(mapping.levelFrom, gap.currentLevel)) : 0;
    return {
      order: index + 1,
      stage: course.difficulty,
      courseId: course.id,
      title: course.title,
      levelFrom: mapping?.levelFrom ?? null,
      levelTo: mapping?.levelTo ?? null,
      coverage: isDone(learningStatus(state)) ? 0 : coverage,
      status: learningStatus(state),
      progress: state?.progress ?? 0,
      locked: blockedBy.length > 0,
      blockedBy,
      addedAsPrerequisite: !relevantIds.has(course.id),
    };
  });

  const next = steps.find((step) => !isDone(step.status) && !step.locked);
  return {
    competencyId: gap.competencyId,
    competencyName: gap.competencyName,
    currentLevel: gap.currentLevel,
    requiredLevel: gap.requiredLevel,
    gap: gap.gap,
    priorityLevel: gap.priorityLevel,
    priorityScore: gap.priorityScore,
    steps,
    completedSteps: steps.filter((step) => isDone(step.status)).length,
    nextStepCourseId: next?.courseId ?? null,
  };
}
