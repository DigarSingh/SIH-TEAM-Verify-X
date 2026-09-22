import { z } from 'zod';

/**
 * Configuration of the deterministic competency engine.
 *
 * Every number that influences a skill-gap classification, a training priority or
 * a competency update lives here (and is editable by administrators), never in
 * scattered constants. Nothing in the engine is a black-box model: each result
 * can be reproduced by hand from these values.
 */
export interface EngineConfig {
  /**
   * Severity of a skill gap (points below the required level):
   *   gap <= lowMax → LOW, <= moderateMax → MODERATE, <= highMax → HIGH, otherwise CRITICAL.
   * Defaults reproduce the brief: 0-10 Low, 11-25 Moderate, 26-50 High, 51+ Critical.
   */
  severity: { lowMax: number; moderateMax: number; highMax: number };

  /** Thresholds on the normalised 0-100 training-priority score. */
  priority: { mediumMin: number; highMin: number; criticalMin: number };

  update: {
    /**
     * Weight of the previous competency level in the blend. The remaining
     * (1 - previousWeight) goes to the evidence. 0.25 turns previous=35 and an
     * assessment of 84 into round(0.25 * 35 + 0.75 * 84) = 72.
     */
    previousWeight: number;
    /** Relative weights of the evidence sources; renormalised over the sources actually available. */
    inputWeights: { assessment: number; trainerEvaluation: number; practical: number };
    /** Trainer evaluations / assessment results older than this no longer count as evidence. */
    evidenceWindowDays: number;
    /** When false, only PASSED assessment attempts move a competency. */
    updateOnFailedAttempt: boolean;
    /** When false a weak result never lowers the recorded competency. */
    allowDecrease: boolean;
    /** Cap the effect of a course at its mapped target level (`levelTo`). */
    capAtCourseTarget: boolean;
  };

  /** Weights of the trainer rubric criteria (must sum to 1). */
  evaluationWeights: {
    technicalKnowledge: number;
    practicalAbility: number;
    participation: number;
    applicationOfKnowledge: number;
    overallCompetency: number;
  };

  /**
   * Competency freshness: how an unpractised competency loses value over time, and
   * when that becomes a problem. Per-competency overrides live in
   * `CompetencyDecayPolicy`; these are the installation-wide defaults and the
   * thresholds that turn a number into a status.
   *
   * The shipped values are a plausible demonstration setting, not an official
   * IMD policy.
   */
  decay: {
    /** Master switch. When false nothing decays anywhere, whatever a competency's own policy says. */
    enabled: boolean;
    /** Defaults for a competency that has no policy of its own. */
    defaultHalfLifeDays: number;
    defaultMinimumSafeLevel: number;
    /** Days between required reassessments; 0 disables recertification. */
    defaultRecertificationDays: number;
    defaultCriticality: number;
    /** A recertification due within this many days puts the competency on WATCH. */
    watchWindowDays: number;
    /** Points below the requirement at which a competency becomes AT_RISK. */
    atRiskGap: number;
    /** Points below the requirement at which it becomes CRITICAL (for a competency of average criticality). */
    criticalGap: number;
    /**
     * How much criticality tightens the critical threshold, 0..1. At 0.5 a
     * criticality-5 competency reaches CRITICAL at half the usual gap.
     */
    criticalityWeight: number;
    /** Furthest ahead the readiness simulation may look, in days. */
    simulationMaxDays: number;
  };

  /**
   * Workforce continuity. These decide when depending on too few people counts
   * as a risk; they describe the organisation's own tolerance, not a prediction.
   */
  succession: {
    /** Effective level at which someone counts as a strong expert. */
    expertLevel: number;
    /** Effective level at which someone counts as developing towards expert. */
    developingLevel: number;
    /** Experts a competency should have before cover is considered adequate. */
    minimumExperts: number;
    /** Extra experts expected of a competency at or above `criticalCriticality`. */
    criticalExtraExperts: number;
    /** Criticality at or above which a competency is treated as mission critical. */
    criticalCriticality: number;
    /** A recorded retirement this many days away already counts as leaving. */
    retirementWindowDays: number;
    /** At or below this many experts a competency is reported as thinly covered. */
    thinCoverExperts: number;
  };

  /**
   * The Capacity Connect Readiness Index: how the organisation-wide headline
   * figure is composed. A DEMONSTRATION METRIC, not an official IMD measure.
   * The three weights must add up to 1.
   */
  readinessIndex: {
    coverage: number;
    freshness: number;
    continuity: number;
    /** Multiplies the share of requirements that are critical gaps. */
    criticalGapPenalty: number;
    /** The most the penalty may subtract, so it cannot swamp the whole index. */
    maxCriticalGapPenalty: number;
    strongMin: number;
    adequateMin: number;
    fragileMin: number;
  };
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  severity: { lowMax: 10, moderateMax: 25, highMax: 50 },
  priority: { mediumMin: 12, highMin: 25, criticalMin: 45 },
  update: {
    previousWeight: 0.25,
    inputWeights: { assessment: 0.6, trainerEvaluation: 0.25, practical: 0.15 },
    evidenceWindowDays: 365,
    updateOnFailedAttempt: false,
    allowDecrease: false,
    capAtCourseTarget: true,
  },
  evaluationWeights: {
    technicalKnowledge: 0.3,
    practicalAbility: 0.25,
    participation: 0.1,
    applicationOfKnowledge: 0.2,
    overallCompetency: 0.15,
  },
  decay: {
    enabled: true,
    defaultHalfLifeDays: 180,
    defaultMinimumSafeLevel: 40,
    defaultRecertificationDays: 365,
    defaultCriticality: 3,
    watchWindowDays: 30,
    atRiskGap: 15,
    criticalGap: 50,
    criticalityWeight: 0.4,
    simulationMaxDays: 1825,
  },
  succession: {
    expertLevel: 80,
    developingLevel: 50,
    minimumExperts: 2,
    criticalExtraExperts: 1,
    criticalCriticality: 4,
    retirementWindowDays: 730,
    thinCoverExperts: 2,
  },
  readinessIndex: {
    coverage: 0.5,
    freshness: 0.3,
    continuity: 0.2,
    criticalGapPenalty: 1.5,
    maxCriticalGapPenalty: 25,
    strongMin: 85,
    adequateMin: 70,
    fragileMin: 50,
  },
};

/** Scale bounds fixed by the database CHECK constraints. */
export const MAX_IMPORTANCE = 5;
export const MAX_CRITICALITY = 5;

const unit = z.number().min(0, 'Must be between 0 and 1').max(1, 'Must be between 0 and 1');
const percent = z.number().min(0).max(100);

export const engineConfigSchema = z.strictObject({
  severity: z
    .strictObject({ lowMax: percent, moderateMax: percent, highMax: percent })
    .refine((t) => t.lowMax < t.moderateMax && t.moderateMax < t.highMax, {
      message: 'Severity thresholds must be strictly increasing (low < moderate < high)',
    }),
  priority: z
    .strictObject({ mediumMin: percent, highMin: percent, criticalMin: percent })
    .refine((t) => t.mediumMin > 0 && t.mediumMin < t.highMin && t.highMin < t.criticalMin, {
      message: 'Priority thresholds must be strictly increasing and above 0 (medium < high < critical)',
    }),
  update: z.strictObject({
    previousWeight: z.number().min(0, 'Must be between 0 and 0.9').max(0.9, 'Must be between 0 and 0.9'),
    inputWeights: z
      .strictObject({ assessment: unit, trainerEvaluation: unit, practical: unit })
      .refine((w) => w.assessment + w.trainerEvaluation + w.practical > 0, { message: 'At least one evidence weight must be above 0' }),
    evidenceWindowDays: z.number().int().min(1).max(3650),
    updateOnFailedAttempt: z.boolean(),
    allowDecrease: z.boolean(),
    capAtCourseTarget: z.boolean(),
  }),
  evaluationWeights: z
    .strictObject({
      technicalKnowledge: unit,
      practicalAbility: unit,
      participation: unit,
      applicationOfKnowledge: unit,
      overallCompetency: unit,
    })
    .refine((w) => Math.abs(Object.values(w).reduce((sum, value) => sum + value, 0) - 1) < 0.001, {
      message: 'Evaluation weights must add up to 1 (100%)',
    }),
  decay: z
    .strictObject({
      enabled: z.boolean(),
      defaultHalfLifeDays: z.number().int().min(1, 'Half-life must be at least 1 day').max(3650),
      defaultMinimumSafeLevel: percent,
      defaultRecertificationDays: z.number().int().min(0, 'Use 0 to switch recertification off').max(3650),
      defaultCriticality: z.number().int().min(1).max(MAX_CRITICALITY),
      watchWindowDays: z.number().int().min(0).max(365),
      atRiskGap: percent,
      criticalGap: percent,
      criticalityWeight: unit,
      simulationMaxDays: z.number().int().min(1).max(3650),
    })
    .refine((d) => d.atRiskGap < d.criticalGap, { message: 'The at-risk gap must be smaller than the critical gap' }),
  succession: z
    .strictObject({
      expertLevel: percent,
      developingLevel: percent,
      minimumExperts: z.number().int().min(1).max(50),
      criticalExtraExperts: z.number().int().min(0).max(20),
      criticalCriticality: z.number().int().min(1).max(MAX_CRITICALITY),
      retirementWindowDays: z.number().int().min(0).max(3650),
      thinCoverExperts: z.number().int().min(0).max(50),
    })
    .refine((s2) => s2.developingLevel < s2.expertLevel, { message: 'The developing level must be below the expert level' }),
  readinessIndex: z
    .strictObject({
      coverage: unit,
      freshness: unit,
      continuity: unit,
      criticalGapPenalty: z.number().min(0).max(10),
      maxCriticalGapPenalty: percent,
      strongMin: percent,
      adequateMin: percent,
      fragileMin: percent,
    })
    .refine((r) => Math.abs(r.coverage + r.freshness + r.continuity - 1) < 0.001, { message: 'The readiness index weights must add up to 1 (100%)' })
    .refine((r) => r.fragileMin < r.adequateMin && r.adequateMin < r.strongMin, { message: 'Readiness index bands must be strictly increasing (fragile < adequate < strong)' }),
});

/**
 * Merges a stored (possibly older / partial) configuration over the defaults so
 * adding a new option in a later release never breaks an existing installation.
 */
export function mergeEngineConfig(stored: unknown): EngineConfig {
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
  const merge = (base: unknown, override: unknown): unknown => {
    if (!isObject(base) || !isObject(override)) return override === undefined ? base : override;
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(base)) result[key] = merge(base[key], override[key]);
    return result;
  };
  const merged = merge(DEFAULT_ENGINE_CONFIG, stored);
  const parsed = engineConfigSchema.safeParse(merged);
  return parsed.success ? (parsed.data as EngineConfig) : DEFAULT_ENGINE_CONFIG;
}
