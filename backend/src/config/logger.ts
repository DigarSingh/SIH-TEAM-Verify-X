import pino from 'pino';
import { env } from './env';

/**
 * Structured JSON logger. Secrets and credentials are redacted centrally so no
 * call site can leak them by accident. Pretty printing is enabled in development only.
 */
export const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'capacity-connect-api' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
  transport: env.isDevelopment
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' } }
    : undefined,
});
