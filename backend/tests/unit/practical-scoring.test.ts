import { describe, expect, it } from 'vitest';
import { combineScores, scoreScenarios, type ScorableStep } from '../../src/modules/assessments/scoring';

/**
 * Scenario marking and the weighted final score.
 *
 * The brief's worked example: MCQ 84%, practical 78%, weighted 60/40, giving
 * 84 x 0.6 + 78 x 0.4 = 81.6%.
 */
const steps: ScorableStep[] = [
  {
    id: 'identify',
    scenarioId: 'cyclone',
    marks: 4,
    options: [
      { id: 'best', credit: 1 },
      { id: 'defensible', credit: 0.5 },
      { id: 'wrong', credit: 0 },
    ],
  },
  {
    id: 'action',
    scenarioId: 'cyclone',
    marks: 6,
    options: [
      { id: 'act-best', credit: 1 },
      { id: 'act-partial', credit: 0.25 },
      { id: 'act-wrong', credit: 0 },
    ],
  },
];

describe('scoreScenarios', () => {
  it('awards full marks for the best decision at every step', () => {
    const result = scoreScenarios(steps, new Map([['identify', 'best'], ['action', 'act-best']]));
    expect(result.score).toBe(10);
    expect(result.totalMarks).toBe(10);
    expect(result.percentage).toBe(100);
  });

  it('awards part marks for a defensible but suboptimal decision', () => {
    const result = scoreScenarios(steps, new Map([['identify', 'defensible'], ['action', 'act-partial']]));
    expect(result.perStep[0]).toMatchObject({ creditAwarded: 0.5, marksAwarded: 2 });
    expect(result.perStep[1]).toMatchObject({ creditAwarded: 0.25, marksAwarded: 1.5 });
    expect(result.score).toBe(3.5);
    expect(result.percentage).toBe(35);
  });

  it('awards nothing for a wrong decision, and nothing for no decision', () => {
    const wrong = scoreScenarios(steps, new Map([['identify', 'wrong'], ['action', 'act-wrong']]));
    expect(wrong.score).toBe(0);
    const unanswered = scoreScenarios(steps, new Map());
    expect(unanswered.score).toBe(0);
    expect(unanswered.perStep.every((step) => step.selectedOptionId === null)).toBe(true);
  });

  it('ignores a choice that does not belong to the step', () => {
    const result = scoreScenarios(steps, new Map([['identify', 'act-best']]));
    expect(result.perStep[0]).toMatchObject({ selectedOptionId: null, marksAwarded: 0 });
  });

  it('clamps a credit outside 0..1 rather than trusting it', () => {
    const odd: ScorableStep[] = [{ id: 's', scenarioId: 'x', marks: 10, options: [{ id: 'over', credit: 5 }, { id: 'under', credit: -3 }] }];
    expect(scoreScenarios(odd, new Map([['s', 'over']])).score).toBe(10); // credit 5 is treated as 1
    expect(scoreScenarios(odd, new Map([['s', 'under']])).score).toBe(0); // credit -3 is treated as 0
  });

  it('reports zero rather than dividing by zero when there are no steps', () => {
    expect(scoreScenarios([], new Map())).toMatchObject({ score: 0, totalMarks: 0, percentage: 0 });
  });

  it('keeps each step attached to its scenario, so a result can be shown per scenario', () => {
    const result = scoreScenarios(steps, new Map([['identify', 'best']]));
    expect(result.perStep.map((step) => step.scenarioId)).toEqual(['cyclone', 'cyclone']);
  });
});

describe('combineScores', () => {
  it('reproduces the worked example: MCQ 84%, practical 78%, 60/40 gives 81.6%', () => {
    const combined = combineScores(84, 78, 0.6);
    expect(combined.percentage).toBe(81.6);
    expect(combined.mcqWeight).toBe(0.6);
    expect(combined.practicalWeight).toBe(0.4);
  });

  it('honours a different weighting', () => {
    expect(combineScores(84, 78, 0.4).percentage).toBe(80.4); // 84 x 0.4 + 78 x 0.6
  });

  it('scores on the questions alone when the assessment has no scenarios', () => {
    const combined = combineScores(84, null, 0.6);
    expect(combined.percentage).toBe(84);
    expect(combined.practicalPercentage).toBeNull();
    expect(combined.mcqWeight).toBe(1);
    expect(combined.explanation).toContain('questions alone');
  });

  it('explains the calculation in the words the result page shows', () => {
    expect(combineScores(84, 78, 0.6).explanation).toBe('Questions 84% x 60% + practical 78% x 40% = 81.6%.');
  });

  it('handles the extremes: all practical, or all questions', () => {
    expect(combineScores(10, 90, 0).percentage).toBe(90);
    expect(combineScores(10, 90, 1).percentage).toBe(10);
  });

  it('clamps a weight outside 0..1', () => {
    expect(combineScores(10, 90, 5).percentage).toBe(10);
    expect(combineScores(10, 90, -2).percentage).toBe(90);
  });
});
