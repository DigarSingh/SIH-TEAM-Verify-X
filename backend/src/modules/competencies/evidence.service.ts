import type { CompetencySource, Prisma } from '@prisma/client';
import type { Db } from '../../lib/prisma';
import type { EngineConfig } from './engine/config';
import { computeCompetencyUpdate, type CompetencyUpdateResult } from './engine/update';

export type EvidenceKind = 'ASSESSMENT' | 'TRAINER_EVALUATION' | 'PRACTICAL';

export interface EvidenceEvent {
  kind: EvidenceKind;
  userId: string;
  /** The course the evidence relates to (limits the update by the course's target level). */
  courseId?: string | null;
  /** Explicit competencies (for evaluations recorded against a competency rather than a course). */
  competencyIds?: string[];
  attemptId?: string | null;
  evaluationId?: string | null;
  /** Percentage of the triggering assessment attempt. */
  assessmentScore?: number | null;
}

export interface CompetencyImpact {
  competencyId: string;
  competencyName: string;
  previousLevel: number;
  newLevel: number;
  changed: boolean;
  requiredLevel: number | null;
  gapBefore: number | null;
  gapAfter: number | null;
  requirementMet: boolean;
  limitedBy: CompetencyUpdateResult['limitedBy'];
  explanation: string;
}

const SOURCE_BY_KIND: Record<EvidenceKind, CompetencySource> = {
  ASSESSMENT: 'ASSESSMENT',
  TRAINER_EVALUATION: 'TRAINER_EVALUATION',
  PRACTICAL: 'PRACTICAL',
};

/**
 * Applies new evidence (an assessment result, a trainer evaluation or a practical
 * assessment) to the employee's competencies.
 *
 * For every affected competency the engine gathers ALL currently valid evidence
 * (latest passed assessment, latest trainer evaluation, latest practical
 * assessment inside the evidence window), blends it with the previous level and
 * writes both the new level and an auditable history row. Must be called with a
 * transaction client so the level, the history and the triggering result commit together.
 */
export async function applyCompetencyEvidence(db: Db, event: EvidenceEvent, config: EngineConfig, now: Date = new Date()): Promise<CompetencyImpact[]> {
  const targets = await resolveTargets(db, event);
  if (targets.length === 0) return [];

  const windowStart = new Date(now.getTime() - config.update.evidenceWindowDays * 24 * 60 * 60 * 1000);
  const user = await db.user.findUniqueOrThrow({ where: { id: event.userId }, select: { jobRoleId: true } });
  const requirements = user.jobRoleId
    ? await db.roleCompetency.findMany({ where: { roleId: user.jobRoleId, competencyId: { in: targets.map((t) => t.competencyId) } } })
    : [];
  const requiredByCompetency = new Map(requirements.map((r) => [r.competencyId, r.requiredLevel]));
  const existing = await db.employeeCompetency.findMany({ where: { userId: event.userId, competencyId: { in: targets.map((t) => t.competencyId) } } });
  const levelByCompetency = new Map(existing.map((e) => [e.competencyId, e]));

  const impacts: CompetencyImpact[] = [];
  for (const target of targets) {
    const previousLevel = levelByCompetency.get(target.competencyId)?.currentLevel ?? 0;

    const assessmentScore =
      event.kind === 'ASSESSMENT' && event.assessmentScore != null
        ? event.assessmentScore
        : await latestAssessmentScore(db, event.userId, target.competencyId, windowStart);
    const evaluation = await latestEvaluationScore(db, event.userId, target.competencyId, 'EVALUATION', windowStart);
    const practical = await latestPracticalScore(db, event.userId, target.competencyId, windowStart);

    const result = computeCompetencyUpdate(
      {
        previousLevel,
        assessmentScore,
        trainerEvaluationScore: evaluation,
        practicalScore: practical,
        ceiling: target.ceiling,
      },
      config,
    );

    if (result.changed) {
      await db.employeeCompetency.upsert({
        where: { userId_competencyId: { userId: event.userId, competencyId: target.competencyId } },
        create: { userId: event.userId, competencyId: target.competencyId, currentLevel: result.newLevel, lastEvidenceAt: now },
        update: { currentLevel: result.newLevel, lastEvidenceAt: now },
      });
      await db.competencyHistory.create({
        data: {
          userId: event.userId,
          competencyId: target.competencyId,
          previousLevel: result.previousLevel,
          newLevel: result.newLevel,
          source: SOURCE_BY_KIND[event.kind],
          courseId: event.courseId ?? null,
          attemptId: event.attemptId ?? null,
          evaluationId: event.evaluationId ?? null,
          details: {
            evidence: result.evidence,
            blended: result.blended,
            limitedBy: result.limitedBy,
            components: result.components.map((c) => ({ source: c.source, score: c.score, share: Math.round(c.share * 1000) / 1000 })),
            explanation: result.explanation,
          } as Prisma.InputJsonValue,
          createdAt: now,
        },
      });
    } else if (levelByCompetency.has(target.competencyId)) {
      await db.employeeCompetency.update({
        where: { userId_competencyId: { userId: event.userId, competencyId: target.competencyId } },
        data: { lastEvidenceAt: now },
      });
    }

    const required = requiredByCompetency.get(target.competencyId) ?? null;
    impacts.push({
      competencyId: target.competencyId,
      competencyName: target.name,
      previousLevel: result.previousLevel,
      newLevel: result.newLevel,
      changed: result.changed,
      requiredLevel: required,
      gapBefore: required === null ? null : Math.max(0, required - result.previousLevel),
      gapAfter: required === null ? null : Math.max(0, required - result.newLevel),
      requirementMet: required !== null && result.newLevel >= required,
      limitedBy: result.limitedBy,
      explanation: result.explanation,
    });
  }
  return impacts;
}

interface Target {
  competencyId: string;
  name: string;
  ceiling: number | null;
}

/**
 * Which competencies does this evidence speak to?
 *
 * A course on its own evidences everything it is mapped to. Naming
 * competencies as well **narrows** it to those: a practical on the radar, or a
 * trainer evaluation recorded against one competency, is not evidence of
 * everything else the course happens to teach. The course is still used, for
 * the ceiling it puts on how far its evidence can certify.
 */
async function resolveTargets(db: Db, event: EvidenceEvent): Promise<Target[]> {
  const named = new Set(event.competencyIds ?? []);
  const targets = new Map<string, Target>();

  if (event.courseId) {
    const mappings = await db.courseCompetency.findMany({
      where: { courseId: event.courseId, competency: { isActive: true }, ...(named.size > 0 ? { competencyId: { in: [...named] } } : {}) },
      include: { competency: { select: { name: true } } },
    });
    for (const mapping of mappings) targets.set(mapping.competencyId, { competencyId: mapping.competencyId, name: mapping.competency.name, ceiling: mapping.levelTo });
  }

  // Named competencies the course does not cover still count, without a ceiling.
  const explicit = [...named].filter((id) => !targets.has(id));
  if (explicit.length > 0) {
    const competencies = await db.competency.findMany({ where: { id: { in: explicit }, isActive: true }, select: { id: true, name: true } });
    for (const competency of competencies) targets.set(competency.id, { competencyId: competency.id, name: competency.name, ceiling: null });
  }
  return [...targets.values()];
}

/** Percentage of the most recent PASSED attempt on any course mapped to the competency. */
async function latestAssessmentScore(db: Db, userId: string, competencyId: string, since: Date): Promise<number | null> {
  const attempt = await db.assessmentAttempt.findFirst({
    where: {
      userId,
      passed: true,
      submittedAt: { gte: since },
      assessment: { course: { competencies: { some: { competencyId } } } },
    },
    orderBy: { submittedAt: 'desc' },
    select: { percentage: true },
  });
  return attempt?.percentage ?? null;
}

/**
 * The most recent practical evidence, from either source.
 *
 * Practical ability can be evidenced two ways: a trainer watching someone work,
 * or an AR lab marking them against the instrument. They are the same kind of
 * claim, so the engine takes whichever is more recent rather than preferring
 * one or averaging them.
 */
async function latestPracticalScore(db: Db, userId: string, competencyId: string, since: Date): Promise<number | null> {
  const [evaluation, arAttempt] = await Promise.all([
    db.trainerEvaluation.findFirst({
      where: { traineeId: userId, type: 'PRACTICAL', createdAt: { gte: since }, OR: [{ competencyId }, { course: { competencies: { some: { competencyId } } } }] },
      orderBy: { createdAt: 'desc' },
      select: { weightedScore: true, createdAt: true },
    }),
    db.aRPracticalAttempt.findFirst({
      where: { userId, status: 'COMPLETED', completedAt: { gte: since }, module: { competencyId } },
      orderBy: { completedAt: 'desc' },
      select: { practicalPercentage: true, completedAt: true },
    }),
  ]);

  if (!evaluation && !arAttempt) return null;
  if (!arAttempt) return evaluation?.weightedScore ?? null;
  if (!evaluation) return arAttempt.practicalPercentage;
  return (arAttempt.completedAt as Date) > evaluation.createdAt ? arAttempt.practicalPercentage : evaluation.weightedScore;
}

/** Most recent trainer evaluation of a given type recorded against the competency or a course mapped to it. */
async function latestEvaluationScore(db: Db, userId: string, competencyId: string, type: 'EVALUATION' | 'PRACTICAL', since: Date): Promise<number | null> {
  const evaluation = await db.trainerEvaluation.findFirst({
    where: {
      traineeId: userId,
      type,
      createdAt: { gte: since },
      OR: [{ competencyId }, { course: { competencies: { some: { competencyId } } } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { weightedScore: true },
  });
  return evaluation?.weightedScore ?? null;
}
