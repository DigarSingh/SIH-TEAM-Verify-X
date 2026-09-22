import { prisma } from '../../lib/prisma';
import { assertCanManage } from '../courses/courses.service';
import { assessmentState, computeAvailability, toAttemptDto } from './attempts.service';
import { loadAssessment } from './assessments.service';

type Actor = Express.AuthUser;

const round1 = (value: number) => Math.round(value * 10) / 10;

const BUCKETS = [
  { label: '0-19%', min: 0, max: 20 },
  { label: '20-39%', min: 20, max: 40 },
  { label: '40-59%', min: 40, max: 60 },
  { label: '60-79%', min: 60, max: 80 },
  { label: '80-100%', min: 80, max: 101 },
];

/** Headline statistics, score distribution and per-question difficulty for one assessment. */
export async function assessmentStats(assessmentId: string) {
  const submitted = await prisma.assessmentAttempt.findMany({
    where: { assessmentId, status: 'SUBMITTED' },
    select: { userId: true, percentage: true, passed: true, timeTakenSeconds: true },
  });
  const learners = new Set(submitted.map((attempt) => attempt.userId));
  const passedLearners = new Set(submitted.filter((attempt) => attempt.passed).map((attempt) => attempt.userId));
  const scores = submitted.map((attempt) => attempt.percentage ?? 0);
  const times = submitted.map((attempt) => attempt.timeTakenSeconds ?? 0).filter((seconds) => seconds > 0);

  const [answerTotals, answerCorrect, questions] = await Promise.all([
    prisma.assessmentAnswer.groupBy({ by: ['questionId'], where: { attempt: { assessmentId, status: 'SUBMITTED' } }, _count: { _all: true } }),
    prisma.assessmentAnswer.groupBy({ by: ['questionId'], where: { isCorrect: true, attempt: { assessmentId, status: 'SUBMITTED' } }, _count: { _all: true } }),
    prisma.question.findMany({ where: { assessmentId }, orderBy: { position: 'asc' }, select: { id: true, text: true, marks: true, position: true } }),
  ]);
  const totalBy = new Map(answerTotals.map((row) => [row.questionId, row._count._all]));
  const correctBy = new Map(answerCorrect.map((row) => [row.questionId, row._count._all]));

  return {
    attempts: submitted.length,
    learners: learners.size,
    passedLearners: passedLearners.size,
    passRate: learners.size === 0 ? null : round1((passedLearners.size / learners.size) * 100),
    averageScore: scores.length === 0 ? null : round1(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    highestScore: scores.length === 0 ? null : Math.max(...scores),
    lowestScore: scores.length === 0 ? null : Math.min(...scores),
    averageTimeMinutes: times.length === 0 ? null : round1(times.reduce((sum, seconds) => sum + seconds, 0) / times.length / 60),
    distribution: BUCKETS.map((bucket) => ({ label: bucket.label, count: scores.filter((score) => score >= bucket.min && score < bucket.max).length })),
    /** Share of learners answering each question correctly - low values flag hard or ambiguous questions. */
    questions: questions.map((question) => {
      const total = totalBy.get(question.id) ?? 0;
      const correct = correctBy.get(question.id) ?? 0;
      return { questionId: question.id, position: question.position + 1, text: question.text, marks: question.marks, answers: total, correctRate: total === 0 ? null : round1((correct / total) * 100) };
    }),
  };
}

/**
 * Results for an assessment.
 *  - Trainee: their own attempt history and what they can do next.
 *  - Course trainer / admin: every submitted attempt (paginated) plus statistics.
 */
export async function getAssessmentResults(user: Actor, assessmentId: string, query: { page: number; pageSize: number; passed?: 'true' | 'false' | undefined }) {
  const assessment = await loadAssessment(assessmentId);
  const summary = {
    id: assessment.id,
    title: assessment.title,
    courseId: assessment.courseId,
    courseTitle: assessment.course.title,
    passingScore: assessment.passingScore,
    maxAttempts: assessment.maxAttempts,
    deadline: assessment.deadline,
    timeLimitMinutes: assessment.timeLimitMinutes,
  };

  if (user.role === 'TRAINEE') {
    const [attempts, availability] = await Promise.all([
      prisma.assessmentAttempt.findMany({ where: { assessmentId, userId: user.id }, orderBy: { attemptNumber: 'desc' } }),
      computeAvailability(user.id, assessment),
    ]);
    return {
      scope: 'self' as const,
      assessment: summary,
      attempts: attempts.map(toAttemptDto),
      availability: { ...availability, state: assessmentState(availability) },
      total: attempts.length,
    };
  }

  assertCanManage(user, assessment.course);
  const where = { assessmentId, status: 'SUBMITTED' as const, ...(query.passed ? { passed: query.passed === 'true' } : {}) };
  const [total, attempts, stats] = await Promise.all([
    prisma.assessmentAttempt.count({ where }),
    prisma.assessmentAttempt.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { user: { select: { id: true, name: true, email: true, employeeId: true, department: { select: { name: true } } } } },
    }),
    assessmentStats(assessmentId),
  ]);
  return {
    scope: 'manager' as const,
    assessment: summary,
    stats,
    attempts: attempts.map((attempt) => ({
      ...toAttemptDto(attempt),
      learner: { id: attempt.user.id, name: attempt.user.name, email: attempt.user.email, employeeId: attempt.user.employeeId, department: attempt.user.department?.name ?? null },
    })),
    total,
  };
}
