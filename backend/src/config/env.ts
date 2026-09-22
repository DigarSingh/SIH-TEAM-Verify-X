import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Typed, validated environment configuration.
 *
 * The API fails fast at start-up with a readable message when the configuration
 * is invalid, instead of failing later at request time. `.env` is loaded from
 * the working directory or the monorepo root; real environment variables always
 * win (12-factor style), which is how production platforms inject configuration.
 */
function loadDotEnv(): string {
  const candidates = [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '..', '.env')];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (file) dotenv.config({ path: file });
  return file ? path.dirname(file) : process.cwd();
}
/** Directory of the loaded `.env` (the repository root in development). Relative paths in the config resolve against it. */
const envDir = loadDotEnv();

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => (value === undefined ? fallback : value === 'true' || value === '1'));

const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
    TRUST_PROXY: z.string().default('false'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    COOKIE_SECURE: bool(false),
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional(),
    REGISTRATION_REQUIRES_APPROVAL: bool(true),
    ALLOWED_EMAIL_DOMAINS: csv,
    MAX_FAILED_LOGINS: z.coerce.number().int().min(1).max(50).default(5),
    LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    ARGON2_MEMORY_KIB: z.coerce.number().int().min(8).default(19456),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),

    FRONTEND_URL: csv,

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./uploads'),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_BUCKET: z.string().default('capacity-connect'),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_FORCE_PATH_STYLE: bool(true),
    MAX_UPLOAD_MB: z.coerce.number().min(1).max(200).default(25),

    CERTIFICATE_ISSUER: z.string().default('India Meteorological Department, Ministry of Earth Sciences'),
    CERTIFICATE_ID_PREFIX: z
      .string()
      .regex(/^[A-Z0-9]{2,8}$/, 'CERTIFICATE_ID_PREFIX must be 2-8 upper-case letters or digits')
      .default('CC'),
    /**
     * Ed25519 private key (PKCS#8 PEM, or that PEM base64-encoded) used to sign
     * certificates. Generate one with `npm run cert:keygen`. Without it,
     * certificates are issued unsigned and verification says so. The value is a
     * secret: it is never logged and never returned by any endpoint.
     */
    CERTIFICATE_SIGNING_KEY: z.string().optional(),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(1000),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),

    ENABLE_SCHEDULER: bool(false),

    // Phase 2 AI features. Without a key every AI endpoint answers 503 AI_NOT_CONFIGURED and the platform works exactly as before.
    /** Which service writes the AI answers: OpenAI's GPT models (the default) or Anthropic's Claude. Only that provider's key is used. */
    AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
    OPENAI_API_KEY: z.string().optional(),
    /** Only for an OpenAI-compatible service other than OpenAI itself, for example `https://example.com/v1`. */
    OPENAI_BASE_URL: z
      .string()
      .url()
      .refine((value) => /^https?:\/\//i.test(value), 'OPENAI_BASE_URL must start with http:// or https://')
      .optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    /** The model used for every AI call. Default: gpt-4o-mini for OpenAI, claude-opus-5 for Anthropic. */
    AI_MODEL: z.string().optional(),
    /** Anthropic only: re-run a request the model declines on Anthropic's recommended fallback model (server-side, `fallbacks: "default"`). */
    AI_REFUSAL_FALLBACKS: bool(true),
    /** Per-user cap on AI requests per hour (they cost money). */
    AI_RATE_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(1000).default(30),
    /** Upper bound on the course material text sent with one request. */
    AI_MAX_CONTEXT_CHARS: z.coerce.number().int().min(5_000).max(500_000).default(120_000),
  })
  .superRefine((value, ctx) => {
    if (value.COOKIE_SAMESITE === 'none' && !value.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject insecure SameSite=None cookies)',
      });
    }
    if (value.NODE_ENV === 'production') {
      if (!value.COOKIE_SECURE) {
        ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
      }
      if (value.FRONTEND_URL.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['FRONTEND_URL'], message: 'FRONTEND_URL is required in production (CORS allow-list)' });
      }
      // The key and the text sent to the AI travel to this address, so it must be encrypted unless it is this machine.
      if (value.OPENAI_BASE_URL && !/^https:\/\//i.test(value.OPENAI_BASE_URL) && !/^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/i.test(value.OPENAI_BASE_URL)) {
        ctx.addIssue({ code: 'custom', path: ['OPENAI_BASE_URL'], message: 'OPENAI_BASE_URL must use https:// in production' });
      }
    }
    if (value.STORAGE_DRIVER === 's3') {
      for (const key of ['STORAGE_BUCKET', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'] as const) {
        if (!value[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
        }
      }
    }
  });

function parseTrustProxy(raw: string): boolean | number | string {
  if (raw === 'true') return true;
  if (raw === 'false' || raw === '') return false;
  const asNumber = Number(raw);
  return Number.isInteger(asNumber) ? asNumber : raw;
}

function parseEnv() {
  // Treat empty strings (e.g. `COOKIE_DOMAIN=`) the same as "not set".
  const source = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined && value !== ''));
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example for the expected variables.`);
  }
  const data = result.data;
  return {
    ...data,
    // `./uploads` means "next to the .env file", so the API and the seed script share one folder wherever they are started from.
    STORAGE_LOCAL_DIR: path.resolve(envDir, data.STORAGE_LOCAL_DIR),
    TRUST_PROXY: parseTrustProxy(data.TRUST_PROXY),
    isProduction: data.NODE_ENV === 'production',
    isTest: data.NODE_ENV === 'test',
    isDevelopment: data.NODE_ENV === 'development',
    /** Public URL of the web app, used in certificate QR codes and e-mail style links. */
    PUBLIC_WEB_URL: (data.FRONTEND_URL[0] ?? 'http://localhost:5173').replace(/\/+$/, ''),
  };
}

export const env = parseEnv();
export type Env = typeof env;
