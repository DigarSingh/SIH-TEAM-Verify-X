import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { csrfGuard } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { apiRouter } from './routes';

const stripSlash = (origin: string) => origin.replace(/\/+$/, '');

/** Browser origins allowed to call the API with credentials. */
export function allowedOrigins(): string[] {
  const configured = env.FRONTEND_URL.map(stripSlash);
  if (configured.length > 0) return configured;
  return env.isProduction ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

/** API responses contain private, per-user data: never let a browser or proxy cache them. */
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/**
 * Builds the Express application (no listening socket), so integration tests can
 * drive it in-process with Supertest and `server.ts` can bind it to a port.
 */
export function createApp(): Express {
  const app = express();
  const origins = new Set(allowedOrigins());

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId,
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );
  app.use(
    helmet({
      // The API only returns JSON / files, so the strictest CSP is appropriate.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      // Thumbnails and downloads are loaded cross-origin by the separately hosted web app.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: env.isProduction ? undefined : false,
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (curl, server-to-server, same-origin GETs) are not CORS requests.
        callback(null, !origin || origins.has(stripSlash(origin)));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use('/api', noStore, apiLimiter, csrfGuard, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
