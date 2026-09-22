import type { EngineConfig } from './config';

export const EVALUATION_CRITERIA = [
  'technicalKnowledge',
  'practicalAbility',
  'participation',
  'applicationOfKnowledge',
  'overallCompetency',
] as const;

export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];
export type EvaluationRatings = Record<EvaluationCriterion, number>;

export const EVALUATION_LABELS: Record<EvaluationCriterion, string> = {
  technicalKnowledge: 'Technical knowledge',
  practicalAbility: 'Practical ability',
  participation: 'Participation',
  applicationOfKnowledge: 'Application of knowledge',
  overallCompetency: 'Overall competency',
};

/**
 * Weighted trainer-evaluation score on a 0-100 scale.
 * Each criterion is rated 1-5; a rating is converted to a percentage (rating / 5)
 * and the criteria are combined with the configured weights (which sum to 1).
 */
export function weightedEvaluationScore(ratings: EvaluationRatings, weights: EngineConfig['evaluationWeights']): number {
  const total = EVALUATION_CRITERIA.reduce((sum, criterion) => sum + (ratings[criterion] / 5) * 100 * weights[criterion], 0);
  return Math.round(Math.min(100, Math.max(0, total)) * 10) / 10;
}
