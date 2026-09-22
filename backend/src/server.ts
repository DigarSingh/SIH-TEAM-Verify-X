import type { Server } from 'node:http';
import express, { type Express } from 'express';

/**
 * This file is the process started by `npm run dev` and `npm start` locally
 * and in Docker, and it is also the entrypoint Vercel is configured to invoke
 * (see vercel.json -> services.backend.entrypoint). Those are different
 * runtimes with one thing in common that matters here: if anything in the
 * real application's import chain throws while loading - most commonly
 * env.ts's startup validation rejecting a missing or invalid production
 * environment variable, or lib/prisma.ts failing to construct a client -
 * Vercel reports only an opaque "FUNCTION_INVOCATION_FAILED", with no
 * indication of what actually went wrong. That invisibility is itself the
 * problem: a real, fixable configuration error looks identical to a platform
 * outage.
 *
 * To make that failure inspectable instead of invisible, the real
 * application is loaded through a *dynamic* import inside a try/catch,
 * never a static one at the top of this file. A static `import { createApp }
 * from './app'` that throws would crash this entire file before any of the
 * code below could run - which is exactly the failure mode this exists to
 * avoid. `express` itself is imported normally: it is a stable, always-
 * available third-party dependency, not part of what can legitimately fail
 * to load here.
 *
 * On success, behaviour is unchanged from before: build the real app,
 * listen, start the scheduler if enabled, wire up graceful shutdown. On
 * failure, a minimal fallback app still binds a port (so this looks like a
 * normal running process to Vercel, Docker or a plain `npm start` either
 * way) and answers every request - including /api/health - with a safe
 * 503, so a monitor or a person hitting the API sees a clear signal instead
 * of nothing. The real error is written to the server's own logs only
 * (never to the HTTP response), so this can never leak a secret.
 */
async function start(): Promise<void> {
  let app: Express;
  let ready = true;

  try {
    const { createApp } = await import('./app');
    app = createApp();
  } catch (error) {
    ready = false;
    // Deliberately console.error, not the project's own logger: the logger's
    // configuration could be part of what just failed to load.
    console.error('[server] The application failed to start. Full error follows (server-side log only):');
    console.error(error);

    app = express();
    app.disable('x-powered-by');
    const startupFailed = (_req: express.Request, res: express.Response) => {
      res.status(503).json({
        success: false,
        code: 'STARTUP_FAILED',
        message: 'The API failed to start. Check this deployment’s function/server logs for the underlying error.',
      });
    };
    app.get('/api/health', startupFailed);
    app.use(startupFailed);
  }

  const port = Number(process.env['PORT']) || 4000;
  const server: Server = app.listen(port, () => {
    console.log(`[server] Capacity Connect API listening on port ${port}${ready ? '' : ' - DEGRADED, see the error logged above'}`);
  });

  if (!ready) return; // Nothing below applies to a fallback that isn't really serving the application.

  // Reaching here proves env.ts, lib/prisma.ts and every route module already
  // loaded without error inside the try block above, so importing them again
  // (Node/ESM caches modules - this does not re-run them) is safe.
  const { env } = await import('./config/env');
  const { logger } = await import('./config/logger');
  const { prisma } = await import('./lib/prisma');
  const { startScheduler } = await import('./services/scheduler');

  logger.info({ port, env: env.NODE_ENV }, 'Capacity Connect API listening');

  const stopScheduler = env.ENABLE_SCHEDULER ? startScheduler() : undefined;

  let shuttingDown = false;

  /** Stops accepting connections, lets in-flight requests finish, then closes the database pool. */
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    stopScheduler?.();

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async () => {
      try {
        await prisma.$disconnect();
      } finally {
        process.exit(0);
      }
    });
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });
}

void start();
