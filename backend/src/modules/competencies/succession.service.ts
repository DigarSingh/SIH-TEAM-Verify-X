import type { MentorshipStatus } from '@prisma/client';
import { conflict, notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { loadDecayPolicies, policyFor, TODAY, type AsOf } from './decay.service';
import type { EngineConfig } from './engine/config';
import { analyzeFreshness } from './engine/decay';
import {
  analyzeSuccession,
  rankSuccessionRisks,
  suggestMentors,
  summarizeSuccession,
  type HolderInput,
  type SuccessionRisk,
  type SuccessionSummary,
} from './engine/succession';
import { getEngineConfig } from './engine-config.service';

/**
 * Workforce continuity across the organisation.
 *
 * Like the freshness analysis, this is derived on every read rather than stored:
 * it depends on competency levels that decay, on a date, and on configuration,
 * so a stored table would be wrong the day after it was written.
 */

export interface SuccessionReport {
  risks: SuccessionRisk[];
  summary: SuccessionSummary;
  asOf: AsOf;
  config: EngineConfig['succession'];
}

/**
 * Builds the continuity picture for every active competency.
 *
 * Levels are the *effective* ones at `asOf`, so an expert whose competency has
 * decayed below the expert level correctly stops counting as cover.
 */
export async function loadSuccessionReport(options: { config?: EngineConfig; db?: Db; asOf?: AsOf; competencyId?: string } = {}): Promise<SuccessionReport> {
  const db = options.db ?? prisma;
  const config = options.config ?? (await getEngineConfig(db));
  const asOf = options.asOf ?? TODAY();

  const competencies = await db.competency.findMany({
    where: { isActive: true, ...(options.competencyId ? { id: options.competencyId } : {}) },
    select: {
      id: true,
      name: true,
      code: true,
      category: true,
      employees: {
        where: { user: { deletedAt: null, status: 'ACTIVE' } },
        select: {
          currentLevel: true,
          lastEvidenceAt: true,
          lastPracticedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              retirementDate: true,
              department: { select: { name: true } },
              jobRole: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  const policies = await loadDecayPolicies(
    config,
    competencies.map((competency) => competency.id),
    db,
  );

  const risks = competencies.map((competency) => {
    const policy = policyFor(policies, competency.id, config);
    const holders: HolderInput[] = competency.employees.map((entry) => ({
      userId: entry.user.id,
      userName: entry.user.name,
      // The requirement is irrelevant here: cover is about absolute capability.
      effectiveLevel: analyzeFreshness(
        { baselineLevel: entry.currentLevel, requiredLevel: 0, lastPracticedAt: entry.lastPracticedAt, lastAssessedAt: entry.lastEvidenceAt, policy },
        asOf.date,
        config,
      ).effectiveLevel,
      retirementDate: entry.user.retirementDate,
      departmentName: entry.user.department?.name ?? null,
      jobRoleName: entry.user.jobRole?.name ?? null,
    }));

    return analyzeSuccession(
      { competencyId: competency.id, competencyName: competency.name, competencyCode: competency.code, category: competency.category, criticality: policy.criticality, holders },
      asOf.date,
      config,
    );
  });

  return {
    risks: rankSuccessionRisks(risks),
    summary: summarizeSuccession(risks, config.succession),
    asOf,
    config: config.succession,
  };
}

/** One competency in detail, with existing mentorships and suggested pairings. */
export async function loadSuccessionDetail(competencyId: string, options: { config?: EngineConfig; db?: Db; asOf?: AsOf } = {}) {
  const db = options.db ?? prisma;
  const report = await loadSuccessionReport({ ...options, competencyId });
  const risk = report.risks[0];
  if (!risk) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');

  const mentorships = await listMentorships({ competencyId }, db);
  const paired = new Set(mentorships.filter((m) => m.status !== 'CANCELLED').map((m) => `${m.mentorId}:${m.menteeId}`));

  // Do not suggest a pairing that already exists.
  const suggestions = suggestMentors(risk)
    .map((suggestion) => ({
      mentor: suggestion.mentor,
      candidates: suggestion.candidates.filter((candidate) => !paired.has(`${suggestion.mentor.userId}:${candidate.userId}`)),
    }))
    .filter((suggestion) => suggestion.candidates.length > 0);

  return { risk, mentorships, suggestions, asOf: report.asOf, config: report.config };
}

// ---------------------------------------------------------------------------------------------
// Mentorships
// ---------------------------------------------------------------------------------------------

const mentorshipInclude = {
  mentor: { select: { id: true, name: true, email: true, designation: true } },
  mentee: { select: { id: true, name: true, email: true, designation: true } },
  competency: { select: { id: true, name: true, code: true } },
} as const;

export async function listMentorships(filter: { competencyId?: string; mentorId?: string; menteeId?: string; status?: MentorshipStatus }, db: Db = prisma) {
  return db.mentorship.findMany({
    where: {
      ...(filter.competencyId ? { competencyId: filter.competencyId } : {}),
      ...(filter.mentorId ? { mentorId: filter.mentorId } : {}),
      ...(filter.menteeId ? { menteeId: filter.menteeId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    include: mentorshipInclude,
    orderBy: [{ createdAt: 'desc' }],
  });
}

export interface CreateMentorshipInput {
  mentorId: string;
  menteeId: string;
  competencyId: string;
  note?: string | null;
  createdById: string;
}

export async function createMentorship(input: CreateMentorshipInput, db: Db = prisma) {
  if (input.mentorId === input.menteeId) throw conflict('MENTORSHIP_SAME_PERSON', 'Someone cannot mentor themselves');

  const [mentor, mentee, competency] = await Promise.all([
    db.user.findFirst({ where: { id: input.mentorId, deletedAt: null }, select: { id: true } }),
    db.user.findFirst({ where: { id: input.menteeId, deletedAt: null }, select: { id: true } }),
    db.competency.findUnique({ where: { id: input.competencyId }, select: { id: true } }),
  ]);
  if (!mentor) throw notFound('MENTOR_NOT_FOUND', 'The mentor was not found');
  if (!mentee) throw notFound('MENTEE_NOT_FOUND', 'The mentee was not found');
  if (!competency) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');

  const existing = await db.mentorship.findUnique({
    where: { mentorId_menteeId_competencyId: { mentorId: input.mentorId, menteeId: input.menteeId, competencyId: input.competencyId } },
  });
  if (existing) throw conflict('MENTORSHIP_EXISTS', 'These two are already paired for this competency');

  return db.mentorship.create({
    data: { mentorId: input.mentorId, menteeId: input.menteeId, competencyId: input.competencyId, note: input.note ?? null, createdById: input.createdById },
    include: mentorshipInclude,
  });
}

/** Moves a mentorship through its lifecycle, keeping the dates consistent with the status. */
export async function updateMentorshipStatus(id: string, status: MentorshipStatus, db: Db = prisma) {
  const existing = await db.mentorship.findUnique({ where: { id } });
  if (!existing) throw notFound('MENTORSHIP_NOT_FOUND', 'Mentorship not found');
  if (existing.status === 'COMPLETED' && status !== 'COMPLETED') throw conflict('MENTORSHIP_COMPLETED', 'A completed mentorship cannot be reopened');

  const now = new Date();
  return db.mentorship.update({
    where: { id },
    data: {
      status,
      ...(status === 'ACTIVE' && existing.startedAt === null ? { startedAt: now } : {}),
      ...(status === 'COMPLETED' ? { completedAt: now, startedAt: existing.startedAt ?? now } : {}),
    },
    include: mentorshipInclude,
  });
}
