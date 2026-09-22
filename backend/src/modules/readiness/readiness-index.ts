import type { EngineConfig } from '../competencies/engine/config';
import type { FreshnessStatus } from '../competencies/engine/decay';
import type { KnowledgeRisk } from '../competencies/engine/succession';

/**
 * The Capacity Connect Readiness Index — a demonstration metric.
 *
 * A single 0-100 number for "how operationally ready is this organisation",
 * combining four things the platform already measures:
 *
 *   coverage      how much of what roles require is actually held (effective levels)
 *   freshness     how much of it is current rather than decayed or expired
 *   continuity    how well critical competencies are covered by enough people
 *   penalty       a deduction for critical gaps, which an average would hide
 *
 *   index = coverage x wCoverage + freshness x wFreshness + continuity x wContinuity
 *           - criticalGapPenalty
 *
 * Every weight is configuration. This is NOT an official IMD operational metric
 * and must always be presented as the demonstration index it is.
 */

export interface ReadinessIndexInput {
  /** Σ min(effective, required) / Σ required across every role requirement, 0-100. */
  coverage: number;
  /** Competency records by freshness status, across the workforce. */
  freshnessCounts: Record<FreshnessStatus, number>;
  /** Competencies by knowledge-loss risk. */
  riskCounts: Record<KnowledgeRisk, number>;
  /** Role requirements whose gap is classified critical. */
  criticalGaps: number;
  /** Total role requirements assessed, used to scale the penalty. */
  totalRequirements: number;
}

export interface ReadinessIndexBand {
  band: 'STRONG' | 'ADEQUATE' | 'FRAGILE' | 'AT_RISK';
  label: string;
}

export interface ReadinessIndex extends ReadinessIndexBand {
  /** The headline 0-100 figure. */
  score: number;
  components: {
    coverage: number;
    freshness: number;
    continuity: number;
    criticalGapPenalty: number;
  };
  weights: EngineConfig['readinessIndex'];
  /** The calculation written out, so the number can be checked by hand. */
  explanation: string;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Share of competency records that are current or merely on watch, 0-100. */
export function freshnessScore(counts: Record<FreshnessStatus, number>): number {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return 100;
  // WATCH counts as half: still usable, but it needs attention.
  const good = counts.CURRENT + counts.WATCH * 0.5;
  return round1((good / total) * 100);
}

/** Share of competencies whose continuity risk is low or merely watched, 0-100. */
export function continuityScore(counts: Record<KnowledgeRisk, number>): number {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total === 0) return 100;
  const good = counts.LOW + counts.WATCH * 0.5;
  return round1((good / total) * 100);
}

export function bandFor(score: number, thresholds: EngineConfig['readinessIndex']): ReadinessIndexBand {
  if (score >= thresholds.strongMin) return { band: 'STRONG', label: 'Strong' };
  if (score >= thresholds.adequateMin) return { band: 'ADEQUATE', label: 'Adequate' };
  if (score >= thresholds.fragileMin) return { band: 'FRAGILE', label: 'Fragile' };
  return { band: 'AT_RISK', label: 'At risk' };
}

export function calculateReadinessIndex(input: ReadinessIndexInput, config: EngineConfig): ReadinessIndex {
  const weights = config.readinessIndex;

  const coverage = round1(clamp(input.coverage, 0, 100));
  const freshness = freshnessScore(input.freshnessCounts);
  const continuity = continuityScore(input.riskCounts);

  // A critical gap is worth more than its share of the average, because an
  // organisation with a few critical holes is not "mostly ready".
  const criticalShare = input.totalRequirements === 0 ? 0 : input.criticalGaps / input.totalRequirements;
  const criticalGapPenalty = round1(clamp(criticalShare * 100 * weights.criticalGapPenalty, 0, weights.maxCriticalGapPenalty));

  const weighted = coverage * weights.coverage + freshness * weights.freshness + continuity * weights.continuity;
  const score = round1(clamp(weighted - criticalGapPenalty, 0, 100));
  const band = bandFor(score, weights);

  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const explanation =
    `Coverage ${coverage} x ${percent(weights.coverage)} + freshness ${freshness} x ${percent(weights.freshness)} + ` +
    `continuity ${continuity} x ${percent(weights.continuity)} = ${round1(weighted)}` +
    (criticalGapPenalty > 0 ? `, less ${criticalGapPenalty} for ${input.criticalGaps} critical gap${input.criticalGaps === 1 ? '' : 's'}` : '') +
    `, giving ${score} out of 100 (${band.label}).`;

  return {
    score,
    ...band,
    components: { coverage, freshness, continuity, criticalGapPenalty },
    weights,
    explanation,
  };
}
