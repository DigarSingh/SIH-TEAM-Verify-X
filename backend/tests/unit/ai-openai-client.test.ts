import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * The GPT adapter against a local stand-in for the Chat Completions API. No key or network is involved; what
 * this verifies is OUR side of the contract: the request that is sent (model, JSON mode, the schema in the
 * instructions, token limit naming), how a response is read, that every failure becomes a safe API error, and
 * how the provider is chosen. (It cannot prove what a live service accepts; a real key is needed for that.)
 */

interface RequestBody {
  model?: string;
  messages: { role: string; content: string }[];
  [key: string]: unknown;
}
interface Seen {
  url: string;
  method: string;
  headers: http.IncomingHttpHeaders;
  body: RequestBody;
}
interface Reply {
  status: number;
  body?: unknown;
  /** Sent as is instead of the JSON body (for example an HTML error page from a proxy). */
  raw?: string;
  headers?: Record<string, string>;
  delayMs?: number;
}

let server: http.Server;
let baseUrl: string;
let seen: Seen[] = [];
let replies: Reply[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ url: req.url ?? '', method: req.method ?? '', headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as RequestBody });
      // The next queued reply; the last one repeats. A tiny retry hint keeps the adapter's retries fast in tests.
      const reply = (replies.length > 1 ? replies.shift() : replies[0]) as Reply;
      setTimeout(() => {
        res.writeHead(reply.status, { 'content-type': 'application/json', 'retry-after-ms': '1', ...reply.headers });
        res.end(reply.raw ?? JSON.stringify(reply.body));
      }, reply.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
);
beforeEach(() => {
  seen = [];
  replies = [];
});

const answerSchema = z.object({ answer: z.string(), foundInMaterials: z.boolean(), sourceIds: z.array(z.string()) });
const goodAnswer = { answer: 'It is c / (2 x PRF).', foundInMaterials: true, sourceIds: ['m1'] };

const choice = (overrides: Record<string, unknown> = {}) => ({
  index: 0,
  finish_reason: 'stop',
  message: { role: 'assistant', content: JSON.stringify(goodAnswer), refusal: null },
  ...overrides,
});
const completion = (overrides: Record<string, unknown> = {}) => ({
  id: 'chatcmpl-test',
  object: 'chat.completion',
  model: 'gpt-4o-mini-2024-07-18',
  choices: [choice()],
  usage: { prompt_tokens: 1200, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 1000 } },
  ...overrides,
});
const withMessage = (content: string | null, extra: Record<string, unknown> = {}) => choice({ message: { role: 'assistant', content, refusal: null, ...extra } });
const apiError = (code: string, type: string, text: string) => ({ error: { message: text, type, param: null, code } });

const AI_ENV = ['AI_PROVIDER', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'ANTHROPIC_API_KEY', 'AI_MODEL'];

/** Loads a fresh copy of the AI client configured like a deployment with an OpenAI key. */
async function load(overrides: Record<string, string> = {}) {
  vi.resetModules();
  // Explicitly empty (not deleted): the settings loader treats '' as unset, and it never lets a developer's real .env fill the gap.
  for (const key of AI_ENV) process.env[key] = '';
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(40),
    COOKIE_SECURE: 'false',
    FRONTEND_URL: 'http://localhost:5173',
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key-not-real',
    OPENAI_BASE_URL: baseUrl,
    ...overrides,
  });
  return import('../../src/modules/ai/ai.client');
}

const request = {
  feature: 'test',
  system: [{ text: 'You are the course assistant.' }, { text: '<course>materials</course>', cache: true }],
  user: JSON.stringify({ question: 'What limits the range?' }),
  schema: answerSchema,
  effort: 'low' as const,
  maxTokens: 500,
};

describe('request sent to the Chat Completions API', () => {
  it('asks for a JSON answer described by the schema, on the configured model', async () => {
    const { requireAiClient } = await load({ AI_MODEL: 'gpt-test' });
    replies = [{ status: 200, body: completion() }];

    const result = await requireAiClient().generate(request);

    expect(seen).toHaveLength(1);
    const [call] = seen;
    expect(call?.method).toBe('POST');
    expect(call?.url).toBe('/v1/chat/completions');
    expect(call?.headers.authorization).toBe('Bearer test-key-not-real');
    expect(call?.body).toMatchObject({ model: 'gpt-test', response_format: { type: 'json_object' }, max_tokens: 500 });
    for (const absent of ['max_completion_tokens', 'reasoning_effort', 'temperature', 'top_p', 'stream']) expect(call?.body).not.toHaveProperty(absent);

    expect(call?.body.messages).toHaveLength(2);
    expect(call?.body.messages[1]).toEqual({ role: 'user', content: request.user });
    const system = String(call?.body.messages[0]?.content);
    expect(call?.body.messages[0]?.role).toBe('system');
    // Instructions, then the course text (stable, so the provider can cache it), then the schema; the question comes last.
    expect(system.indexOf('You are the course assistant.')).toBeGreaterThanOrEqual(0);
    expect(system.indexOf('You are the course assistant.')).toBeLessThan(system.indexOf('<course>materials</course>'));
    expect(system.indexOf('<course>materials</course>')).toBeLessThan(system.indexOf('JSON Schema'));
    expect(system).toContain('foundInMaterials');

    expect(result).toEqual({
      output: goodAnswer,
      model: 'gpt-4o-mini-2024-07-18',
      usage: { inputTokens: 200, outputTokens: 80, cacheReadTokens: 1000, cacheWriteTokens: 0 },
    });
  });

  it('names the token limit the way OpenAI itself expects, and sends the effort only to reasoning models', async () => {
    await load();
    const { buildChatRequest } = await import('../../src/modules/ai/ai.openai');
    const official = 'https://api.openai.com/v1';
    expect(buildChatRequest('gpt-4o-mini', official, request)).toMatchObject({ max_completion_tokens: 500 });
    expect(buildChatRequest('gpt-4o-mini', official, request)).not.toHaveProperty('max_tokens');
    expect(buildChatRequest('gpt-4o-mini', official, request)).not.toHaveProperty('reasoning_effort');
    for (const model of ['gpt-5', 'gpt-5-mini', 'gpt-5.4-mini', 'o3-mini', 'o4-mini']) {
      expect(buildChatRequest(model, official, request)).toMatchObject({ reasoning_effort: 'low' });
    }
    expect(buildChatRequest('gpt-5-mini', official, { ...request, effort: undefined })).not.toHaveProperty('reasoning_effort');
    expect(buildChatRequest('gpt-4o-mini', 'https://gateway.example.com/v1', request)).toMatchObject({ max_tokens: 500 });
  });

  it('defaults to gpt-4.1-mini and reuses one client', async () => {
    const { requireAiClient } = await load({ OPENAI_BASE_URL: '' });
    expect(requireAiClient().model).toBe('gpt-4.1-mini');
    expect(requireAiClient()).toBe(requireAiClient());
  });

  it('accepts JSON that a model wrapped in a code fence', async () => {
    const { requireAiClient } = await load();
    replies = [{ status: 200, body: completion({ choices: [withMessage('```json\n' + JSON.stringify(goodAnswer) + '\n```')] }) }];
    await expect(requireAiClient().generate(request)).resolves.toMatchObject({ output: goodAnswer });
  });
});

describe('answers that are not usable', () => {
  it.each([
    { label: 'a refusal', body: completion({ choices: [withMessage(null, { refusal: 'I cannot help with that.' })] }), status: 422, code: 'AI_REFUSED' },
    { label: 'the content filter', body: completion({ choices: [choice({ finish_reason: 'content_filter' })] }), status: 422, code: 'AI_REFUSED' },
    { label: 'an answer cut off by the token limit', body: completion({ choices: [{ ...withMessage('{"answer": "It is c / (2'), finish_reason: 'length' }] }), status: 502, code: 'AI_TRUNCATED' },
    { label: 'text that is not JSON', body: completion({ choices: [withMessage('Sure! Here is the answer.')] }), status: 502, code: 'AI_BAD_OUTPUT' },
    { label: 'JSON of the wrong shape', body: completion({ choices: [withMessage(JSON.stringify({ answer: 42 }))] }), status: 502, code: 'AI_BAD_OUTPUT' },
    { label: 'an empty answer', body: completion({ choices: [withMessage('')] }), status: 502, code: 'AI_BAD_OUTPUT' },
    { label: 'no choices at all', body: completion({ choices: [] }), status: 502, code: 'AI_BAD_OUTPUT' },
  ])('$label becomes a clear $code error, not a crash', async ({ body, status, code }) => {
    const { requireAiClient } = await load();
    replies = [{ status: 200, body }];
    await expect(requireAiClient().generate(request)).rejects.toMatchObject({ name: 'AppError', status, code });
  });
});

describe('failures of the AI service', () => {
  it.each([
    { httpStatus: 429, code: 'rate_limit_exceeded', type: 'requests', expected: 'AI_BUSY', status: 503, attempts: 3 }, // retried twice, then reported
    { httpStatus: 401, code: 'invalid_api_key', type: 'invalid_request_error', expected: 'AI_MISCONFIGURED', status: 502, attempts: 1 },
    { httpStatus: 403, code: 'unsupported_country_region_territory', type: 'invalid_request_error', expected: 'AI_MISCONFIGURED', status: 502, attempts: 1 },
    { httpStatus: 404, code: 'model_not_found', type: 'invalid_request_error', expected: 'AI_MISCONFIGURED', status: 502, attempts: 1 },
    { httpStatus: 400, code: 'invalid_prompt', type: 'invalid_request_error', expected: 'AI_REQUEST_REJECTED', status: 502, attempts: 1 },
    { httpStatus: 500, code: 'server_error', type: 'server_error', expected: 'AI_UPSTREAM_ERROR', status: 502, attempts: 3 },
    { httpStatus: 503, code: 'overloaded', type: 'server_error', expected: 'AI_UPSTREAM_ERROR', status: 502, attempts: 3 },
  ])('HTTP $httpStatus is reported as $expected without leaking the upstream message', async ({ httpStatus, code, type, expected, status, attempts }) => {
    const { requireAiClient } = await load();
    replies = [{ status: httpStatus, body: apiError(code, type, 'upstream detail: sk-secret-looking-value and internal hints') }];

    const failure = await requireAiClient().generate(request).then(
      () => null,
      (error: unknown) => error as { status: number; code: string; message: string },
    );
    expect(failure).toMatchObject({ status, code: expected });
    expect(failure?.message).not.toMatch(/upstream detail|sk-secret|internal/);
    expect(seen).toHaveLength(attempts);
  });

  it('does not retry when the account is out of credit, and says so', async () => {
    const { requireAiClient } = await load();
    replies = [{ status: 429, body: apiError('insufficient_quota', 'insufficient_quota', 'You exceeded your current quota, please check your plan and billing details.') }];
    await expect(requireAiClient().generate(request)).rejects.toMatchObject({ status: 503, code: 'AI_QUOTA_EXHAUSTED' });
    expect(seen).toHaveLength(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    const { requireAiClient } = await load();
    replies = [
      { status: 500, body: apiError('server_error', 'server_error', 'The server had an error') },
      { status: 200, body: completion() },
    ];
    await expect(requireAiClient().generate(request)).resolves.toMatchObject({ output: goodAnswer });
    expect(seen).toHaveLength(2);
  });

  it('reports an unreachable service as 503 AI_UNAVAILABLE', async () => {
    const { requireAiClient } = await load({ OPENAI_BASE_URL: 'http://127.0.0.1:1/v1' });
    await expect(requireAiClient().generate(request)).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
  }, 20_000);

  it('gives up on a service that does not answer in time, without retrying', async () => {
    await load();
    const { OpenAiClient } = await import('../../src/modules/ai/ai.openai');
    replies = [{ status: 200, body: completion(), delayMs: 600 }];
    const client = new OpenAiClient({ apiKey: 'test-key-not-real', model: 'gpt-test', baseUrl, timeoutMs: 100, retryDelayMs: 1 });
    await expect(client.generate(request)).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
    expect(seen).toHaveLength(1);
  });

  it('reports an answer that is not JSON at all (a proxy error page) as an upstream error', async () => {
    const { requireAiClient } = await load();
    replies = [{ status: 200, raw: '<html>Bad gateway</html>', headers: { 'content-type': 'text/html' } }];
    await expect(requireAiClient().generate(request)).rejects.toMatchObject({ status: 502, code: 'AI_UPSTREAM_ERROR' });
  });

  it('keeps the key, the question and the answer out of the logs', async () => {
    const { requireAiClient } = await load();
    const { logger } = await import('../../src/config/logger');
    const logged: unknown[] = [];
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      vi.spyOn(logger, level).mockImplementation(((...args: unknown[]) => {
        logged.push(args);
      }) as never);
    }

    replies = [{ status: 200, body: completion() }];
    await requireAiClient().generate(request);
    replies = [{ status: 401, body: apiError('invalid_api_key', 'invalid_request_error', 'Incorrect API key provided: test-key-not-real') }];
    await requireAiClient().generate(request).catch(() => undefined);

    const text = JSON.stringify(logged);
    expect(text).toContain('AI request completed'); // the spies did see the real log calls
    expect(text).toContain('rejected the configured credentials');
    for (const secret of ['test-key-not-real', 'What limits the range?', 'It is c / (2 x PRF)', '<course>materials</course>']) expect(text).not.toContain(secret);
    vi.restoreAllMocks();
  });
});

describe('choosing the provider', () => {
  it('uses GPT by default and ignores the other provider’s key', async () => {
    const { isAiConfigured, requireAiClient, aiProviderLabel } = await load({ OPENAI_API_KEY: '', ANTHROPIC_API_KEY: 'sk-ant-not-real' });
    expect(isAiConfigured()).toBe(false);
    expect(aiProviderLabel()).toBeNull();
    expect(() => requireAiClient()).toThrowError(expect.objectContaining({ status: 503, code: 'AI_NOT_CONFIGURED' }));
  });

  it('is on with an OpenAI key, and names OpenAI as the recipient of the text', async () => {
    const { isAiConfigured, aiProviderLabel } = await load({ OPENAI_BASE_URL: '' });
    expect(isAiConfigured()).toBe(true);
    expect(aiProviderLabel()).toBe('OpenAI');
  });

  it('still says OpenAI when the base URL is set to OpenAI’s own address', async () => {
    const { aiProviderLabel } = await load({ OPENAI_BASE_URL: 'https://api.openai.com/v1' });
    expect(aiProviderLabel()).toBe('OpenAI');
  });

  it('names the host of an OpenAI-compatible service instead', async () => {
    const { aiProviderLabel } = await load({ OPENAI_BASE_URL: 'https://gateway.example.com/v1' });
    expect(aiProviderLabel()).toBe('gateway.example.com');
  });

  it('AI_PROVIDER=anthropic switches to the Anthropic key and its default model', async () => {
    const { isAiConfigured, aiProviderLabel, requireAiClient } = await load({ AI_PROVIDER: 'anthropic', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: 'sk-ant-not-real' });
    expect(isAiConfigured()).toBe(true);
    expect(aiProviderLabel()).toBe('Anthropic');
    expect(requireAiClient().model).toBe('claude-opus-5');
  });

  it('AI_PROVIDER=anthropic ignores an OpenAI key', async () => {
    const { isAiConfigured } = await load({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' });
    expect(isAiConfigured()).toBe(false);
  });
});

describe('environment checks for the AI settings', () => {
  const production = { NODE_ENV: 'production', COOKIE_SECURE: 'true', FRONTEND_URL: 'https://app.example.gov.in' };

  it('rejects a base URL that is not an http(s) address', async () => {
    await expect(load({ OPENAI_BASE_URL: 'not a url' })).rejects.toThrow(/OPENAI_BASE_URL/);
    await expect(load({ OPENAI_BASE_URL: 'ftp://gateway.example.com/v1' })).rejects.toThrow(/OPENAI_BASE_URL must start with http/);
  });

  it('requires https for a remote base URL in production, but allows this machine', async () => {
    await expect(load({ ...production, OPENAI_BASE_URL: 'http://gateway.example.com/v1' })).rejects.toThrow(/OPENAI_BASE_URL must use https/);
    await expect(load({ ...production, OPENAI_BASE_URL: 'https://gateway.example.com/v1' })).resolves.toBeDefined();
    await expect(load({ ...production, OPENAI_BASE_URL: 'http://localhost:11434/v1' })).resolves.toBeDefined();
  });

  it('rejects an unknown provider', async () => {
    await expect(load({ AI_PROVIDER: 'gemini' })).rejects.toThrow(/AI_PROVIDER/);
  });
});
