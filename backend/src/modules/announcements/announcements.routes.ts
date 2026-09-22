import { Router } from 'express';
import { ok } from '../../lib/http';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { prisma } from '../../lib/prisma';
import { listActiveAnnouncements } from './announcements.service';

export const announcementsRouter = Router();
announcementsRouter.use(authenticate);

/** GET /api/announcements - announcements addressed to the signed-in user. */
announcementsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { departmentId: true } });
  ok(res, await listActiveAnnouncements(user, profile?.departmentId ?? null));
});
