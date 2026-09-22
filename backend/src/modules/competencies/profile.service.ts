import { notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { TODAY, loadDecayPolicies, policyFor, type AsOf } from './decay.service';
import { levelBand, type LevelBand } from './engine/bands';
import type { EngineConfig } from './engine/config';
import { analyzeFreshness, summarizeFreshness, type Freshness, type FreshnessSummary } from './engine/decay';
import { analyzeSkillGap, rankGaps, summarizeGaps, type GapSummary, type SkillGap } from './engine/skill-gap';
import { getEngineConfig } from './engine-config.service';

export interface CompetencyRecord extends SkillGap {
  description: string;
  lastEvidenceAt: Date | null;
  /** False when the employee has never been assessed on this competency (level defaults to 0). */
  assessed: boolean;
  band: LevelBand;
  /**
   * Freshness at the analysed date. `currentLevel` above is the *effective* level
   * (after decay); `freshness.baselineLevel` is the verified level it decayed from.
   */
  freshness: Freshness;
}

export interface AdditionalCompetency {
  competencyId: string;
  competencyCode: string;
  competencyName: string;
  category: string;
  currentLevel: number;
  lastEvidenceAt: Date | null;
  band: LevelBand;
}

export interface EmployeeAnalysis {
  userId: string;
  userName: string;
  jobRole: { id: string; name: string; code: string; criticality: number } | null;
  /** One record per competency required by the employee's role. */
  records: CompetencyRecord[];
  /** Records ranked by training priority. */
  ranked: CompetencyRecord[];
  /** Competencies the employee has a level for that their role does not require. */
  additional: AdditionalCompetency[];
  summary: GapSummary & {
    averageCurrent: number;
    averageRequired: number;
    /** Share of the role's requirements already met, 0-100: Σ min(current, required) / Σ required. */
    readiness: number;
    freshness: FreshnessSummary;
  };
  /** The date this analysis describes, and whether it is a simulation. */
  asOf: AsOf;
  config: EngineConfig;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Skill-gap analysis for one employee:
 * profile → job role → required competencies → current competency → gap → priority.
 */
export async function loadEmployeeAnalysis(userId: string, options: { config?: EngineConfig; db?: Db; asOf?: AsOf } = {}): Promise<EmployeeAnalysis> {
  const db = options.db ?? prisma;
  const config = options.config ?? (await getEngineConfig(db));
  const asOf = options.asOf ?? TODAY();

  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      jobRole: {
        select: {
          id: true,
          name: true,
          code: true,
          criticality: true,
          competencies: { where: { competency: { isActive: true } }, include: { competency: true } },
        },
      },
      competencies: { include: { competency: true } },
    },
  });
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');

  const levels = new Map(user.competencies.map((entry) => [entry.competencyId, entry]));
  const required = user.jobRole?.competencies ?? [];
  const criticality = user.jobRole?.criticality ?? 3;

  // One policy lookup for the whole analysis; competencies without a policy do not decay.
  const policies = await loadDecayPolicies(
    config,
    required.map((requirement) => requirement.competencyId),
    db,
  );

  const records: CompetencyRecord[] = required.map((requirement) => {
    const employee = levels.get(requirement.competencyId);
    // The gap is measured against the *effective* level: a competency that has
    // decayed below the requirement is a real gap, not a historical achievement.
    const freshness = analyzeFreshness(
      {
        baselineLevel: employee?.currentLevel ?? 0,
        requiredLevel: requirement.requiredLevel,
        lastPracticedAt: employee?.lastPracticedAt ?? null,
        lastAssessedAt: employee?.lastEvidenceAt ?? null,
        policy: policyFor(policies, requirement.competencyId, config),
      },
      asOf.date,
      config,
    );
    const currentLevel = freshness.effectiveLevel;
    const gap = analyzeSkillGap(
      {
        competencyId: requirement.competencyId,
        competencyCode: requirement.competency.code,
        competencyName: requirement.competency.name,
        category: requirement.competency.category,
        requiredLevel: requirement.requiredLevel,
        currentLevel,
        importance: requirement.importance,
        roleCriticality: criticality,
      },
      config,
    );
    return {
      ...gap,
      description: requirement.competency.description,
      lastEvidenceAt: employee?.lastEvidenceAt ?? null,
      assessed: Boolean(employee),
      band: levelBand(currentLevel),
      freshness,
    };
  });

  const requiredIds = new Set(required.map((requirement) => requirement.competencyId));
  const additional: AdditionalCompetency[] = user.competencies
    .filter((entry) => !requiredIds.has(entry.competencyId) && entry.competency.isActive)
    .map((entry) => ({
      competencyId: entry.competencyId,
      competencyCode: entry.competency.code,
      competencyName: entry.competency.name,
      category: entry.competency.category,
      currentLevel: entry.currentLevel,
      lastEvidenceAt: entry.lastEvidenceAt,
      band: levelBand(entry.currentLevel),
    }))
    .sort((a, b) => b.currentLevel - a.currentLevel);

  const totalRequired = records.reduce((sum, record) => sum + record.requiredLevel, 0);
  const totalMet = records.reduce((sum, record) => sum + Math.min(record.currentLevel, record.requiredLevel), 0);
  const count = records.length;

  return {
    userId: user.id,
    userName: user.name,
    jobRole: user.jobRole ? { id: user.jobRole.id, name: user.jobRole.name, code: user.jobRole.code, criticality: user.jobRole.criticality } : null,
    records: records.sort((a, b) => a.competencyName.localeCompare(b.competencyName)),
    ranked: rankGaps(records),
    additional,
    summary: {
      ...summarizeGaps(records),
      averageCurrent: count === 0 ? 0 : round1(records.reduce((sum, record) => sum + record.currentLevel, 0) / count),
      averageRequired: count === 0 ? 0 : round1(totalRequired / count),
      readiness: totalRequired === 0 ? 0 : round1((totalMet / totalRequired) * 100),
      freshness: summarizeFreshness(records.map((record) => record.freshness)),
    },
    asOf,
    config,
  };
}
