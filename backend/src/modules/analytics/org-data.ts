import { prisma, Prisma } from '../../lib/prisma';
import { loadDecayPolicies, policyFor } from '../competencies/decay.service';
import type { EngineConfig } from '../competencies/engine/config';
import { analyzeFreshness, type Freshness } from '../competencies/engine/decay';
import { analyzeSkillGap, type SkillGap } from '../competencies/engine/skill-gap';

/** One employee × one required competency, with the numbers the engine needs. */
export interface OrgRow extends SkillGap {
  userId: string;
  userName: string;
  departmentId: string | null;
  departmentName: string | null;
  jobRoleId: string;
  jobRoleName: string;
  /** False when the employee has never been assessed on this competency (level defaults to 0). */
  assessed: boolean;
  /** Present only when the caller asked for the freshness pass (`asOf`). */
  freshness?: Freshness;
}

export interface OrgOptions {
  /**
   * Decay competencies to this date and use the decayed level as the current
   * one. Omitted, no decay is applied at all and every analysis behaves exactly
   * as it did before freshness existed.
   */
  asOf?: Date;
}

export interface OrgFilters {
  departmentId?: string | undefined;
  jobRoleId?: string | undefined;
  competencyId?: string | undefined;
}

/**
 * Loads the workforce snapshot used by every organisation-level analysis.
 * An "employee" is an ACTIVE, non-deleted user with a job role; rows exist for
 * each competency the employee's role requires. Gap, severity and priority come
 * from the same engine functions used for the individual view, so an
 * administrator's numbers always agree with what each employee sees.
 */
export async function loadOrgRows(filters: OrgFilters, config: EngineConfig, options: OrgOptions = {}): Promise<OrgRow[]> {
  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      jobRoleId: filters.jobRoleId ?? { not: null },
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    },
    select: {
      id: true,
      name: true,
      departmentId: true,
      department: { select: { name: true } },
      jobRole: {
        select: {
          id: true,
          name: true,
          criticality: true,
          competencies: {
            where: { competency: { isActive: true }, ...(filters.competencyId ? { competencyId: filters.competencyId } : {}) },
            select: { competencyId: true, requiredLevel: true, importance: true, competency: { select: { name: true, code: true, category: true } } },
          },
        },
      },
      competencies: {
        where: filters.competencyId ? { competencyId: filters.competencyId } : {},
        select: { competencyId: true, currentLevel: true, ...(options.asOf ? { lastPracticedAt: true, lastEvidenceAt: true } : {}) },
      },
    },
  });

  // Policies are only needed for the freshness pass, and only once for the whole workforce.
  const policies = options.asOf ? await loadDecayPolicies(config, filters.competencyId ? [filters.competencyId] : undefined) : null;

  const rows: OrgRow[] = [];
  for (const user of users) {
    if (!user.jobRole) continue;
    const held = new Map(user.competencies.map((entry) => [entry.competencyId, entry]));
    const levels = new Map(user.competencies.map((entry) => [entry.competencyId, entry.currentLevel]));
    for (const requirement of user.jobRole.competencies) {
      const assessed = levels.has(requirement.competencyId);
      const entry = held.get(requirement.competencyId) as { currentLevel: number; lastPracticedAt?: Date | null; lastEvidenceAt?: Date | null } | undefined;
      const freshness =
        options.asOf && policies
          ? analyzeFreshness(
              {
                baselineLevel: entry?.currentLevel ?? 0,
                requiredLevel: requirement.requiredLevel,
                lastPracticedAt: entry?.lastPracticedAt ?? null,
                lastAssessedAt: entry?.lastEvidenceAt ?? null,
                policy: policyFor(policies, requirement.competencyId, config),
              },
              options.asOf,
              config,
            )
          : undefined;
      const gap = analyzeSkillGap(
        {
          competencyId: requirement.competencyId,
          competencyCode: requirement.competency.code,
          competencyName: requirement.competency.name,
          category: requirement.competency.category,
          requiredLevel: requirement.requiredLevel,
          currentLevel: freshness ? freshness.effectiveLevel : levels.get(requirement.competencyId) ?? 0,
          importance: requirement.importance,
          roleCriticality: user.jobRole.criticality,
        },
        config,
      );
      rows.push({
        ...gap,
        ...(freshness ? { freshness } : {}),
        userId: user.id,
        userName: user.name,
        departmentId: user.departmentId,
        departmentName: user.department?.name ?? null,
        jobRoleId: user.jobRole.id,
        jobRoleName: user.jobRole.name,
        assessed,
      });
    }
  }
  return rows;
}

/**
 * Competency levels as they were at `asOf`, reconstructed from the append-only
 * history (latest event on or before that instant). Keyed by `userId:competencyId`.
 */
export async function levelsAsOf(userIds: string[], asOf: Date): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ userId: string; competencyId: string; level: number }[]>(Prisma.sql`
    SELECT DISTINCT ON ("userId", "competencyId") "userId", "competencyId", "newLevel" AS level
    FROM "CompetencyHistory"
    WHERE "userId" IN (${Prisma.join(userIds)}) AND "createdAt" <= ${asOf}
    ORDER BY "userId", "competencyId", "createdAt" DESC
  `);
  return new Map(rows.map((row) => [`${row.userId}:${row.competencyId}`, row.level]));
}

export const rowKey = (row: { userId: string; competencyId: string }) => `${row.userId}:${row.competencyId}`;

export const round1 = (value: number) => Math.round(value * 10) / 10;
export const mean = (values: number[]): number | null => (values.length === 0 ? null : round1(values.reduce((sum, value) => sum + value, 0) / values.length));

/** Builds the last `months` calendar months (UTC) as `YYYY-MM` keys, oldest first. */
export function monthKeys(months: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export const monthStart = (months: number, now: Date = new Date()): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
