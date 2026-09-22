import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG, engineConfigSchema, mergeEngineConfig, type EngineConfig } from '../../src/modules/competencies/engine/config';
import {
  analyzeSkillGap,
  calculateGap,
  classifyPriority,
  classifySeverity,
  priorityScore,
  rankGaps,
  summarizeGaps,
  type GapInput,
} from '../../src/modules/competencies/engine/skill-gap';

const config = DEFAULT_ENGINE_CONFIG;

const radar: GapInput = {
  competencyId: 'radar',
  competencyCode: 'RADAR',
  competencyName: 'Radar Meteorology',
  category: 'Core Operations',
  requiredLevel: 80,
  currentLevel: 35,
  importance: 4,
  roleCriticality: 4,
};

describe('skill gap = required - current', () => {
  it('reproduces the example from the brief (required 80, current 35 → gap 45)', () => {
    expect(calculateGap(80, 35)).toBe(45);
  });

  it('is never negative: exceeding the requirement is "no gap"', () => {
    expect(calculateGap(70, 85)).toBe(0);
    expect(calculateGap(70, 70)).toBe(0);
  });
});

describe('severity classification', () => {
  it.each([
    [0, 'LOW'],
    [10, 'LOW'],
    [11, 'MODERATE'],
    [25, 'MODERATE'],
    [26, 'HIGH'],
    [45, 'HIGH'],
    [50, 'HIGH'],
    [51, 'CRITICAL'],
    [100, 'CRITICAL'],
  ] as const)('gap %i is %s (0-10 Low, 11-25 Moderate, 26-50 High, 51+ Critical)', (gap, expected) => {
    expect(classifySeverity(gap, config.severity)).toBe(expected);
  });

  it('honours configurable thresholds', () => {
    const custom = { lowMax: 5, moderateMax: 15, highMax: 30 };
    expect(classifySeverity(5, custom)).toBe('LOW');
    expect(classifySeverity(6, custom)).toBe('MODERATE');
    expect(classifySeverity(16, custom)).toBe('HIGH');
    expect(classifySeverity(31, custom)).toBe('CRITICAL');
  });
});

describe('training priority = gap × importance × role criticality (normalised 0-100)', () => {
  it('normalises against the maximum possible product', () => {
    expect(priorityScore(100, 5, 5)).toBe(100);
    expect(priorityScore(0, 5, 5)).toBe(0);
    expect(priorityScore(50, 5, 5)).toBe(50);
    expect(priorityScore(50, 1, 1)).toBe(2);
  });

  it('computes the radar example: 45 × (4/5) × (4/5) = 28.8', () => {
    expect(priorityScore(45, 4, 4)).toBe(28.8);
  });

  it('scales with both importance and role criticality', () => {
    expect(priorityScore(40, 5, 5)).toBeGreaterThan(priorityScore(40, 3, 5));
    expect(priorityScore(40, 5, 5)).toBeGreaterThan(priorityScore(40, 5, 2));
  });

  it('clamps out-of-range inputs instead of producing scores outside 0-100', () => {
    expect(priorityScore(500, 9, 9)).toBe(100);
    expect(priorityScore(-20, 3, 3)).toBe(0);
  });

  it.each([
    [0, 'LOW'],
    [11.9, 'LOW'],
    [12, 'MEDIUM'],
    [24.9, 'MEDIUM'],
    [25, 'HIGH'],
    [44.9, 'HIGH'],
    [45, 'CRITICAL'],
    [100, 'CRITICAL'],
  ] as const)('priority score %s is %s', (score, expected) => {
    expect(classifyPriority(score, config.priority)).toBe(expected);
  });
});

describe('analyzeSkillGap', () => {
  it('reproduces the Radar Meteorology example: current 35, required 80, gap 45, High priority', () => {
    const result = analyzeSkillGap(radar, config);
    expect(result).toMatchObject({ gap: 45, met: false, severity: 'HIGH', priorityScore: 28.8, priorityLevel: 'HIGH', criticalityLabel: 'High' });
  });

  it('explains the calculation in plain language', () => {
    const { reason } = analyzeSkillGap(radar, config);
    expect(reason).toContain('Radar Meteorology');
    expect(reason).toContain('35%');
    expect(reason).toContain('80%');
    expect(reason).toContain('45 points');
    expect(reason).toContain('importance 4/5');
    expect(reason).toContain('role criticality 4/5');
    expect(reason).toContain('28.8');
    expect(reason).toContain('High priority');
  });

  it('reports an met requirement without a gap', () => {
    const result = analyzeSkillGap({ ...radar, currentLevel: 82 }, config);
    expect(result).toMatchObject({ gap: 0, met: true, priorityScore: 0, priorityLevel: 'LOW' });
    expect(result.reason).toMatch(/requirement met/i);
  });

  it('uses the supplied configuration, not hard-coded values', () => {
    const strict: EngineConfig = { ...config, severity: { lowMax: 5, moderateMax: 10, highMax: 20 }, priority: { mediumMin: 5, highMin: 10, criticalMin: 20 } };
    const result = analyzeSkillGap(radar, strict);
    expect(result.severity).toBe('CRITICAL');
    expect(result.priorityLevel).toBe('CRITICAL');
  });
});

describe('ranking and summary', () => {
  const build = (name: string, current: number, importance: number, criticality: number) =>
    analyzeSkillGap({ ...radar, competencyId: name, competencyName: name, currentLevel: current, importance, roleCriticality: criticality }, config);

  it('ranks the highest priority first, then the larger gap, then name', () => {
    const ranked = rankGaps([build('B', 60, 3, 3), build('A', 35, 4, 4), build('C', 60, 3, 3)]);
    expect(ranked.map((gap) => gap.competencyName)).toEqual(['A', 'B', 'C']);
  });

  it('summarises severity and priority counts and flags who needs training', () => {
    const gaps = [build('a', 35, 4, 4), build('b', 75, 3, 3), build('c', 90, 3, 3)];
    const summary = summarizeGaps(gaps);
    expect(summary.totalCompetencies).toBe(3);
    expect(summary.met).toBe(1);
    expect(summary.withGap).toBe(2);
    expect(summary.bySeverity).toMatchObject({ HIGH: 1, LOW: 1 });
    expect(summary.averageGap).toBe(25);
    expect(summary.needsTraining).toBe(true);
    expect(summarizeGaps([build('c', 90, 3, 3)]).needsTraining).toBe(false);
    expect(summarizeGaps([]).averageGap).toBe(0);
  });
});

describe('engine configuration', () => {
  it('accepts the defaults', () => {
    expect(engineConfigSchema.safeParse(DEFAULT_ENGINE_CONFIG).success).toBe(true);
  });

  it('rejects non-increasing severity thresholds', () => {
    const bad = { ...config, severity: { lowMax: 30, moderateMax: 20, highMax: 50 } };
    expect(engineConfigSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects evaluation weights that do not add up to 1', () => {
    const bad = { ...config, evaluationWeights: { ...config.evaluationWeights, technicalKnowledge: 0.9 } };
    const result = engineConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('add up to 1');
  });

  it('rejects unknown keys (no silent typos)', () => {
    expect(engineConfigSchema.safeParse({ ...config, extra: true }).success).toBe(false);
  });

  it('fills missing options from the defaults so older stored configs keep working', () => {
    const merged = mergeEngineConfig({ severity: { lowMax: 8, moderateMax: 20, highMax: 40 } });
    expect(merged.severity).toEqual({ lowMax: 8, moderateMax: 20, highMax: 40 });
    expect(merged.update).toEqual(DEFAULT_ENGINE_CONFIG.update);
  });

  it('falls back to the defaults when a stored config is invalid', () => {
    expect(mergeEngineConfig({ severity: { lowMax: 90, moderateMax: 20, highMax: 40 } })).toEqual(DEFAULT_ENGINE_CONFIG);
    expect(mergeEngineConfig(null)).toEqual(DEFAULT_ENGINE_CONFIG);
  });
});
