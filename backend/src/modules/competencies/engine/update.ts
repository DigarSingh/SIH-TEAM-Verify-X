import type { EngineConfig } from './config';

export interface CompetencyUpdateInput {
  /** Current recorded level, 0-100. */
  previousLevel: number;
  /** Assessment score in percent (0-100), when there is assessment evidence. */
  assessmentScore?: number | null;
  /** Weighted trainer-evaluation score (0-100). */
  trainerEvaluationScore?: number | null;
  /** Weighted practical-assessment score (0-100). */
  practicalScore?: number | null;
  /** Highest level this course may certify (`CourseCompetency.levelTo`), when capping applies. */
  ceiling?: number | null;
}

export interface EvidenceComponent {
  source: 'assessment' | 'trainerEvaluation' | 'practical';
  score: number;
  /** Configured relative weight. */
  weight: number;
  /** Share of the evidence after renormalising over the available sources (sums to 1). */
  share: number;
}

export interface CompetencyUpdateResult {
  previousLevel: number;
  newLevel: number;
  changed: boolean;
  /** Blend of the available evidence sources (null when there is no evidence). */
  evidence: number | null;
  components: EvidenceComponent[];
  /** Result of the blend before decrease/ceiling rules were applied. */
  blended: number | null;
  /** Which rule, if any, limited the change. */
  limitedBy: 'none' | 'no-decrease' | 'course-ceiling' | 'no-evidence';
  explanation: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isNumber = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

const SOURCE_LABELS: Record<EvidenceComponent['source'], string> = {
  assessment: 'assessment',
  trainerEvaluation: 'trainer evaluation',
  practical: 'practical assessment',
};

/**
 * The configurable competency update rule. It deliberately does NOT set
 * competency = exam score.
 *
 *   evidence = weighted average of the available evidence sources
 *              (assessment, trainer evaluation, practical assessment),
 *              renormalised over the sources that are actually present
 *   blended  = previousWeight × previous + (1 − previousWeight) × evidence
 *
 * then optional guard-rails: a weak result never lowers the level (unless allowed)
 * and a course cannot lift a learner past the level it certifies (`ceiling`).
 *
 * Worked example with the defaults: previous 35, assessment 84 →
 *   0.25 × 35 + 0.75 × 84 = 71.75 → 72.
 */
export function computeCompetencyUpdate(input: CompetencyUpdateInput, config: EngineConfig): CompetencyUpdateResult {
  const previous = clamp(Math.round(input.previousLevel), 0, 100);
  const { previousWeight, inputWeights } = config.update;

  const candidates: { source: EvidenceComponent['source']; score: number | null | undefined; weight: number }[] = [
    { source: 'assessment', score: input.assessmentScore, weight: inputWeights.assessment },
    { source: 'trainerEvaluation', score: input.trainerEvaluationScore, weight: inputWeights.trainerEvaluation },
    { source: 'practical', score: input.practicalScore, weight: inputWeights.practical },
  ];
  const present = candidates.filter((candidate) => isNumber(candidate.score) && candidate.weight > 0);
  const totalWeight = present.reduce((sum, candidate) => sum + candidate.weight, 0);

  if (present.length === 0 || totalWeight <= 0) {
    return {
      previousLevel: previous,
      newLevel: previous,
      changed: false,
      evidence: null,
      components: [],
      blended: null,
      limitedBy: 'no-evidence',
      explanation: 'No usable evidence was available, so the competency level was left unchanged.',
    };
  }

  const components: EvidenceComponent[] = present.map((candidate) => ({
    source: candidate.source,
    score: clamp(candidate.score as number, 0, 100),
    weight: candidate.weight,
    share: candidate.weight / totalWeight,
  }));
  const evidence = components.reduce((sum, component) => sum + component.score * component.share, 0);
  const blended = previousWeight * previous + (1 - previousWeight) * evidence;

  let result = blended;
  let limitedBy: CompetencyUpdateResult['limitedBy'] = 'none';
  if (!config.update.allowDecrease && result < previous) {
    result = previous;
    limitedBy = 'no-decrease';
  }
  if (config.update.capAtCourseTarget && isNumber(input.ceiling)) {
    // A ceiling below the current level never pulls the level down: it only stops further gains.
    const cap = Math.max(input.ceiling, previous);
    if (result > cap) {
      result = cap;
      limitedBy = 'course-ceiling';
    }
  }

  const newLevel = clamp(Math.round(result), 0, 100);
  const sources = components.map((c) => `${SOURCE_LABELS[c.source]} ${Math.round(c.score * 10) / 10}%`).join(', ');
  const formula = `${Math.round(previousWeight * 100)}% × previous ${previous} + ${Math.round((1 - previousWeight) * 100)}% × evidence ${Math.round(evidence * 10) / 10} (${sources}) = ${Math.round(blended * 100) / 100}`;
  const limits: Record<CompetencyUpdateResult['limitedBy'], string> = {
    none: '',
    'no-evidence': '',
    'no-decrease': ' A weaker result does not lower an existing competency level.',
    'course-ceiling': ` This course certifies competency up to ${input.ceiling}%, so the level was capped there.`,
  };

  return {
    previousLevel: previous,
    newLevel,
    changed: newLevel !== previous,
    evidence: Math.round(evidence * 100) / 100,
    components,
    blended: Math.round(blended * 100) / 100,
    limitedBy,
    explanation: `${formula} → ${newLevel}%.${limits[limitedBy]}`,
  };
}
