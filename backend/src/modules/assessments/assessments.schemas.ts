import { z } from 'zod';
import { paginationSchema } from '../../lib/http';
import { isoDate, requiredText, uuid } from '../../lib/schemas';

export const questionTypeEnum = z.enum(['SINGLE', 'MULTIPLE']);

const optionSchema = z.strictObject({
  text: requiredText(1, 500, 'Option text'),
  isCorrect: z.boolean(),
});

export type OptionInput = z.infer<typeof optionSchema>;

/** Shared option rules: enough choices, a sensible number of correct ones, no duplicates. */
export function optionIssues(type: 'SINGLE' | 'MULTIPLE', options: OptionInput[]): string | null {
  const correct = options.filter((option) => option.isCorrect).length;
  if (correct === 0) return 'Mark at least one option as correct';
  if (type === 'SINGLE' && correct !== 1) return 'Single-answer questions need exactly one correct option';
  if (type === 'MULTIPLE' && correct < 2) return 'Multiple-answer questions need at least two correct options';
  const texts = options.map((option) => option.text.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) return 'Options must be different from each other';
  return null;
}

export const createQuestionSchema = z
  .strictObject({
    text: requiredText(5, 2000, 'Question'),
    type: questionTypeEnum.default('SINGLE'),
    marks: z.number().int().min(1, 'Minimum 1 mark').max(20, 'Maximum 20 marks').default(1),
    explanation: z.string().trim().max(1000).optional(),
    options: z.array(optionSchema).min(2, 'Provide at least two options').max(8, 'At most 8 options'),
  })
  .superRefine((question, ctx) => {
    const issue = optionIssues(question.type, question.options);
    if (issue) ctx.addIssue({ code: 'custom', path: ['options'], message: issue });
  });
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

// No `.default()` in update schemas: Zod 4 would apply it to untouched fields.
export const updateQuestionSchema = z
  .strictObject({
    text: requiredText(5, 2000, 'Question'),
    type: questionTypeEnum,
    marks: z.number().int().min(1).max(20),
    explanation: z.string().trim().max(1000).nullable(),
    options: z.array(optionSchema).min(2).max(8),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const bulkQuestionsSchema = z.strictObject({ questions: z.array(createQuestionSchema).min(1).max(100) });
export const reorderQuestionsSchema = z.strictObject({ questionIds: z.array(uuid).min(1) });

const settings = {
  title: requiredText(3, 150, 'Title'),
  description: z.string().trim().max(1000),
  instructions: z.string().trim().max(2000),
  timeLimitMinutes: z.number().int().min(1).max(600),
  passingScore: z.number().int().min(1).max(100),
  maxAttempts: z.number().int().min(0).max(50),
  deadline: isoDate,
  questionsPerAttempt: z.number().int().min(1).max(200),
  isPublished: z.boolean(),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  showCorrectAnswers: z.boolean(),
  /** Share of the final mark that comes from the questions; the rest comes from the scenarios. */
  mcqWeight: z.number().min(0).max(1),
};

export const createAssessmentSchema = z.strictObject({
  courseId: uuid,
  title: settings.title,
  description: settings.description.optional(),
  instructions: settings.instructions.optional(),
  timeLimitMinutes: settings.timeLimitMinutes.nullable().optional(),
  /** Defaults to the course pass mark. */
  passingScore: settings.passingScore.optional(),
  maxAttempts: settings.maxAttempts.default(3),
  deadline: settings.deadline.nullable().optional(),
  questionsPerAttempt: settings.questionsPerAttempt.nullable().optional(),
  isPublished: z.boolean().default(false),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  showCorrectAnswers: z.boolean().default(true),
  mcqWeight: settings.mcqWeight.default(1),
  questions: z.array(createQuestionSchema).max(200).default([]),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentSchema = z
  .strictObject({
    title: settings.title,
    description: settings.description.nullable(),
    instructions: settings.instructions.nullable(),
    timeLimitMinutes: settings.timeLimitMinutes.nullable(),
    passingScore: settings.passingScore,
    maxAttempts: settings.maxAttempts,
    deadline: settings.deadline.nullable(),
    questionsPerAttempt: settings.questionsPerAttempt.nullable(),
    isPublished: settings.isPublished,
    shuffleQuestions: settings.shuffleQuestions,
    shuffleOptions: settings.shuffleOptions,
    showCorrectAnswers: settings.showCorrectAnswers,
    mcqWeight: settings.mcqWeight,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;

// ---------------------------------------------------------------------------------------------
// The practical component: scenarios
// ---------------------------------------------------------------------------------------------

/** The three stages of an operational decision, as the schema models them. */
export const scenarioStepTypeEnum = z.enum(['IDENTIFY', 'INTERPRET', 'ACTION']);

const scenarioOptionSchema = z.strictObject({
  text: requiredText(1, 500, 'Option text'),
  /** 0 is wrong, 1 is the best decision; anything between is partly defensible. */
  credit: z.number().min(0).max(1).default(0),
  rationale: z.string().trim().max(1000).nullable().optional(),
});

const scenarioStepSchema = z
  .strictObject({
    type: scenarioStepTypeEnum.default('IDENTIFY'),
    prompt: requiredText(5, 1000, 'Prompt'),
    marks: z.number().int().min(1).max(20).default(1),
    explanation: z.string().trim().max(1000).nullable().optional(),
    options: z.array(scenarioOptionSchema).min(2, 'Provide at least two options').max(6),
  })
  .superRefine((step, ctx) => {
    // Without a full-credit option the step cannot be answered well, and the practical
    // percentage would be capped below 100 for reasons nobody can see.
    if (!step.options.some((option) => option.credit >= 1)) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'One option must earn full credit (1)' });
    }
  });

export const scenarioSchema = z.strictObject({
  title: requiredText(3, 150, 'Title'),
  briefing: requiredText(10, 4000, 'Briefing'),
  imageUrl: z.string().trim().url().max(500).nullable().optional(),
  steps: z.array(scenarioStepSchema).min(1, 'A scenario needs at least one decision').max(20),
});
export type ScenarioInput = z.infer<typeof scenarioSchema>;

/** The whole practical component, replaced in one call. */
export const scenariosSchema = z.strictObject({ scenarios: z.array(scenarioSchema).max(20) });

export const submitSchema = z.strictObject({
  attemptId: uuid,
  answers: z
    .array(
      z.strictObject({
        questionId: uuid,
        optionIds: z.array(uuid).max(8),
      }),
    )
    .max(200),
  /** One choice per scenario step; absent when the assessment has no scenarios. */
  practical: z
    .array(z.strictObject({ stepId: uuid, optionId: uuid }))
    .max(200)
    .optional(),
  /**
   * Client-generated key that makes a submission safe to retry. A device that
   * loses the network mid-submit sends the same key again and gets the original
   * result back, rather than burning a second attempt.
   */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});
export type SubmitInput = z.infer<typeof submitSchema>;

export const resultsQuery = paginationSchema.extend({
  passed: z.enum(['true', 'false']).optional(),
});
