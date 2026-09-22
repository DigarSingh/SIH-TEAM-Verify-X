import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/**
 * The real Anthropic client wrapper against a local stand-in for the Messages API. No key or network is
 * involved; what this verifies is OUR side of the contract: the request that is sent (model, structured
 * output, caching, refusal fallbacks), how a response is read, and that every failure becomes a safe
 * API error. (It cannot prove what the live service accepts; that needs a real key.)
 */

/** The request-body fields these tests read directly; everything else is checked with toMatchObject. */
interface RequestBody {
  model?: string;
  fallbacks?: unknown;
  system: unknown[];
  [key: string]: unknown;
}
interface Seen {
  url: string;
  headers: http.IncomingHttpHeaders;
  body: RequestBody;
}
type Reply = { status: number; headers?: Record<string, string>; body: unknown };

let server: http.Server;
let baseUrl: string;
let seen: Seen[] = [];
let reply: Reply;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      seen.push({ url: req.url ?? '', headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      // A tiny retry delay keeps the SDK's automatic retries fast in tests.
      res.writeHead(reply.status, { 'content-type': 'application/json', 'retry-after-ms': '1', ...reply.headers });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  seen = [];
});

const answerSchema = z.object({ answer: z.string(), foundInMaterials: z.boolean(), sourceIds: z.array(z.string()) });
const goodAnswer = { answer: 'It is c / (2 x PRF).', foundInMaterials: true, sourceIds: ['m1'] };

const message = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5',
  // adaptive thinking puts a thinking block in front of the answer; it must be ignored
  content: [
    { type: 'thinking', thinking: 'reasoning the client must not treat as the answer', signature: 'sig' },
    { type: 'text', text: JSON.stringify(goodAnswer) },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1200, output_tokens: 80, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 },
  ...overrides,
});
const apiError = (type: string, text: string) => ({ type: 'error', error: { type, message: text } });

/** Loads a fresh copy of the client configured like a deployment with a key. */
async function loadClient(overrides: Record<string, string> = {}) {
  vi.resetModules();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(40),
    AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test-key-not-real',
    ANTHROPIC_BASE_URL: baseUrl,
    AI_MODEL: 'claude-opus-5',
    AI_REFUSAL_FALLBACKS: 'true',
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

describe('request sent to the Messages API', () => {
  it('asks for structured output with cached course text, on the configured model', async () => {
    const { requireAiClient } = await loadClient({ AI_REFUSAL_FALLBACKS: 'false' });
    reply = { status: 200, body: message() };

    const result = await requireAiClient().generate(request);

    expect(seen).toHaveLength(1);
    const [call] = seen;
    expect(call?.url).toBe('/v1/messages');
    expect(call?.headers['x-api-key']).toBe('test-key-not-real');
    expect(call?.headers['anthropic-beta']).toBeUndefined();
    expect(call?.body).toMatchObject({
      model: 'claude-opus-5',
      max_tokens: 500,
      system: [{ type: 'text', text: 'You are the course assistant.' }, { type: 'text', text: '<course>materials</course>', cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['answer', 'foundInMaterials', 'sourceIds'] } } },
    });
    expect(call?.body.system[0]).not.toHaveProperty('cache_control'); // only the large stable block is cached
    for (const unsupported of ['temperature', 'top_p', 'top_k', 'fallbacks', 'budget_tokens']) expect(call?.body).not.toHaveProperty(unsupported);

    expect(result).toEqual({
      output: goodAnswer,
      model: 'claude-opus-5',
      usage: { inputTokens: 1200, outputTokens: 80, cacheReadTokens: 1000, cacheWriteTokens: 0 },
    });
  });

  it('enables server-side refusal fallbacks by default and reports the model that really answered', async () => {
    const { requireAiClient } = await loadClient();
    reply = { status: 200, body: message({ model: 'claude-sonnet-5' }) };

    const result = await requireAiClient().generate(request);

    expect(seen[0]?.url).toBe('/v1/messages?beta=true');
    expect(seen[0]?.headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(seen[0]?.body.fallbacks).toBe('default');
    expect(result.model).toBe('claude-sonnet-5');
  });

  it('reuses one client and honours AI_MODEL', async () => {
    const { requireAiClient } = await loadClient({ AI_MODEL: 'claude-sonnet-5', AI_REFUSAL_FALLBACKS: 'false' });
    reply = { status: 200, body: message() };
    expect(requireAiClient()).toBe(requireAiClient());
    expect(requireAiClient().model).toBe('claude-sonnet-5');
    await requireAiClient().generate(request);
    expect(seen[0]?.body.model).toBe('claude-sonnet-5');
  });
});

describe('answers that are not usable', () => {
  it.each([
    ['a refusal', { stop_reason: 'refusal', content: [{ type: 'text', text: '' }] }, 422, 'AI_REFUSED'],
    ['an answer cut off by the token limit', { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"answer": "It is c / (2' }] }, 502, 'AI_TRUNCATED'],
    ['text that is not JSON', { content: [{ type: 'text', text: 'Sure! Here is the answer.' }] }, 502, 'AI_BAD_OUTPUT'],
    ['JSON of the wrong shape', { content: [{ type: 'text', text: JSON.stringify({ answer: 42 }) }] }, 502, 'AI_BAD_OUTPUT'],
    ['no text at all', { content: [] }, 502, 'AI_BAD_OUTPUT'],
  ])('%s becomes a clear %s error, not a crash', async (_label, overrides, status, code) => {
    const { requireAiClient } = await loadClient();
    reply = { status: 200, body: message(overrides) };
    await expect(requireAiClient().generate(request)).rejects.toMatchObject({ name: 'AppError', status, code });
  });
});

describe('failures of the AI service', () => {
  it.each([
    [429, 'rate_limit_error', 'AI_BUSY', 503, 3], // retried twice, then reported
    [401, 'authentication_error', 'AI_MISCONFIGURED', 502, 1],
    [403, 'permission_error', 'AI_MISCONFIGURED', 502, 1],
    [400, 'invalid_request_error', 'AI_REQUEST_REJECTED', 502, 1],
    [500, 'api_error', 'AI_UPSTREAM_ERROR', 502, 3],
    [529, 'overloaded_error', 'AI_UPSTREAM_ERROR', 502, 3],
  ])('HTTP %i is reported as %s without leaking the upstream message', async (httpStatus, type, code, status, attempts) => {
    const { requireAiClient } = await loadClient();
    reply = { status: httpStatus, body: apiError(type, 'upstream detail: sk-ant-secret-looking-value and internal hints') };

    const failure = await requireAiClient().generate(request).then(
      () => null,
      (error: unknown) => error as { status: number; code: string; message: string },
    );
    expect(failure).toMatchObject({ status, code });
    expect(failure?.message).not.toMatch(/upstream detail|sk-ant|internal/);
    expect(seen).toHaveLength(attempts);
  });

  it('reports an unreachable service as 503 AI_UNAVAILABLE', async () => {
    const { requireAiClient } = await loadClient({ ANTHROPIC_BASE_URL: 'http://127.0.0.1:1' });
    await expect(requireAiClient().generate(request)).rejects.toMatchObject({ status: 503, code: 'AI_UNAVAILABLE' });
  }, 20_000);
});

describe('configuration', () => {
  it('without a key every AI call answers 503 AI_NOT_CONFIGURED', async () => {
    const { requireAiClient, isAiConfigured } = await loadClient({ ANTHROPIC_API_KEY: '' });
    expect(isAiConfigured()).toBe(false);
    expect(() => requireAiClient()).toThrowError(expect.objectContaining({ status: 503, code: 'AI_NOT_CONFIGURED' }));
  });

  it('a client injected by a test takes the place of the key', async () => {
    const { requireAiClient, isAiConfigured, setAiClientForTesting } = await loadClient({ ANTHROPIC_API_KEY: '' });
    const fake = { model: 'fake', generate: vi.fn() };
    setAiClientForTesting(fake);
    expect(isAiConfigured()).toBe(true);
    expect(requireAiClient()).toBe(fake);
    setAiClientForTesting(null);
    expect(isAiConfigured()).toBe(false);
  });

  it('does not translate an ordinary programming error into an AI error', async () => {
    const { toAppError } = await loadClient();
    const bug = new TypeError('cannot read properties of undefined');
    expect(() => toAppError(bug)).toThrow(bug);
  });
});
