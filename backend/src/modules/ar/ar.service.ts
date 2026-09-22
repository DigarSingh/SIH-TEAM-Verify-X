import type { ARModule, ARTask, Prisma } from '@prisma/client';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';
import { loadDecayPolicies, policyFor, recordPractice, TODAY, type AsOf } from '../competencies/decay.service';
import { analyzeFreshness } from '../competencies/engine/decay';
import { getEngineConfig } from '../competencies/engine-config.service';
import { applyCompetencyEvidence, type CompetencyImpact } from '../competencies/evidence.service';
import type { SubmitAttemptInput } from './ar.schemas';

/**
 * The AR Instrument Lab.
 *
 * A trainee identifies components on a 3D model; the server marks the answers,
 * combines the practical with their theory result, and hands the practical
 * score to the competency engine as PRACTICAL evidence. The engine's existing
 * update rules decide what the competency becomes - this module never sets a
 * competency level itself.
 *
 * Nothing the browser sends is trusted: it sends which component was tapped,
 * and that is all.
 */

type Actor = Express.AuthUser;

const moduleInclude = {
  competency: { select: { id: true, name: true, code: true, category: true } },
  course: { select: { id: true, title: true } },
  components: { orderBy: { position: 'asc' } },
  tasks: { orderBy: { position: 'asc' } },
} satisfies Prisma.ARModuleInclude;

type ModuleRow = Prisma.ARModuleGetPayload<{ include: typeof moduleInclude }>;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** A component as the trainee's device sees it. */
const toComponentDto = (component: ModuleRow['components'][number]) => ({
  id: component.id,
  key: component.key,
  name: component.name,
  description: component.description,
  hotspotPosition: component.hotspotPosition,
  hotspotNormal: component.hotspotNormal,
  isInteractive: component.isInteractive,
  position: component.position,
});

/**
 * A task, with the answer removed.
 *
 * `correctComponentId` never leaves the server while an attempt is open - not
 * for the assessment, and not for training either, because the training tasks
 * are answered against the same model.
 */
const toTaskDto = (task: ARTask, { withHint }: { withHint: boolean }) => ({
  id: task.id,
  type: task.type,
  position: task.position,
  instruction: task.instruction,
  points: task.points,
  ...(withHint ? { hint: task.hint } : {}),
});

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

async function loadModule(idOrKey: string, db: Db = prisma): Promise<ModuleRow> {
  const module = await db.aRModule.findFirst({ where: { OR: [{ id: idOrKey }, { key: idOrKey }] }, include: moduleInclude });
  if (!module) throw notFound('AR_MODULE_NOT_FOUND', 'AR module not found');
  return module;
}

/** Unpublished modules are visible to the people who maintain them, and to nobody else. */
function assertVisible(module: ARModule, user: Actor): void {
  if (!module.isPublished && user.role === 'TRAINEE') throw notFound('AR_MODULE_NOT_FOUND', 'AR module not found');
}

/**
 * The AR Instrument Lab landing page: every module with where this trainee
 * stands on the competency behind it.
 */
export async function listModules(user: Actor, filter: { competencyId?: string; kind?: 'FULL_LAB' | 'REFRESHER'; includeUnpublished?: boolean } = {}, options: { db?: Db; asOf?: AsOf } = {}) {
  const db = options.db ?? prisma;
  const asOf = options.asOf ?? TODAY();
  const config = await getEngineConfig(db);

  const modules = await db.aRModule.findMany({
    where: {
      ...(filter.competencyId ? { competencyId: filter.competencyId } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.includeUnpublished && user.role !== 'TRAINEE' ? {} : { isPublished: true }),
    },
    include: moduleInclude,
    orderBy: [{ position: 'asc' }, { title: 'asc' }],
  });
  if (modules.length === 0) return { modules: [], asOf };

  const competencyIds = [...new Set(modules.map((module) => module.competencyId))];
  const [held, requirements, attempts, policies] = await Promise.all([
    db.employeeCompetency.findMany({ where: { userId: user.id, competencyId: { in: competencyIds } } }),
    db.user
      .findUnique({ where: { id: user.id }, select: { jobRoleId: true } })
      .then((row) => (row?.jobRoleId ? db.roleCompetency.findMany({ where: { roleId: row.jobRoleId, competencyId: { in: competencyIds } } }) : [])),
    db.aRPracticalAttempt.findMany({ where: { userId: user.id, arModuleId: { in: modules.map((module) => module.id) } }, orderBy: { startedAt: 'desc' } }),
    loadDecayPolicies(config, competencyIds, db),
  ]);

  const heldBy = new Map(held.map((entry) => [entry.competencyId, entry]));
  const requiredBy = new Map(requirements.map((entry) => [entry.competencyId, entry.requiredLevel]));

  return {
    modules: modules.map((module) => {
      const entry = heldBy.get(module.competencyId);
      const requiredLevel = requiredBy.get(module.competencyId) ?? null;
      const mine = attempts.filter((attempt) => attempt.arModuleId === module.id);
      const completed = mine.filter((attempt) => attempt.status === 'COMPLETED');
      const best = completed.reduce<number | null>((top, attempt) => (top === null || (attempt.combinedPercentage ?? 0) > top ? attempt.combinedPercentage ?? 0 : top), null);

      const freshness = analyzeFreshness(
        {
          baselineLevel: entry?.currentLevel ?? 0,
          requiredLevel: requiredLevel ?? 0,
          lastPracticedAt: entry?.lastPracticedAt ?? null,
          lastAssessedAt: entry?.lastEvidenceAt ?? null,
          policy: policyFor(policies, module.competencyId, config),
        },
        asOf.date,
        config,
      );

      return {
        id: module.id,
        key: module.key,
        title: module.title,
        subtitle: module.subtitle,
        description: module.description,
        objectives: module.objectives,
        modelUrl: module.modelUrl,
        modelHeightM: module.modelHeightM,
        kind: module.kind,
        difficulty: module.difficulty,
        durationMinutes: module.durationMinutes,
        passingScore: module.passingScore,
        theoryWeight: module.theoryWeight,
        isPublished: module.isPublished,
        isSimulation: module.isSimulation,
        competency: module.competency,
        course: module.course,
        taskCount: module.tasks.filter((task) => task.phase === 'ASSESSMENT').length,
        componentCount: module.components.filter((component) => component.isInteractive).length,
        /** Where this trainee stands on the competency the lab develops. */
        standing: {
          currentLevel: entry?.currentLevel ?? 0,
          effectiveLevel: freshness.effectiveLevel,
          requiredLevel,
          freshnessStatus: freshness.status,
          needsRefresher: freshness.needsRefresher,
        },
        progress: {
          attempts: mine.length,
          completed: completed.length,
          bestScore: best === null ? null : round1(best),
          /** The practical component alone, which is what the Competency Passport reports. */
          bestPractical: completed.length === 0 ? null : round1(Math.max(...completed.map((attempt) => attempt.practicalPercentage))),
          lastTheory: completed[0]?.theoryPercentage ?? null,
          passed: completed.some((attempt) => attempt.passed),
          lastAttemptAt: mine[0]?.startedAt ?? null,
          lastCompletedAt: completed[0]?.completedAt ?? null,
        },
      };
    }),
    asOf,
  };
}

/** One module, with its components and the guided-training tasks. No answers. */
export async function getModule(user: Actor, idOrKey: string, db: Db = prisma) {
  const module = await loadModule(idOrKey, db);
  assertVisible(module, user);

  const attempts = await db.aRPracticalAttempt.findMany({ where: { userId: user.id, arModuleId: module.id }, orderBy: { startedAt: 'desc' }, take: 10 });
  const theory = module.courseId ? await latestTheoryScore(db, user.id, module.courseId) : null;

  return {
    module: {
      id: module.id,
      key: module.key,
      title: module.title,
      subtitle: module.subtitle,
      description: module.description,
      objectives: module.objectives,
      modelUrl: module.modelUrl,
      modelHeightM: module.modelHeightM,
      kind: module.kind,
      difficulty: module.difficulty,
      durationMinutes: module.durationMinutes,
      passingScore: module.passingScore,
      theoryWeight: module.theoryWeight,
      isSimulation: module.isSimulation,
      competency: module.competency,
      course: module.course,
    },
    components: module.components.map(toComponentDto),
    /** Guided training: hints are part of the point here. */
    training: module.tasks.filter((task) => task.phase === 'TRAINING').map((task) => toTaskDto(task, { withHint: true })),
    assessmentTaskCount: module.tasks.filter((task) => task.phase === 'ASSESSMENT').length,
    assessmentTotalPoints: module.tasks.filter((task) => task.phase === 'ASSESSMENT').reduce((sum, task) => sum + task.points, 0),
    /** The theory score this practical will be combined with, so the trainee knows before starting. */
    theory: theory === null ? null : { percentage: theory, weight: module.theoryWeight },
    attempts: attempts.map(toAttemptDto),
  };
}

/** The most recent passed attempt on the linked theory assessment. */
async function latestTheoryScore(db: Db, userId: string, courseId: string): Promise<number | null> {
  const attempt = await db.assessmentAttempt.findFirst({
    where: { userId, passed: true, assessment: { courseId } },
    orderBy: { submittedAt: 'desc' },
    select: { percentage: true },
  });
  return attempt?.percentage ?? null;
}

// ---------------------------------------------------------------------------------------------
// Taking the practical
// ---------------------------------------------------------------------------------------------

const toAttemptDto = (attempt: {
  id: string;
  attemptNumber: number;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number | null;
  score: number;
  totalPoints: number;
  practicalPercentage: number;
  theoryPercentage: number | null;
  combinedPercentage: number | null;
  passed: boolean;
  hintsUsed: number;
  competencyBefore: number | null;
  competencyAfter: number | null;
}) => ({
  id: attempt.id,
  attemptNumber: attempt.attemptNumber,
  status: attempt.status,
  startedAt: attempt.startedAt,
  completedAt: attempt.completedAt,
  durationSeconds: attempt.durationSeconds,
  score: attempt.score,
  totalPoints: attempt.totalPoints,
  practicalPercentage: attempt.practicalPercentage,
  theoryPercentage: attempt.theoryPercentage,
  combinedPercentage: attempt.combinedPercentage,
  passed: attempt.passed,
  hintsUsed: attempt.hintsUsed,
  competencyBefore: attempt.competencyBefore,
  competencyAfter: attempt.competencyAfter,
});

/**
 * Begins a practical.
 *
 * An attempt already in progress is resumed rather than duplicated, so a
 * trainee whose phone locked mid-lab comes back to the same attempt.
 */
export async function startAttempt(user: Actor, idOrKey: string, ctx: AuditContext) {
  if (user.role !== 'TRAINEE') throw forbidden('ONLY_TRAINEES', 'Only trainees take AR practicals');
  const module = await loadModule(idOrKey);
  assertVisible(module, user);
  if (!module.isPublished) throw conflict('AR_MODULE_UNPUBLISHED', 'This AR lab is not published yet');

  const tasks = module.tasks.filter((task) => task.phase === 'ASSESSMENT');
  if (tasks.length === 0) throw conflict('AR_MODULE_INCOMPLETE', 'This AR lab has no practical tasks yet');

  const existing = await prisma.aRPracticalAttempt.findFirst({ where: { arModuleId: module.id, userId: user.id, status: 'IN_PROGRESS' }, orderBy: { startedAt: 'desc' } });
  if (existing) {
    return { resumed: true, attempt: toAttemptDto(existing), tasks: tasks.map((task) => toTaskDto(task, { withHint: false })), components: module.components.map(toComponentDto) };
  }

  const last = await prisma.aRPracticalAttempt.aggregate({ where: { arModuleId: module.id, userId: user.id }, _max: { attemptNumber: true } });
  const attempt = await prisma.aRPracticalAttempt.create({
    data: {
      arModuleId: module.id,
      userId: user.id,
      attemptNumber: (last._max.attemptNumber ?? 0) + 1,
      totalPoints: tasks.reduce((sum, task) => sum + task.points, 0),
    },
  });

  await recordAudit(ctx, { action: AuditActions.AR_PRACTICAL_STARTED, entityType: 'ARModule', entityId: module.id, metadata: { attempt: attempt.attemptNumber, module: module.title } });
  return { resumed: false, attempt: toAttemptDto(attempt), tasks: tasks.map((task) => toTaskDto(task, { withHint: false })), components: module.components.map(toComponentDto) };
}

export interface SubmitResult {
  attempt: ReturnType<typeof toAttemptDto>;
  module: { id: string; key: string; title: string; passingScore: number; theoryWeight: number; competencyName: string };
  review: {
    taskId: string;
    instruction: string;
    points: number;
    pointsAwarded: number;
    correct: boolean;
    selectedComponentId: string | null;
    selectedComponentName: string | null;
    correctComponentId: string;
    correctComponentName: string;
    explanation: string | null;
  }[];
  scoring: { practical: number; theory: number | null; theoryWeight: number; combined: number; explanation: string };
  competencyImpacts: CompetencyImpact[];
  /** True when this was a replay of an earlier submission rather than a fresh one. */
  replayed: boolean;
}

/**
 * Marks a practical.
 *
 * Everything that matters happens here, on the server: the answers are compared
 * with the database, the practical percentage is derived from the points, the
 * combined score is worked out from the module's configured weighting, and the
 * competency engine is given the practical result as evidence. All of it in one
 * transaction, so a competency can never move without the attempt that moved it.
 */
export async function submitAttempt(user: Actor, idOrKey: string, input: SubmitAttemptInput, ctx: AuditContext): Promise<SubmitResult> {
  if (user.role !== 'TRAINEE') throw forbidden('ONLY_TRAINEES', 'Only trainees take AR practicals');

  // A replay of a submission that already happened returns the original result untouched.
  if (input.idempotencyKey) {
    const previous = await prisma.aRPracticalAttempt.findUnique({ where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: input.idempotencyKey } } });
    if (previous) return buildResult(previous.id, true);
  }

  const module = await loadModule(idOrKey);
  const tasks = module.tasks.filter((task) => task.phase === 'ASSESSMENT');
  const attempt = await prisma.aRPracticalAttempt.findUnique({ where: { id: input.attemptId } });
  if (!attempt || attempt.arModuleId !== module.id) throw notFound('AR_ATTEMPT_NOT_FOUND', 'Attempt not found');
  if (attempt.userId !== user.id) throw forbidden('NOT_YOUR_ATTEMPT', 'This attempt belongs to someone else');
  if (attempt.status !== 'IN_PROGRESS') throw conflict('AR_ATTEMPT_ALREADY_SUBMITTED', 'This attempt has already been submitted');

  // ---- mark, from the database ---------------------------------------------------------------
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const componentIds = new Set(module.components.map((component) => component.id));
  const seen = new Set<string>();
  const marked: { taskId: string; selectedComponentId: string | null; correct: boolean; pointsAwarded: number; timeMs: number | null }[] = [];
  for (const response of input.responses) {
    const task = taskById.get(response.taskId);
    if (!task) throw conflict('AR_INVALID_RESPONSE', 'An answer refers to a task that is not part of this practical');
    if (seen.has(task.id)) throw conflict('AR_INVALID_RESPONSE', 'Each task can only be answered once');
    if (response.selectedComponentId && !componentIds.has(response.selectedComponentId)) {
      throw conflict('AR_INVALID_RESPONSE', 'An answer refers to a component that is not part of this model');
    }
    seen.add(task.id);
    const correct = response.selectedComponentId === task.correctComponentId;
    marked.push({
      taskId: task.id,
      selectedComponentId: response.selectedComponentId,
      correct,
      pointsAwarded: correct ? task.points : 0,
      timeMs: response.timeMs ?? null,
    });
  }

  const totalPoints = tasks.reduce((sum, task) => sum + task.points, 0);
  const score = marked.reduce((sum, response) => sum + response.pointsAwarded, 0);
  const practicalPercentage = totalPoints === 0 ? 0 : round1((score / totalPoints) * 100);

  const theoryPercentage = module.courseId ? await latestTheoryScore(prisma, user.id, module.courseId) : null;
  const combined = combinePracticalAndTheory(practicalPercentage, theoryPercentage, module.theoryWeight);
  const passed = combined.value >= module.passingScore;

  const now = new Date();
  const durationSeconds = Math.max(0, Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000));
  const config = await getEngineConfig();

  const before = await prisma.employeeCompetency.findUnique({
    where: { userId_competencyId: { userId: user.id, competencyId: module.competencyId } },
    select: { currentLevel: true },
  });

  const { impacts } = await prisma.$transaction(async (tx) => {
    await tx.aRPracticalAttempt.update({
      where: { id: attempt.id },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        durationSeconds,
        score,
        totalPoints,
        practicalPercentage,
        theoryPercentage,
        combinedPercentage: combined.value,
        passed,
        hintsUsed: input.hintsUsed ?? 0,
        idempotencyKey: input.idempotencyKey ?? null,
        competencyBefore: before?.currentLevel ?? 0,
      },
    });
    await tx.aRTaskResponse.createMany({ data: marked.map((response) => ({ attemptId: attempt.id, ...response })) });

    /*
     * The practical counts as practice, whatever it scored: the trainee has just
     * handled the instrument, which is what decay measures. This resets
     * `lastPracticedAt`, so a lab completed today pulls a faded competency back.
     */
    await recordPractice(
      {
        userId: user.id,
        competencyId: module.competencyId,
        practicedAt: now,
        source: module.kind === 'REFRESHER' ? 'REFRESHER' : 'COURSE_COMPLETION',
        note: `AR practical: ${module.title} (${practicalPercentage}%)`,
        courseId: module.courseId,
      },
      tx,
    );

    /*
     * Hand the practical result to the competency engine. The engine gathers all
     * current evidence - the latest theory assessment, any trainer evaluation and
     * this practical - and applies its own update rules. This module deliberately
     * does not decide what the new level is.
     */
    const applied = await applyCompetencyEvidence(
      tx,
      { kind: 'PRACTICAL', userId: user.id, competencyIds: [module.competencyId], courseId: module.courseId },
      config,
      now,
    );

    const after = applied.find((impact) => impact.competencyId === module.competencyId);
    if (after) await tx.aRPracticalAttempt.update({ where: { id: attempt.id }, data: { competencyAfter: after.newLevel } });
    return { impacts: applied };
  });

  await recordAudit(ctx, {
    action: AuditActions.AR_PRACTICAL_SUBMITTED,
    entityType: 'ARPracticalAttempt',
    entityId: attempt.id,
    metadata: { module: module.title, practical: practicalPercentage, theory: theoryPercentage, combined: combined.value, passed },
  });

  const moved = impacts.find((impact) => impact.competencyId === module.competencyId);
  if (moved?.changed) {
    await notifyUser(user.id, {
      type: 'COMPETENCY_UPDATE',
      title: `${moved.competencyName} updated to ${moved.newLevel}%`,
      message: `Your ${module.title} practical scored ${practicalPercentage}%. ${moved.explanation}`,
      link: '/trainee/passport',
      dedupeKey: `ar-attempt:${attempt.id}`,
    }).catch(() => undefined);
  }

  return buildResult(attempt.id, false, impacts);
}

/**
 * The combined score.
 *
 * `theoryWeight` is per module, so an administrator can decide how much of the
 * mark a practical carries. With no theory score yet - the trainee did the lab
 * first - the practical stands alone rather than being penalised for a theory
 * assessment that has not happened.
 */
export function combinePracticalAndTheory(practical: number, theory: number | null, theoryWeight: number): { value: number; explanation: string } {
  const weight = Math.min(1, Math.max(0, theoryWeight));
  if (theory === null || weight === 0) {
    return {
      value: round1(practical),
      explanation: theory === null ? `Practical ${practical}%. No theory result yet, so the practical stands on its own.` : `Practical ${practical}%. This module is scored on the practical alone.`,
    };
  }
  const value = round1(theory * weight + practical * (1 - weight));
  return {
    value,
    explanation: `Theory ${theory}% x ${Math.round(weight * 100)}% + practical ${practical}% x ${Math.round((1 - weight) * 100)}% = ${value}%.`,
  };
}

/** Rebuilds a submitted attempt's result, for the response and for replays. */
async function buildResult(attemptId: string, replayed: boolean, competencyImpacts: CompetencyImpact[] = []): Promise<SubmitResult> {
  const attempt = await prisma.aRPracticalAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      module: { include: { competency: { select: { name: true } }, tasks: { where: { phase: 'ASSESSMENT' }, orderBy: { position: 'asc' }, include: { correctComponent: { select: { id: true, name: true } } } } } },
      responses: { include: { selectedComponent: { select: { id: true, name: true } } } },
    },
  });

  const responseByTask = new Map(attempt.responses.map((response) => [response.taskId, response]));
  const review = attempt.module.tasks.map((task) => {
    const response = responseByTask.get(task.id);
    return {
      taskId: task.id,
      instruction: task.instruction,
      points: task.points,
      pointsAwarded: response?.pointsAwarded ?? 0,
      correct: response?.correct ?? false,
      selectedComponentId: response?.selectedComponentId ?? null,
      selectedComponentName: response?.selectedComponent?.name ?? null,
      correctComponentId: task.correctComponentId,
      correctComponentName: task.correctComponent.name,
      explanation: task.explanation,
    };
  });

  return {
    attempt: toAttemptDto(attempt),
    module: {
      id: attempt.module.id,
      key: attempt.module.key,
      title: attempt.module.title,
      passingScore: attempt.module.passingScore,
      theoryWeight: attempt.module.theoryWeight,
      competencyName: attempt.module.competency.name,
    },
    review,
    scoring: {
      practical: attempt.practicalPercentage,
      theory: attempt.theoryPercentage,
      theoryWeight: attempt.module.theoryWeight,
      combined: attempt.combinedPercentage ?? attempt.practicalPercentage,
      explanation: combinePracticalAndTheory(attempt.practicalPercentage, attempt.theoryPercentage, attempt.module.theoryWeight).explanation,
    },
    competencyImpacts,
    replayed,
  };
}

/** One finished attempt, for the trainee who took it or the staff who oversee it. */
export async function getAttempt(user: Actor, attemptId: string) {
  const attempt = await prisma.aRPracticalAttempt.findUnique({ where: { id: attemptId }, select: { userId: true, status: true } });
  if (!attempt) throw notFound('AR_ATTEMPT_NOT_FOUND', 'Attempt not found');
  if (attempt.userId !== user.id && user.role === 'TRAINEE') throw forbidden('NOT_YOUR_ATTEMPT', 'This attempt belongs to someone else');
  if (attempt.status !== 'COMPLETED') throw conflict('AR_ATTEMPT_IN_PROGRESS', 'This attempt has not been submitted yet');
  return buildResult(attemptId, false);
}

// ---------------------------------------------------------------------------------------------
// Oversight
// ---------------------------------------------------------------------------------------------

/** Practical results for the people a trainer or administrator oversees. */
export async function listAttempts(filter: { arModuleId?: string; userId?: string }, db: Db = prisma) {
  const attempts = await db.aRPracticalAttempt.findMany({
    where: { status: 'COMPLETED', ...(filter.arModuleId ? { arModuleId: filter.arModuleId } : {}), ...(filter.userId ? { userId: filter.userId } : {}) },
    include: {
      user: { select: { id: true, name: true, email: true, department: { select: { name: true } } } },
      module: { select: { id: true, key: true, title: true, kind: true, competency: { select: { id: true, name: true } } } },
    },
    orderBy: { completedAt: 'desc' },
    take: 200,
  });
  return attempts.map((attempt) => ({
    ...toAttemptDto(attempt),
    user: attempt.user,
    module: attempt.module,
  }));
}

/**
 * Organisation-level AR analytics.
 *
 * Deliberately includes the competency movement, because the point of the lab
 * is not that people completed it - it is whether it changed anything.
 */
export async function arAnalytics(db: Db = prisma) {
  const [modules, attempts] = await Promise.all([
    db.aRModule.findMany({ where: { isPublished: true }, select: { id: true, key: true, title: true, kind: true, passingScore: true } }),
    db.aRPracticalAttempt.findMany({
      where: { status: 'COMPLETED' },
      select: { arModuleId: true, userId: true, practicalPercentage: true, combinedPercentage: true, passed: true, completedAt: true, durationSeconds: true, competencyBefore: true, competencyAfter: true },
    }),
  ]);

  const mean = (values: number[]) => (values.length === 0 ? null : round1(values.reduce((sum, value) => sum + value, 0) / values.length));
  const improvements = attempts
    .filter((attempt) => attempt.competencyBefore !== null && attempt.competencyAfter !== null)
    .map((attempt) => (attempt.competencyAfter as number) - (attempt.competencyBefore as number));

  // Which tasks trip people up: the ones most often answered wrongly.
  const responses = await db.aRTaskResponse.groupBy({
    by: ['taskId'],
    _count: { _all: true },
    _sum: { pointsAwarded: true },
  });
  const taskIds = responses.map((row) => row.taskId);
  const taskRows = taskIds.length > 0 ? await db.aRTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, instruction: true, points: true, module: { select: { title: true } } } }) : [];
  const taskById = new Map(taskRows.map((task) => [task.id, task]));
  const hardestTasks = responses
    .map((row) => {
      const task = taskById.get(row.taskId);
      const answered = row._count._all;
      const earned = row._sum.pointsAwarded ?? 0;
      const possible = answered * (task?.points ?? 1);
      return {
        taskId: row.taskId,
        instruction: task?.instruction ?? 'Unknown task',
        moduleTitle: task?.module.title ?? '',
        answered,
        correctRate: possible === 0 ? 0 : round1((earned / possible) * 100),
      };
    })
    .filter((row) => row.answered >= 1)
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 5);

  // Completion by month, for the trend chart.
  const byMonth = new Map<string, number>();
  for (const attempt of attempts) {
    if (!attempt.completedAt) continue;
    const key = attempt.completedAt.toISOString().slice(0, 7);
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }

  // Practical score distribution, in tens.
  const distribution = Array.from({ length: 10 }, (_, index) => ({ band: `${index * 10}-${index * 10 + 9}`, count: 0 }));
  for (const attempt of attempts) {
    const index = Math.min(9, Math.floor(attempt.practicalPercentage / 10));
    (distribution[index] as { count: number }).count += 1;
  }

  return {
    labsCompleted: attempts.length,
    distinctLearners: new Set(attempts.map((attempt) => attempt.userId)).size,
    averagePractical: mean(attempts.map((attempt) => attempt.practicalPercentage)),
    averageCombined: mean(attempts.map((attempt) => attempt.combinedPercentage ?? attempt.practicalPercentage)),
    passRate: attempts.length === 0 ? null : round1((attempts.filter((attempt) => attempt.passed).length / attempts.length) * 100),
    averageDurationSeconds: mean(attempts.filter((attempt) => attempt.durationSeconds !== null).map((attempt) => attempt.durationSeconds as number)),
    refresherCompletions: attempts.filter((attempt) => modules.find((module) => module.id === attempt.arModuleId)?.kind === 'REFRESHER').length,
    averageCompetencyGain: mean(improvements),
    byModule: modules.map((module) => {
      const mine = attempts.filter((attempt) => attempt.arModuleId === module.id);
      return {
        moduleId: module.id,
        key: module.key,
        title: module.title,
        kind: module.kind,
        completions: mine.length,
        averagePractical: mean(mine.map((attempt) => attempt.practicalPercentage)),
        passRate: mine.length === 0 ? null : round1((mine.filter((attempt) => attempt.passed).length / mine.length) * 100),
      };
    }),
    trend: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
    distribution,
    hardestTasks,
    isDemonstrationData: true,
  };
}

/**
 * The refresher to offer this trainee, if any.
 *
 * This is the join between the decay engine and the AR lab: a competency the
 * freshness engine reports as needing attention, for which a refresher module
 * exists. Returns null when there is nothing to recommend, which is the normal case.
 */
export async function recommendedRefresher(userId: string, options: { db?: Db; asOf?: AsOf } = {}) {
  const db = options.db ?? prisma;
  const asOf = options.asOf ?? TODAY();
  const config = await getEngineConfig(db);

  const refreshers = await db.aRModule.findMany({ where: { isPublished: true, kind: 'REFRESHER' }, include: { competency: { select: { id: true, name: true } } } });
  if (refreshers.length === 0) return null;

  const competencyIds = refreshers.map((module) => module.competencyId);
  const user = await db.user.findUnique({ where: { id: userId }, select: { jobRoleId: true } });
  const [held, requirements, policies] = await Promise.all([
    db.employeeCompetency.findMany({ where: { userId, competencyId: { in: competencyIds } } }),
    user?.jobRoleId ? db.roleCompetency.findMany({ where: { roleId: user.jobRoleId, competencyId: { in: competencyIds } } }) : [],
    loadDecayPolicies(config, competencyIds, db),
  ]);
  const heldBy = new Map(held.map((entry) => [entry.competencyId, entry]));
  const requiredBy = new Map(requirements.map((entry) => [entry.competencyId, entry.requiredLevel]));

  const candidates = refreshers
    .map((module) => {
      const entry = heldBy.get(module.competencyId);
      const freshness = analyzeFreshness(
        {
          baselineLevel: entry?.currentLevel ?? 0,
          requiredLevel: requiredBy.get(module.competencyId) ?? 0,
          lastPracticedAt: entry?.lastPracticedAt ?? null,
          lastAssessedAt: entry?.lastEvidenceAt ?? null,
          policy: policyFor(policies, module.competencyId, config),
        },
        asOf.date,
        config,
      );
      return { module, freshness };
    })
    // Only offer a refresher for a competency the person actually holds and has let slip.
    .filter((candidate) => candidate.freshness.needsRefresher && (heldBy.get(candidate.module.competencyId)?.currentLevel ?? 0) > 0);

  if (candidates.length === 0) return null;
  // Worst first: the largest shortfall against what the role needs.
  candidates.sort((a, b) => b.freshness.gap - a.freshness.gap);
  const best = candidates[0] as (typeof candidates)[number];

  return {
    module: {
      id: best.module.id,
      key: best.module.key,
      title: best.module.title,
      durationMinutes: best.module.durationMinutes,
      modelUrl: best.module.modelUrl,
    },
    competency: best.module.competency,
    freshness: best.freshness,
    reason: `${best.module.competency.name} is ${best.freshness.statusLabel.toLowerCase()}: ${best.freshness.reason}`,
    asOf,
  };
}
