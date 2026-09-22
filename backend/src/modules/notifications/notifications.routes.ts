import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { ok, paginated, paginationSchema, queryBool, skipTake, uuidParam } from '../../lib/http';
import { prisma, type Prisma } from '../../lib/prisma';
import { authenticate, currentUser } from '../../middleware/authenticate';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

const typeEnum = z.enum([
  'COURSE_RECOMMENDATION',
  'COURSE_ENROLLMENT',
  'ASSESSMENT_DEADLINE',
  'ASSESSMENT_RESULT',
  'CERTIFICATE_ISSUED',
  'TRAINING_REMINDER',
  'ANNOUNCEMENT',
  'COMPETENCY_UPDATE',
  'EVALUATION_RECEIVED',
  'ACHIEVEMENT',
  'ACCOUNT',
]);

/** GET /api/notifications - my notifications, newest first. `?unread=true`, `?type=`. */
notificationsRouter.get('/', async (req, res) => {
  const { id } = currentUser(req);
  const query = paginationSchema.extend({ unread: queryBool, type: typeEnum.optional() }).parse(req.query);
  const where: Prisma.NotificationWhereInput = { userId: id, ...(query.unread ? { isRead: false } : {}), ...(query.type ? { type: query.type } : {}) };
  const [total, items, unreadCount] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(query) }),
    prisma.notification.count({ where: { userId: id, isRead: false } }),
  ]);
  paginated(
    res,
    items.map(({ dedupeKey: _dedupeKey, ...notification }) => notification),
    query.page,
    query.pageSize,
    total,
    { unreadCount },
  );
});

/** GET /api/notifications/unread-count */
notificationsRouter.get('/unread-count', async (req, res) => {
  ok(res, { unreadCount: await prisma.notification.count({ where: { userId: currentUser(req).id, isRead: false } }) });
});

/** PATCH /api/notifications/read-all - mark everything as read. */
notificationsRouter.patch('/read-all', async (req, res) => {
  const result = await prisma.notification.updateMany({ where: { userId: currentUser(req).id, isRead: false }, data: { isRead: true, readAt: new Date() } });
  ok(res, { updated: result.count });
});

/** PATCH /api/notifications/:id/read */
notificationsRouter.patch('/:id/read', async (req, res) => {
  const id = uuidParam(req, 'id');
  const { id: userId } = currentUser(req);
  const updated = await prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true, readAt: new Date() } });
  if (updated.count === 0) throw notFound('NOTIFICATION_NOT_FOUND', 'Notification not found');
  ok(res, await prisma.notification.findUnique({ where: { id } }));
});

/** DELETE /api/notifications/:id - dismiss. */
notificationsRouter.delete('/:id', async (req, res) => {
  const removed = await prisma.notification.deleteMany({ where: { id: uuidParam(req, 'id'), userId: currentUser(req).id } });
  if (removed.count === 0) throw notFound('NOTIFICATION_NOT_FOUND', 'Notification not found');
  ok(res, { deleted: true });
});
