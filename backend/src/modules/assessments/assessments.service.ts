import type { Prisma } from '@prisma/client';
import { Prisma as PrismaNS } from '@prisma/client';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { assertCanManage, loadManagedCourse } from '../courses/courses.service';
import { recomputeCourseEnrollments } from '../enrollments/enrollments.service';
import { optionIssues, type CreateAssessmentInput, type CreateQuestionInput, type ScenarioInput, type UpdateAssessmentInput, type UpdateQuestionInput } from './assessments.schemas';

type Actor = Express.AuthUser;

/** A submission this long after the deadline of a timed attempt is still accepted (network latency). */
export const SUBMIT_GRACE_MS = 60_000;

export const assessmentInclude = {
  course: { select: { id: true, title: true, trainerId: true, status: true, deletedAt: true, passingScore: true, certificateEnabled: true } },
  _count: { select: { questions: true, attempts: true } },
} satisfies Prisma.AssessmentInclude;

export type AssessmentRow = Prisma.AssessmentGetPayload<{ include: typeof assessmentInclude }>;

export async function loadAssessment(id: string): Promise<AssessmentRow> {
  const assessment = await prisma.assessment.findUnique({ where: { id }, include: assessmentInclude });
  if (!assessment || assessment.course.deletedAt) throw notFound('ASSESSMENT_NOT_FOUND', 'Assessment not found');
  return assessment;
}

export async function loadManagedAssessment(user: Actor, id: string): Promise<AssessmentRow> {
  const assessment = await loadAssessment(id);
  assertCanManage(user, assessment.course);
  return assessment;
}

// ---------------------------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------------------------

const questionDetailInclude = { options: { orderBy: { position: 'asc' as const } } };

/** Trainer / admin view: settings, the full question bank and the correct answers. */
export async function getManagedAssessment(user: Actor, id: string) {
  const assessment = await loadManagedAssessment(user, id);
  const [questions, scenarios] = await Promise.all([
    prisma.question.findMany({ where: { assessmentId: id }, orderBy: { position: 'asc' }, include: questionDetailInclude }),
    listScenarios(id),
  ]);
  return { ...toManagerDto(assessment, questions), scenarios };
}

const scenarioInclude = { steps: { include: { options: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } } } satisfies Prisma.PracticalScenarioInclude;

/** The practical component with its marking, for the people who author it. */
export function listScenarios(assessmentId: string) {
  return prisma.practicalScenario.findMany({ where: { assessmentId }, include: scenarioInclude, orderBy: { position: 'asc' } });
}

/**
 * Replaces the whole practical component.
 *
 * Wholesale replacement keeps the step and option positions consistent without
 * a diffing protocol. Existing responses point at the old steps and are removed
 * with them by the cascade, so this is refused once anyone has been marked
 * against these scenarios.
 */
export async function replaceScenarios(user: Actor, assessmentId: string, scenarios: ScenarioInput[], ctx: AuditContext) {
  const assessment = await loadManagedAssessment(user, assessmentId);

  const graded = await prisma.practicalResponse.count({ where: { scenario: { assessmentId } } });
  if (graded > 0) {
    throw conflict('SCENARIOS_IN_USE', `${graded} answer(s) have already been marked against these scenarios. Create a new assessment rather than changing how past attempts were marked.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.practicalScenario.deleteMany({ where: { assessmentId } });
    for (const [position, scenario] of scenarios.entries()) {
      await tx.practicalScenario.create({
        data: {
          assessmentId,
          title: scenario.title,
          briefing: scenario.briefing,
          imageUrl: scenario.imageUrl ?? null,
          marks: scenario.steps.reduce((sum, step) => sum + step.marks, 0),
          position,
          steps: {
            create: scenario.steps.map((step, stepPosition) => ({
              type: step.type,
              prompt: step.prompt,
              marks: step.marks,
              explanation: step.explanation ?? null,
              position: stepPosition,
              options: { create: step.options.map((option, optionPosition) => ({ text: option.text, credit: option.credit, rationale: option.rationale ?? null, position: optionPosition })) },
            })),
          },
        },
      });
    }
  });

  await recordAudit(ctx, {
    action: AuditActions.ASSESSMENT_UPDATED,
    entityType: 'Assessment',
    entityId: assessmentId,
    metadata: { practicalScenarios: scenarios.length, title: assessment.title },
  });
  return listScenarios(assessmentId);
}

type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof questionDetailInclude }>;

function toManagerDto(assessment: AssessmentRow, questions: QuestionRow[]) {
  return {
    id: assessment.id,
    courseId: assessment.courseId,
    courseTitle: assessment.course.title,
    title: assessment.title,
    description: assessment.description,
    instructions: assessment.instructions,
    timeLimitMinutes: assessment.timeLimitMinutes,
    passingScore: assessment.passingScore,
    maxAttempts: assessment.maxAttempts,
    deadline: assessment.deadline,
    questionsPerAttempt: assessment.questionsPerAttempt,
    isPublished: assessment.isPublished,
    shuffleQuestions: assessment.shuffleQuestions,
    shuffleOptions: assessment.shuffleOptions,
    showCorrectAnswers: assessment.showCorrectAnswers,
    mcqWeight: assessment.mcqWeight,
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
    attemptCount: assessment._count.attempts,
    questionCount: questions.length,
    totalMarks: questions.reduce((sum, question) => sum + question.marks, 0),
    questions: questions.map((question) => ({
      id: question.id,
      text: question.text,
      type: question.type,
      marks: question.marks,
      explanation: question.explanation,
      position: question.position,
      options: question.options.map((option) => ({ id: option.id, text: option.text, isCorrect: option.isCorrect, position: option.position })),
    })),
  };
}

const questionCreateData = (question: CreateQuestionInput, position: number) => ({
  text: question.text,
  type: question.type,
  marks: question.marks,
  explanation: question.explanation ?? null,
  position,
  options: { create: question.options.map((option, index) => ({ text: option.text, isCorrect: option.isCorrect, position: index })) },
});

function assertPublishable(questionCount: number, questionsPerAttempt: number | null | undefined): void {
  if (questionCount === 0) throw unprocessable('ASSESSMENT_INCOMPLETE', 'Add at least one question before publishing the assessment');
  if (questionsPerAttempt && questionsPerAttempt > questionCount) {
    throw unprocessable('ASSESSMENT_INCOMPLETE', `The assessment draws ${questionsPerAttempt} questions per attempt but the question bank only has ${questionCount}`);
  }
}

export async function createAssessment(user: Actor, input: CreateAssessmentInput, ctx: AuditContext) {
  const course = await loadManagedCourse(user, input.courseId);
  if (await prisma.assessment.findUnique({ where: { courseId: input.courseId }, select: { id: true } })) {
    throw conflict('ASSESSMENT_EXISTS', 'This course already has an assessment. Edit it instead.');
  }
  if (input.isPublished) assertPublishable(input.questions.length, input.questionsPerAttempt);
  if (input.questionsPerAttempt && input.questions.length > 0 && input.questionsPerAttempt > input.questions.length) {
    throw badRequest('INVALID_QUESTIONS_PER_ATTEMPT', 'Questions per attempt cannot exceed the number of questions in the bank');
  }

  const assessment = await prisma.assessment.create({
    data: {
      courseId: course.id,
      title: input.title,
      description: input.description ?? null,
      instructions: input.instructions ?? null,
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      passingScore: input.passingScore ?? course.passingScore,
      maxAttempts: input.maxAttempts,
      deadline: input.deadline ?? null,
      questionsPerAttempt: input.questionsPerAttempt ?? null,
      isPublished: input.isPublished,
      shuffleQuestions: input.shuffleQuestions,
      shuffleOptions: input.shuffleOptions,
      showCorrectAnswers: input.showCorrectAnswers,
      createdById: user.id,
      questions: { create: input.questions.map((question, index) => questionCreateData(question, index)) },
    },
  });
  if (input.isPublished) await recomputeCourseEnrollments(prisma, course.id);
  await recordAudit(ctx, { action: AuditActions.ASSESSMENT_CREATED, entityType: 'Assessment', entityId: assessment.id, metadata: { course: course.title, questions: input.questions.length } });
  return getManagedAssessment(user, assessment.id);
}

export async function updateAssessment(user: Actor, id: string, input: UpdateAssessmentInput, ctx: AuditContext) {
  const assessment = await loadManagedAssessment(user, id);
  const effectivePerAttempt = input.questionsPerAttempt === undefined ? assessment.questionsPerAttempt : input.questionsPerAttempt;
  if (effectivePerAttempt && effectivePerAttempt > assessment._count.questions) {
    throw badRequest('INVALID_QUESTIONS_PER_ATTEMPT', 'Questions per attempt cannot exceed the number of questions in the bank');
  }
  if (input.isPublished) assertPublishable(assessment._count.questions, effectivePerAttempt);

  await prisma.assessment.update({ where: { id }, data: input });
  if (input.isPublished !== undefined && input.isPublished !== assessment.isPublished) await recomputeCourseEnrollments(prisma, assessment.courseId);
  await recordAudit(ctx, {
    action: AuditActions.ASSESSMENT_UPDATED,
    entityType: 'Assessment',
    entityId: id,
    metadata: { changes: Object.keys(input), ...(input.passingScore !== undefined && assessment._count.attempts > 0 ? { passMarkChangedAfterAttempts: true } : {}) },
  });
  return getManagedAssessment(user, id);
}

export async function deleteAssessment(user: Actor, id: string, ctx: AuditContext): Promise<void> {
  const assessment = await loadManagedAssessment(user, id);
  if (assessment._count.attempts > 0) {
    throw conflict('ASSESSMENT_HAS_ATTEMPTS', 'Learners have already attempted this assessment. Unpublish it instead of deleting it.');
  }
  await prisma.assessment.delete({ where: { id } });
  await recomputeCourseEnrollments(prisma, assessment.courseId);
  await recordAudit(ctx, { action: AuditActions.ASSESSMENT_DELETED, entityType: 'Assessment', entityId: id, metadata: { course: assessment.course.title } });
}

// ---- questions -----------------------------------------------------------------------------------------

async function assertNoAttempts(assessment: AssessmentRow, what: string): Promise<void> {
  if (assessment._count.attempts > 0) {
    throw conflict('ASSESSMENT_HAS_ATTEMPTS', `${what} cannot be changed after learners have attempted the assessment, because it would rewrite scored results.`);
  }
}

export async function addQuestions(user: Actor, assessmentId: string, questions: CreateQuestionInput[], ctx: AuditContext) {
  const assessment = await loadManagedAssessment(user, assessmentId);
  const last = await prisma.question.aggregate({ where: { assessmentId }, _max: { position: true } });
  const start = (last._max.position ?? -1) + 1;
  await prisma.$transaction(questions.map((question, index) => prisma.question.create({ data: { assessmentId, ...questionCreateData(question, start + index) } })));
  await recordAudit(ctx, { action: AuditActions.ASSESSMENT_UPDATED, entityType: 'Assessment', entityId: assessmentId, metadata: { questionsAdded: questions.length, course: assessment.course.title } });
  return getManagedAssessment(user, assessmentId);
}

export async function updateQuestion(user: Actor, assessmentId: string, questionId: string, input: UpdateQuestionInput, ctx: AuditContext) {
  const assessment = await loadManagedAssessment(user, assessmentId);
  const question = await prisma.question.findFirst({ where: { id: questionId, assessmentId }, include: questionDetailInclude });
  if (!question) throw notFound('QUESTION_NOT_FOUND', 'Question not found');

  const scoringChange = input.options !== undefined || input.type !== undefined || input.marks !== undefined;
  if (scoringChange) await assertNoAttempts(assessment, 'Options, question type and marks');

  const type = input.type ?? question.type;
  if (input.options !== undefined || input.type !== undefined) {
    const options = input.options ?? question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect }));
    const issue = optionIssues(type, options);
    if (issue) throw unprocessable('INVALID_OPTIONS', issue);
  }

  await prisma.$transaction(async (tx) => {
    await tx.question.update({
      where: { id: questionId },
      data: {
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.marks !== undefined ? { marks: input.marks } : {}),
        ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
      },
    });
    if (input.options) {
      await tx.questionOption.deleteMany({ where: { questionId } });
      await tx.questionOption.createMany({ data: input.options.map((option, index) => ({ questionId, text: option.text, isCorrect: option.isCorrect, position: index })) });
    }
  });
  await recordAudit(ctx, { action: AuditActions.ASSESSMENT_UPDATED, entityType: 'Assessment', entityId: assessmentId, metadata: { questionUpdated: questionId, changes: Object.keys(input) } });
  return getManagedAssessment(user, assessmentId);
}

export async function deleteQuestion(user: Actor, assessmentId: string, questionId: string, ctx: AuditContext) {
  const assessment = await loadManagedAssessment(user, assessmentId);
  await assertNoAttempts(assessment, 'Questions');
  const question = await prisma.question.findFirst({ where: { id: questionId, assessmentId }, select: { id: true } });
  if (!question) throw notFound('QUESTION_NOT_FOUND', 'Question not found');
  if (assessment.isPublished && assessment._count.questions <= 1) throw conflict('LAST_QUESTION', 'A published assessment needs at least one question. Unpublish it first.');
  if (assessment.questionsPerAttempt && assessment._count.questions - 1 < assessment.questionsPerAttempt) {
    throw conflict('QUESTION_BANK_TOO_SMALL', 'Removing this question would leave fewer questions than are drawn per attempt');
  }
  await prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id: questionId } });
    const remaining = await tx.question.findMany({ where: { assessmentId }, orderBy: { position: 'asc' }, select: { id: true } });
    for (const [index, item] of remaining.entries()) await tx.question.update({ where: { id: item.id }, data: { position: index } });
  });
  await recordAudit(ctx, { action: AuditActions.ASSESSMENT_UPDATED, entityType: 'Assessment', entityId: assessmentId, metadata: { questionDeleted: questionId } });
  return getManagedAssessment(user, assessmentId);
}

export async function reorderQuestions(user: Actor, assessmentId: string, questionIds: string[], ctx: AuditContext) {
  await loadManagedAssessment(user, assessmentId);
  const existing = await prisma.question.findMany({ where: { assessmentId }, select: { id: true } });
  const same = existing.length === questionIds.length && new Set(questionIds).size === questionIds.length && existing.every((question) => questionIds.includes(question.id));
  if (!same) throw badRequest('INVALID_ORDER', 'The ordering must list every question exactly once');
  await prisma.$transaction(questionIds.map((id, index) => prisma.question.update({ where: { id }, data: { position: index } })));
  await recordAudit(ctx, { action: AuditActions.ASSESSMENT_UPDATED, entityType: 'Assessment', entityId: assessmentId, metadata: { reordered: true } });
  return getManagedAssessment(user, assessmentId);
}

// ---------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------

/** Trainer / admin: assessments of the courses they manage, with headline statistics. */
export async function listManagedAssessments(user: Actor, courseId?: string) {
  if (user.role === 'TRAINEE') throw forbidden();
  const rows = await prisma.assessment.findMany({
    where: {
      course: { deletedAt: null, ...(user.role === 'TRAINER' ? { trainerId: user.id } : {}) },
      ...(courseId ? { courseId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: assessmentInclude,
  });
  const ids = rows.map((row) => row.id);
  const [submitted, passed] = await Promise.all([
    prisma.assessmentAttempt.groupBy({ by: ['assessmentId'], where: { assessmentId: { in: ids }, status: 'SUBMITTED' }, _count: true, _avg: { percentage: true } }),
    prisma.assessmentAttempt.groupBy({ by: ['assessmentId'], where: { assessmentId: { in: ids }, status: 'SUBMITTED', passed: true }, _count: true }),
  ]);
  const submittedBy = new Map(submitted.map((row) => [row.assessmentId, row]));
  const passedBy = new Map(passed.map((row) => [row.assessmentId, row._count]));
  return rows.map((row) => {
    const stats = submittedBy.get(row.id);
    const attempts = stats?._count ?? 0;
    return {
      id: row.id,
      courseId: row.courseId,
      courseTitle: row.course.title,
      title: row.title,
      isPublished: row.isPublished,
      passingScore: row.passingScore,
      maxAttempts: row.maxAttempts,
      timeLimitMinutes: row.timeLimitMinutes,
      deadline: row.deadline,
      questionCount: row._count.questions,
      attemptsSubmitted: attempts,
      passRate: attempts === 0 ? null : Math.round(((passedBy.get(row.id) ?? 0) / attempts) * 1000) / 10,
      averageScore: stats?._avg.percentage == null ? null : Math.round(stats._avg.percentage * 10) / 10,
      updatedAt: row.updatedAt,
    };
  });
}

/** Mapped here so unique-violation handling stays out of the routes. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof PrismaNS.PrismaClientKnownRequestError && error.code === 'P2002';
}
