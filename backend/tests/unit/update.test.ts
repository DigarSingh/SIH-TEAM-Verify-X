import { describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../../src/modules/competencies/engine/config';
import { EVALUATION_CRITERIA, weightedEvaluationScore, type EvaluationRatings } from '../../src/modules/competencies/engine/evaluation';
import { computeCompetencyUpdate } from '../../src/modules/competencies/engine/update';

const config = DEFAULT_ENGINE_CONFIG;
const withUpdate = (update: Partial<EngineConfig['update']>): EngineConfig => ({ ...config, update: { ...config.update, ...update } });

describe('competency update engine', () => {
  it('reproduces the example from the brief: previous 35 + assessment 84 → 72 (not 84)', () => {
    const result = computeCompetencyUpdate({ previousLevel: 35, assessmentScore: 84 }, config);
    expect(result.blended).toBe(71.75);
    expect(result.newLevel).toBe(72);
    expect(result.newLevel).not.toBe(84);
    expect(result.changed).toBe(true);
    expect(result.explanation).toContain('72%');
  });

  it('reproduces the "35% → 52% → 72%" timeline as two successive updates', () => {
    const first = computeCompetencyUpdate({ previousLevel: 35, trainerEvaluationScore: 58 }, config);
    expect(first.newLevel).toBe(52);
    const second = computeCompetencyUpdate({ previousLevel: first.newLevel, assessmentScore: 79 }, config);
    expect(second.newLevel).toBe(72);
  });

  it('blends several evidence sources with renormalised weights', () => {
    const result = computeCompetencyUpdate({ previousLevel: 52, assessmentScore: 84, trainerEvaluationScore: 58 }, config);
    // evidence = (0.60 × 84 + 0.25 × 58) / 0.85 = 76.35 ; blended = 0.25 × 52 + 0.75 × 76.35 = 70.26
    expect(result.evidence).toBeCloseTo(76.35, 2);
    expect(result.newLevel).toBe(70);
    expect(result.components.map((c) => c.source)).toEqual(['assessment', 'trainerEvaluation']);
    expect(result.components.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(1, 10);
  });

  it('uses assessment + trainer evaluation + practical assessment when all are present', () => {
    const result = computeCompetencyUpdate({ previousLevel: 40, assessmentScore: 84, trainerEvaluationScore: 80, practicalScore: 70 }, config);
    // evidence = 0.6 × 84 + 0.25 × 80 + 0.15 × 70 = 80.9 ; blended = 0.25 × 40 + 0.75 × 80.9 = 70.675
    expect(result.evidence).toBeCloseTo(80.9, 2);
    expect(result.newLevel).toBe(71);
  });

  it('does not depend on the MCQ alone: a weaker trainer evaluation changes the outcome', () => {
    const mcqOnly = computeCompetencyUpdate({ previousLevel: 40, assessmentScore: 90 }, config);
    const withTrainer = computeCompetencyUpdate({ previousLevel: 40, assessmentScore: 90, trainerEvaluationScore: 50 }, config);
    expect(withTrainer.newLevel).toBeLessThan(mcqOnly.newLevel);
  });

  it('leaves the level unchanged when there is no evidence', () => {
    const result = computeCompetencyUpdate({ previousLevel: 61 }, config);
    expect(result).toMatchObject({ newLevel: 61, changed: false, evidence: null, limitedBy: 'no-evidence' });
  });

  it('ignores evidence sources whose configured weight is zero', () => {
    const cfg = withUpdate({ inputWeights: { assessment: 1, trainerEvaluation: 0, practical: 0 } });
    const result = computeCompetencyUpdate({ previousLevel: 40, assessmentScore: 80, trainerEvaluationScore: 10 }, cfg);
    expect(result.components).toHaveLength(1);
    expect(result.newLevel).toBe(Math.round(0.25 * 40 + 0.75 * 80));
  });

  it('never lowers an existing level by default (a weak result is not a demotion)', () => {
    const result = computeCompetencyUpdate({ previousLevel: 80, assessmentScore: 50 }, config);
    expect(result.newLevel).toBe(80);
    expect(result.limitedBy).toBe('no-decrease');
    expect(result.changed).toBe(false);
  });

  it('can lower the level when decreases are enabled', () => {
    const result = computeCompetencyUpdate({ previousLevel: 80, assessmentScore: 50 }, withUpdate({ allowDecrease: true }));
    expect(result.newLevel).toBe(58); // round(0.25 × 80 + 0.75 × 50 = 57.5)
    expect(result.changed).toBe(true);
  });

  it('caps the gain at the level the course certifies', () => {
    const result = computeCompetencyUpdate({ previousLevel: 35, assessmentScore: 100, ceiling: 60 }, config);
    expect(result.blended).toBe(83.75);
    expect(result.newLevel).toBe(60);
    expect(result.limitedBy).toBe('course-ceiling');
    expect(result.explanation).toContain('capped');
  });

  it('a ceiling below the current level never pulls the level down', () => {
    const result = computeCompetencyUpdate({ previousLevel: 70, assessmentScore: 100, ceiling: 50 }, config);
    expect(result.newLevel).toBe(70);
    expect(result.changed).toBe(false);
  });

  it('ignores the ceiling when capping is switched off', () => {
    const result = computeCompetencyUpdate({ previousLevel: 35, assessmentScore: 100, ceiling: 60 }, withUpdate({ capAtCourseTarget: false }));
    expect(result.newLevel).toBe(84);
  });

  it('honours a configurable previous-performance weight', () => {
    const result = computeCompetencyUpdate({ previousLevel: 35, assessmentScore: 84 }, withUpdate({ previousWeight: 0.5 }));
    expect(result.newLevel).toBe(60); // round(0.5 × 35 + 0.5 × 84 = 59.5)
  });

  it('keeps the result within 0-100 and clamps out-of-range scores', () => {
    expect(computeCompetencyUpdate({ previousLevel: 99, assessmentScore: 250 }, config).newLevel).toBe(100);
    expect(computeCompetencyUpdate({ previousLevel: 0, assessmentScore: -40 }, withUpdate({ allowDecrease: true })).newLevel).toBe(0);
  });
});

describe('weighted trainer evaluation', () => {
  const ratings = (value: number): EvaluationRatings =>
    Object.fromEntries(EVALUATION_CRITERIA.map((criterion) => [criterion, value])) as EvaluationRatings;

  it('maps ratings of 5 to 100 and 1 to 20', () => {
    expect(weightedEvaluationScore(ratings(5), config.evaluationWeights)).toBe(100);
    expect(weightedEvaluationScore(ratings(1), config.evaluationWeights)).toBe(20);
  });

  it('applies the configured criterion weights', () => {
    const mixed: EvaluationRatings = { technicalKnowledge: 4, practicalAbility: 3, participation: 5, applicationOfKnowledge: 4, overallCompetency: 4 };
    // 0.30 × 80 + 0.25 × 60 + 0.10 × 100 + 0.20 × 80 + 0.15 × 80 = 77
    expect(weightedEvaluationScore(mixed, config.evaluationWeights)).toBe(77);
  });

  it('changes when the weights change', () => {
    const mixed: EvaluationRatings = { technicalKnowledge: 5, practicalAbility: 1, participation: 1, applicationOfKnowledge: 1, overallCompetency: 1 };
    const technicalHeavy = { technicalKnowledge: 0.8, practicalAbility: 0.05, participation: 0.05, applicationOfKnowledge: 0.05, overallCompetency: 0.05 };
    expect(weightedEvaluationScore(mixed, technicalHeavy)).toBeGreaterThan(weightedEvaluationScore(mixed, config.evaluationWeights));
  });
});
