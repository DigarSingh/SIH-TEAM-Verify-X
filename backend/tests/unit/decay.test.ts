import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../../src/modules/competencies/engine/config';
import {
  DEFAULT_DECAY_POLICY,
  analyzeFreshness,
  daysBetween,
  decayedLevel,
  classifyFreshness,
  recertificationDueAt,
  type DecayPolicy,
  type FreshnessInput,
} from '../../src/modules/competencies/engine/decay';

const config = DEFAULT_ENGINE_CONFIG;
const at = (iso: string) => new Date(iso);

/** The brief's worked example: baseline 72, half-life 180 days, 90 days since practice. */
const RADAR_BASELINE = 72;

describe('decayedLevel: baseline x 0.5 ^ (days / halfLife)', () => {
  it('reproduces the worked example from the brief (72, 180-day half-life, 90 days ≈ 50.9)', () => {
    expect(decayedLevel(RADAR_BASELINE, 90, 180)).toBeCloseTo(50.9, 1);
  });

  it('loses exactly half the level after one half-life', () => {
    expect(decayedLevel(80, 180, 180)).toBeCloseTo(40, 6);
    expect(decayedLevel(80, 360, 180)).toBeCloseTo(20, 6);
  });

  it('does not change the level when no time has passed', () => {
    expect(decayedLevel(72, 0, 180)).toBe(72);
  });

  it('never decays upwards when a practice date is in the future (negative elapsed days)', () => {
    expect(decayedLevel(72, -30, 180)).toBe(72);
  });

  it('clamps the result to 0..100', () => {
    expect(decayedLevel(150, 0, 180)).toBe(100);
    expect(decayedLevel(-10, 0, 180)).toBe(0);
    expect(decayedLevel(100, 100_000, 180)).toBeCloseTo(0, 6); // approaches zero, never goes below it
    expect(decayedLevel(100, 100_000, 180)).toBeGreaterThanOrEqual(0);
  });

  it('treats a non-positive half-life as "no decay" rather than dividing by zero', () => {
    expect(decayedLevel(72, 500, 0)).toBe(72);
    expect(decayedLevel(72, 500, -10)).toBe(72);
  });
});

describe('daysBetween', () => {
  it('counts whole and fractional days', () => {
    expect(daysBetween(at('2026-01-01T00:00:00Z'), at('2026-01-31T00:00:00Z'))).toBe(30);
    expect(daysBetween(at('2026-01-01T00:00:00Z'), at('2026-01-01T12:00:00Z'))).toBe(0.5);
  });

  it('is negative when the later date comes first', () => {
    expect(daysBetween(at('2026-02-01T00:00:00Z'), at('2026-01-01T00:00:00Z'))).toBe(-31);
  });
});

describe('recertificationDueAt', () => {
  it('is the last assessment plus the configured interval', () => {
    expect(recertificationDueAt(at('2026-01-01T00:00:00Z'), 365)?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('is unknown when the competency has never been assessed', () => {
    expect(recertificationDueAt(null, 365)).toBeNull();
  });

  it('is unknown when recertification is switched off (interval 0)', () => {
    expect(recertificationDueAt(at('2026-01-01T00:00:00Z'), 0)).toBeNull();
  });
});

describe('freshness status', () => {
  const thresholds = config.decay;
  /** A competency that has lost `decayPoints` to decay. */
  const decayed = (effectiveLevel: number, requiredLevel: number, decayPoints: number, extra: Partial<{ minimumSafeLevel: number; daysUntilRecertification: number | null; criticality: number }> = {}) => ({
    effectiveLevel,
    requiredLevel,
    minimumSafeLevel: extra.minimumSafeLevel ?? 40,
    daysUntilRecertification: extra.daysUntilRecertification === undefined ? 200 : extra.daysUntilRecertification,
    criticality: extra.criticality ?? 3,
    decayPoints,
  });

  it('is CURRENT when the requirement is met and nothing has decayed', () => {
    expect(classifyFreshness(decayed(85, 80, 0), thresholds)).toBe('CURRENT');
  });

  it('is WATCH for a small shortfall', () => {
    expect(classifyFreshness(decayed(75, 80, 0), thresholds)).toBe('WATCH');
  });

  it('is WATCH as soon as anything has decayed, even while the requirement is still met', () => {
    expect(classifyFreshness(decayed(85, 80, 5), thresholds)).toBe('WATCH');
  });

  it('is WATCH when the requirement is met but recertification is approaching', () => {
    expect(classifyFreshness(decayed(90, 80, 0, { daysUntilRecertification: 10 }), thresholds)).toBe('WATCH');
  });

  it('is AT_RISK once decay has cost a meaningful number of points', () => {
    expect(classifyFreshness(decayed(51, 80, 21), thresholds)).toBe('AT_RISK');
  });

  /**
   * The distinction the whole view rests on: a shortfall nobody has lost is a
   * training gap, which the skill-gap engine reports on its own terms.
   */
  it('is only WATCH for the same gap when no decay caused it', () => {
    expect(classifyFreshness(decayed(51, 80, 0), thresholds)).toBe('WATCH');
  });

  it('is only WATCH when decay contributed a little to a large training gap', () => {
    // 25 points short, but only 5 of them lost to decay: this is a training need.
    expect(classifyFreshness(decayed(45, 70, 5), thresholds)).toBe('WATCH');
  });

  it('warns as soon as decay itself reaches the threshold, however small the resulting gap', () => {
    // Only 2 points short of the requirement, but 18 points have been lost.
    expect(classifyFreshness(decayed(78, 80, 18), thresholds)).toBe('AT_RISK');
  });

  it('does not warn when decay has not yet taken anyone below what their role needs', () => {
    expect(classifyFreshness(decayed(85, 80, 20), thresholds)).toBe('WATCH');
  });

  it('is CRITICAL below the configured minimum safe level, however it got there', () => {
    expect(classifyFreshness(decayed(39, 80, 0, { minimumSafeLevel: 40 }), thresholds)).toBe('CRITICAL');
    expect(classifyFreshness(decayed(39, 80, 20, { minimumSafeLevel: 40 }), thresholds)).toBe('CRITICAL');
  });

  it('ignores the minimum safe level when the policy sets none', () => {
    expect(classifyFreshness(decayed(5, 80, 0, { minimumSafeLevel: 0 }), thresholds)).toBe('WATCH');
  });

  it('is CRITICAL when a lot has been lost on a highly critical competency', () => {
    expect(classifyFreshness(decayed(45, 90, 30, { minimumSafeLevel: 20, criticality: 5 }), thresholds)).toBe('CRITICAL');
    // The same loss on a low-criticality competency is serious but not critical.
    expect(classifyFreshness(decayed(45, 90, 30, { minimumSafeLevel: 20, criticality: 1 }), thresholds)).toBe('AT_RISK');
  });

  it('is EXPIRED once the recertification date has passed, whatever the level', () => {
    expect(classifyFreshness(decayed(95, 80, 0, { minimumSafeLevel: 50, daysUntilRecertification: -1 }), thresholds)).toBe('EXPIRED');
  });

  it('never reports WATCH on recertification when there is no recertification date', () => {
    expect(classifyFreshness(decayed(90, 80, 0, { minimumSafeLevel: 50, daysUntilRecertification: null }), thresholds)).toBe('CURRENT');
  });
});

describe('analyzeFreshness: the whole picture for one competency at a point in time', () => {
  const policy: DecayPolicy = { ...DEFAULT_DECAY_POLICY, halfLifeDays: 180, minimumSafeLevel: 40, recertificationIntervalDays: 365, criticality: 4 };

  const input: FreshnessInput = {
    baselineLevel: RADAR_BASELINE,
    requiredLevel: 80,
    lastPracticedAt: at('2026-01-01T00:00:00Z'),
    lastAssessedAt: at('2026-01-01T00:00:00Z'),
    policy,
  };

  it('reproduces the demo: 72% practised 90 days ago becomes about 51% and is AT RISK', () => {
    const result = analyzeFreshness(input, at('2026-04-01T00:00:00Z'), config);
    expect(result.daysSincePractice).toBe(90);
    expect(result.effectiveLevel).toBe(51);
    expect(result.status).toBe('AT_RISK');
    expect(result.decayPoints).toBe(21);
  });

  it('explains itself in words a trainee can act on', () => {
    const { reason } = analyzeFreshness(input, at('2026-04-01T00:00:00Z'), config);
    expect(reason).toContain('90 days');
    expect(reason).toContain('180');
    expect(reason).toContain('51%');
    expect(reason).toContain('80%');
  });

  it('does not decay a competency whose policy has decay switched off', () => {
    const result = analyzeFreshness({ ...input, policy: { ...policy, decayEnabled: false } }, at('2026-04-01T00:00:00Z'), config);
    expect(result.effectiveLevel).toBe(RADAR_BASELINE);
    expect(result.decayPoints).toBe(0);
    expect(result.status).toBe('WATCH'); // still 8 points below the requirement, but not from decay
    expect(result.reason).toContain('not configured to decay');
  });

  it('does not decay anything when decay is switched off for the whole installation', () => {
    const off: EngineConfig = { ...config, decay: { ...config.decay, enabled: false } };
    const result = analyzeFreshness(input, at('2026-04-01T00:00:00Z'), off);
    expect(result.effectiveLevel).toBe(RADAR_BASELINE);
    expect(result.decayPoints).toBe(0);
  });

  it('falls back to the assessment date when the competency has never been practised', () => {
    const result = analyzeFreshness({ ...input, lastPracticedAt: null }, at('2026-04-01T00:00:00Z'), config);
    expect(result.daysSincePractice).toBe(90);
    expect(result.effectiveLevel).toBe(51);
  });

  it('cannot decay a competency with no evidence at all: there is nothing to decay from', () => {
    const result = analyzeFreshness({ ...input, lastPracticedAt: null, lastAssessedAt: null }, at('2026-04-01T00:00:00Z'), config);
    expect(result.daysSincePractice).toBeNull();
    expect(result.effectiveLevel).toBe(RADAR_BASELINE);
    expect(result.reason).toContain('no recorded evidence');
  });

  it('reports the recertification date and marks it expired once passed', () => {
    const result = analyzeFreshness(input, at('2027-06-01T00:00:00Z'), config);
    expect(result.recertificationDueAt?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(result.daysUntilRecertification).toBe(-151);
    expect(result.status).toBe('EXPIRED');
    expect(result.reason).toContain('recertification');
  });

  it('needs a refresher exactly when the status is AT_RISK, CRITICAL or EXPIRED', () => {
    const today = analyzeFreshness(input, at('2026-01-01T00:00:00Z'), config);
    expect(today.status).toBe('WATCH');
    expect(today.needsRefresher).toBe(false);
    expect(analyzeFreshness(input, at('2026-04-01T00:00:00Z'), config).needsRefresher).toBe(true);
  });

  it('is a pure function of the "as of" date: the same inputs always give the same answer', () => {
    const first = analyzeFreshness(input, at('2026-04-01T00:00:00Z'), config);
    const second = analyzeFreshness(input, at('2026-04-01T00:00:00Z'), config);
    expect(second).toEqual(first);
  });

  it('decays further the later the simulated date, and never below zero', () => {
    const levels = ['2026-04-01', '2026-07-01', '2027-01-01', '2030-01-01'].map(
      (day) => analyzeFreshness(input, at(`${day}T00:00:00Z`), config).effectiveLevel,
    );
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(levels.at(-1)).toBeGreaterThanOrEqual(0);
  });
});
