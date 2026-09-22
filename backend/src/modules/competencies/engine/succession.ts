import { MAX_CRITICALITY, type EngineConfig } from './config';

/**
 * Workforce continuity: where the organisation depends on too few people for a
 * competency, and what happens to that competency when they leave.
 *
 * This identifies a *configured* continuity risk from the data the system holds
 * (recorded competency levels and recorded retirement dates). It does not predict
 * whether anyone will actually retire, resign or be replaced, and it is not a
 * workforce-planning forecast. Like the rest of the engine it is a pure function
 * of its inputs and an explicit date, so it can be simulated forward.
 */

export type KnowledgeRisk = 'LOW' | 'WATCH' | 'HIGH' | 'CRITICAL';

export const KNOWLEDGE_RISK_LABELS: Record<KnowledgeRisk, string> = {
  LOW: 'Low',
  WATCH: 'Watch',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

/** One person's standing in a competency, as the succession view needs it. */
export interface HolderInput {
  userId: string;
  userName: string;
  /** Effective level at the analysed date (decay already applied). */
  effectiveLevel: number;
  /** Recorded retirement date, when the organisation holds one. */
  retirementDate: Date | null;
  departmentName: string | null;
  jobRoleName: string | null;
}

export interface Holder extends HolderInput {
  /** Days until the recorded retirement date; null when none is recorded. */
  daysUntilRetirement: number | null;
  /** A strong holder who is inside the configured retirement window. */
  leavingSoon: boolean;
}

export interface SuccessionInput {
  competencyId: string;
  competencyName: string;
  competencyCode: string;
  category: string;
  /** Operational criticality of the competency, 1..5 (from its freshness policy). */
  criticality: number;
  holders: HolderInput[];
}

export interface SuccessionRisk {
  competencyId: string;
  competencyName: string;
  competencyCode: string;
  category: string;
  criticality: number;
  /** People at or above the configured expert level. */
  experts: Holder[];
  /** Experts whose recorded retirement falls inside the window. */
  leavingExperts: Holder[];
  /** People on their way to expert: above the developing level but not yet expert. */
  developing: Holder[];
  expertCount: number;
  leavingCount: number;
  developingCount: number;
  /** Experts expected to remain after the recorded retirements. */
  remainingExperts: number;
  /** How many experts the configuration says this competency should have. */
  minimumExperts: number;
  risk: KnowledgeRisk;
  /** Plain-language explanation of the risk level. */
  reason: string;
}

const MS_PER_DAY = 86_400_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Classifies continuity risk.
 *
 * The question is not "how many experts are there" but "how many will still be
 * here, and is that enough for something this critical".
 */
export function classifyKnowledgeRisk(
  input: { remainingExperts: number; minimumExperts: number; developingCount: number; leavingCount: number; criticality: number },
  thresholds: EngineConfig['succession'],
): KnowledgeRisk {
  const { remainingExperts, minimumExperts, developingCount, leavingCount, criticality } = input;

  // Nobody left who can do it: the worst case, regardless of anything else.
  if (remainingExperts === 0) return 'CRITICAL';

  const critical = criticality >= thresholds.criticalCriticality;
  if (remainingExperts < minimumExperts) {
    // A shortfall on a mission-critical competency with nobody coming through is critical.
    if (critical && developingCount === 0) return 'CRITICAL';
    return 'HIGH';
  }
  if (leavingCount > 0 || remainingExperts === minimumExperts) return 'WATCH';
  return 'LOW';
}

/** The full succession picture for one competency, at a date. */
export function analyzeSuccession(input: SuccessionInput, asOf: Date, config: EngineConfig): SuccessionRisk {
  const thresholds = config.succession;
  const criticality = clamp(input.criticality, 1, MAX_CRITICALITY);

  const withDates: Holder[] = input.holders.map((holder) => {
    const daysUntilRetirement = holder.retirementDate === null ? null : Math.round((holder.retirementDate.getTime() - asOf.getTime()) / MS_PER_DAY);
    return {
      ...holder,
      daysUntilRetirement,
      // Already past the recorded date, or inside the window: either way the organisation should plan for it.
      leavingSoon: daysUntilRetirement !== null && daysUntilRetirement <= thresholds.retirementWindowDays,
    };
  });

  const byLevel = (a: Holder, b: Holder) => b.effectiveLevel - a.effectiveLevel || a.userName.localeCompare(b.userName);
  const experts = withDates.filter((holder) => holder.effectiveLevel >= thresholds.expertLevel).sort(byLevel);
  const developing = withDates
    .filter((holder) => holder.effectiveLevel >= thresholds.developingLevel && holder.effectiveLevel < thresholds.expertLevel)
    .sort(byLevel);
  const leavingExperts = experts.filter((holder) => holder.leavingSoon);

  // Criticality raises the bar: the more critical the competency, the more cover it should have.
  const minimumExperts = thresholds.minimumExperts + (criticality >= thresholds.criticalCriticality ? thresholds.criticalExtraExperts : 0);
  const remainingExperts = experts.length - leavingExperts.length;

  const risk = classifyKnowledgeRisk(
    { remainingExperts, minimumExperts, developingCount: developing.length, leavingCount: leavingExperts.length, criticality },
    thresholds,
  );

  return {
    competencyId: input.competencyId,
    competencyName: input.competencyName,
    competencyCode: input.competencyCode,
    category: input.category,
    criticality,
    experts,
    leavingExperts,
    developing,
    expertCount: experts.length,
    leavingCount: leavingExperts.length,
    developingCount: developing.length,
    remainingExperts,
    minimumExperts,
    risk,
    reason: explain({ risk, experts: experts.length, leaving: leavingExperts.length, remaining: remainingExperts, developing: developing.length, minimumExperts, criticality, thresholds }),
  };
}

function explain(input: {
  risk: KnowledgeRisk;
  experts: number;
  leaving: number;
  remaining: number;
  developing: number;
  minimumExperts: number;
  criticality: number;
  thresholds: EngineConfig['succession'];
}): string {
  const { risk, experts, leaving, remaining, developing, minimumExperts, criticality, thresholds } = input;
  const parts: string[] = [];

  parts.push(
    experts === 0
      ? `Nobody currently reaches the ${thresholds.expertLevel}% expert level in this competency.`
      : `${plural(experts, 'person reaches', 'people reach')} the ${thresholds.expertLevel}% expert level.`,
  );

  if (leaving > 0) {
    parts.push(
      `${plural(leaving, 'of them has', 'of them have')} a recorded retirement date within ${Math.round(thresholds.retirementWindowDays / 365 * 10) / 10} years, ` +
        `which would leave ${remaining === 0 ? 'nobody' : plural(remaining, 'expert', 'experts')}.`,
    );
  }

  parts.push(
    developing === 0
      ? 'No one is currently developing towards it.'
      : `${plural(developing, 'person is', 'people are')} developing towards it.`,
  );

  parts.push(`This competency is configured at criticality ${criticality}/${MAX_CRITICALITY}, so it should have at least ${plural(minimumExperts, 'expert', 'experts')}.`);

  const verdict: Record<KnowledgeRisk, string> = {
    CRITICAL: 'Knowledge-loss risk is CRITICAL: start developing a successor now.',
    HIGH: 'Knowledge-loss risk is HIGH: there is less cover than this competency warrants.',
    WATCH: 'Knowledge-loss risk is on WATCH: cover is adequate but has no margin.',
    LOW: 'Knowledge-loss risk is LOW.',
  };
  parts.push(verdict[risk]);

  return parts.join(' ');
}

/** Highest risk first, then the thinnest cover, then name: deterministic. */
const RISK_ORDER: Record<KnowledgeRisk, number> = { CRITICAL: 0, HIGH: 1, WATCH: 2, LOW: 3 };
export function rankSuccessionRisks(risks: SuccessionRisk[]): SuccessionRisk[] {
  return [...risks].sort(
    (a, b) =>
      RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
      a.remainingExperts - b.remainingExperts ||
      b.criticality - a.criticality ||
      a.competencyName.localeCompare(b.competencyName),
  );
}

export interface SuccessionSummary {
  competencies: number;
  byRisk: Record<KnowledgeRisk, number>;
  /** Competencies at HIGH or CRITICAL risk. */
  atRisk: number;
  /** Competencies with at most the configured thin-cover threshold of experts. */
  thinlyCovered: number;
  /** Distinct experts with a recorded retirement inside the window. */
  expertsLeaving: number;
}

export function summarizeSuccession(risks: SuccessionRisk[], thresholds: EngineConfig['succession']): SuccessionSummary {
  const byRisk: Record<KnowledgeRisk, number> = { LOW: 0, WATCH: 0, HIGH: 0, CRITICAL: 0 };
  const leaving = new Set<string>();
  let thinlyCovered = 0;
  for (const risk of risks) {
    byRisk[risk.risk] += 1;
    if (risk.expertCount <= thresholds.thinCoverExperts) thinlyCovered += 1;
    for (const expert of risk.leavingExperts) leaving.add(expert.userId);
  }
  return {
    competencies: risks.length,
    byRisk,
    atRisk: byRisk.HIGH + byRisk.CRITICAL,
    thinlyCovered,
    expertsLeaving: leaving.size,
  };
}

/**
 * Suggests who could mentor whom for a competency: the strongest people who are
 * not leaving, paired with those developing towards it. Advisory only — a human
 * decides and records the mentorship.
 */
export function suggestMentors(risk: SuccessionRisk, limit = 3): { mentor: Holder; candidates: Holder[] }[] {
  const available = risk.experts.filter((expert) => !expert.leavingSoon);
  if (available.length === 0 || risk.developing.length === 0) return [];
  return available.slice(0, limit).map((mentor) => ({ mentor, candidates: risk.developing.slice(0, limit) }));
}
