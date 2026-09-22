import type { HazardType, Prisma, ReadinessEventStatus } from '@prisma/client';
import { conflict, notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { loadDecayPolicies, policyFor, TODAY, type AsOf } from '../competencies/decay.service';
import type { EngineConfig } from '../competencies/engine/config';
import { analyzeFreshness } from '../competencies/engine/decay';
import { getEngineConfig } from '../competencies/engine-config.service';
import { notifyUsers } from '../../services/notification.service';
import { analyzeEventReadiness, daysUntil, type EventReadiness, type PersonReadiness, type PersonReadinessInput } from './readiness.engine';

/**
 * Readiness sprints: preparing the workforce for a known operational period.
 *
 * Readiness is computed for the date the event starts, not for today, because
 * that is the date the organisation actually has to be ready. A competency that
 * is fine today but will have decayed by the cyclone season is a gap now.
 */

const eventInclude = {
  requirements: { include: { competency: { select: { id: true, name: true, code: true, category: true } } } },
  departments: { include: { department: { select: { id: true, name: true, code: true } } } },
  _count: { select: { assignments: true } },
} as const;

export type EventWithDetail = Prisma.ReadinessEventGetPayload<{ include: typeof eventInclude }>;

export async function listEvents(filter: { status?: ReadinessEventStatus; includeCompleted?: boolean }, db: Db = prisma): Promise<EventWithDetail[]> {
  return db.readinessEvent.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : filter.includeCompleted ? {} : { status: { in: ['PLANNED', 'ACTIVE'] } }),
    },
    include: eventInclude,
    orderBy: [{ startDate: 'asc' }],
  });
}

export async function loadEvent(id: string, db: Db = prisma): Promise<EventWithDetail> {
  const event = await db.readinessEvent.findUnique({ where: { id }, include: eventInclude });
  if (!event) throw notFound('READINESS_EVENT_NOT_FOUND', 'Readiness event not found');
  return event;
}

/**
 * Everyone the event applies to: the affected departments, or the whole active
 * workforce when no department is named.
 */
async function peopleInScope(event: EventWithDetail, db: Db) {
  const departmentIds = event.departments.map((entry) => entry.departmentId);
  return db.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      role: { in: ['TRAINEE', 'TRAINER'] },
      ...(departmentIds.length > 0 ? { departmentId: { in: departmentIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      department: { select: { name: true } },
      jobRole: { select: { name: true } },
      competencies: { select: { competencyId: true, currentLevel: true, lastEvidenceAt: true, lastPracticedAt: true } },
    },
    orderBy: [{ name: 'asc' }],
  });
}

/**
 * A person as the report sends them: everything the engine worked out, minus
 * their full requirement list. Shortfalls carry the same freshness objects, and
 * the duplication is most of the payload on a large workforce.
 */
export type ReportedPerson = Omit<PersonReadiness, 'requirements'>;

export interface EventReadinessReport extends Omit<EventReadiness, 'people'> {
  people: ReportedPerson[];
  event: EventWithDetail;
  /** The date readiness was measured at: the event's start, or a simulated date. */
  measuredAt: Date;
  daysUntilStart: number;
  asOf: AsOf;
}

/**
 * Readiness for one event.
 *
 * `asOf` shifts the whole calculation (the simulation). Without it, readiness is
 * measured at the event's start date when that is still ahead, and at today once
 * the event has begun.
 */
export async function loadEventReadiness(eventId: string, options: { config?: EngineConfig; db?: Db; asOf?: AsOf } = {}): Promise<EventReadinessReport> {
  const db = options.db ?? prisma;
  const config = options.config ?? (await getEngineConfig(db));
  const asOf = options.asOf ?? TODAY();

  const event = await loadEvent(eventId, db);
  // Be ready by the time it starts; once it has started, readiness is a question about now.
  const measuredAt = asOf.simulated ? asOf.date : event.startDate > asOf.date ? event.startDate : asOf.date;

  const [people, policies] = await Promise.all([
    peopleInScope(event, db),
    loadDecayPolicies(
      config,
      event.requirements.map((requirement) => requirement.competencyId),
      db,
    ),
  ]);

  const inputs: PersonReadinessInput[] = people.map((person) => {
    const levels = new Map(person.competencies.map((entry) => [entry.competencyId, entry]));
    return {
      userId: person.id,
      userName: person.name,
      departmentName: person.department?.name ?? null,
      jobRoleName: person.jobRole?.name ?? null,
      requirements: event.requirements.map((requirement) => {
        const held = levels.get(requirement.competencyId);
        return {
          competencyId: requirement.competencyId,
          competencyName: requirement.competency.name,
          requiredLevel: requirement.requiredLevel,
          importance: requirement.importance,
          freshness: analyzeFreshness(
            {
              baselineLevel: held?.currentLevel ?? 0,
              requiredLevel: requirement.requiredLevel,
              lastPracticedAt: held?.lastPracticedAt ?? null,
              lastAssessedAt: held?.lastEvidenceAt ?? null,
              policy: policyFor(policies, requirement.competencyId, config),
            },
            measuredAt,
            config,
          ),
        };
      }),
    };
  });

  const readiness = analyzeEventReadiness({ eventId: event.id, eventName: event.name, people: inputs });

  /*
   * Each person's full requirement list is dropped from the response and only
   * their shortfalls are sent. The two carry the same freshness objects, and on
   * a large workforce the duplication dominates the payload: measured on the
   * seeded data it was roughly half of it, for something no screen reads.
   */
  const trimmedPeople = readiness.people.map(({ requirements: _requirements, ...person }) => person);

  return { ...readiness, people: trimmedPeople, event, measuredAt, daysUntilStart: daysUntil(event.startDate, asOf.date), asOf };
}

/** Headline readiness for every upcoming event, for the calendar and the dashboard. */
export async function loadReadinessCalendar(options: { config?: EngineConfig; db?: Db; asOf?: AsOf } = {}) {
  const db = options.db ?? prisma;
  const config = options.config ?? (await getEngineConfig(db));
  const asOf = options.asOf ?? TODAY();
  const events = await listEvents({}, db);

  const summaries = [];
  for (const event of events) {
    const report = await loadEventReadiness(event.id, { config, db, asOf });
    summaries.push({
      id: event.id,
      name: event.name,
      hazardType: event.hazardType,
      startDate: event.startDate,
      endDate: event.endDate,
      priority: event.priority,
      status: event.status,
      isSimulation: event.isSimulation,
      daysUntilStart: report.daysUntilStart,
      workforceReady: report.workforceReady,
      averageReadiness: report.averageReadiness,
      totalPeople: report.totalPeople,
      readyCount: report.readyCount,
      needingPreparation: report.needingPreparation,
      atRiskCount: report.atRiskCount,
      criticalCount: report.criticalCount,
      weakestCompetencies: report.weakestCompetencies.slice(0, 3),
      requirements: event.requirements.map((requirement) => ({ competencyId: requirement.competencyId, competencyName: requirement.competency.name, requiredLevel: requirement.requiredLevel })),
    });
  }
  return { events: summaries, asOf };
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

export interface EventInput {
  name: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  hazardType: HazardType;
  priority: number;
  status?: ReadinessEventStatus;
  isSimulation: boolean;
  departmentIds: string[];
  requirements: { competencyId: string; requiredLevel: number; importance: number }[];
}

async function assertReferences(input: EventInput, db: Db): Promise<void> {
  if (input.endDate < input.startDate) throw conflict('READINESS_DATES_INVALID', 'The event must end on or after it starts');

  const competencyIds = input.requirements.map((requirement) => requirement.competencyId);
  if (new Set(competencyIds).size !== competencyIds.length) throw conflict('READINESS_DUPLICATE_COMPETENCY', 'Each competency may appear only once in an event');

  const [competencies, departments] = await Promise.all([
    db.competency.count({ where: { id: { in: competencyIds } } }),
    db.department.count({ where: { id: { in: input.departmentIds } } }),
  ]);
  if (competencies !== new Set(competencyIds).size) throw notFound('COMPETENCY_NOT_FOUND', 'One of the competencies was not found');
  if (departments !== new Set(input.departmentIds).size) throw notFound('DEPARTMENT_NOT_FOUND', 'One of the departments was not found');
}

export async function createEvent(input: EventInput, createdById: string, db: Db = prisma): Promise<EventWithDetail> {
  await assertReferences(input, db);
  return db.readinessEvent.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      hazardType: input.hazardType,
      priority: input.priority,
      status: input.status ?? 'PLANNED',
      isSimulation: input.isSimulation,
      createdById,
      departments: { create: input.departmentIds.map((departmentId) => ({ departmentId })) },
      requirements: { create: input.requirements },
    },
    include: eventInclude,
  });
}

export async function updateEvent(id: string, input: EventInput, db: Db = prisma): Promise<EventWithDetail> {
  await loadEvent(id, db);
  await assertReferences(input, db);
  // Requirements and departments are replaced wholesale: the caller sends the complete
  // intended set, so the three writes must succeed or fail together.
  return prisma.$transaction(async (tx) => {
    await tx.readinessRequirement.deleteMany({ where: { eventId: id } });
    await tx.readinessEventDepartment.deleteMany({ where: { eventId: id } });
    return tx.readinessEvent.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        hazardType: input.hazardType,
        priority: input.priority,
        ...(input.status ? { status: input.status } : {}),
        isSimulation: input.isSimulation,
        departments: { create: input.departmentIds.map((departmentId) => ({ departmentId })) },
        requirements: { create: input.requirements },
      },
      include: eventInclude,
    });
  });
}

export async function deleteEvent(id: string, db: Db = prisma): Promise<void> {
  await loadEvent(id, db);
  await db.readinessEvent.delete({ where: { id } });
}

/**
 * Assigns preparation to everyone who is short for an event.
 *
 * Idempotent: running it again after more people fall behind adds only the new
 * assignments and leaves existing ones (and their progress) alone.
 */
export async function assignPreparation(eventId: string, assignedById: string, options: { db?: Db; asOf?: AsOf } = {}) {
  const db = options.db ?? prisma;
  const report = await loadEventReadiness(eventId, { db, ...(options.asOf ? { asOf: options.asOf } : {}) });

  const wanted = report.people.flatMap((person) =>
    person.shortfalls.map((shortfall) => ({ eventId, userId: person.userId, competencyId: shortfall.competencyId, assignedById })),
  );
  if (wanted.length === 0) return { created: 0, existing: 0, total: 0 };

  const before = await db.readinessAssignment.count({ where: { eventId } });
  // `skipDuplicates` relies on the unique (event, user, competency) index.
  const result = await db.readinessAssignment.createMany({ data: wanted, skipDuplicates: true });

  /**
   * Tell the people who have been asked to prepare.
   *
   * One notification per person per event rather than one per competency: a
   * dozen separate messages about the same cyclone season is noise. The dedupe
   * key means running the assignment again does not notify anybody twice.
   */
  const shortPeople = report.people.filter((person) => person.shortfalls.length > 0);
  const notified = await notifyUsers(
    shortPeople.map((person) => person.userId),
    {
      type: 'TRAINING_REMINDER',
      title: `Preparation for ${report.event.name}`,
      message: `You have been asked to prepare for ${report.event.name}, which starts on ${report.event.startDate.toISOString().slice(0, 10)}. Open "My readiness" to see which competencies to work on.`,
      link: '/trainee/readiness',
      dedupeKey: `readiness-assignment:${eventId}`,
      metadata: { eventId, hazardType: report.event.hazardType, isSimulation: report.event.isSimulation },
    },
    db,
  );

  return { created: result.count, existing: before, total: before + result.count, notified };
}

export async function listAssignments(filter: { eventId?: string; userId?: string }, db: Db = prisma) {
  return db.readinessAssignment.findMany({
    where: { ...(filter.eventId ? { eventId: filter.eventId } : {}), ...(filter.userId ? { userId: filter.userId } : {}) },
    include: {
      event: { select: { id: true, name: true, hazardType: true, startDate: true, endDate: true, status: true } },
      competency: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: [{ assignedAt: 'desc' }],
  });
}
