import type { AssessmentAttempt, Prisma } from '@prisma/client';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';
import { checkAchievements } from '../achievements/achievements.service';
import { announceCertificate, issueCertificate } from '../certificates/certificate.service';
import { applyCompetencyEvidence, type CompetencyImpact } from '../competencies/evidence.service';
import { getEngineConfig } from '../competencies/engine-config.service';
import type { SubmitInput } from './assessments.schemas';
import { loadAssessment, SUBMIT_GRACE_MS, type AssessmentRow } from './assessments.service';
import { combineScores, isPassing, scoreAnswers, scoreScenarios, shuffle, shuffledOptions, type ScorableStep } from './scoring';

type Actor = Express.AuthUser;

const REASON_MESSAGES: Record<string, string> = {
  NOT_PUBLISHED: 'This assessment is not open yet.',
  NO_QUESTIONS: 'This assessment has no questions yet.',
  NOT_ENROLLED: 'Enroll in the course to take its assessment.',
  MODULES_INCOMPLETE: 'Complete every module of the course before taking the assessment.',
  ALREADY_PASSED: 'You have already passed this assessment.',
  DEADLINE_PASSED: 'The deadline for this assessment has passed.',
  NO_ATTEMPTS_LEFT: 'You have used all of your attempts.',
};

export interface Availability {
  eligible: boolean;
  reasons: string[];
  attemptsUsed: number;
  /** null = unlimited. */
  attemptsAllowed: number | null;
  attemptsRemaining: number | null;
  passed: boolean;
  bestScore: number | null;
  deadline: Date | null;
  deadlinePassed: boolean;
  inProgress: { id: string; startedAt: Date; expiresAt: Date | null } | null;
  enrollment: { id: string; status: string; progress: number } | null;
}

const isStale = (attempt: { status: string; expiresAt: Date | null }, now: Date) =>
  attempt.status === 'IN_PROGRESS' && attempt.expiresAt !== null && attempt.expiresAt.getTime() + SUBMIT_GRACE_MS < now.getTime();

/** Can this learner start (or resume) the assessment right now, and if not, why not? */
export async function computeAvailability(userId: string, assessment: AssessmentRow, now: Date = new Date()): Promise<Availability> {
  const [enrollment, attempts] = await Promise.all([
    prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId: assessment.courseId } }, select: { id: true, status: true, progress: true } }),
    prisma.assessmentAttempt.findMany({
      where: { assessmentId: assessment.id, userId },
      select: { id: true, status: true, passed: true, percentage: true, startedAt: true, expiresAt: true },
    }),
  ]);

  const active = attempts.find((attempt) => attempt.status === 'IN_PROGRESS' && !isStale(attempt, now)) ?? null;
  const used = attempts.filter((attempt) => attempt.id !== active?.id).length; // submitted, expired, or stale in-progress
  const passed = attempts.some((attempt) => attempt.status === 'SUBMITTED' && attempt.passed === true);
  const scores = attempts.filter((attempt) => attempt.status === 'SUBMITTED').map((attempt) => attempt.percentage ?? 0);
  const deadlinePassed = assessment.deadline !== null && assessment.deadline.getTime() < now.getTime();
  const attemptsAllowed = assessment.maxAttempts === 0 ? null : assessment.maxAttempts;
  const attemptsRemaining = attemptsAllowed === null ? null : Math.max(0, attemptsAllowed - used);

  const reasons: string[] = [];
  if (!assessment.isPublished) reasons.push('NOT_PUBLISHED');
  else if (assessment._count.questions === 0) reasons.push('NO_QUESTIONS');
  if (!enrollment || enrollment.status === 'WITHDRAWN') reasons.push('NOT_ENROLLED');
  else if (enrollment.progress < 100) reasons.push('MODULES_INCOMPLETE');
  if (passed) reasons.push('ALREADY_PASSED');
  if (deadlinePassed) reasons.push('DEADLINE_PASSED');
  if (attemptsRemaining !== null && attemptsRemaining <= 0) reasons.push('NO_ATTEMPTS_LEFT');

  return {
    eligible: reasons.length === 0,
    reasons,
    attemptsUsed: used,
    attemptsAllowed,
    attemptsRemaining,
    passed,
    bestScore: scores.length === 0 ? null : Math.max(...scores),
    deadline: assessment.deadline,
    deadlinePassed,
    inProgress: active ? { id: active.id, startedAt: active.startedAt, expiresAt: active.expiresAt } : null,
    enrollment: enrollment && enrollment.status !== 'WITHDRAWN' ? enrollment : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Starting an attempt
// ---------------------------------------------------------------------------------------------

type QuestionWithOptions = Prisma.QuestionGetPayload<{ include: { options: true } }>;
type ScenarioWithSteps = Prisma.PracticalScenarioGetPayload<{ include: { steps: { include: { options: true } } } }>;

/** The practical part of an assessment, if it has one. Loaded in the order it is presented. */
export function loadScenarios(assessmentId: string, db = prisma): Promise<ScenarioWithSteps[]> {
  return db.practicalScenario.findMany({
    where: { assessmentId },
    include: { steps: { include: { options: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } } },
    orderBy: { position: 'asc' },
  });
}

function attemptPayload(attempt: AssessmentAttempt, assessment: AssessmentRow, questions: QuestionWithOptions[], resumed: boolean, now: Date, scenarios: ScenarioWithSteps[] = []) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const ordered = attempt.questionOrder.map((id) => byId.get(id)).filter((question): question is QuestionWithOptions => Boolean(question));
  return {
    resumed,
    attempt: {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      remainingSeconds: attempt.expiresAt ? Math.max(0, Math.round((attempt.expiresAt.getTime() - now.getTime()) / 1000)) : null,
    },
    assessment: {
      id: assessment.id,
      title: assessment.title,
      instructions: assessment.instructions,
      passingScore: assessment.passingScore,
      timeLimitMinutes: assessment.timeLimitMinutes,
      totalMarks: ordered.reduce((sum, question) => sum + question.marks, 0),
      /** How the two components combine; 1 means the questions are the whole mark. */
      mcqWeight: assessment.mcqWeight,
      practicalMarks: scenarios.reduce((sum, scenario) => sum + scenario.steps.reduce((stepSum, step) => stepSum + step.marks, 0), 0),
    },
    /**
     * The practical component. Like the questions, the marking is withheld: an
     * option's `credit` and `rationale` would give the best decision away, so
     * they are only sent with the result.
     */
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      briefing: scenario.briefing,
      imageUrl: scenario.imageUrl,
      marks: scenario.marks,
      steps: scenario.steps.map((step) => ({
        id: step.id,
        type: step.type,
        prompt: step.prompt,
        marks: step.marks,
        options: step.options.map((option) => ({ id: option.id, text: option.text })),
      })),
    })),
    // Correct answers and explanations are NEVER sent while an attempt is open.
    questions: ordered.map((question) => ({
      id: question.id,
      text: question.text,
      type: question.type,
      marks: question.marks,
      options: (assessment.shuffleOptions ? shuffledOptions([...question.options].sort((a, b) => a.position - b.position), attempt.id, question.id) : [...question.options].sort((a, b) => a.position - b.position)).map(
        (option) => ({ id: option.id, text: option.text }),
      ),
    })),
  };
}

export async function startAttempt(user: Actor, assessmentId: string, ctx: AuditContext) {
  if (user.role !== 'TRAINEE') throw forbidden('ONLY_TRAINEES', 'Only trainees can take assessments');
  const assessment = await loadAssessment(assessmentId);
  const now = new Date();

  // Attempts abandoned past their time limit become EXPIRED (and count as used).
  await prisma.assessmentAttempt.updateMany({
    where: { assessmentId, userId: user.id, status: 'IN_PROGRESS', expiresAt: { lt: new Date(now.getTime() - SUBMIT_GRACE_MS) } },
    data: { status: 'EXPIRED' },
  });

  const availability = await computeAvailability(user.id, assessment, now);
  const loadQuestions = (ids?: string[]) =>
    prisma.question.findMany({ where: { assessmentId, ...(ids ? { id: { in: ids } } : {}) }, orderBy: { position: 'asc' }, include: { options: true } });

  if (availability.inProgress) {
    const resumed = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: availability.inProgress.id } });
    return attemptPayload(resumed, assessment, await loadQuestions(resumed.questionOrder), true, now, await loadScenarios(assessmentId));
  }
  if (!availability.eligible) {
    const code = availability.reasons[0] ?? 'NOT_ELIGIBLE';
    throw conflict(code, REASON_MESSAGES[code] ?? 'You cannot start this assessment right now.', { reasons: availability.reasons });
  }

  const bank = await loadQuestions();
  const drawn = assessment.questionsPerAttempt ? shuffle(bank).slice(0, assessment.questionsPerAttempt) : bank;
  const ordered = assessment.shuffleQuestions ? shuffle(drawn) : [...drawn].sort((a, b) => a.position - b.position);

  const last = await prisma.assessmentAttempt.aggregate({ where: { assessmentId, userId: user.id }, _max: { attemptNumber: true } });
  let attempt: AssessmentAttempt;
  try {
    attempt = await prisma.assessmentAttempt.create({
      data: {
        assessmentId,
        userId: user.id,
        enrollmentId: availability.enrollment?.id ?? null,
        attemptNumber: (last._max.attemptNumber ?? 0) + 1,
        questionOrder: ordered.map((question) => question.id),
        expiresAt: assessment.timeLimitMinutes ? new Date(now.getTime() + assessment.timeLimitMinutes * 60_000) : null,
        startedAt: now,
      },
    });
  } catch (error) {
    // A concurrent start already created the attempt (unique user + assessment + number): resume it.
    const existing = await prisma.assessmentAttempt.findFirst({ where: { assessmentId, userId: user.id, status: 'IN_PROGRESS' }, orderBy: { startedAt: 'desc' } });
    if (existing) return attemptPayload(existing, assessment, await loadQuestions(existing.questionOrder), true, now, await loadScenarios(assessmentId));
    throw error;
  }
  await recordAudit(ctx, { action: AuditActions.ASSESSMENT_STARTED, entityType: 'Assessment', entityId: assessmentId, metadata: { attempt: attempt.attemptNumber, course: assessment.course.title } });
  return attemptPayload(attempt, assessment, ordered, false, now, await loadScenarios(assessmentId));
}

// ---------------------------------------------------------------------------------------------
// Submitting
// ---------------------------------------------------------------------------------------------

export function toAttemptDto(
  attempt: Pick<
    AssessmentAttempt,
    'id' | 'attemptNumber' | 'status' | 'startedAt' | 'submittedAt' | 'score' | 'totalMarks' | 'percentage' | 'mcqPercentage' | 'practicalPercentage' | 'passed' | 'timeTakenSeconds'
  >,
) {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    totalMarks: attempt.totalMarks,
    percentage: attempt.percentage,
    /** The components behind `percentage`; null when the assessment had no practical part. */
    mcqPercentage: attempt.mcqPercentage,
    practicalPercentage: attempt.practicalPercentage,
    passed: attempt.passed,
    timeTakenSeconds: attempt.timeTakenSeconds,
  };
}

export async function submitAttempt(user: Actor, assessmentId: string, input: SubmitInput, ctx: AuditContext) {
  if (user.role !== 'TRAINEE') throw forbidden('ONLY_TRAINEES', 'Only trainees can take assessments');
  const assessment = await loadAssessment(assessmentId);

  /**
   * A retry of a submission that already succeeded (the response was lost on the
   * way back, which is the normal case on a poor connection) returns the original
   * result. It must not create a second attempt, grade twice or issue a second
   * certificate.
   */
  if (input.idempotencyKey) {
    const replay = await prisma.assessmentAttempt.findUnique({
      where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: input.idempotencyKey } },
    });
    if (replay) {
      if (replay.assessmentId !== assessmentId) throw conflict('IDEMPOTENCY_KEY_REUSED', 'That submission key was already used for a different assessment.');
      return buildSubmissionResult(replay.id);
    }
  }

  const attempt = await prisma.assessmentAttempt.findFirst({ where: { id: input.attemptId, assessmentId, userId: user.id } });
  if (!attempt) throw notFound('ATTEMPT_NOT_FOUND', 'Attempt not found');
  if (attempt.status !== 'IN_PROGRESS') throw conflict('ATTEMPT_ALREADY_SUBMITTED', attempt.status === 'EXPIRED' ? 'This attempt expired before it was submitted.' : 'This attempt has already been submitted.');

  const now = new Date();
  if (attempt.expiresAt && now.getTime() > attempt.expiresAt.getTime() + SUBMIT_GRACE_MS) {
    await prisma.assessmentAttempt.updateMany({ where: { id: attempt.id, status: 'IN_PROGRESS' }, data: { status: 'EXPIRED' } });
    throw new AppError(409, 'ATTEMPT_EXPIRED', 'The time limit for this attempt has passed, so it could not be submitted. It counts as one of your attempts.');
  }

  const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: assessment.courseId } } });
  if (!enrollment || enrollment.status === 'WITHDRAWN') throw conflict('NOT_ENROLLED', REASON_MESSAGES['NOT_ENROLLED'] as string);

  // ---- validate and score -----------------------------------------------------------------------------
  const questions = await prisma.question.findMany({ where: { id: { in: attempt.questionOrder } }, include: { options: true } });
  const byId = new Map(questions.map((question) => [question.id, question]));
  const answers = new Map<string, string[]>();
  for (const answer of input.answers) {
    const question = byId.get(answer.questionId);
    if (!question) throw badRequest('INVALID_ANSWER', 'An answer refers to a question that is not part of this attempt');
    if (answers.has(answer.questionId)) throw badRequest('DUPLICATE_ANSWER', 'Each question can only be answered once');
    const optionIds = new Set(question.options.map((option) => option.id));
    if (answer.optionIds.some((id) => !optionIds.has(id))) throw badRequest('INVALID_ANSWER', 'An answer refers to an option that does not belong to the question');
    if (question.type === 'SINGLE' && answer.optionIds.length > 1) throw badRequest('INVALID_ANSWER', 'Only one option can be selected for a single-answer question');
    answers.set(answer.questionId, answer.optionIds);
  }
  const result = scoreAnswers(questions, answers);

  // ---- practical component (scenarios), when the assessment has one ------------------------------------
  const scenarios = await loadScenarios(assessmentId);
  const steps: ScorableStep[] = scenarios.flatMap((scenario) =>
    scenario.steps.map((step) => ({ id: step.id, scenarioId: scenario.id, marks: step.marks, options: step.options })),
  );

  const stepById = new Map(steps.map((step) => [step.id, step]));
  const practicalAnswers = new Map<string, string>();
  for (const answer of input.practical ?? []) {
    const step = stepById.get(answer.stepId);
    if (!step) throw badRequest('INVALID_ANSWER', 'An answer refers to a scenario step that is not part of this assessment');
    if (practicalAnswers.has(answer.stepId)) throw badRequest('DUPLICATE_ANSWER', 'Each scenario step can only be answered once');
    if (!step.options.some((option) => option.id === answer.optionId)) throw badRequest('INVALID_ANSWER', 'An answer refers to an option that does not belong to the scenario step');
    practicalAnswers.set(answer.stepId, answer.optionId);
  }

  const practical = steps.length > 0 ? scoreScenarios(steps, practicalAnswers) : null;
  const combined = combineScores(result.percentage, practical?.percentage ?? null, assessment.mcqWeight);
  const passed = isPassing(combined.percentage, assessment.passingScore);
  const timeTakenSeconds = Math.max(0, Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000));
  const config = await getEngineConfig();

  // ---- one atomic unit: attempt + answers + enrollment + certificate + competency ----------------------------
  const outcome = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.assessmentAttempt.updateMany({
        where: { id: attempt.id, status: 'IN_PROGRESS' },
        data: {
          status: 'SUBMITTED',
          submittedAt: now,
          score: result.score,
          totalMarks: result.totalMarks,
          // `percentage` is the score the pass mark was applied to: the weighted
          // combination when there is a practical component, the questions alone otherwise.
          percentage: combined.percentage,
          mcqPercentage: practical ? combined.mcqPercentage : null,
          practicalPercentage: combined.practicalPercentage,
          passed,
          timeTakenSeconds,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        },
      });
      if (claimed.count !== 1) throw conflict('ATTEMPT_ALREADY_SUBMITTED', 'This attempt has already been submitted.');
      await tx.assessmentAnswer.createMany({
        data: result.perQuestion.map((row) => ({ attemptId: attempt.id, questionId: row.questionId, selectedOptionIds: row.selectedOptionIds, isCorrect: row.isCorrect, marksAwarded: row.marksAwarded })),
      });
      if (practical) {
        await tx.practicalResponse.createMany({
          data: practical.perStep.map((row) => ({
            attemptId: attempt.id,
            scenarioId: row.scenarioId,
            stepId: row.stepId,
            selectedOptionId: row.selectedOptionId,
            creditAwarded: row.creditAwarded,
            marksAwarded: row.marksAwarded,
          })),
        });
      }

      let certificate: Awaited<ReturnType<typeof issueCertificate>> | null = null;
      if (passed) {
        if (assessment.course.certificateEnabled) {
          certificate = await issueCertificate(tx, { userId: user.id, courseId: assessment.courseId, enrollmentId: enrollment.id, attemptId: attempt.id, score: combined.percentage });
        }
        await tx.enrollment.update({
          where: { id: enrollment.id },
          data: { status: certificate ? 'CERTIFIED' : 'COMPLETED', completedAt: enrollment.completedAt ?? now, progress: 100, lastAccessedAt: now },
        });
      }

      let impacts: CompetencyImpact[] = [];
      if (passed || config.update.updateOnFailedAttempt) {
        impacts = await applyCompetencyEvidence(tx, { kind: 'ASSESSMENT', userId: user.id, courseId: assessment.courseId, attemptId: attempt.id, assessmentScore: combined.percentage }, config, now);
      }
      const updatedEnrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id }, select: { id: true, status: true, progress: true } });
      return { certificate, impacts, enrollment: updatedEnrollment };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  // ---- side effects after commit (a failure here must not undo the scored result) ----------------------------
  const attemptsUsed = (await prisma.assessmentAttempt.count({ where: { assessmentId, userId: user.id } })) ?? 0;
  const attemptsRemaining = assessment.maxAttempts === 0 ? null : Math.max(0, assessment.maxAttempts - attemptsUsed);
  await notifyUser(user.id, {
    type: 'ASSESSMENT_RESULT',
    title: passed ? `Assessment passed: ${assessment.course.title} (${combined.percentage}%)` : `Assessment not passed: ${assessment.course.title} (${combined.percentage}%)`,
    message: passed
      ? `You scored ${combined.percentage}% (pass mark ${assessment.passingScore}%).`
      : `You scored ${combined.percentage}% but the pass mark is ${assessment.passingScore}%.${attemptsRemaining === null ? ' You can try again.' : attemptsRemaining > 0 ? ` You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} left.` : ' You have no attempts left - please contact your trainer.'}`,
    link: `/trainee/assessments/${assessmentId}/result/${attempt.id}`,
    dedupeKey: `assessment-result:${attempt.id}`,
  });
  for (const impact of outcome.impacts.filter((item) => item.changed)) {
    await notifyUser(user.id, {
      type: 'COMPETENCY_UPDATE',
      title: `${impact.competencyName}: ${impact.previousLevel}% → ${impact.newLevel}%`,
      message: impact.requiredLevel === null ? impact.explanation : `Required for your role: ${impact.requiredLevel}%. ${impact.requirementMet ? 'Requirement met.' : `Remaining gap: ${impact.gapAfter} points.`}`,
      link: '/trainee/passport',
      dedupeKey: `competency-update:${attempt.id}:${impact.competencyId}`,
    });
  }
  if (outcome.certificate?.created) await announceCertificate(prisma, outcome.certificate.certificate, ctx);
  await recordAudit(ctx, {
    action: AuditActions.ASSESSMENT_SUBMITTED,
    entityType: 'Assessment',
    entityId: assessmentId,
    metadata: { course: assessment.course.title, attempt: attempt.attemptNumber, percentage: combined.percentage, passed },
  });
  await checkAchievements(user.id);

  const finalAttempt = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
  return {
    attempt: toAttemptDto(finalAttempt),
    assessment: { id: assessment.id, title: assessment.title, passingScore: assessment.passingScore, maxAttempts: assessment.maxAttempts, attemptsRemaining, courseId: assessment.courseId, courseTitle: assessment.course.title },
    competencyImpacts: outcome.impacts,
    certificate: outcome.certificate
      ? { id: outcome.certificate.certificate.id, certificateNumber: outcome.certificate.certificate.certificateNumber, issuedAt: outcome.certificate.certificate.issuedAt }
      : null,
    enrollment: outcome.enrollment,
    review: await buildReview(attempt.id, assessment.showCorrectAnswers),
  };
}

/**
 * Rebuilds the response of a submission that already happened, for an idempotent
 * retry. It reads only stored data: nothing is graded, issued or notified again.
 */
async function buildSubmissionResult(attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: {
      assessment: { include: { course: { select: { id: true, title: true } } } },
      certificates: { select: { id: true, certificateNumber: true, issuedAt: true } },
      enrollment: { select: { id: true, status: true, progress: true, completedAt: true } },
    },
  });
  const attemptsUsed = await prisma.assessmentAttempt.count({ where: { assessmentId: attempt.assessmentId, userId: attempt.userId, status: { not: 'IN_PROGRESS' } } });
  const attemptsRemaining = attempt.assessment.maxAttempts === 0 ? null : Math.max(0, attempt.assessment.maxAttempts - attemptsUsed);
  const certificate = attempt.certificates[0] ?? null;

  return {
    attempt: toAttemptDto(attempt),
    assessment: {
      id: attempt.assessment.id,
      title: attempt.assessment.title,
      passingScore: attempt.assessment.passingScore,
      maxAttempts: attempt.assessment.maxAttempts,
      attemptsRemaining,
      courseId: attempt.assessment.courseId,
      courseTitle: attempt.assessment.course.title,
    },
    // The competency changes were applied on the original submission; a replay
    // reports the result, not a fresh set of impacts.
    competencyImpacts: [],
    certificate: certificate ? { id: certificate.id, certificateNumber: certificate.certificateNumber, issuedAt: certificate.issuedAt } : null,
    enrollment: attempt.enrollment,
    review: await buildReview(attempt.id, attempt.assessment.showCorrectAnswers),
    /** True when this response replays a submission that had already succeeded. */
    replayed: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Results and review
// ---------------------------------------------------------------------------------------------

/**
 * Per-question breakdown of a submitted attempt. When the assessment hides correct
 * answers, only the learner's own selections and marks are returned.
 */
/**
 * The practical half of a result, decision by decision.
 *
 * Unlike the quiz review this always reveals the marking. A scenario teaches
 * through its rationales - "this is defensible but costs time" - and withholding
 * them would leave the learner with a number and nothing to learn from.
 */
export async function buildPracticalReview(attemptId: string, assessmentId: string) {
  const scenarios = await loadScenarios(assessmentId);
  if (scenarios.length === 0) return null;

  const responses = await prisma.practicalResponse.findMany({ where: { attemptId } });
  const byStep = new Map(responses.map((response) => [response.stepId, response]));

  return scenarios.map((scenario) => {
    const steps = scenario.steps.map((step) => {
      const response = byStep.get(step.id);
      const best = [...step.options].sort((a, b) => b.credit - a.credit)[0];
      return {
        stepId: step.id,
        type: step.type,
        prompt: step.prompt,
        marks: step.marks,
        marksAwarded: response?.marksAwarded ?? 0,
        creditAwarded: response?.creditAwarded ?? 0,
        selectedOptionId: response?.selectedOptionId ?? null,
        /** The decision that earns full credit, so a learner knows what good looked like. */
        bestOptionId: best?.id ?? null,
        explanation: step.explanation,
        options: step.options.map((option) => ({ id: option.id, text: option.text, credit: option.credit, rationale: option.rationale })),
      };
    });
    return {
      scenarioId: scenario.id,
      title: scenario.title,
      briefing: scenario.briefing,
      imageUrl: scenario.imageUrl,
      marks: steps.reduce((sum, step) => sum + step.marks, 0),
      marksAwarded: Math.round(steps.reduce((sum, step) => sum + step.marksAwarded, 0) * 100) / 100,
      steps,
    };
  });
}

export async function buildReview(attemptId: string, revealAnswers: boolean) {
  const attempt = await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: attemptId }, include: { answers: true } });
  if (attempt.status !== 'SUBMITTED') return [];
  const questions = await prisma.question.findMany({ where: { id: { in: attempt.questionOrder } }, include: { options: { orderBy: { position: 'asc' } } } });
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const answerByQuestion = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));

  return attempt.questionOrder
    .map((id) => questionById.get(id))
    .filter((question): question is NonNullable<typeof question> => Boolean(question))
    .map((question) => {
      const answer = answerByQuestion.get(question.id);
      return {
        questionId: question.id,
        text: question.text,
        type: question.type,
        marks: question.marks,
        marksAwarded: answer?.marksAwarded ?? 0,
        answered: (answer?.selectedOptionIds.length ?? 0) > 0,
        selectedOptionIds: answer?.selectedOptionIds ?? [],
        ...(revealAnswers ? { isCorrect: answer?.isCorrect ?? false, explanation: question.explanation } : {}),
        options: question.options.map((option) => ({ id: option.id, text: option.text, ...(revealAnswers ? { isCorrect: option.isCorrect } : {}) })),
      };
    });
}

/** One attempt with its review: the learner themself, the course's trainer, or an administrator. */
export async function getAttemptDetail(user: Actor, attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { user: { select: { id: true, name: true, email: true, employeeId: true, jobRoleId: true } }, assessment: { include: { course: { select: { id: true, title: true, trainerId: true, deletedAt: true } }, _count: { select: { questions: true, attempts: true } } } } },
  });
  if (!attempt || attempt.assessment.course.deletedAt) throw notFound('ATTEMPT_NOT_FOUND', 'Attempt not found');
  const isOwner = attempt.userId === user.id;
  const isManager = user.role === 'ADMIN' || (user.role === 'TRAINER' && attempt.assessment.course.trainerId === user.id);
  if (!isOwner && !isManager) throw forbidden('NOT_YOUR_ATTEMPT', 'You do not have access to this attempt');

  const impacts = await prisma.competencyHistory.findMany({
    where: { attemptId },
    include: { competency: { select: { name: true } } },
  });
  const certificate = attempt.passed ? await prisma.certificate.findFirst({ where: { attemptId }, select: { id: true, certificateNumber: true } }) : null;

  // The same impact the learner saw at submission, rebuilt from the append-only history so it survives a page reload.
  const requirements = attempt.user.jobRoleId
    ? await prisma.roleCompetency.findMany({ where: { roleId: attempt.user.jobRoleId, competencyId: { in: impacts.map((event) => event.competencyId) } } })
    : [];
  const requiredBy = new Map(requirements.map((requirement) => [requirement.competencyId, requirement.requiredLevel]));
  const competencyImpacts = impacts.map((event) => {
    const required = requiredBy.get(event.competencyId) ?? null;
    const details = event.details as { explanation?: string; limitedBy?: string } | null;
    return {
      competencyId: event.competencyId,
      competencyName: event.competency.name,
      previousLevel: event.previousLevel,
      newLevel: event.newLevel,
      changed: true,
      requiredLevel: required,
      gapBefore: required === null ? null : Math.max(0, required - event.previousLevel),
      gapAfter: required === null ? null : Math.max(0, required - event.newLevel),
      requirementMet: required !== null && event.newLevel >= required,
      limitedBy: details?.limitedBy ?? 'none',
      explanation: details?.explanation ?? '',
    };
  });

  return {
    attempt: toAttemptDto(attempt),
    learner: isManager ? attempt.user : { id: attempt.user.id, name: attempt.user.name },
    assessment: { id: attempt.assessmentId, title: attempt.assessment.title, passingScore: attempt.assessment.passingScore, courseId: attempt.assessment.course.id, courseTitle: attempt.assessment.course.title, mcqWeight: attempt.assessment.mcqWeight },
    practical: await buildPracticalReview(attemptId, attempt.assessmentId),
    competencyChanges: impacts.map((event) => ({ competencyId: event.competencyId, competencyName: event.competency.name, previousLevel: event.previousLevel, newLevel: event.newLevel })),
    competencyImpacts,
    certificate,
    review: await buildReview(attemptId, isManager || attempt.assessment.showCorrectAnswers),
  };
}

// ---------------------------------------------------------------------------------------------
// Learner's assessment list
// ---------------------------------------------------------------------------------------------

export type AssessmentState = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'PASSED' | 'NO_ATTEMPTS_LEFT' | 'OVERDUE';

export function assessmentState(availability: Availability): AssessmentState {
  if (availability.passed) return 'PASSED';
  if (availability.inProgress) return 'IN_PROGRESS';
  if (availability.eligible) return 'AVAILABLE';
  if (availability.reasons.includes('DEADLINE_PASSED')) return 'OVERDUE';
  if (availability.reasons.includes('NO_ATTEMPTS_LEFT')) return 'NO_ATTEMPTS_LEFT';
  return 'LOCKED';
}

/** Assessments of the courses the trainee is enrolled in, with what they can do next. */
export async function listMyAssessments(user: Actor) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: user.id, status: { not: 'WITHDRAWN' }, course: { deletedAt: null, assessment: { isPublished: true } } },
    select: { courseId: true },
  });
  const assessments = await prisma.assessment.findMany({ where: { courseId: { in: enrollments.map((e) => e.courseId) }, isPublished: true }, include: { ...{ course: { select: { id: true, title: true, trainerId: true, status: true, deletedAt: true, passingScore: true, certificateEnabled: true } }, _count: { select: { questions: true, attempts: true } } } } });
  const items = await Promise.all(
    assessments.map(async (assessment) => {
      const availability = await computeAvailability(user.id, assessment);
      return {
        assessmentId: assessment.id,
        title: assessment.title,
        courseId: assessment.courseId,
        courseTitle: assessment.course.title,
        passingScore: assessment.passingScore,
        timeLimitMinutes: assessment.timeLimitMinutes,
        questionCount: assessment.questionsPerAttempt ?? assessment._count.questions,
        deadline: assessment.deadline,
        state: assessmentState(availability),
        reasons: availability.reasons,
        attemptsUsed: availability.attemptsUsed,
        attemptsRemaining: availability.attemptsRemaining,
        bestScore: availability.bestScore,
        passed: availability.passed,
        inProgressAttemptId: availability.inProgress?.id ?? null,
      };
    }),
  );
  // Soonest deadline first, then everything else alphabetically.
  return items.sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity) || a.courseTitle.localeCompare(b.courseTitle));
}
