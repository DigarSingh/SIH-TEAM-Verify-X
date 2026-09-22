import type { QuestionType } from '@prisma/client';

export interface ScorableQuestion {
  id: string;
  type: QuestionType;
  marks: number;
  options: { id: string; isCorrect: boolean }[];
}

export interface QuestionResult {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  marksAwarded: number;
}

export interface ScoreResult {
  perQuestion: QuestionResult[];
  score: number;
  totalMarks: number;
  /** 0-100, two decimals. */
  percentage: number;
}

/**
 * Automatic marking. A question earns its full marks only when the selected
 * options are EXACTLY the set of correct options (all-or-nothing, so a
 * multiple-answer question cannot be gamed by ticking every box).
 * Unanswered questions score 0. Selections that are not options of the question
 * are ignored for scoring (the API rejects them before this point).
 */
export function scoreAnswers(questions: ScorableQuestion[], answers: Map<string, string[]>): ScoreResult {
  const perQuestion: QuestionResult[] = questions.map((question) => {
    const optionIds = new Set(question.options.map((option) => option.id));
    const selected = [...new Set(answers.get(question.id) ?? [])].filter((id) => optionIds.has(id));
    const correct = new Set(question.options.filter((option) => option.isCorrect).map((option) => option.id));
    const isCorrect = selected.length > 0 && selected.length === correct.size && selected.every((id) => correct.has(id));
    return { questionId: question.id, selectedOptionIds: selected, isCorrect, marksAwarded: isCorrect ? question.marks : 0 };
  });

  const totalMarks = questions.reduce((sum, question) => sum + question.marks, 0);
  const score = perQuestion.reduce((sum, result) => sum + result.marksAwarded, 0);
  const percentage = totalMarks === 0 ? 0 : Math.round((score / totalMarks) * 10000) / 100;
  return { perQuestion, score, totalMarks, percentage };
}

export const isPassing = (percentage: number, passingScore: number): boolean => percentage >= passingScore;

// ---------------------------------------------------------------------------------------------
// Practical (scenario) marking
// ---------------------------------------------------------------------------------------------

/** One decision inside a scenario, with the credit each choice earns. */
export interface ScorableStep {
  id: string;
  scenarioId: string;
  marks: number;
  options: { id: string; credit: number }[];
}

export interface StepResult {
  stepId: string;
  scenarioId: string;
  selectedOptionId: string | null;
  /** Share of the step's marks earned, 0..1. */
  creditAwarded: number;
  marksAwarded: number;
}

export interface PracticalResult {
  perStep: StepResult[];
  score: number;
  totalMarks: number;
  /** 0-100, two decimals. */
  percentage: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Marks the practical component.
 *
 * Unlike a quiz question, a scenario choice can be partly right: a defensible but
 * suboptimal decision earns part of the marks, which is how operational judgement
 * actually works. An unanswered step earns nothing, and a choice that does not
 * belong to the step is treated as no answer.
 */
export function scoreScenarios(steps: ScorableStep[], answers: Map<string, string>): PracticalResult {
  const perStep: StepResult[] = steps.map((step) => {
    const selectedOptionId = answers.get(step.id) ?? null;
    const option = step.options.find((candidate) => candidate.id === selectedOptionId);
    const creditAwarded = option ? clamp01(option.credit) : 0;
    return {
      stepId: step.id,
      scenarioId: step.scenarioId,
      selectedOptionId: option ? (selectedOptionId as string) : null,
      creditAwarded: round2(creditAwarded),
      marksAwarded: round2(creditAwarded * step.marks),
    };
  });

  const totalMarks = steps.reduce((sum, step) => sum + step.marks, 0);
  const score = round2(perStep.reduce((sum, result) => sum + result.marksAwarded, 0));
  const percentage = totalMarks === 0 ? 0 : round2((score / totalMarks) * 100);
  return { perStep, score, totalMarks, percentage };
}

export interface CombinedScore {
  /** The final percentage the pass mark is applied to. */
  percentage: number;
  mcqPercentage: number;
  /** Null when the assessment has no scenarios. */
  practicalPercentage: number | null;
  mcqWeight: number;
  practicalWeight: number;
  /** The calculation in words, for the result page. */
  explanation: string;
}

/**
 * Combines the two components into the score the pass mark is applied to:
 *
 *   final = mcq x mcqWeight + practical x (1 - mcqWeight)
 *
 * An assessment with no scenarios is scored on its questions alone, whatever the
 * configured weight says, so adding the field cannot change an existing result.
 */
export function combineScores(mcqPercentage: number, practicalPercentage: number | null, mcqWeight: number): CombinedScore {
  if (practicalPercentage === null) {
    return {
      percentage: round2(mcqPercentage),
      mcqPercentage: round2(mcqPercentage),
      practicalPercentage: null,
      mcqWeight: 1,
      practicalWeight: 0,
      explanation: `Scored on the questions alone: ${round2(mcqPercentage)}%.`,
    };
  }
  const weight = clamp01(mcqWeight);
  const practicalWeight = round2(1 - weight);
  const percentage = round2(mcqPercentage * weight + practicalPercentage * (1 - weight));
  return {
    percentage,
    mcqPercentage: round2(mcqPercentage),
    practicalPercentage: round2(practicalPercentage),
    mcqWeight: round2(weight),
    practicalWeight,
    explanation:
      `Questions ${round2(mcqPercentage)}% x ${Math.round(weight * 100)}% + practical ${round2(practicalPercentage)}% x ${Math.round((1 - weight) * 100)}% ` +
      `= ${percentage}%.`,
  };
}

/** Small deterministic PRNG (mulberry32) so shuffles are repeatable from a seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit string hash (FNV-1a) used to derive shuffle seeds. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Fisher-Yates shuffle with an injectable random source; returns a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/**
 * Option order for one question inside one attempt. Deterministic in
 * (attemptId, questionId) so a page reload shows the same order without storing it.
 */
export function shuffledOptions<T>(options: readonly T[], attemptId: string, questionId: string): T[] {
  return shuffle(options, seededRandom(hashString(`${attemptId}:${questionId}`)));
}
