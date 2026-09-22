import { logger } from '../config/logger';
import { prisma } from '../lib/prisma';
import { runReminders } from '../modules/reminders/reminders.service';

const SIX_HOURS = 6 * 60 * 60 * 1000;
/** Arbitrary constant identifying the reminder job in PostgreSQL advisory locks. */
const LOCK_KEY = 7_270_001;

/**
 * Runs `job` only if no other API instance is running it right now. A transaction
 * holds a PostgreSQL advisory lock for the duration of the job; the lock is
 * released automatically on commit or if the instance dies.
 */
async function withAdvisoryLock(job: () => Promise<void>): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
      if (!locked) return false;
      await job();
      return true;
    },
    { timeout: 10 * 60 * 1000, maxWait: 5_000 },
  );
}

/** Starts the in-process scheduler (enabled with ENABLE_SCHEDULER=true). Returns a stop function. */
export function startScheduler(): () => void {
  const tick = async () => {
    try {
      const ran = await withAdvisoryLock(async () => {
        await runReminders();
      });
      if (!ran) logger.debug('Reminder job skipped: another instance holds the lock');
    } catch (error) {
      logger.error({ err: error }, 'Scheduled reminder job failed');
    }
  };
  const first = setTimeout(() => void tick(), 60_000);
  const timer = setInterval(() => void tick(), SIX_HOURS);
  first.unref();
  timer.unref();
  logger.info('Reminder scheduler started (every 6 hours)');
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
