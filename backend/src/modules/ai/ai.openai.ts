import { z } from 'zod';
import { logger } from '../../config/logger';
import { AppError } from '../../lib/errors';
import { badOutput, parseJsonAnswer, refusedError, truncatedError, type AiClient, type AiRequest, type AiResult, type AiUsage } from './ai.shared';

/**
 * The GPT adapter: OpenAI's Chat Completions API, or any service that speaks the same protocol (set OPENAI_BASE_URL).
 * It uses plain `fetch`, so there is no SDK to install.
 *
 * The answer is requested in JSON mode, which every OpenAI-compatible service supports, with the JSON Schema of the
 * expected shape written into the instructions. The reply is then checked against the real Zod schema (`parseJsonAnswer`),
 * so a model that strays from the shape produces a clean "unexpected format" error instead of bad data. Failures become
 * safe API errors; details (status, request id, error code) are logged, never the key, the prompt or the answer.
 */

export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_DEFAULT_MODEL = 'gpt-4.1-mini';

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;
const MAX_RETRY_WAIT_MS = 5_000;

export interface OpenAiClientOptions {
  apiKey: string;
  model: string;
  /** Root of the API, `https://api.openai.com/v1` unless another OpenAI-compatible service is used. */
  baseUrl?: string;
  /** Per-attempt timeout; tests use a small value. */
  timeoutMs?: number;
  /** Wait before the first retry (it doubles each time); tests use a tiny value. */
  retryDelayMs?: number;
}

/** The parts of a chat completion this client reads. */
interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}

interface Failure {
  status: number;
  code?: string;
  type?: string;
  message?: string;
  requestId?: string;
  retryAfterMs?: number;
}

const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Models that think before answering take their effort as `reasoning_effort` and count that thinking against the token limit. */
const isReasoningModel = (model: string) => /^(o\d|gpt-5)/i.test(model);
/** True for OpenAI's own API (as opposed to another service that speaks the same protocol). */
export const isOfficialOpenAiUrl = (baseUrl: string) => new URL(baseUrl).hostname === 'api.openai.com';

/** The request body for one AI call. Exported so tests can check exactly what would be sent. */
export function buildChatRequest<T>(model: string, baseUrl: string, request: AiRequest<T>) {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(request.schema, { io: 'input', unrepresentable: 'any' });
  const instruction = `Reply with one JSON object and nothing else: no code fences, no commentary. It must match this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
  // Stable text first and the variable question last, so a provider that caches automatically can reuse the long course text.
  const system = [...request.system.map((block) => block.text), instruction].join('\n\n');
  const limit = request.maxTokens ?? 16_000;
  return {
    model,
    messages: [
      { role: 'system' as const, content: system },
      { role: 'user' as const, content: request.user },
    ],
    response_format: { type: 'json_object' as const },
    // OpenAI's own API wants max_completion_tokens (newer models reject max_tokens); other services still expect max_tokens.
    ...(isOfficialOpenAiUrl(baseUrl) ? { max_completion_tokens: limit } : { max_tokens: limit }),
    ...(request.effort && isReasoningModel(model) ? { reasoning_effort: request.effort } : {}),
  };
}

/** Some models wrap JSON in a code fence even when told not to; the fence is not part of the answer. */
const unfence = (text: string): string => {
  const trimmed = text.trim();
  return (/^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1] ?? trimmed).trim();
};

function retryAfterMs(headers: Headers): number | undefined {
  const millis = headers.get('retry-after-ms');
  if (millis !== null && Number.isFinite(Number(millis)) && Number(millis) >= 0) return Number(millis);
  const seconds = headers.get('retry-after');
  if (seconds !== null && Number.isFinite(Number(seconds)) && Number(seconds) >= 0) return Number(seconds) * 1000;
  return undefined;
}

async function readFailure(response: Response): Promise<Failure> {
  const text = await response.text().catch(() => '');
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // not JSON: the status alone has to do
  }
  const root = asRecord(body);
  const error = asRecord(root.error);
  const message = typeof error.message === 'string' ? error.message : typeof root.error === 'string' ? root.error : typeof root.message === 'string' ? root.message : undefined;
  return {
    status: response.status,
    code: typeof error.code === 'string' ? error.code : undefined,
    type: typeof error.type === 'string' ? error.type : undefined,
    message: message?.slice(0, 300),
    requestId: response.headers.get('x-request-id') ?? undefined,
    retryAfterMs: retryAfterMs(response.headers),
  };
}

const isQuotaExhausted = (failure: Failure) => failure.code === 'insufficient_quota' || failure.type === 'insufficient_quota';
const isRetryable = (failure: Failure) => failure.status === 408 || failure.status === 409 || failure.status >= 500 || (failure.status === 429 && !isQuotaExhausted(failure));
const isTimeout = (error: unknown) => error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');

/** Translates a failed HTTP answer into a safe API error (details are logged, never returned). */
function failureToError(failure: Failure): AppError {
  const { status, code, requestId } = failure;
  if (status === 401 || status === 403) {
    logger.error({ status, code, requestId }, 'The AI service rejected the configured credentials');
    return new AppError(502, 'AI_MISCONFIGURED', 'The AI service rejected this server’s credentials. Please contact your administrator.');
  }
  if (isQuotaExhausted(failure)) {
    logger.error({ status, code, requestId }, 'The AI account has no credit left');
    return new AppError(503, 'AI_QUOTA_EXHAUSTED', 'The AI account this server uses has no credit left. Please contact your administrator.');
  }
  if (status === 429) return new AppError(503, 'AI_BUSY', 'The AI service is busy right now. Please try again in a minute.');
  if (status === 404 || code === 'model_not_found') {
    logger.error({ status, code, requestId }, 'The AI service does not offer the configured model');
    return new AppError(502, 'AI_MISCONFIGURED', 'The AI service does not accept the configured model. Please contact your administrator.');
  }
  if (status === 400 || status === 422) {
    logger.error({ status, code, requestId, message: failure.message }, 'The AI service rejected a request');
    return new AppError(502, 'AI_REQUEST_REJECTED', 'The AI service could not process this request. Please try again, or contact your administrator if it keeps happening.');
  }
  logger.error({ status, requestId }, 'The AI service returned an error');
  return new AppError(502, 'AI_UPSTREAM_ERROR', 'The AI service returned an error. Please try again shortly.');
}

export class OpenAiClient implements AiClient {
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(options: OpenAiClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = (options.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  }

  async generate<T>(request: AiRequest<T>): Promise<AiResult<T>> {
    const started = Date.now();
    const completion = await this.send(buildChatRequest(this.model, this.baseUrl, request));

    const choice = completion.choices?.[0];
    if (!choice) {
      logger.error({ feature: request.feature }, 'The AI answer had no choices');
      throw badOutput();
    }
    // A refusal or a cut-off answer is not valid JSON: check for it BEFORE parsing.
    if (choice.message?.refusal || choice.finish_reason === 'content_filter') throw refusedError();
    if (choice.finish_reason === 'length') throw truncatedError();
    const output = parseJsonAnswer(unfence(choice.message?.content ?? ''), request.schema, request.feature, choice.finish_reason ?? null);

    // OpenAI counts cached tokens inside prompt_tokens; report them separately, like the other provider does.
    const cached = completion.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const usage: AiUsage = {
      inputTokens: Math.max(0, (completion.usage?.prompt_tokens ?? 0) - cached),
      outputTokens: completion.usage?.completion_tokens ?? 0,
      cacheReadTokens: cached,
      cacheWriteTokens: 0,
    };
    const model = completion.model ?? this.model;
    logger.info({ feature: request.feature, model, ms: Date.now() - started, ...usage }, 'AI request completed');
    return { output, model, usage };
  }

  /** One POST, retried on rate limits, server errors and dropped connections; every failure leaves as an AppError. */
  private async send(body: unknown): Promise<ChatCompletion> {
    const wait = (attempt: number, hint?: number) => sleep(Math.min(MAX_RETRY_WAIT_MS, hint ?? this.retryDelayMs * 2 ** attempt));
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) {
          logger.error({ timeoutMs: this.timeoutMs }, 'The AI service did not answer in time');
          throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service took too long to answer. Please try again shortly.');
        }
        if (attempt < MAX_RETRIES) {
          await wait(attempt);
          continue;
        }
        const cause = asRecord(asRecord(error).cause).code;
        logger.error({ cause: typeof cause === 'string' ? cause : 'unknown' }, 'The AI service could not be reached');
        throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service could not be reached. Please try again shortly.');
      }

      if (response.ok) {
        try {
          return (await response.json()) as ChatCompletion;
        } catch (error) {
          logger.error({ timedOut: isTimeout(error) }, 'The AI service sent an answer that could not be read');
          throw new AppError(502, 'AI_UPSTREAM_ERROR', 'The AI service returned an error. Please try again shortly.');
        }
      }
      const failure = await readFailure(response);
      if (attempt < MAX_RETRIES && isRetryable(failure)) {
        await wait(attempt, failure.retryAfterMs);
        continue;
      }
      throw failureToError(failure);
    }
  }
}
