import { z } from 'zod';
import { optionalText, requiredText } from '../../lib/schemas';

// ---- requests -----------------------------------------------------------------------------------------------

export const askSchema = z.strictObject({ question: requiredText(3, 500, 'Question') });

export const quizDraftSchema = z.strictObject({
  questionCount: z.number().int().min(1, 'Ask for at least 1 question').max(20, 'At most 20 questions at a time').default(5),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  includeMultipleAnswer: z.boolean().default(true),
  focus: optionalText(200),
});
export type QuizDraftInput = z.infer<typeof quizDraftSchema>;

export const searchRequestSchema = z.strictObject({ query: requiredText(2, 200, 'Search') });

export const forecastQuerySchema = z.object({ horizon: z.coerce.number().int().min(1).max(12).default(6) });

// ---- what the model must return (validated again on the server after parsing) ------------------------------------
// Constraints such as length limits are enforced in code: structured outputs only guarantee the shape.

export const askOutputSchema = z.object({
  answer: z.string(),
  foundInMaterials: z.boolean(),
  sourceIds: z.array(z.string()),
});

export const quizOutputSchema = z.object({
  questions: z.array(
    z.object({
      text: z.string(),
      type: z.enum(['SINGLE', 'MULTIPLE']),
      explanation: z.string(),
      options: z.array(z.object({ text: z.string(), isCorrect: z.boolean() })),
    }),
  ),
});

export const planOutputSchema = z.object({
  summary: z.string(),
  steps: z.array(z.object({ courseId: z.string(), note: z.string() })),
});

export const searchOutputSchema = z.object({
  keywords: z.string(),
  competencyIds: z.array(z.string()),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).nullable(),
  category: z.string().nullable(),
  maxDurationMinutes: z.number().nullable(),
  explanation: z.string(),
});

export const forecastSummaryOutputSchema = z.object({
  summary: z.string(),
  priorities: z.array(z.object({ competencyId: z.string(), action: z.string() })),
});
