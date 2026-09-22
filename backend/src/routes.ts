import { Router } from 'express';
import { ok } from './lib/http';
import { prisma } from './lib/prisma';
import { achievementsRouter } from './modules/achievements/achievements.routes';
import { assessmentsRouter } from './modules/assessments/assessments.routes';
import { adminRouter } from './modules/analytics/admin.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { announcementsRouter } from './modules/announcements/announcements.routes';
import { authRouter } from './modules/auth/auth.routes';
import { certificatesRouter } from './modules/certificates/certificates.routes';
import { competenciesRouter } from './modules/competencies/competencies.routes';
import { skillGapsRouter } from './modules/competencies/skill-gaps.routes';
import { successionRouter } from './modules/competencies/succession.routes';
import { arRouter } from './modules/ar/ar.routes';
import { readinessRouter } from './modules/readiness/readiness.routes';
import { coursesRouter } from './modules/courses/courses.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { departmentsRouter } from './modules/departments/departments.routes';
import { enrollmentsRouter } from './modules/enrollments/enrollments.routes';
import { evaluationsRouter } from './modules/evaluations/evaluations.routes';
import { metaRouter } from './modules/meta/meta.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { recommendationsRouter } from './modules/recommendations/recommendations.routes';
import { rolesRouter } from './modules/roles/roles.routes';
import { searchRouter } from './modules/search/search.routes';
import { usersRouter } from './modules/users/users.routes';

export const apiRouter = Router();

/** Liveness + database readiness probe (used by load balancers and container orchestrators). */
apiRouter.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  ok(res, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

apiRouter.use('/meta', metaRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/departments', departmentsRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/competencies', competenciesRouter);
apiRouter.use('/skill-gaps', skillGapsRouter);
apiRouter.use('/succession', successionRouter);
apiRouter.use('/readiness', readinessRouter);
apiRouter.use('/ar', arRouter);
apiRouter.use('/recommendations', recommendationsRouter);
apiRouter.use('/courses', coursesRouter);
apiRouter.use('/enrollments', enrollmentsRouter);
apiRouter.use('/assessments', assessmentsRouter);
apiRouter.use('/certificates', certificatesRouter);
apiRouter.use('/evaluations', evaluationsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/achievements', achievementsRouter);
apiRouter.use('/announcements', announcementsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/ai', aiRouter);
