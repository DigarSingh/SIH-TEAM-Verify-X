import { Router } from 'express';
import { ok } from '../../lib/http';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { trainerDashboard, traineeDashboard } from './dashboard.service';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

/** GET /api/dashboard/trainee - competency, gaps, recommendations, progress, assessments, certificates, activity. */
dashboardRouter.get('/trainee', requireRole('TRAINEE'), async (req, res) => {
  ok(res, await traineeDashboard(currentUser(req)));
});

/** GET /api/dashboard/trainer - courses, trainees, completion, scores, competency improvement. */
dashboardRouter.get('/trainer', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, await trainerDashboard(currentUser(req)));
});
