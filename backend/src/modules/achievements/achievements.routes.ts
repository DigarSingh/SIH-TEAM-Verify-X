import { Router } from 'express';
import { ok } from '../../lib/http';
import { authenticate, currentUser } from '../../middleware/authenticate';
import { checkAchievements, listAchievements } from './achievements.service';

export const achievementsRouter = Router();
achievementsRouter.use(authenticate);

/** GET /api/achievements/me - badge catalogue with what the signed-in user has earned. */
achievementsRouter.get('/me', async (req, res) => {
  const { id } = currentUser(req);
  // Re-evaluating on read keeps badges correct even for events recorded outside the API (e.g. imports).
  await checkAchievements(id);
  ok(res, await listAchievements(id));
});
