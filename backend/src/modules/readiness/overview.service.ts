import { prisma, type Db } from '../../lib/prisma';
import { loadDecayPolicies, policyFor, TODAY, type AsOf } from '../competencies/decay.service';
import type { EngineConfig } from '../competencies/engine/config';
import { analyzeFreshness, summarizeFreshness, type Freshness, type FreshnessStatus } from '../competencies/engine/decay';
import { analyzeSkillGap } from '../competencies/engine/skill-gap';
import type { KnowledgeRisk } from '../competencies/engine/succession';
import { getEngineConfig } from '../competencies/engine-config.service';
import { loadSuccessionReport } from '../competencies/succession.service';
import { calculateReadinessIndex, type ReadinessIndex } from './readiness-index';
import { loadReadinessCalendar } from './readiness.service';

/**
 * Everything the Operational Readiness dashboard shows, in one pass.
 *
 * The dashboard is an aggregation, not a new source of truth: each figure comes
 * from the same engine functions that produce the individual screens, so the
 * headline number can always be traced back to a person and a competency.
 */

export interface DepartmentReadiness {
  departmentId: string;
  departmentName: string;
  people: number;
  coverage: number;
  byStatus: Record<FreshnessStatus, number>;
  needingRefresher: number;
}

export interface CompetencyReadiness {
  competencyId: string;
  competencyName: string;
  category: string;
  /** Average effective level across everyone who holds it. */
  averageLevel: number;
  /** Average points lost to decay. */
  averageDecay: number;
  byStatus: Record<FreshnessStatus, number>;
  peopleShort: number;
  criticality: number;
  knowledgeRisk: KnowledgeRisk | null;
}

export interface RecertificationDue {
  userId: string;
  userName: string;
  competencyId: string;
  competencyName: string;
  dueAt: Date;
  daysUntil: number;
  overdue: boolean;
}

export interface ReadinessOverview {
  index: ReadinessIndex;
  headline: {
    overallReadiness: number;
    competenciesAtRisk: number;
    criticalSkillGaps: number;
    knowledgeLossRisks: number;
    upcomingEvents: number;
    peopleNeedingRefresher: number;
  };
  freshness: ReturnType<typeof summarizeFreshness>;
  byDepartment: DepartmentReadiness[];
  byCompetency: CompetencyReadiness[];
  /** Soonest first; overdue entries lead. */
  recertifications: RecertificationDue[];
  succession: Awaited<ReturnType<typeof loadSuccessionReport>>['summary'] & {
    top: { competencyId: string; competencyName: string; risk: KnowledgeRisk; remainingExperts: number; reason: string }[];
  };
  events: Awaited<ReturnType<typeof loadReadinessCalendar>>['events'];
  asOf: AsOf;
  /** Always true: the index is a demonstration metric, never an official one. */
  isDemonstrationMetric: true;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const emptyStatus = (): Record<FreshnessStatus, number> => ({ CURRENT: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0, EXPIRED: 0 });

export async function loadReadinessOverview(options: { config?: EngineConfig; db?: Db; asOf?: AsOf } = {}): Promise<ReadinessOverview> {
  const db = options.db ?? prisma;
  const config = options.config ?? (await getEngineConfig(db));
  const asOf = options.asOf ?? TODAY();

  const people = await db.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE', role: { in: ['TRAINEE', 'TRAINER'] } },
    select: {
      id: true,
      name: true,
      department: { select: { id: true, name: true } },
      jobRole: { select: { criticality: true, competencies: { where: { competency: { isActive: true } }, include: { competency: true } } } },
      competencies: { select: { competencyId: true, currentLevel: true, lastEvidenceAt: true, lastPracticedAt: true } },
    },
  });

  const policies = await loadDecayPolicies(config, undefined, db);

  const departments = new Map<string, { name: string; people: number; required: number; met: number; byStatus: Record<FreshnessStatus, number>; refreshers: number }>();
  const competencies = new Map<string, { name: string; category: string; levels: number[]; decay: number[]; byStatus: Record<FreshnessStatus, number>; short: number; criticality: number }>();
  const allFreshness: Freshness[] = [];
  const recertifications: RecertificationDue[] = [];

  let totalRequired = 0;
  let totalMet = 0;
  let criticalGaps = 0;
  let totalRequirements = 0;

  for (const person of people) {
    const held = new Map(person.competencies.map((entry) => [entry.competencyId, entry]));
    const requirements = person.jobRole?.competencies ?? [];
    const departmentKey = person.department?.id ?? 'unassigned';
    const department = departments.get(departmentKey) ?? { name: person.department?.name ?? 'No department', people: 0, required: 0, met: 0, byStatus: emptyStatus(), refreshers: 0 };
    department.people += 1;

    for (const requirement of requirements) {
      const entry = held.get(requirement.competencyId);
      const policy = policyFor(policies, requirement.competencyId, config);
      const freshness = analyzeFreshness(
        {
          baselineLevel: entry?.currentLevel ?? 0,
          requiredLevel: requirement.requiredLevel,
          lastPracticedAt: entry?.lastPracticedAt ?? null,
          lastAssessedAt: entry?.lastEvidenceAt ?? null,
          policy,
        },
        asOf.date,
        config,
      );
      allFreshness.push(freshness);
      totalRequirements += 1;

      const gap = analyzeSkillGap(
        {
          competencyId: requirement.competencyId,
          competencyCode: requirement.competency.code,
          competencyName: requirement.competency.name,
          category: requirement.competency.category,
          requiredLevel: requirement.requiredLevel,
          currentLevel: freshness.effectiveLevel,
          importance: requirement.importance,
          roleCriticality: person.jobRole?.criticality ?? 3,
        },
        config,
      );
      if (gap.severity === 'CRITICAL') criticalGaps += 1;

      totalRequired += requirement.requiredLevel;
      totalMet += Math.min(freshness.effectiveLevel, requirement.requiredLevel);
      department.required += requirement.requiredLevel;
      department.met += Math.min(freshness.effectiveLevel, requirement.requiredLevel);
      department.byStatus[freshness.status] += 1;
      if (freshness.needsRefresher) department.refreshers += 1;

      const competency = competencies.get(requirement.competencyId) ?? {
        name: requirement.competency.name,
        category: requirement.competency.category,
        levels: [],
        decay: [],
        byStatus: emptyStatus(),
        short: 0,
        criticality: policy.criticality,
      };
      competency.levels.push(freshness.effectiveLevel);
      competency.decay.push(freshness.decayPoints);
      competency.byStatus[freshness.status] += 1;
      if (freshness.gap > 0) competency.short += 1;
      competencies.set(requirement.competencyId, competency);

      if (freshness.recertificationDueAt && freshness.daysUntilRecertification !== null && freshness.daysUntilRecertification <= config.decay.defaultRecertificationDays) {
        recertifications.push({
          userId: person.id,
          userName: person.name,
          competencyId: requirement.competencyId,
          competencyName: requirement.competency.name,
          dueAt: freshness.recertificationDueAt,
          daysUntil: Math.round(freshness.daysUntilRecertification),
          overdue: freshness.daysUntilRecertification < 0,
        });
      }
    }
    departments.set(departmentKey, department);
  }

  const [succession, calendar] = await Promise.all([loadSuccessionReport({ config, db, asOf }), loadReadinessCalendar({ config, db, asOf })]);
  const riskByCompetency = new Map(succession.risks.map((risk) => [risk.competencyId, risk]));

  const freshness = summarizeFreshness(allFreshness);
  const coverage = totalRequired === 0 ? 0 : round1((totalMet / totalRequired) * 100);

  const index = calculateReadinessIndex(
    { coverage, freshnessCounts: freshness.byStatus, riskCounts: succession.summary.byRisk, criticalGaps, totalRequirements },
    config,
  );

  return {
    index,
    headline: {
      overallReadiness: index.score,
      competenciesAtRisk: freshness.byStatus.AT_RISK + freshness.byStatus.CRITICAL + freshness.byStatus.EXPIRED,
      criticalSkillGaps: criticalGaps,
      knowledgeLossRisks: succession.summary.atRisk,
      upcomingEvents: calendar.events.length,
      peopleNeedingRefresher: new Set(
        people.filter((person) => (person.jobRole?.competencies ?? []).length > 0).map((person) => person.id),
      ).size === 0
        ? 0
        : freshness.needingRefresher,
    },
    freshness,
    byDepartment: [...departments.entries()]
      .map(([departmentId, entry]) => ({
        departmentId,
        departmentName: entry.name,
        people: entry.people,
        coverage: entry.required === 0 ? 0 : round1((entry.met / entry.required) * 100),
        byStatus: entry.byStatus,
        needingRefresher: entry.refreshers,
      }))
      .sort((a, b) => a.coverage - b.coverage || a.departmentName.localeCompare(b.departmentName)),
    byCompetency: [...competencies.entries()]
      .map(([competencyId, entry]) => ({
        competencyId,
        competencyName: entry.name,
        category: entry.category,
        averageLevel: entry.levels.length === 0 ? 0 : round1(entry.levels.reduce((sum, level) => sum + level, 0) / entry.levels.length),
        averageDecay: entry.decay.length === 0 ? 0 : round1(entry.decay.reduce((sum, points) => sum + points, 0) / entry.decay.length),
        byStatus: entry.byStatus,
        peopleShort: entry.short,
        criticality: entry.criticality,
        knowledgeRisk: riskByCompetency.get(competencyId)?.risk ?? null,
      }))
      .sort((a, b) => b.peopleShort - a.peopleShort || a.averageLevel - b.averageLevel || a.competencyName.localeCompare(b.competencyName)),
    recertifications: recertifications.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 50),
    succession: {
      ...succession.summary,
      top: succession.risks
        .filter((risk) => risk.risk === 'HIGH' || risk.risk === 'CRITICAL')
        .slice(0, 10)
        .map((risk) => ({ competencyId: risk.competencyId, competencyName: risk.competencyName, risk: risk.risk, remainingExperts: risk.remainingExperts, reason: risk.reason })),
    },
    events: calendar.events,
    asOf,
    isDemonstrationMetric: true,
  };
}
