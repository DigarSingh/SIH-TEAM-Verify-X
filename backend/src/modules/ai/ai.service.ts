import { randomInt } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError, forbidden, unprocessable } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { optionIssues } from '../assessments/assessments.schemas';
import { listCourses } from '../courses/courses.service';
import { listCoursesQuery } from '../courses/courses.schemas';
import { getRecommendationsForUser } from '../recommendations/recommendation.service';
import { requireAiClient, isAiConfigured, type AiResult, type AiUsage } from './ai.client';
import { loadCourseForContext, renderCourseContext, type RenderedContext } from './ai.materials';
import { ASSISTANT_SYSTEM, FORECAST_SYSTEM, PLAN_SYSTEM, QUIZ_SYSTEM, SEARCH_SYSTEM } from './ai.prompts';
import { askOutputSchema, forecastSummaryOutputSchema, planOutputSchema, quizOutputSchema, searchOutputSchema, type QuizDraftInput } from './ai.schemas';
import { forecastTrainingNeeds } from './predictive.service';
import { describeIntent, interpretSearch, type SearchIntent, type SearchVocabulary } from './search-interpreter';

type Actor = Express.AuthUser;

/** AI failures after which plain-language search quietly falls back to the built-in interpreter. */
const SEARCH_FALLBACK_CODES = new Set(['AI_BUSY', 'AI_UNAVAILABLE', 'AI_UPSTREAM_ERROR', 'AI_REFUSED', 'AI_BAD_OUTPUT', 'AI_TRUNCATED', 'AI_REQUEST_REJECTED', 'AI_MISCONFIGURED']);

const usageMeta = (result: AiResult<unknown>): { model: string } & AiUsage => ({ model: result.model, ...result.usage });

/** Loads the course for an AI feature the caller is allowed to use on it: managers (admin, the course's trainer) and enrolled trainees. */
async function loadForUse(user: Actor, courseId: string) {
  const loaded = await loadCourseForContext(courseId);
  const isManager = user.role === 'ADMIN' || loaded.trainerId === user.id;
  if (!isManager) {
    if (user.role !== 'TRAINEE') throw forbidden('NOT_COURSE_OWNER', 'Trainers can use the assistant on their own courses only');
    const enrollment = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId } }, select: { status: true } });
    if (!enrollment || enrollment.status === 'WITHDRAWN') throw forbidden('NOT_ENROLLED', 'Enroll in this course to use its assistant');
  }
  return { ...loaded, isManager };
}

const coverage = (rendered: RenderedContext) => ({ readableMaterials: rendered.readable, includedMaterials: rendered.includedIds.size, omittedMaterials: rendered.omitted, truncated: rendered.truncated });

// ---------------------------------------------------------------------------------------------
// 1. Course assistant: answers from the course's own materials only
// ---------------------------------------------------------------------------------------------

export async function askCourseAssistant(user: Actor, courseId: string, question: string, ctx: AuditContext) {
  const { course } = await loadForUse(user, courseId);
  const client = requireAiClient();
  const rendered = renderCourseContext(course, env.AI_MAX_CONTEXT_CHARS);
  if (rendered.includedIds.size === 0) {
    throw unprocessable('NO_READABLE_MATERIALS', 'This course has no text materials the assistant can read yet. Ask the trainer, or open the materials directly.');
  }

  const result = await client.generate({
    feature: 'course-assistant',
    // The course text is large and identical for every question about the course: cache it.
    system: [{ text: ASSISTANT_SYSTEM }, { text: rendered.text, cache: true }],
    user: JSON.stringify({ question }),
    schema: askOutputSchema,
    effort: 'medium',
    maxTokens: 4_000,
  });

  // Only citations that really point at a material the model was shown are kept.
  const sources = [...new Set(result.output.sourceIds)].filter((id) => rendered.includedIds.has(id)).map((id) => ({ id, ...(rendered.labels.get(id) as { title: string; moduleTitle: string }) }));
  await recordAudit(ctx, { action: AuditActions.AI_ASSISTANT_QUERY, entityType: 'Course', entityId: courseId, metadata: { feature: 'course-assistant', questionLength: question.length, sources: sources.length, ...usageMeta(result) } });
  return {
    answer: result.output.answer.trim(),
    grounded: result.output.foundInMaterials && sources.length > 0,
    sources,
    coverage: coverage(rendered),
    model: result.model,
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Quiz generator: drafts for a trainer to review; nothing is saved automatically
// ---------------------------------------------------------------------------------------------

/** Shaped like the assessment API's question payload, so a reviewed draft can be added to an assessment as it is. */
export interface DraftQuestion {
  text: string;
  type: 'SINGLE' | 'MULTIPLE';
  marks: number;
  explanation?: string;
  options: { text: string; isCorrect: boolean }[];
}

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const MARKS: Record<QuizDraftInput['difficulty'], number> = { EASY: 1, MEDIUM: 1, HARD: 2 };

/** Random order that does not depend on where the model tends to put the right answer. */
function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy;
}

/** Applies the same rules the assessment API enforces; returns null for a question that cannot be repaired safely. */
export function sanitiseDraftQuestion(raw: { text: string; type: 'SINGLE' | 'MULTIPLE'; explanation: string; options: { text: string; isCorrect: boolean }[] }, marks: number): DraftQuestion | null {
  const text = raw.text.trim();
  if (text.length < 5 || text.length > 2000) return null;
  const options = raw.options.map((option) => ({ text: option.text.trim(), isCorrect: option.isCorrect }));
  if (options.length < 2 || options.length > 8 || options.some((option) => option.text.length < 1 || option.text.length > 500)) return null;

  // The number of correct options decides the type (the model occasionally labels it wrongly).
  const correct = options.filter((option) => option.isCorrect).length;
  const type = correct >= 2 ? 'MULTIPLE' : 'SINGLE';
  if (optionIssues(type, options) !== null) return null;
  const explanation = raw.explanation.trim().slice(0, 1000);
  return { text, type, marks, ...(explanation ? { explanation } : {}), options: shuffled(options) };
}

export async function draftQuiz(user: Actor, courseId: string, input: QuizDraftInput, ctx: AuditContext) {
  const { course, isManager } = await loadForUse(user, courseId);
  if (!isManager) throw forbidden('NOT_COURSE_OWNER', 'Only the course trainer or an administrator can generate questions');
  const client = requireAiClient();
  const rendered = renderCourseContext(course, env.AI_MAX_CONTEXT_CHARS);
  if (rendered.includedIds.size === 0) {
    throw unprocessable('NO_READABLE_MATERIALS', 'Add at least one text reading (or a text document) to the course first: questions are written from the course materials.');
  }

  const existing = await prisma.question.findMany({ where: { assessment: { courseId } }, orderBy: { createdAt: 'desc' }, take: 60, select: { text: true } });
  const request = {
    count: input.questionCount,
    difficulty: input.difficulty,
    includeMultipleAnswerQuestions: input.includeMultipleAnswer,
    ...(input.focus ? { focus: input.focus } : {}),
    existing_questions: existing.map((row) => row.text),
  };

  const result = await client.generate({
    feature: 'quiz-generator',
    system: [{ text: QUIZ_SYSTEM }, { text: rendered.text, cache: true }],
    user: JSON.stringify(request),
    schema: quizOutputSchema,
    effort: 'medium',
    maxTokens: 16_000,
  });

  const seen = new Set(existing.map((row) => normalise(row.text)));
  const questions: DraftQuestion[] = [];
  let rejected = 0;
  for (const raw of result.output.questions) {
    const question = sanitiseDraftQuestion(raw, MARKS[input.difficulty]);
    const key = question ? normalise(question.text) : '';
    if (!question || seen.has(key) || (!input.includeMultipleAnswer && question.type === 'MULTIPLE') || questions.length >= input.questionCount) {
      rejected += 1;
      continue;
    }
    seen.add(key);
    questions.push(question);
  }

  await recordAudit(ctx, { action: AuditActions.AI_QUIZ_GENERATED, entityType: 'Course', entityId: courseId, metadata: { feature: 'quiz-generator', requested: input.questionCount, drafted: questions.length, rejected, ...usageMeta(result) } });
  return { questions, requested: input.questionCount, rejected, coverage: coverage(rendered), model: result.model };
}

// ---------------------------------------------------------------------------------------------
// 3. Study plan: the AI explains the rule-based recommendations, it never changes them
// ---------------------------------------------------------------------------------------------

export async function explainRecommendations(user: Actor, ctx: AuditContext) {
  const client = requireAiClient();
  const report = await getRecommendationsForUser(user.id, { limit: 6 });
  if (report.recommendations.length === 0) {
    throw unprocessable('NOTHING_TO_EXPLAIN', 'There are no recommended courses to explain right now. Either you meet every requirement of your role or no published course addresses your gaps yet.');
  }

  // Facts only, and nothing that identifies the employee.
  const facts = {
    jobRole: report.analysis.jobRole?.name ?? null,
    skillGaps: report.analysis.records
      .filter((record) => !record.met)
      .slice(0, 5)
      .map((record) => ({ competency: record.competencyName, currentLevel: record.currentLevel, requiredLevel: record.requiredLevel, gap: record.gap, priority: record.priorityLevel, why: record.reason })),
    recommendedCourses: report.recommendations.map((recommendation) => ({
      courseId: recommendation.courseId,
      rank: recommendation.rank,
      title: recommendation.title,
      difficulty: recommendation.difficulty,
      durationMinutes: recommendation.durationMinutes,
      status: recommendation.status,
      readyToStart: recommendation.ready,
      waitsFor: recommendation.blockedBy.map((blocker) => blocker.title),
      reasons: recommendation.reasons,
    })),
  };

  const result = await client.generate({ feature: 'study-plan', system: [{ text: PLAN_SYSTEM }], user: JSON.stringify(facts), schema: planOutputSchema, effort: 'medium', maxTokens: 4_000 });

  const noteFor = new Map<string, string>();
  for (const step of result.output.steps) if (!noteFor.has(step.courseId)) noteFor.set(step.courseId, step.note.trim().slice(0, 400));
  // The steps are the engine's recommendations, in the engine's order; the model only supplies the words
  // (a course it invented, or repeated, never appears).
  const steps = report.recommendations
    .filter((recommendation) => noteFor.has(recommendation.courseId))
    .map((recommendation) => ({ courseId: recommendation.courseId, title: recommendation.title, rank: recommendation.rank, note: noteFor.get(recommendation.courseId) as string }));

  await recordAudit(ctx, { action: AuditActions.AI_PLAN_GENERATED, entityType: 'User', entityId: user.id, metadata: { feature: 'study-plan', steps: steps.length, ...usageMeta(result) } });
  return { summary: result.output.summary.trim(), steps, model: result.model };
}

// ---------------------------------------------------------------------------------------------
// 4. Plain-language search: the AI (or the built-in interpreter) only PRODUCES FILTERS
// ---------------------------------------------------------------------------------------------

async function loadVocabulary(): Promise<SearchVocabulary> {
  const [competencies, categories] = await Promise.all([
    prisma.competency.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.course.findMany({ where: { deletedAt: null, status: 'PUBLISHED' }, distinct: ['category'], orderBy: { category: 'asc' }, select: { category: true } }),
  ]);
  return { competencies, categories: categories.map((row) => row.category) };
}

/**
 * The catalogue matches text, and a plural ("cyclones") is not inside a title that says "Cyclone", so keywords are searched in
 * the singular. Only a trailing "s" is removed (not from "ss", "is" or "us"), which can only widen what matches.
 */
const singularWord = (word: string) => (word.length > 3 && /s$/i.test(word) && !/(ss|is|us)$/i.test(word) ? word.slice(0, -1) : word);
const singularKeywords = (text: string) => text.split(/\s+/).filter(Boolean).map(singularWord).join(' ');

/** Whatever produced an intent, it is cut down to values that really exist before it touches a query. */
function validateIntent(intent: SearchIntent, vocabulary: SearchVocabulary): SearchIntent {
  const known = new Set(vocabulary.competencies.map((competency) => competency.id));
  return {
    keywords: singularKeywords(intent.keywords).slice(0, 100),
    competencyIds: [...new Set(intent.competencyIds)].filter((id) => known.has(id)).slice(0, 3),
    difficulty: intent.difficulty,
    category: intent.category !== null && vocabulary.categories.includes(intent.category) ? intent.category : null,
    maxDurationMinutes: intent.maxDurationMinutes !== null && intent.maxDurationMinutes >= 5 && intent.maxDurationMinutes <= 6_000 ? Math.round(intent.maxDurationMinutes) : null,
  };
}

async function interpretWithAi(query: string, vocabulary: SearchVocabulary): Promise<{ intent: SearchIntent; explanation: string }> {
  const client = requireAiClient();
  const result = await client.generate({
    feature: 'plain-language-search',
    system: [{ text: SEARCH_SYSTEM }],
    user: JSON.stringify({ request: query, competencies: vocabulary.competencies.map(({ id, name }) => ({ id, name })), categories: vocabulary.categories }),
    schema: searchOutputSchema,
    effort: 'low',
    maxTokens: 2_000,
  });
  const { explanation, ...intent } = result.output;
  return { intent, explanation: explanation.trim().slice(0, 300) };
}

/** The published courses that fit an intent, as the caller may see them. */
async function findCourses(user: Actor, intent: SearchIntent) {
  // The catalogue query filters by one competency; several are searched separately and merged.
  const base = { ...(intent.keywords ? { q: intent.keywords } : {}), ...(intent.difficulty ? { difficulty: intent.difficulty } : {}), ...(intent.category ? { category: intent.category } : {}), sort: 'popular', page: 1, pageSize: 20 };
  const searches = intent.competencyIds.length > 0 ? intent.competencyIds.map((competencyId) => ({ ...base, competencyId })) : [base];
  const merged = new Map<string, { course: Awaited<ReturnType<typeof listCourses>>['items'][number]; hits: number }>();
  for (const search of searches) {
    const found = await listCourses(user, listCoursesQuery.parse(search));
    for (const course of found.items) merged.set(course.id, { course, hits: (merged.get(course.id)?.hits ?? 0) + 1 });
  }
  const limit = intent.maxDurationMinutes;
  return [...merged.values()]
    .filter(({ course }) => limit === null || course.durationMinutes <= limit)
    .sort((a, b) => b.hits - a.hits)
    .map(({ course }) => course)
    .slice(0, 12);
}

export async function searchCoursesInPlainLanguage(user: Actor, query: string, ctx: AuditContext) {
  const vocabulary = await loadVocabulary();
  let intent: SearchIntent;
  let method: 'ai' | 'keywords' = 'keywords';
  let explanation: string | null = null;

  if (isAiConfigured()) {
    try {
      const interpreted = await interpretWithAi(query, vocabulary);
      intent = validateIntent(interpreted.intent, vocabulary);
      explanation = interpreted.explanation || null;
      method = 'ai';
    } catch (error) {
      if (!(error instanceof AppError) || !SEARCH_FALLBACK_CODES.has(error.code)) throw error;
      logger.warn({ code: error.code }, 'AI search interpretation failed; using the built-in interpreter');
      intent = validateIntent(interpretSearch(query, vocabulary), vocabulary);
    }
  } else {
    intent = validateIntent(interpretSearch(query, vocabulary), vocabulary);
  }

  let courses = await findCourses(user, intent);
  if (courses.length === 0 && intent.keywords && intent.competencyIds.length > 0) {
    // The competency is the interpreter's guess, the words are what the person typed: try the words alone before answering "nothing".
    const wordsOnly = { ...intent, competencyIds: [] };
    const again = await findCourses(user, wordsOnly);
    if (again.length > 0) {
      intent = wordsOnly;
      courses = again;
    }
  }

  await recordAudit(ctx, { action: AuditActions.AI_SEARCH, entityType: 'Course', metadata: { feature: 'plain-language-search', method, queryLength: query.length, results: courses.length } });
  return { method, explanation, interpretation: describeIntent(intent, vocabulary), filters: intent, courses };
}

// ---------------------------------------------------------------------------------------------
// 5. Forecast briefing: the numbers are calculated; the AI only writes the summary
// ---------------------------------------------------------------------------------------------

export async function summariseForecast(horizonMonths: number, ctx: AuditContext) {
  const client = requireAiClient();
  const forecast = await forecastTrainingNeeds(horizonMonths);
  const facts = {
    horizonMonths: forecast.horizonMonths,
    method: 'linear trend of monthly averages',
    totals: forecast.summary,
    competencies: forecast.competencies.slice(0, 12).map((item) => ({
      competencyId: item.competencyId,
      name: item.name,
      employees: item.employees,
      currentAverage: item.currentAverage,
      requiredAverage: item.requiredAverage,
      trendPerMonth: item.trendPerMonth,
      projectedAverage: item.projectedAverage,
      affectedNow: item.affectedNow,
      projectedAffected: item.projectedAffected,
      monthsToClose: item.monthsToClose,
      outlook: item.outlook,
      confidence: item.confidence,
    })),
  };
  const result = await client.generate({ feature: 'forecast-briefing', system: [{ text: FORECAST_SYSTEM }], user: JSON.stringify(facts), schema: forecastSummaryOutputSchema, effort: 'medium', maxTokens: 4_000 });

  const names = new Map(facts.competencies.map((item) => [item.competencyId, item.name]));
  const priorities = result.output.priorities
    .filter((priority) => names.has(priority.competencyId))
    .slice(0, 4)
    .map((priority) => ({ competencyId: priority.competencyId, competency: names.get(priority.competencyId) as string, action: priority.action.trim().slice(0, 300) }));

  await recordAudit(ctx, { action: AuditActions.AI_FORECAST_SUMMARISED, entityType: 'System', metadata: { feature: 'forecast-briefing', priorities: priorities.length, ...usageMeta(result) } });
  return { horizonMonths, summary: result.output.summary.trim(), priorities, model: result.model };
}
