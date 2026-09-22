import { MAX_CRITICALITY, type EngineConfig } from './config';

/**
 * Competency freshness: the part of the engine that answers "is this competency
 * still current, or has it decayed because it has not been practised?".
 *
 * Everything here is a pure function of its inputs and an explicit `asOf` date.
 * Nothing is read from the clock and nothing is written to the database, which is
 * what makes the readiness simulation ("time travel") possible: asking for a
 * future date changes the answer without changing a single stored timestamp.
 *
 * The decay model is deliberately simple and inspectable:
 *
 *   effectiveLevel = baselineLevel x 0.5 ^ (daysSincePractice / halfLifeDays)
 *
 * The half-life, the minimum safe level, the recertification interval and the
 * criticality are configuration, never constants in the code: see
 * `CompetencyDecayPolicy` (per competency) and `EngineConfig.decay` (defaults and
 * thresholds). The values shipped with the demo data are a plausible simulation,
 * not an official IMD policy.
 */

export type FreshnessStatus = 'CURRENT' | 'WATCH' | 'AT_RISK' | 'CRITICAL' | 'EXPIRED';

export const FRESHNESS_STATUS_LABELS: Record<FreshnessStatus, string> = {
  CURRENT: 'Current',
  WATCH: 'Watch',
  AT_RISK: 'At risk',
  CRITICAL: 'Critical',
  EXPIRED: 'Expired',
};

/** Statuses that mean the employee should be doing something about it. */
export const REFRESHER_STATUSES: readonly FreshnessStatus[] = ['AT_RISK', 'CRITICAL', 'EXPIRED'];

/** The decay settings that apply to one competency. */
export interface DecayPolicy {
  /** When false this competency keeps its level indefinitely. */
  decayEnabled: boolean;
  /** Days in which an unpractised competency loses half of its level. */
  halfLifeDays: number;
  /** Below this effective level the competency counts as critical, whatever the requirement. */
  minimumSafeLevel: number;
  /** Days after an assessment at which the competency must be reassessed; 0 = never. */
  recertificationIntervalDays: number;
  /** Operational criticality of the competency, 1..5. */
  criticality: number;
}

const MS_PER_DAY = 86_400_000;
const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Signed difference in days (fractions kept), `to` minus `from`. */
export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

/**
 * Exponential decay with a half-life, clamped to 0..100.
 *
 * A non-positive half-life means "no decay configured" rather than an infinitely
 * fast one, and a negative elapsed time (a practice date in the future, which
 * happens while simulating a past date) never increases the level.
 */
export function decayedLevel(baselineLevel: number, daysSincePractice: number, halfLifeDays: number): number {
  const baseline = clamp(baselineLevel, 0, 100);
  if (halfLifeDays <= 0 || daysSincePractice <= 0) return baseline;
  return clamp(baseline * 0.5 ** (daysSincePractice / halfLifeDays), 0, 100);
}

/** The date by which the competency must be reassessed, or null when that does not apply. */
export function recertificationDueAt(lastAssessedAt: Date | null, intervalDays: number): Date | null {
  if (lastAssessedAt === null || intervalDays <= 0) return null;
  return new Date(lastAssessedAt.getTime() + intervalDays * MS_PER_DAY);
}

export interface FreshnessClassification {
  effectiveLevel: number;
  requiredLevel: number;
  minimumSafeLevel: number;
  /** Negative once the date has passed; null when recertification does not apply. */
  daysUntilRecertification: number | null;
  criticality: number;
  /** Points decay has already taken off the verified level. */
  decayPoints: number;
}

/**
 * Where a competency stands on FRESHNESS, using the configurable thresholds.
 *
 * Two rules shape this, and both matter:
 *
 * 1. An expired recertification outranks a comfortable level, because an
 *    unverified competency is not a demonstrated one.
 * 2. AT_RISK and CRITICAL mean a shortfall that decay caused or worsened. Someone
 *    who was never trained to the required level has a *training gap*, which the
 *    skill-gap engine already reports with its own severity and priority; calling
 *    that a freshness risk would double-count it and drown the signal this view
 *    exists to give — who is quietly losing a capability they once had.
 *
 * A competency below its minimum safe level is critical either way: at that point
 * how it got there stops mattering.
 */
export function classifyFreshness(input: FreshnessClassification, thresholds: EngineConfig['decay']): FreshnessStatus {
  const { effectiveLevel, requiredLevel, minimumSafeLevel, daysUntilRecertification, criticality, decayPoints } = input;

  if (daysUntilRecertification !== null && daysUntilRecertification < 0) return 'EXPIRED';
  if (minimumSafeLevel > 0 && effectiveLevel < minimumSafeLevel) return 'CRITICAL';

  const gap = Math.max(0, requiredLevel - effectiveLevel);

  /**
   * What matters is how much decay has COST, not merely that some occurred.
   * Someone 25 points short who has lost 5 to decay has a training gap with a
   * little decay on top; someone who has lost 21 points is actively losing a
   * capability they demonstrated. Only the second is a freshness risk, and the
   * thresholds are therefore applied to `decayPoints`, not to the gap.
   *
   * The shortfall still has to be real: decay that has not yet taken anyone below
   * what their role needs is worth watching, not warning about.
   */
  if (gap > 0) {
    // Criticality tightens the threshold: criticality 1 leaves it alone, 5 tightens
    // it by `criticalityWeight`, so a critical competency raises the alarm sooner.
    const tightening = ((clamp(criticality, 1, MAX_CRITICALITY) - 1) / (MAX_CRITICALITY - 1)) * thresholds.criticalityWeight;
    if (decayPoints >= thresholds.criticalGap * (1 - tightening)) return 'CRITICAL';
    if (decayPoints >= thresholds.atRiskGap) return 'AT_RISK';
  }

  if (daysUntilRecertification !== null && daysUntilRecertification <= thresholds.watchWindowDays) return 'WATCH';
  // Any decay at all, or any shortfall, is worth watching even when neither is yet serious.
  if (decayPoints > 0 || gap > 0) return 'WATCH';
  return 'CURRENT';
}

export interface FreshnessInput {
  /** The verified level recorded by the competency engine, before any decay. */
  baselineLevel: number;
  /** What the employee's role requires. */
  requiredLevel: number;
  /** Last time the competency was actually used or practised. */
  lastPracticedAt: Date | null;
  /** Last time it was demonstrated in an assessment or evaluation; drives recertification. */
  lastAssessedAt: Date | null;
  policy: DecayPolicy;
}

export interface Freshness {
  baselineLevel: number;
  /** The level after decay, rounded to a whole percentage point. */
  effectiveLevel: number;
  /** How many points decay has taken off the baseline. */
  decayPoints: number;
  requiredLevel: number;
  /** Shortfall against the requirement, using the effective level. Never negative. */
  gap: number;
  daysSincePractice: number | null;
  lastPracticedAt: Date | null;
  lastAssessedAt: Date | null;
  recertificationDueAt: Date | null;
  daysUntilRecertification: number | null;
  status: FreshnessStatus;
  statusLabel: string;
  /** True when the employee should take a refresher now. */
  needsRefresher: boolean;
  decayApplied: boolean;
  policy: DecayPolicy;
  /** Plain-language explanation of the status, including the numbers behind it. */
  reason: string;
}

const days = (value: number) => `${Math.round(value)} day${Math.round(value) === 1 ? '' : 's'}`;

/**
 * The complete freshness picture for one competency of one employee, as of a date.
 *
 * `asOf` is always explicit so the caller decides whether this is "now" or a
 * simulated future date.
 */
export function analyzeFreshness(input: FreshnessInput, asOf: Date, config: EngineConfig): Freshness {
  const { baselineLevel, requiredLevel, policy } = input;
  const evidenceAt = input.lastPracticedAt ?? input.lastAssessedAt;
  const daysSincePractice = evidenceAt === null ? null : round1(daysBetween(evidenceAt, asOf));

  const decayApplied = config.decay.enabled && policy.decayEnabled && policy.halfLifeDays > 0 && daysSincePractice !== null;
  const effectiveLevel = decayApplied
    ? Math.round(decayedLevel(baselineLevel, daysSincePractice as number, policy.halfLifeDays))
    : Math.round(clamp(baselineLevel, 0, 100));
  const decayPoints = Math.max(0, Math.round(clamp(baselineLevel, 0, 100)) - effectiveLevel);

  const dueAt = recertificationDueAt(input.lastAssessedAt, policy.recertificationIntervalDays);
  const daysUntilRecertification = dueAt === null ? null : round1(daysBetween(asOf, dueAt));

  const status = classifyFreshness(
    { effectiveLevel, requiredLevel, minimumSafeLevel: policy.minimumSafeLevel, daysUntilRecertification, criticality: policy.criticality, decayPoints },
    config.decay,
  );
  const gap = Math.max(0, requiredLevel - effectiveLevel);

  return {
    baselineLevel: Math.round(clamp(baselineLevel, 0, 100)),
    effectiveLevel,
    decayPoints,
    requiredLevel,
    gap,
    daysSincePractice,
    lastPracticedAt: input.lastPracticedAt,
    lastAssessedAt: input.lastAssessedAt,
    recertificationDueAt: dueAt,
    daysUntilRecertification,
    status,
    statusLabel: FRESHNESS_STATUS_LABELS[status],
    needsRefresher: REFRESHER_STATUSES.includes(status),
    decayApplied,
    policy,
    reason: explain({ status, effectiveLevel, decayPoints, requiredLevel, gap, daysSincePractice, daysUntilRecertification, decayApplied, policy, hasEvidence: evidenceAt !== null }),
  };
}

interface ExplainInput {
  status: FreshnessStatus;
  effectiveLevel: number;
  decayPoints: number;
  requiredLevel: number;
  gap: number;
  daysSincePractice: number | null;
  daysUntilRecertification: number | null;
  decayApplied: boolean;
  policy: DecayPolicy;
  hasEvidence: boolean;
}

/** Why the competency has this status, in the words the trainee and the admin both see. */
function explain(input: ExplainInput): string {
  const { status, effectiveLevel, decayPoints, requiredLevel, gap, daysSincePractice, daysUntilRecertification, policy } = input;
  const parts: string[] = [];

  if (!input.hasEvidence) {
    parts.push(`There is no recorded evidence for this competency yet, so it is held at ${effectiveLevel}% and nothing has decayed.`);
  } else if (input.decayApplied && decayPoints > 0) {
    parts.push(
      `Last practised ${days(daysSincePractice as number)} ago. With a configured half-life of ${policy.halfLifeDays} days, ` +
        `the recorded ${effectiveLevel + decayPoints}% has decayed to an effective ${effectiveLevel}%.`,
    );
  } else if (input.decayApplied) {
    parts.push(`Last practised ${days(daysSincePractice as number)} ago, which is recent enough that the effective level is still ${effectiveLevel}%.`);
  } else {
    parts.push(`This competency is not configured to decay, so it stays at the recorded ${effectiveLevel}%.`);
  }

  if (status === 'EXPIRED' && daysUntilRecertification !== null) {
    parts.push(`Its recertification was due ${days(Math.abs(daysUntilRecertification))} ago, so it must be reassessed before it counts as current.`);
  } else if (daysUntilRecertification !== null && daysUntilRecertification <= policy.recertificationIntervalDays) {
    parts.push(`Recertification is due in ${days(daysUntilRecertification)}.`);
  }

  if (gap > 0) {
    parts.push(`Your role requires ${requiredLevel}%, so there is a gap of ${gap} point${gap === 1 ? '' : 's'}.`);
  } else if (status !== 'EXPIRED') {
    parts.push(`That still meets the ${requiredLevel}% your role requires.`);
  }

  if (effectiveLevel < policy.minimumSafeLevel) {
    parts.push(`It is below the configured minimum safe level of ${policy.minimumSafeLevel}%.`);
  }

  return parts.join(' ');
}

/** The starting point offered when an administrator switches freshness on for a competency. */
export const DEFAULT_DECAY_POLICY: DecayPolicy = {
  decayEnabled: true,
  halfLifeDays: 180,
  minimumSafeLevel: 40,
  recertificationIntervalDays: 365,
  criticality: 3,
};

/**
 * Fills a partial stored policy from the installation defaults.
 *
 * A competency with NO stored policy is inert: it neither decays nor expires nor
 * has a minimum safe level. Freshness is something an administrator switches on
 * deliberately, so an installation that has not configured it sees exactly the
 * behaviour it had before, and nothing changes under anyone silently.
 */
export function resolvePolicy(stored: Partial<DecayPolicy> | null | undefined, config: EngineConfig): DecayPolicy {
  if (!stored) {
    return {
      decayEnabled: false,
      halfLifeDays: config.decay.defaultHalfLifeDays, // carried for display; unused while decay is off
      minimumSafeLevel: 0,
      recertificationIntervalDays: 0,
      criticality: config.decay.defaultCriticality,
    };
  }
  return {
    decayEnabled: stored.decayEnabled ?? true,
    halfLifeDays: stored.halfLifeDays ?? config.decay.defaultHalfLifeDays,
    minimumSafeLevel: stored.minimumSafeLevel ?? config.decay.defaultMinimumSafeLevel,
    recertificationIntervalDays: stored.recertificationIntervalDays ?? config.decay.defaultRecertificationDays,
    criticality: stored.criticality ?? config.decay.defaultCriticality,
  };
}

export interface FreshnessSummary {
  total: number;
  byStatus: Record<FreshnessStatus, number>;
  /** Competencies whose status calls for a refresher. */
  needingRefresher: number;
  /** Average effective level across all competencies, 0 when there are none. */
  averageEffectiveLevel: number;
  /** Points lost to decay across all competencies. */
  totalDecayPoints: number;
}

export function summarizeFreshness(items: Freshness[]): FreshnessSummary {
  const byStatus: Record<FreshnessStatus, number> = { CURRENT: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0, EXPIRED: 0 };
  let levelTotal = 0;
  let decayTotal = 0;
  for (const item of items) {
    byStatus[item.status] += 1;
    levelTotal += item.effectiveLevel;
    decayTotal += item.decayPoints;
  }
  return {
    total: items.length,
    byStatus,
    needingRefresher: items.filter((item) => item.needsRefresher).length,
    averageEffectiveLevel: items.length === 0 ? 0 : round1(levelTotal / items.length),
    totalDecayPoints: decayTotal,
  };
}
