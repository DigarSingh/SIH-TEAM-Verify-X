import type { Freshness, FreshnessStatus } from '../competencies/engine/decay';

/**
 * Operational readiness for a specific event: a cyclone season, a monsoon onset.
 *
 * The question is narrower than the skill-gap analysis. That one asks "is this
 * person meeting the requirements of their job role?"; this one asks "is this
 * person able to do the things THIS event depends on, on the day it starts?".
 * The requirement therefore comes from the event, not from the person's role,
 * and the level used is the effective one on the event's start date.
 *
 * Pure functions throughout, so a readiness figure can be recomputed for any date
 * without touching stored data. They take no engine configuration: the thresholds
 * that matter here are the per-event required levels, and the freshness statuses
 * have already been decided by the decay engine.
 */

export type ReadinessState = 'READY' | 'NEEDS_PREPARATION' | 'AT_RISK' | 'CRITICAL';

export const READINESS_STATE_LABELS: Record<ReadinessState, string> = {
  READY: 'Ready',
  NEEDS_PREPARATION: 'Needs preparation',
  AT_RISK: 'At risk',
  CRITICAL: 'Critical',
};

/** One competency the event depends on, for one person. */
export interface PersonRequirement {
  competencyId: string;
  competencyName: string;
  /** The level this event needs, which may differ from the person's role requirement. */
  requiredLevel: number;
  importance: number;
  /** Freshness at the event's start date. */
  freshness: Freshness;
}

export interface PersonReadinessInput {
  userId: string;
  userName: string;
  departmentName: string | null;
  jobRoleName: string | null;
  requirements: PersonRequirement[];
}

export interface PersonReadiness extends PersonReadinessInput {
  state: ReadinessState;
  /** Requirements not met at the event's start date. */
  shortfalls: PersonRequirement[];
  /** Weighted share of the event's requirements met, 0-100. */
  readiness: number;
  reason: string;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Where one person stands for one event.
 *
 * A single critical or expired competency outweighs a good average: being ready
 * on average is not being ready.
 */
export function analyzePersonReadiness(input: PersonReadinessInput): PersonReadiness {
  const { requirements } = input;

  const shortfalls = requirements.filter((requirement) => requirement.freshness.effectiveLevel < requirement.requiredLevel);

  // Weighted by importance: falling short of an essential competency counts for more.
  const totalWeight = requirements.reduce((sum, requirement) => sum + requirement.importance * requirement.requiredLevel, 0);
  const metWeight = requirements.reduce(
    (sum, requirement) => sum + requirement.importance * Math.min(requirement.freshness.effectiveLevel, requirement.requiredLevel),
    0,
  );
  const readiness = totalWeight === 0 ? 100 : round1(clamp((metWeight / totalWeight) * 100, 0, 100));

  const worst = (statuses: FreshnessStatus[]) => requirements.some((requirement) => statuses.includes(requirement.freshness.status));

  let state: ReadinessState;
  if (shortfalls.length === 0) state = 'READY';
  else if (worst(['CRITICAL', 'EXPIRED'])) state = 'CRITICAL';
  else if (worst(['AT_RISK'])) state = 'AT_RISK';
  else state = 'NEEDS_PREPARATION';

  return { ...input, state, shortfalls, readiness, reason: explainPerson(input.userName, shortfalls, readiness, state) };
}

function explainPerson(name: string, shortfalls: PersonRequirement[], readiness: number, state: ReadinessState): string {
  if (state === 'READY') return `${name} meets every competency this event depends on.`;
  const named = shortfalls
    .slice(0, 3)
    .map((shortfall) => `${shortfall.competencyName} (${shortfall.freshness.effectiveLevel}% against ${shortfall.requiredLevel}% needed)`)
    .join(', ');
  const more = shortfalls.length > 3 ? `, and ${shortfalls.length - 3} more` : '';
  return `${name} is at ${readiness}% of what this event needs. Short on: ${named}${more}.`;
}

export interface EventReadinessInput {
  eventId: string;
  eventName: string;
  people: PersonReadinessInput[];
}

export interface EventReadiness {
  eventId: string;
  eventName: string;
  people: PersonReadiness[];
  /** Share of the affected workforce fully ready, 0-100. */
  workforceReady: number;
  /** Average of each person's weighted readiness, 0-100. */
  averageReadiness: number;
  totalPeople: number;
  readyCount: number;
  needingPreparation: number;
  atRiskCount: number;
  criticalCount: number;
  /** Which competencies are holding the organisation back, worst first. */
  weakestCompetencies: { competencyId: string; competencyName: string; peopleShort: number; averageShortfall: number }[];
  reason: string;
}

/** Aggregates one event across everyone it applies to. */
export function analyzeEventReadiness(input: EventReadinessInput): EventReadiness {
  const people = input.people.map((person) => analyzePersonReadiness(person));

  const readyCount = people.filter((person) => person.state === 'READY').length;
  const atRiskCount = people.filter((person) => person.state === 'AT_RISK').length;
  const criticalCount = people.filter((person) => person.state === 'CRITICAL').length;
  const needingPreparation = people.length - readyCount;

  const shortfallsByCompetency = new Map<string, { competencyName: string; peopleShort: number; totalShortfall: number }>();
  for (const person of people) {
    for (const shortfall of person.shortfalls) {
      const entry = shortfallsByCompetency.get(shortfall.competencyId) ?? { competencyName: shortfall.competencyName, peopleShort: 0, totalShortfall: 0 };
      entry.peopleShort += 1;
      entry.totalShortfall += shortfall.requiredLevel - shortfall.freshness.effectiveLevel;
      shortfallsByCompetency.set(shortfall.competencyId, entry);
    }
  }

  const weakestCompetencies = [...shortfallsByCompetency.entries()]
    .map(([competencyId, entry]) => ({
      competencyId,
      competencyName: entry.competencyName,
      peopleShort: entry.peopleShort,
      averageShortfall: round1(entry.totalShortfall / entry.peopleShort),
    }))
    .sort((a, b) => b.peopleShort - a.peopleShort || b.averageShortfall - a.averageShortfall || a.competencyName.localeCompare(b.competencyName));

  const workforceReady = people.length === 0 ? 100 : round1((readyCount / people.length) * 100);
  const averageReadiness = people.length === 0 ? 100 : round1(people.reduce((sum, person) => sum + person.readiness, 0) / people.length);

  return {
    eventId: input.eventId,
    eventName: input.eventName,
    people,
    workforceReady,
    averageReadiness,
    totalPeople: people.length,
    readyCount,
    needingPreparation,
    atRiskCount,
    criticalCount,
    weakestCompetencies,
    reason: explainEvent(input.eventName, people.length, readyCount, atRiskCount, criticalCount, weakestCompetencies),
  };
}

function explainEvent(
  name: string,
  total: number,
  ready: number,
  atRisk: number,
  critical: number,
  weakest: EventReadiness['weakestCompetencies'],
): string {
  if (total === 0) return `No one is currently in scope for ${name}, so there is nothing to report.`;
  const parts = [`${ready} of ${total} people meet everything ${name} depends on.`];
  if (critical > 0) parts.push(`${critical} ${critical === 1 ? 'is' : 'are'} critically short.`);
  if (atRisk > 0) parts.push(`${atRisk} ${atRisk === 1 ? 'has' : 'have'} a competency at risk.`);
  if (weakest[0]) parts.push(`The biggest gap is ${weakest[0].competencyName}, where ${weakest[0].peopleShort} ${weakest[0].peopleShort === 1 ? 'person falls' : 'people fall'} short by ${weakest[0].averageShortfall} points on average.`);
  return parts.join(' ');
}

/** Days from `asOf` to the event start; negative once it has begun. */
export function daysUntil(startDate: Date, asOf: Date): number {
  return Math.round((startDate.getTime() - asOf.getTime()) / 86_400_000);
}
