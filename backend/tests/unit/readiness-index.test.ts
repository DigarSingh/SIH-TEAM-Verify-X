import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../../src/modules/competencies/engine/config';
import { bandFor, calculateReadinessIndex, continuityScore, freshnessScore, type ReadinessIndexInput } from '../../src/modules/readiness/readiness-index';

const config = DEFAULT_ENGINE_CONFIG;

const perfect: ReadinessIndexInput = {
  coverage: 100,
  freshnessCounts: { CURRENT: 100, WATCH: 0, AT_RISK: 0, CRITICAL: 0, EXPIRED: 0 },
  riskCounts: { LOW: 10, WATCH: 0, HIGH: 0, CRITICAL: 0 },
  criticalGaps: 0,
  totalRequirements: 100,
};

describe('freshnessScore', () => {
  it('is 100 when everything is current', () => {
    expect(freshnessScore({ CURRENT: 10, WATCH: 0, AT_RISK: 0, CRITICAL: 0, EXPIRED: 0 })).toBe(100);
  });

  it('counts a watched competency as half: usable, but needing attention', () => {
    expect(freshnessScore({ CURRENT: 0, WATCH: 10, AT_RISK: 0, CRITICAL: 0, EXPIRED: 0 })).toBe(50);
  });

  it('gives no credit for at-risk, critical or expired competencies', () => {
    expect(freshnessScore({ CURRENT: 0, WATCH: 0, AT_RISK: 5, CRITICAL: 3, EXPIRED: 2 })).toBe(0);
  });

  it('is 100 rather than a division by zero when there is nothing to measure', () => {
    expect(freshnessScore({ CURRENT: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0, EXPIRED: 0 })).toBe(100);
  });
});

describe('continuityScore', () => {
  it('rewards low risk and half-credits a watch', () => {
    expect(continuityScore({ LOW: 8, WATCH: 0, HIGH: 0, CRITICAL: 0 })).toBe(100);
    expect(continuityScore({ LOW: 0, WATCH: 8, HIGH: 0, CRITICAL: 0 })).toBe(50);
    expect(continuityScore({ LOW: 0, WATCH: 0, HIGH: 4, CRITICAL: 4 })).toBe(0);
  });

  it('is 100 when no competency has been assessed for continuity', () => {
    expect(continuityScore({ LOW: 0, WATCH: 0, HIGH: 0, CRITICAL: 0 })).toBe(100);
  });
});

describe('bandFor', () => {
  it.each([
    [95, 'STRONG'],
    [85, 'STRONG'],
    [84.9, 'ADEQUATE'],
    [70, 'ADEQUATE'],
    [69, 'FRAGILE'],
    [50, 'FRAGILE'],
    [49, 'AT_RISK'],
    [0, 'AT_RISK'],
  ])('puts %s in the %s band', (score, expected) => {
    expect(bandFor(score, config.readinessIndex).band).toBe(expected);
  });
});

describe('calculateReadinessIndex', () => {
  it('is 100 for an organisation that is fully covered, fresh and well succeeded', () => {
    const index = calculateReadinessIndex(perfect, config);
    expect(index.score).toBe(100);
    expect(index.band).toBe('STRONG');
  });

  it('combines the three components with the configured weights', () => {
    const index = calculateReadinessIndex(
      {
        ...perfect,
        coverage: 80,
        freshnessCounts: { CURRENT: 50, WATCH: 0, AT_RISK: 50, CRITICAL: 0, EXPIRED: 0 },
        riskCounts: { LOW: 5, WATCH: 0, HIGH: 5, CRITICAL: 0 },
      },
      config,
    );
    // 80 x 0.5 + 50 x 0.3 + 50 x 0.2 = 40 + 15 + 10 = 65
    expect(index.components).toMatchObject({ coverage: 80, freshness: 50, continuity: 50 });
    expect(index.score).toBe(65);
    expect(index.band).toBe('FRAGILE');
  });

  it('deducts for critical gaps, which an average would otherwise hide', () => {
    const withGaps = calculateReadinessIndex({ ...perfect, criticalGaps: 10 }, config);
    // 10 of 100 requirements critical: 10% x 1.5 = 15 points off.
    expect(withGaps.components.criticalGapPenalty).toBe(15);
    expect(withGaps.score).toBe(85);
  });

  it('caps the penalty so it cannot swamp the whole index', () => {
    const index = calculateReadinessIndex({ ...perfect, criticalGaps: 100 }, config);
    expect(index.components.criticalGapPenalty).toBe(config.readinessIndex.maxCriticalGapPenalty);
    expect(index.score).toBe(75);
  });

  it('never reports below zero or above one hundred', () => {
    const floor = calculateReadinessIndex(
      { coverage: 0, freshnessCounts: { CURRENT: 0, WATCH: 0, AT_RISK: 10, CRITICAL: 0, EXPIRED: 0 }, riskCounts: { LOW: 0, WATCH: 0, HIGH: 0, CRITICAL: 5 }, criticalGaps: 50, totalRequirements: 50 },
      config,
    );
    expect(floor.score).toBe(0);
    expect(calculateReadinessIndex({ ...perfect, coverage: 200 }, config).score).toBe(100);
  });

  it('writes the calculation out so the number can be checked by hand', () => {
    const index = calculateReadinessIndex({ ...perfect, coverage: 80 }, config);
    expect(index.explanation).toContain('Coverage 80 x 50%');
    expect(index.explanation).toContain('freshness 100 x 30%');
    expect(index.explanation).toContain('continuity 100 x 20%');
    expect(index.explanation).toContain('out of 100');
  });

  it('respects a changed configuration rather than any built-in constant', () => {
    const coverageOnly: EngineConfig = { ...config, readinessIndex: { ...config.readinessIndex, coverage: 1, freshness: 0, continuity: 0 } };
    const index = calculateReadinessIndex(
      { ...perfect, coverage: 60, freshnessCounts: { CURRENT: 0, WATCH: 0, AT_RISK: 10, CRITICAL: 0, EXPIRED: 0 } },
      coverageOnly,
    );
    expect(index.score).toBe(60);
  });

  it('handles an empty organisation without dividing by zero', () => {
    const index = calculateReadinessIndex(
      { coverage: 0, freshnessCounts: { CURRENT: 0, WATCH: 0, AT_RISK: 0, CRITICAL: 0, EXPIRED: 0 }, riskCounts: { LOW: 0, WATCH: 0, HIGH: 0, CRITICAL: 0 }, criticalGaps: 0, totalRequirements: 0 },
      config,
    );
    expect(index.score).toBe(50); // no coverage, but nothing stale or at risk either
    expect(Number.isFinite(index.score)).toBe(true);
  });
});
