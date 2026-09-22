import { MAX_CRITICALITY, MAX_IMPORTANCE, type EngineConfig } from './config';

export type Severity = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const CRITICALITY_LABELS: Record<number, string> = { 1: 'Low', 2: 'Moderate', 3: 'Significant', 4: 'High', 5: 'Critical' };
export const IMPORTANCE_LABELS: Record<number, string> = { 1: 'Minor', 2: 'Supporting', 3: 'Important', 4: 'Major', 5: 'Essential' };

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Skill Gap = Required Competency - Current Competency (never negative:
 * exceeding the requirement is "no gap", not a negative gap).
 */
export function calculateGap(requiredLevel: number, currentLevel: number): number {
  return Math.max(0, requiredLevel - currentLevel);
}

/** 0-10 Low, 11-25 Moderate, 26-50 High, 51+ Critical (thresholds are configurable). */
export function classifySeverity(gap: number, thresholds: EngineConfig['severity']): Severity {
  if (gap <= thresholds.lowMax) return 'LOW';
  if (gap <= thresholds.moderateMax) return 'MODERATE';
  if (gap <= thresholds.highMax) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Training Priority = Skill Gap x Competency Importance x Role Criticality,
 * normalised to 0-100 by dividing by the largest possible product
 * (100 x 5 x 5). Equivalent to gap x (importance/5) x (criticality/5).
 */
export function priorityScore(gap: number, importance: number, criticality: number): number {
  const importanceFactor = clamp(importance, 1, MAX_IMPORTANCE) / MAX_IMPORTANCE;
  const criticalityFactor = clamp(criticality, 1, MAX_CRITICALITY) / MAX_CRITICALITY;
  return round1(clamp(gap, 0, 100) * importanceFactor * criticalityFactor);
}

export function classifyPriority(score: number, thresholds: EngineConfig['priority']): PriorityLevel {
  if (score >= thresholds.criticalMin) return 'CRITICAL';
  if (score >= thresholds.highMin) return 'HIGH';
  if (score >= thresholds.mediumMin) return 'MEDIUM';
  return 'LOW';
}

const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

export interface GapInput {
  competencyId: string;
  competencyCode: string;
  competencyName: string;
  category: string;
  requiredLevel: number;
  currentLevel: number;
  /** Importance of the competency for the employee's role, 1-5. */
  importance: number;
  /** Criticality of the employee's role, 1-5. */
  roleCriticality: number;
}

export interface SkillGap extends GapInput {
  gap: number;
  /** True when the requirement is met or exceeded. */
  met: boolean;
  severity: Severity;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  importanceLabel: string;
  criticalityLabel: string;
  /** Human-readable explanation of the priority (the calculation, spelled out). */
  reason: string;
}

/** Full, explainable analysis of one competency for one employee. */
export function analyzeSkillGap(input: GapInput, config: EngineConfig): SkillGap {
  const gap = calculateGap(input.requiredLevel, input.currentLevel);
  const severity = classifySeverity(gap, config.severity);
  const score = priorityScore(gap, input.importance, input.roleCriticality);
  const priorityLevel = classifyPriority(score, config.priority);
  const importanceLabel = IMPORTANCE_LABELS[input.importance] ?? String(input.importance);
  const criticalityLabel = CRITICALITY_LABELS[input.roleCriticality] ?? String(input.roleCriticality);
  const met = gap === 0;

  const reason = met
    ? `${input.competencyName}: requirement met (${input.currentLevel}% against a required ${input.requiredLevel}%). No training needed.`
    : `${input.competencyName}: you are at ${input.currentLevel}% and your role requires ${input.requiredLevel}%, a gap of ${gap} points (${titleCase(severity)} severity). ` +
      `Priority = gap ${gap} × importance ${input.importance}/${MAX_IMPORTANCE} (${importanceLabel}) × role criticality ${input.roleCriticality}/${MAX_CRITICALITY} (${criticalityLabel}) ` +
      `= ${score} out of 100, which is ${titleCase(priorityLevel)} priority.`;

  return { ...input, gap, met, severity, priorityScore: score, priorityLevel, importanceLabel, criticalityLabel, reason };
}

/** Highest training priority first; ties broken by larger gap, then name (stable, deterministic). */
export function rankGaps<T extends Pick<SkillGap, 'priorityScore' | 'gap' | 'competencyName'>>(gaps: T[]): T[] {
  return [...gaps].sort(
    (a, b) => b.priorityScore - a.priorityScore || b.gap - a.gap || a.competencyName.localeCompare(b.competencyName),
  );
}

export interface GapSummary {
  totalCompetencies: number;
  met: number;
  withGap: number;
  averageGap: number;
  bySeverity: Record<Severity, number>;
  byPriority: Record<PriorityLevel, number>;
  /** Employee needs training: at least one HIGH/CRITICAL priority gap. */
  needsTraining: boolean;
}

export function summarizeGaps(gaps: SkillGap[]): GapSummary {
  const bySeverity: Record<Severity, number> = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
  const byPriority: Record<PriorityLevel, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let met = 0;
  let gapTotal = 0;
  for (const gap of gaps) {
    if (gap.met) {
      met += 1;
      continue;
    }
    bySeverity[gap.severity] += 1;
    byPriority[gap.priorityLevel] += 1;
    gapTotal += gap.gap;
  }
  const withGap = gaps.length - met;
  return {
    totalCompetencies: gaps.length,
    met,
    withGap,
    averageGap: withGap === 0 ? 0 : round1(gapTotal / withGap),
    bySeverity,
    byPriority,
    needsTraining: gaps.some((gap) => !gap.met && (gap.priorityLevel === 'HIGH' || gap.priorityLevel === 'CRITICAL')),
  };
}
