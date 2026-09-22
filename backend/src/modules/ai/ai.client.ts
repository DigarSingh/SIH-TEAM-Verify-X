import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError } from '../../lib/errors';
import { OPENAI_DEFAULT_MODEL, OpenAiClient, isOfficialOpenAiUrl } from './ai.openai';
import { parseJsonAnswer, refusedError, truncatedError, type AiClient, type AiRequest, type AiResult, type AiUsage } from './ai.shared';

export type { AiClient, AiEffort, AiRequest, AiResult, AiSystemBlock, AiUsage } from './ai.shared';

/**
 * The single place where the AI provider is chosen and reached. `AI_PROVIDER` selects the adapter: OpenAI's GPT
 * models (the default, and any OpenAI-compatible service through `OPENAI_BASE_URL`, see `ai.openai.ts`) or Anthropic's
 * Claude (below).
 *
 * Every AI feature asks for STRUCTURED output (a Zod schema), so the rest of the code never parses free
 * text, and every failure is translated into an AppError with a clear, safe message. Nothing here is
 * ever on the critical path of the deterministic framework: without a key the AI endpoints answer 503
 * and the platform works exactly as before.
 */

const REQUEST_TIMEOUT_MS = 120_000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5';

/** The parts of a Messages API response this client reads (the same for the stable and the beta endpoint). */
interface RawMessage {
  model: string;
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
}

/** A request that succeeded but ended without a complete answer. Checked BEFORE the text is parsed: a refusal or a cut-off answer is not valid JSON. */
function stopFailure(stopReason: string | null): AppError | null {
  if (stopReason === 'refusal') return refusedError();
  if (stopReason === 'max_tokens') return truncatedError();
  return null;
}

function parseAnswer<T>(message: RawMessage, schema: z.ZodType<T>, feature: string): T {
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim();
  return parseJsonAnswer(text, schema, feature, message.stop_reason);
}

/** Translates SDK failures into safe API errors (details are logged, never returned). */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    return new AppError(503, 'AI_BUSY', 'The AI service is busy right now. Please try again in a minute.');
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    logger.error({ status: error.status, requestId: error.requestID }, 'The AI service rejected the configured credentials');
    return new AppError(502, 'AI_MISCONFIGURED', 'The AI service rejected this server’s credentials. Please contact your administrator.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    logger.error({ status: error.status, requestId: error.requestID, message: error.message }, 'The AI service rejected a request');
    return new AppError(502, 'AI_REQUEST_REJECTED', 'The AI service could not process this request. Please try again, or contact your administrator if it keeps happening.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AppError(503, 'AI_UNAVAILABLE', 'The AI service could not be reached. Please try again shortly.');
  }
  if (error instanceof Anthropic.APIError) {
    logger.error({ status: error.status, requestId: error.requestID }, 'The AI service returned an error');
    return new AppError(502, 'AI_UPSTREAM_ERROR', 'The AI service returned an error. Please try again shortly.');
  }
  if (error instanceof Anthropic.AnthropicError) {
    logger.error({ err: error }, 'The AI client failed');
    return new AppError(502, 'AI_UPSTREAM_ERROR', 'The AI service returned an error. Please try again shortly.');
  }
  throw error; // a bug in this codebase: let it surface as a 500 instead of hiding it
}

class AnthropicAiClient implements AiClient {
  private readonly sdk: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.sdk = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 2 });
  }

  async generate<T>(request: AiRequest<T>): Promise<AiResult<T>> {
    const params = {
      model: this.model,
      max_tokens: request.maxTokens ?? 16_000,
      system: request.system.map((block) => ({ type: 'text' as const, text: block.text, ...(block.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) })),
      messages: [{ role: 'user' as const, content: request.user }],
      // Adaptive thinking is the default on current models; only the depth of effort is chosen here.
      output_config: { effort: request.effort ?? ('high' as const), format: zodOutputFormat(request.schema) },
    };
    const started = Date.now();
    try {
      const message: RawMessage = env.AI_REFUSAL_FALLBACKS
        ? await this.sdk.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' })
        : await this.sdk.messages.create(params);

      const failure = stopFailure(message.stop_reason);
      if (failure) throw failure;
      const output = parseAnswer(message, request.schema, request.feature);

      const usage: AiUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      };
      logger.info({ feature: request.feature, model: message.model, ms: Date.now() - started, ...usage }, 'AI request completed');
      return { output, model: message.model, usage };
    } catch (error) {
      throw toAppError(error);
    }
  }
}

let injected: AiClient | null = null;
let cached: AiClient | null = null;

/** Tests and demos can supply a fake client; production code never calls this. */
export function setAiClientForTesting(client: AiClient | null): void {
  injected = client;
}

/** The key of the provider `AI_PROVIDER` selects (the other provider's key is ignored). */
const providerKey = (): string | undefined => (env.AI_PROVIDER === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY);

export const isAiConfigured = (): boolean => injected !== null || Boolean(providerKey());

/**
 * Who receives the text the AI features send, for the notice shown next to each feature: OpenAI, Anthropic, or the host
 * of the OpenAI-compatible service that is configured. Null while the AI features are off.
 */
export function aiProviderLabel(): string | null {
  if (!isAiConfigured()) return null;
  if (env.AI_PROVIDER === 'anthropic') return 'Anthropic';
  if (!env.OPENAI_BASE_URL || isOfficialOpenAiUrl(env.OPENAI_BASE_URL)) return 'OpenAI';
  return new URL(env.OPENAI_BASE_URL).hostname;
}

/** The client to use, or a clear 503 when the deployment has no AI key. */
export function requireAiClient(): AiClient {
  if (injected) return injected;
  const apiKey = providerKey();
  if (!apiKey) throw new AppError(503, 'AI_NOT_CONFIGURED', 'The AI assistant is not configured on this server.');
  cached ??=
    env.AI_PROVIDER === 'anthropic'
      ? new AnthropicAiClient(apiKey, env.AI_MODEL ?? ANTHROPIC_DEFAULT_MODEL)
      : new OpenAiClient({ apiKey, model: env.AI_MODEL ?? OPENAI_DEFAULT_MODEL, baseUrl: env.OPENAI_BASE_URL });
  return cached;
}
