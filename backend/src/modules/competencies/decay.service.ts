import type { CompetencyDecayPolicy, CompetencyPracticeRecord, PracticeSource } from '@prisma/client';
import { z } from 'zod';
import { badRequest } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import type { EngineConfig } from './engine/config';
import { resolvePolicy, type DecayPolicy } from './engine/decay';

/**
 * Loading and resolving competency decay policies.
 *
 * The arithmetic itself lives in `engine/decay.ts` as pure functions; this module
 * only fetches the configured policies and decides which one applies. Keeping the
 * two apart is what lets the readiness simulation run any date through the same
 * code that produces today's numbers.
 */

/** Resolved policies by competency id. Competencies without a row simply do not decay. */
export type PolicyMap = Map<string, DecayPolicy>;

export interface StoredPolicy extends DecayPolicy {
  competencyId: string;
  isSimulation: boolean;
  notes: string | null;
  configured: boolean;
}

function toPolicy(row: CompetencyDecayPolicy): DecayPolicy {
  return {
    decayEnabled: row.decayEnabled,
    halfLifeDays: row.halfLifeDays,
    minimumSafeLevel: row.minimumSafeLevel,
    recertificationIntervalDays: row.recertificationIntervalDays,
    criticality: row.criticality,
  };
}

/** Policies for the given competencies (all of them when `competencyIds` is omitted). */
export async function loadDecayPolicies(config: EngineConfig, competencyIds?: string[], db: Db = prisma): Promise<PolicyMap> {
  const rows = await db.competencyDecayPolicy.findMany({
    ...(competencyIds ? { where: { competencyId: { in: competencyIds } } } : {}),
  });
  const map: PolicyMap = new Map(rows.map((row) => [row.competencyId, toPolicy(row)]));
  // Competencies without a stored row fall back to "no decay configured".
  const fallback = resolvePolicy(null, config);
  for (const id of competencyIds ?? []) if (!map.has(id)) map.set(id, fallback);
  return map;
}

/** The policy for one competency, resolved against the installation defaults. */
export function policyFor(policies: PolicyMap, competencyId: string, config: EngineConfig): DecayPolicy {
  return policies.get(competencyId) ?? resolvePolicy(null, config);
}

/** Every competency with its policy, for the administration screen. */
export async function listDecayPolicies(config: EngineConfig, db: Db = prisma): Promise<Array<StoredPolicy & { competencyName: string; competencyCode: string; category: string }>> {
  const competencies = await db.competency.findMany({
    where: { isActive: true },
    include: { decayPolicy: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return competencies.map((competency) => {
    const stored = competency.decayPolicy;
    const policy = stored ? toPolicy(stored) : resolvePolicy(null, config);
    return {
      ...policy,
      competencyId: competency.id,
      competencyName: competency.name,
      competencyCode: competency.code,
      category: competency.category,
      isSimulation: stored?.isSimulation ?? false,
      notes: stored?.notes ?? null,
      configured: stored !== null,
    };
  });
}

export interface SaveDecayPolicyInput {
  decayEnabled: boolean;
  halfLifeDays: number;
  minimumSafeLevel: number;
  recertificationIntervalDays: number;
  criticality: number;
  isSimulation: boolean;
  notes?: string | null;
}

export async function saveDecayPolicy(competencyId: string, input: SaveDecayPolicyInput, updatedById: string, db: Db = prisma): Promise<StoredPolicy> {
  const data = { ...input, notes: input.notes ?? null, updatedById };
  const row = await db.competencyDecayPolicy.upsert({
    where: { competencyId },
    create: { competencyId, ...data },
    update: data,
  });
  return { ...toPolicy(row), competencyId, isSimulation: row.isSimulation, notes: row.notes, configured: true };
}

/** Removes the policy, so the competency stops decaying altogether. */
export async function deleteDecayPolicy(competencyId: string, db: Db = prisma): Promise<void> {
  await db.competencyDecayPolicy.deleteMany({ where: { competencyId } });
}

export interface RecordPracticeInput {
  userId: string;
  competencyId: string;
  practicedAt: Date;
  source: PracticeSource;
  note?: string | null;
  courseId?: string | null;
  attemptId?: string | null;
  recordedById?: string | null;
}

/**
 * Records that a competency was practised and moves the employee's decay clock
 * forward. Both happen together so the summary field on `EmployeeCompetency` can
 * never disagree with the practice history behind it.
 *
 * An out-of-order entry (back-dated practice) is kept in the history but does not
 * pull `lastPracticedAt` backwards.
 */
export async function recordPractice(input: RecordPracticeInput, db: Db): Promise<CompetencyPracticeRecord> {
  const key = { userId_competencyId: { userId: input.userId, competencyId: input.competencyId } };
  const record = await db.competencyPracticeRecord.create({
    data: {
      userId: input.userId,
      competencyId: input.competencyId,
      practicedAt: input.practicedAt,
      source: input.source,
      note: input.note ?? null,
      courseId: input.courseId ?? null,
      attemptId: input.attemptId ?? null,
      recordedById: input.recordedById ?? null,
    },
  });

  const existing = await db.employeeCompetency.findUnique({ where: key, select: { lastPracticedAt: true } });
  if (existing) {
    if (existing.lastPracticedAt === null || existing.lastPracticedAt < input.practicedAt) {
      await db.employeeCompetency.update({ where: key, data: { lastPracticedAt: input.practicedAt } });
    }
  } else {
    // Practice on a competency with no recorded level yet: start the row at 0 so the
    // date is not lost. The level itself only moves on assessed evidence.
    await db.employeeCompetency.create({
      data: { userId: input.userId, competencyId: input.competencyId, currentLevel: 0, lastPracticedAt: input.practicedAt },
    });
  }
  return record;
}

/** `recordPractice` as a standalone, atomic operation (it writes to two tables). */
export const recordPracticeAtomically = (input: RecordPracticeInput): Promise<CompetencyPracticeRecord> =>
  prisma.$transaction((tx) => recordPractice(input, tx));

/**
 * The date the caller wants the answer for.
 *
 * Simulation is read-only and bounded: a caller may look forward (or back) within
 * the configured window, but nothing it asks for is ever written.
 */
export interface AsOf {
  date: Date;
  /** True when the caller asked for a date other than now. */
  simulated: boolean;
  /** Whole days from now; negative looks into the past. */
  offsetDays: number;
}

export const TODAY: (now?: Date) => AsOf = (now = new Date()) => ({ date: now, simulated: false, offsetDays: 0 });

/** Query-string shape of a simulation request, accepted by every readiness endpoint. */
export const asOfQuery = z.object({
  asOf: z.string().trim().max(40).optional(),
  offsetDays: z.coerce.number().int().optional(),
});

/**
 * Validates a requested simulation date against the configured bounds.
 * Accepts either an ISO date or a number of days from now.
 */
export function resolveAsOf(requested: { asOf?: string | undefined; offsetDays?: number | undefined }, config: EngineConfig, now: Date = new Date()): AsOf {
  const max = config.decay.simulationMaxDays;

  if (requested.offsetDays !== undefined) {
    if (!Number.isFinite(requested.offsetDays)) throw badRequest('INVALID_SIMULATION_DATE', 'The simulation offset must be a number of days');
    const offsetDays = Math.trunc(requested.offsetDays);
    if (Math.abs(offsetDays) > max) throw badRequest('INVALID_SIMULATION_DATE', `The simulation may look at most ${max} days ahead or back`);
    if (offsetDays === 0) return TODAY(now);
    return { date: new Date(now.getTime() + offsetDays * 86_400_000), simulated: true, offsetDays };
  }

  if (requested.asOf !== undefined && requested.asOf !== '') {
    const date = new Date(requested.asOf);
    if (Number.isNaN(date.getTime())) throw badRequest('INVALID_SIMULATION_DATE', 'The simulation date could not be read');
    const offsetDays = Math.round((date.getTime() - now.getTime()) / 86_400_000);
    if (Math.abs(offsetDays) > max) throw badRequest('INVALID_SIMULATION_DATE', `The simulation may look at most ${max} days ahead or back`);
    return { date, simulated: offsetDays !== 0, offsetDays };
  }

  return TODAY(now);
}
