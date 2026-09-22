import { generateKeyPairSync } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { resolveTestDatabaseUrl } from './test-env';

// Runs before every test file (and before any application module is imported):
// pins a deterministic, isolated configuration for the API under test.
const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: resolveTestDatabaseUrl(),
  JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
  ACCESS_TOKEN_TTL_MINUTES: '15',
  REFRESH_TOKEN_TTL_DAYS: '7',
  COOKIE_SECURE: 'false',
  COOKIE_SAMESITE: 'lax',
  REGISTRATION_REQUIRES_APPROVAL: 'true',
  MAX_FAILED_LOGINS: '5',
  LOCKOUT_MINUTES: '15',
  // Cheap hashing keeps the suite fast; production uses the defaults from .env.example.
  ARGON2_MEMORY_KIB: '1024',
  ARGON2_TIME_COST: '1',
  RATE_LIMIT_MAX: '1000000',
  AUTH_RATE_LIMIT_MAX: '1000000',
  FRONTEND_URL: 'http://localhost:5173',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: path.join(os.tmpdir(), 'capacity-connect-test-uploads'),
  ENABLE_SCHEDULER: 'false',
  // The AI settings are pinned so that a developer's real key in .env can never reach a test.
  AI_PROVIDER: 'openai',
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: '',
  ANTHROPIC_API_KEY: '',
  AI_MODEL: '',
  AI_RATE_LIMIT_PER_HOUR: '1000',
  ALLOWED_EMAIL_DOMAINS: '',
  // A signing key generated for this run only, so certificate signatures are
  // exercised for real while a developer's own key in .env can never reach a test.
  CERTIFICATE_SIGNING_KEY: generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
Object.assign(process.env, testEnv);
