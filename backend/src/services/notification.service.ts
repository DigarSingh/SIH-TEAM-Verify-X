import type { NotificationType, Prisma } from '@prisma/client';
import { prisma, type Db } from '../lib/prisma';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  /** In-app route, e.g. `/trainee/courses/<id>`. */
  link?: string;
  /** Idempotency key: the same (user, key) pair is never notified twice. */
  dedupeKey?: string;
  metadata?: Prisma.InputJsonValue;
}

/** Creates one notification per user. Returns how many were actually created (duplicates are skipped). */
export async function notifyUsers(userIds: string[], input: NotificationInput, db: Db = prisma): Promise<number> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return 0;
  const result = await db.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      dedupeKey: input.dedupeKey ?? null,
      metadata: input.metadata,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export const notifyUser = (userId: string, input: NotificationInput, db: Db = prisma): Promise<number> => notifyUsers([userId], input, db);

/** Notifies every active administrator (e.g. a new registration awaiting approval). */
export async function notifyAdmins(input: NotificationInput, db: Db = prisma): Promise<number> {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null }, select: { id: true } });
  return notifyUsers(
    admins.map((admin) => admin.id),
    input,
    db,
  );
}
