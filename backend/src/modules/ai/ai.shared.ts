import type { z } from 'zod';
import { logger } from '../../config/logger';
import { AppError } from '../../lib/errors';

/**
 * What every AI provider adapter has in common: the request and result shapes the features use, and the
 * checks applied to whatever text a model returns. The rest of the code only ever sees an `AiClient`.
 */

export type AiEffort = 'low' | 'medium' | 'high';

export interface AiSystemBlock {
  text: string;
  /** Mark a large, stable block (for example a course's materials) for prompt caching where the provider supports an explicit hint. */
  cache?: boolean;
}

export interface AiRequest<T> {
  /** Used for logging and usage accounting only. */
  feature: string;
  system: AiSystemBlock[];
  user: string;
  schema: z.ZodType<T>;
  effort?: AiEffort;
  maxTokens?: number;
}

export interface AiUsage {
  /** Input tokens that were not served from the provider's prompt cache. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiResult<T> {
  output: T;
  /** The model that actually produced the answer (differs from the configured one after a refusal fallback). */
  model: string;
  usage: AiUsage;
}

export interface AiClient {
  readonly model: string;
  generate<T>(request: AiRequest<T>): Promise<AiResult<T>>;
}

export const badOutput = () => new AppError(502, 'AI_BAD_OUTPUT', 'The AI returned an answer in an unexpected format. Please try again.');
export const refusedError = () => new AppError(422, 'AI_REFUSED', 'The AI declined to answer this request. Rephrase it, or ask something about the course content.');
export const truncatedError = () => new AppError(502, 'AI_TRUNCATED', 'The AI response was cut off before it was complete. Try again with a smaller request.');

/** The structured answer. The provider constrains the shape; validating it here keeps that a checked fact rather than an assumption. */
export function parseJsonAnswer<T>(text: string, schema: z.ZodType<T>, feature: string, stopReason: string | null): T {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    logger.error({ feature, stopReason, length: text.length }, 'The AI answer was not valid JSON');
    throw badOutput();
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    logger.error({ feature, issues: parsed.error.issues.slice(0, 5).map((issue) => ({ path: issue.path.join('.'), code: issue.code })) }, 'The AI answer did not match the expected shape');
    throw badOutput();
  }
  return parsed.data;
}
