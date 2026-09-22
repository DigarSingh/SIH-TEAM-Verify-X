import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createAdmin, createCompetency, createDepartment, createJobRole, createTrainer, createUser, TEST_PASSWORD } from '../helpers/factories';
import { anonymous, loginAs, type Agent } from '../helpers/http';
import { buildCourse, takeAssessment } from '../helpers/scenario';

/**
 * Organisation analytics on a small workforce with known numbers, so every
 * figure can be verified by hand against the formulas in the brief.
 *
 *  Forecasting dept, role "Severe Weather Forecaster" (criticality 4):
 *      Radar (required 80, importance 4)      Forecasting (required 85, importance 5)
 *      u1: Radar 35, Forecasting 82            u2: Radar 70, Forecasting 90
 *  Radar Ops dept, role "Radar Operator" (criticality 5):
 *      Radar (required 90, importance 5)
 *      u3: Radar 60
 */
describe('admin analytics and organisation management', () => {
  let admin: Agent;
  let trainer: Agent;
  let ids: { radar: string; forecasting: string; deptFc: string; deptRd: string; roleSwf: string; roleOp: string; u1: string; u2: string; u3: string };

  const setLevel = async (userId: string, competencyId: string, level: number, daysAgo = 200) => {
    const at = new Date(Date.now() - daysAgo * 86_400_000);
    await prisma.employeeCompetency.create({ data: { userId, competencyId, currentLevel: level } });
    await prisma.competencyHistory.create({ data: { userId, competencyId, previousLevel: 0, newLevel: level, source: 'BASELINE', createdAt: at } });
  };

  beforeAll(async () => {
    await resetDatabase();
    const adminUser = await createAdmin({ email: 'admin@imd.gov.in' });
    const trainerUser = await createTrainer({ email: 'trainer@imd.gov.in', name: 'Dr. Arjun Mehta' });
    const deptFc = await createDepartment({ name: 'Forecasting', code: 'FC' });
    const deptRd = await createDepartment({ name: 'Radar Operations', code: 'RD' });
    const radar = await createCompetency({ name: 'Radar Meteorology', code: 'RADAR', category: 'Core Operations' });
    const forecasting = await createCompetency({ name: 'Weather Forecasting', code: 'FORECAST', category: 'Core Operations' });
    const roleSwf = await createJobRole({ name: 'Severe Weather Forecaster', code: 'SWF', criticality: 4 });
    const roleOp = await createJobRole({ name: 'Radar Operator', code: 'OPR', criticality: 5 });
    await prisma.roleCompetency.createMany({
      data: [
        { roleId: roleSwf.id, competencyId: radar.id, requiredLevel: 80, importance: 4 },
        { roleId: roleSwf.id, competencyId: forecasting.id, requiredLevel: 85, importance: 5 },
        { roleId: roleOp.id, competencyId: radar.id, requiredLevel: 90, importance: 5 },
      ],
    });
    const u1 = await createUser({ email: 'u1@imd.gov.in', name: 'Asha One', departmentId: deptFc.id, jobRoleId: roleSwf.id });
    const u2 = await createUser({ email: 'u2@imd.gov.in', name: 'Bala Two', departmentId: deptFc.id, jobRoleId: roleSwf.id });
    const u3 = await createUser({ email: 'u3@imd.gov.in', name: 'Chitra Three', departmentId: deptRd.id, jobRoleId: roleOp.id });
    await setLevel(u1.id, radar.id, 35);
    await setLevel(u1.id, forecasting.id, 82);
    await setLevel(u2.id, radar.id, 70);
    await setLevel(u2.id, forecasting.id, 90);
    await setLevel(u3.id, radar.id, 60);
    ids = { radar: radar.id, forecasting: forecasting.id, deptFc: deptFc.id, deptRd: deptRd.id, roleSwf: roleSwf.id, roleOp: roleOp.id, u1: u1.id, u2: u2.id, u3: u3.id };
    admin = await loginAs(adminUser.email);
    trainer = await loginAs(trainerUser.email);
  });

  describe('competency heatmap', () => {
    it('shows average level, requirement, gap and affected employees per department × competency', async () => {
      const { data } = (await admin.get('/api/admin/heatmap').expect(200)).body;
      expect(data.columns.map((c: { name: string }) => c.name)).toEqual(['Radar Meteorology', 'Weather Forecasting']);
      const fc = data.rows.find((r: { name: string }) => r.name === 'Forecasting');
      const rd = data.rows.find((r: { name: string }) => r.name === 'Radar Operations');

      expect(fc.cells[0]).toMatchObject({ employees: 2, average: 52.5, required: 80, averageGap: 27.5, severity: 'HIGH', affected: 2, highPriority: 1 });
      expect(fc.cells[1]).toMatchObject({ employees: 2, average: 86, required: 85, averageGap: 1.5, severity: 'LOW', affected: 1 });
      expect(rd.cells[0]).toMatchObject({ employees: 1, average: 60, required: 90, averageGap: 30, severity: 'HIGH', affected: 1 });
      expect(rd.cells[1]).toMatchObject({ employees: 0, average: null }); // not required by any Radar Ops role
      expect(data.overall.cells[0]).toMatchObject({ employees: 3, average: 55, required: 83.3, affected: 3 });
    });

    it('can be grouped by job role and filtered by department, role or competency', async () => {
      const byRole = (await admin.get('/api/admin/heatmap?groupBy=role').expect(200)).body.data;
      expect(byRole.rows.map((r: { name: string }) => r.name)).toEqual(['Radar Operator', 'Severe Weather Forecaster']);

      const dept = (await admin.get(`/api/admin/heatmap?departmentId=${ids.deptFc}`).expect(200)).body.data;
      expect(dept.rows).toHaveLength(1);
      expect(dept.overall.employees).toBe(2);

      const single = (await admin.get(`/api/admin/heatmap?competencyId=${ids.forecasting}`).expect(200)).body.data;
      expect(single.columns).toHaveLength(1);
      const role = (await admin.get(`/api/admin/heatmap?jobRoleId=${ids.roleOp}`).expect(200)).body.data;
      expect(role.overall.employees).toBe(1);
    });

    it('leaves every number alone on the competency layer, which knows nothing about decay', async () => {
      const { data } = (await admin.get('/api/admin/heatmap').expect(200)).body;
      expect(data.layer).toBe('competency');
      expect(data.measuredAt).toBeNull();
      expect(data.overall.cells[0].decay).toBeUndefined();
    });

    /**
     * The freshness layer answers a different question: not "who was never
     * trained to the level" but "what has faded". It decays each level to the
     * measured date first, so the averages drop and a refresher count appears.
     */
    it('reports what decay has cost on the freshness layer, and drops further at a simulated future date', async () => {
      // Give one person a practice date far enough back for a configured policy to bite.
      await prisma.competencyDecayPolicy.upsert({
        where: { competencyId: ids.radar },
        create: { competencyId: ids.radar, decayEnabled: true, halfLifeDays: 180, minimumSafeLevel: 30, recertificationIntervalDays: 365, criticality: 5, isSimulation: true },
        update: { decayEnabled: true, halfLifeDays: 180 },
      });
      await prisma.employeeCompetency.updateMany({
        where: { competencyId: ids.radar },
        data: { lastPracticedAt: new Date(Date.now() - 360 * 86_400_000), lastEvidenceAt: new Date(Date.now() - 360 * 86_400_000) },
      });

      const plain = (await admin.get('/api/admin/heatmap').expect(200)).body.data;
      const fresh = (await admin.get('/api/admin/heatmap?layer=freshness').expect(200)).body.data;

      expect(fresh.layer).toBe('freshness');
      expect(fresh.measuredAt).toEqual(expect.any(String));
      const plainRadar = plain.overall.cells[0];
      const freshRadar = fresh.overall.cells[0];
      expect(freshRadar.average).toBeLessThan(plainRadar.average); // a year without practice costs something
      expect(freshRadar.decay.averageDecay).toBeGreaterThan(0);
      expect(freshRadar.decay.needingRefresher).toBeGreaterThan(0);
      expect(Object.values(freshRadar.decay.byStatus).reduce((sum: number, count) => sum + (count as number), 0)).toBe(freshRadar.employees);

      // Travelling forward decays it further, and still writes nothing.
      const later = (await admin.get('/api/admin/heatmap?layer=freshness&offsetDays=365').expect(200)).body.data;
      expect(later.overall.cells[0].average).toBeLessThan(freshRadar.average);
      const stored = await prisma.employeeCompetency.findFirst({ where: { competencyId: ids.radar, userId: ids.u1 } });
      expect(stored?.currentLevel).toBe(35); // the stored baseline is untouched

      await prisma.competencyDecayPolicy.deleteMany({ where: { competencyId: ids.radar } });
      await prisma.employeeCompetency.updateMany({ where: { competencyId: ids.radar }, data: { lastPracticedAt: null } });
    });

    it('reports the change over the selected time period from the competency history', async () => {
      await prisma.competencyHistory.create({ data: { userId: ids.u1, competencyId: ids.radar, previousLevel: 30, newLevel: 35, source: 'ASSESSMENT', createdAt: new Date(Date.now() - 20 * 86_400_000) } });
      // (The stored level stays 35; the history says it was 30 more than 90 days ago.)
      const cell = (await admin.get('/api/admin/heatmap?period=90d').expect(200)).body.data.rows.find((r: { name: string }) => r.name === 'Forecasting').cells[0];
      expect(cell.change).toBeTypeOf('number');
      await prisma.competencyHistory.deleteMany({ where: { userId: ids.u1, source: 'ASSESSMENT' } });
      expect((await admin.get('/api/admin/heatmap?period=7d')).status).toBe(400);
    });

    it('lets the admin click a cell to see the affected employees, worst first', async () => {
      const response = await admin.get(`/api/admin/heatmap/cell?competencyId=${ids.radar}&groupBy=department&groupId=${ids.deptFc}`).expect(200);
      expect(response.body.meta.competency.name).toBe('Radar Meteorology');
      expect(response.body.meta.summary).toMatchObject({ employees: 2, affected: 2, averageCurrent: 52.5, averageRequired: 80 });
      expect(response.body.data.map((e: { name: string }) => e.name)).toEqual(['Asha One', 'Bala Two']);
      expect(response.body.data[0]).toMatchObject({ currentLevel: 35, requiredLevel: 80, gap: 45, severity: 'HIGH', priorityScore: 28.8, priorityLevel: 'HIGH', jobRole: 'Severe Weather Forecaster' });
      expect(response.body.data[1]).toMatchObject({ gap: 10, severity: 'LOW', priorityScore: 6.4, priorityLevel: 'LOW' });

      const everyone = (await admin.get(`/api/admin/heatmap/cell?competencyId=${ids.radar}&groupBy=department&groupId=all`).expect(200)).body;
      expect(everyone.meta.total).toBe(3);
      const bad = await admin.get('/api/admin/heatmap/cell');
      expect(bad.status).toBe(400);
    });
  });

  describe('training needs and skill gaps', () => {
    it('ranks competencies by total training demand with affected employees, priority and courses', async () => {
      const { data } = (await admin.get('/api/admin/training-needs').expect(200)).body;
      expect(data.summary).toMatchObject({ employees: 3, employeesNeedingTraining: 2, competenciesWithGaps: 2 });
      const [radar, forecasting] = data.needs;
      expect(radar).toMatchObject({
        name: 'Radar Meteorology',
        employeesRequired: 3,
        employeesAffected: 3,
        affectedShare: 100,
        averageGap: 28.3,
        severity: 'HIGH',
        priorityScore: 21.7, // mean of 28.8, 6.4 and 30
        priorityLevel: 'MEDIUM',
        demandScore: 65.2,
        recommendedCourses: 0,
        needsCourseDevelopment: true,
        unserved: 3,
      });
      expect(forecasting).toMatchObject({ name: 'Weather Forecasting', employeesAffected: 1, averageGap: 3, priorityScore: 2.4, priorityLevel: 'LOW' });
      expect(data.summary.competenciesWithoutCourses).toBe(2);
    });

    it('counts recommended courses and learners already in training once courses exist', async () => {
      const course = await buildCourse(trainer, { title: 'Radar Fundamentals', competencyId: ids.radar, levelFrom: 0, levelTo: 75, questions: 4 });
      const learner = await loginAs('u1@imd.gov.in');
      await learner.post(`/api/courses/${course.courseId}/enroll`).expect(201);
      const { data } = (await admin.get('/api/admin/training-needs').expect(200)).body;
      const radar = data.needs.find((n: { name: string }) => n.name === 'Radar Meteorology');
      expect(radar).toMatchObject({ recommendedCourses: 1, needsCourseDevelopment: false, inTraining: 1, unserved: 2 });
      expect(radar.courses[0]).toMatchObject({ title: 'Radar Fundamentals', levelFrom: 0, levelTo: 75, enrolled: 1 });

      const detail = (await admin.get(`/api/admin/training-needs/${ids.radar}`).expect(200)).body.data;
      expect(detail.departments.map((d: { name: string; affected: number }) => [d.name, d.affected])).toEqual([['Forecasting', 2], ['Radar Operations', 1]]);
      expect(detail.employees[0]).toMatchObject({ name: 'Chitra Three', priorityScore: 30 });
      expect(detail.courses[0]).toMatchObject({ enrolled: 1, affectedEnrolled: 1 });
    });

    it('summarises the severity distribution and gaps by department, role and competency', async () => {
      const { data } = (await admin.get('/api/admin/skill-gaps').expect(200)).body;
      expect(Object.fromEntries(data.severityDistribution.map((d: { severity: string; count: number }) => [d.severity, d.count]))).toEqual({ MET: 1, LOW: 2, MODERATE: 0, HIGH: 2, CRITICAL: 0 });
      expect(data).toMatchObject({ employees: 3, requirements: 5, needingTraining: 2 });
      expect(data.byDepartment.map((d: { name: string }) => d.name)).toEqual(['Radar Operations', 'Forecasting']); // largest average gap first
      expect(data.byCompetency).toHaveLength(2);
    });

    it('recomputes when an admin changes the configurable thresholds (and audits it)', async () => {
      const current = (await admin.get('/api/competencies/engine/config').expect(200)).body.data;
      expect(current.customised).toBe(false);
      const changed = { ...current.config, severity: { lowMax: 5, moderateMax: 15, highMax: 30 }, priority: { mediumMin: 5, highMin: 10, criticalMin: 20 } };
      const saved = await admin.put('/api/competencies/engine/config').send(changed).expect(200);
      expect(saved.body.data.customised).toBe(true);

      const { data } = (await admin.get('/api/admin/skill-gaps').expect(200)).body;
      const counts = Object.fromEntries(data.severityDistribution.map((d: { severity: string; count: number }) => [d.severity, d.count]));
      expect(counts).toMatchObject({ MET: 1, LOW: 1, MODERATE: 1, HIGH: 1, CRITICAL: 1 }); // gaps 3, 10, 30, 45
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'ENGINE_CONFIG_UPDATED' } });
      expect(audit.metadata).toMatchObject({ after: { severity: { lowMax: 5 } }, before: { severity: { lowMax: 10 } } });

      const gap = (await loginAs('u1@imd.gov.in').then((a) => a.get('/api/skill-gaps/me'))).body.data.gaps.find((g: { competencyName: string }) => g.competencyName === 'Radar Meteorology');
      expect(gap).toMatchObject({ severity: 'CRITICAL', priorityLevel: 'CRITICAL' }); // 45 > 30, score 28.8 >= 20

      const reset = await admin.post('/api/competencies/engine/config/reset').expect(200);
      expect(reset.body.data.config.severity).toEqual({ lowMax: 10, moderateMax: 25, highMax: 50 });
      // Restoring the defaults removes the override: the configuration is no longer "customised".
      expect(reset.body.data).toMatchObject({ customised: false, updatedAt: null });
      expect((await admin.get('/api/competencies/engine/config').expect(200)).body.data.customised).toBe(false);

      // Saving values identical to the defaults is not a customisation either.
      const same = await admin.put('/api/competencies/engine/config').send(reset.body.data.config).expect(200);
      expect(same.body.data.customised).toBe(false);
    });

    it('rejects an invalid configuration and simulates the update formula without touching data', async () => {
      const current = (await admin.get('/api/competencies/engine/config').expect(200)).body.data.config;
      const bad = await admin.put('/api/competencies/engine/config').send({ ...current, severity: { lowMax: 30, moderateMax: 20, highMax: 50 } });
      expect(bad.status).toBe(400);
      const badWeights = await admin.put('/api/competencies/engine/config').send({ ...current, evaluationWeights: { ...current.evaluationWeights, technicalKnowledge: 0.9 } });
      expect(badWeights.status).toBe(400);

      const simulation = await admin.post('/api/competencies/engine/simulate').send({ requiredLevel: 80, currentLevel: 35, importance: 4, roleCriticality: 4, assessmentScore: 84 }).expect(200);
      expect(simulation.body.data.before).toMatchObject({ gap: 45, severity: 'HIGH', priorityScore: 28.8 });
      expect(simulation.body.data.update).toMatchObject({ newLevel: 72, blended: 71.75 });
      expect(simulation.body.data.after).toMatchObject({ gap: 8, severity: 'LOW' });
      expect((await prisma.employeeCompetency.findUniqueOrThrow({ where: { userId_competencyId: { userId: ids.u1, competencyId: ids.radar } } })).currentLevel).toBe(35);
    });
  });

  describe('dashboard metrics', () => {
    it('reports organisation totals, readiness and monthly trends from the database', async () => {
      const learner = await loginAs('u2@imd.gov.in');
      const course = await buildCourse(trainer, { title: 'Analytics course', competencyId: ids.radar, levelFrom: 0, levelTo: 80, questions: 4 });
      const result = await takeAssessment(learner, course);
      expect(result.body.data.attempt.passed).toBe(true);

      const { data } = (await admin.get('/api/admin/analytics?months=6').expect(200)).body;
      expect(data.metrics).toMatchObject({
        totalEmployees: 5, // admin, trainer, u1, u2, u3
        trainees: 3,
        trainers: 1,
        pendingApprovals: 0,
        courses: 2,
        certificatesIssued: 1,
        averageAssessmentScore: 100,
        assessmentPassRate: 100,
        employeesWithRole: 3,
      });
      expect(data.metrics.enrollments).toBe(2);
      expect(data.metrics.completionRate).toBe(50); // 1 of 2 enrollments finished
      expect(data.metrics.employeesRequiringTraining).toBe(2);
      expect(data.metrics.averageCompetency).toBeGreaterThan(50);
      expect(data.metrics.workforceReadiness).toBeGreaterThan(60);

      const thisMonth = data.trends.months.at(-1);
      expect(data.trends.months).toHaveLength(6);
      expect(data.trends.enrollments.find((p: { month: string }) => p.month === thisMonth).value).toBe(2);
      expect(data.trends.certifications.at(-1).value).toBe(1);
      expect(data.trends.assessmentPerformance.at(-1)).toMatchObject({ averageScore: 100, passRate: 100, attempts: 1 });
      expect(data.trends.competency.at(-1).averageCompetency).toBeGreaterThan(0);
      expect(data.enrollmentStatus.find((s: { status: string }) => s.status === 'CERTIFIED').count).toBe(1);
      expect(data.departmentComparison[0]).toHaveProperty('readiness');
      expect(data.topCourses[0]).toHaveProperty('completionRate');
    });
  });

  describe('user management', () => {
    it('supports the registration → approval workflow, with notifications and audit', async () => {
      const register = await anonymous().post('/api/auth/register').send({ name: 'New Joiner', email: 'joiner@imd.gov.in', password: 'Sup3r!Secret#Pass' }).expect(201);
      const id = register.body.data.user.id;

      const before = (await admin.get('/api/users?status=PENDING').expect(200)).body;
      expect(before.data.map((u: { email: string }) => u.email)).toEqual(['joiner@imd.gov.in']);
      expect(before.meta.statusCounts).toMatchObject({ PENDING: 1 });
      expect((await anonymous().post('/api/auth/login').send({ email: 'joiner@imd.gov.in', password: 'Sup3r!Secret#Pass' })).body.code).toBe('ACCOUNT_PENDING');

      const approved = await admin.post(`/api/users/${id}/approve`).send({ departmentId: ids.deptFc, jobRoleId: ids.roleSwf }).expect(200);
      expect(approved.body.data).toMatchObject({ status: 'ACTIVE', department: { name: 'Forecasting' }, jobRole: { name: 'Severe Weather Forecaster' } });
      expect((await admin.post(`/api/users/${id}/approve`).send({})).body.code).toBe('NOT_PENDING');
      const session = await loginAs('joiner@imd.gov.in', 'Sup3r!Secret#Pass');
      expect((await session.get('/api/notifications').expect(200)).body.data[0].title).toMatch(/approved/i);
      // A new employee with a role but no assessments has every requirement as a gap.
      const gaps = (await session.get('/api/skill-gaps/me').expect(200)).body.data;
      expect(gaps.gaps.every((g: { assessed: boolean; currentLevel: number }) => !g.assessed && g.currentLevel === 0)).toBe(true);
      expect(await prisma.auditLog.count({ where: { entityId: id, action: { in: ['USER_REGISTERED', 'USER_APPROVED'] } } })).toBe(2);
    });

    it('rejects a registration with a reason and the applicant can never sign in', async () => {
      const register = await anonymous().post('/api/auth/register').send({ name: 'Rejected Person', email: 'reject@imd.gov.in', password: 'Sup3r!Secret#Pass' }).expect(201);
      expect((await admin.post(`/api/users/${register.body.data.user.id}/reject`).send({})).status).toBe(400);
      await admin.post(`/api/users/${register.body.data.user.id}/reject`).send({ reason: 'Not an IMD employee' }).expect(200);
      expect((await anonymous().post('/api/auth/login').send({ email: 'reject@imd.gov.in', password: 'Sup3r!Secret#Pass' })).body.code).toBe('ACCOUNT_REJECTED');
    });

    it('creates accounts with a temporary password that must be changed at first sign-in', async () => {
      const created = await admin.post('/api/users').send({ name: 'Created By Admin', email: 'created@imd.gov.in', role: 'TRAINER', departmentId: ids.deptFc }).expect(201);
      const temporary = created.body.data.temporaryPassword as string;
      expect(temporary).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{14}$/);
      expect(created.body.data.user).toMatchObject({ role: 'TRAINER', status: 'ACTIVE', mustChangePassword: true });
      const session = await loginAs('created@imd.gov.in', temporary);
      expect((await session.get('/api/notifications')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await session.post('/api/auth/change-password').send({ currentPassword: temporary, newPassword: 'B3tter!Password#9' }).expect(200);
      expect((await session.get('/api/notifications')).status).toBe(200);
      expect((await admin.post('/api/users').send({ name: 'Dup', email: 'CREATED@imd.gov.in' })).body.code).toBe('EMAIL_TAKEN');
    });

    it('changes roles and suspends users with the safety rules (no self-change, never the last admin)', async () => {
      const target = await createUser({ email: 'promote@imd.gov.in' });
      const promoted = await admin.patch(`/api/users/${target.id}/role`).send({ role: 'TRAINER' }).expect(200);
      expect(promoted.body.data.role).toBe('TRAINER');
      expect((await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_ROLE_CHANGED', entityId: target.id } })).metadata).toEqual({ from: 'TRAINEE', to: 'TRAINER' });

      const me = await prisma.user.findFirstOrThrow({ where: { email: 'admin@imd.gov.in' } });
      expect((await admin.patch(`/api/users/${me.id}/role`).send({ role: 'TRAINEE' })).body.code).toBe('CANNOT_CHANGE_OWN_ROLE');
      expect((await admin.patch(`/api/users/${me.id}/status`).send({ status: 'SUSPENDED' })).body.code).toBe('CANNOT_CHANGE_OWN_STATUS');
      expect((await admin.delete(`/api/users/${me.id}`)).body.code).toBe('CANNOT_DELETE_SELF');

      // With a second admin present, that admin cannot demote the first while they are the LAST other admin.
      const second = await createAdmin({ email: 'second.admin@imd.gov.in' });
      const secondSession = await loginAs(second.email);
      await secondSession.patch(`/api/users/${me.id}/role`).send({ role: 'TRAINER' }).expect(200); // now second is the only admin
      const lastAdmin = await admin.patch(`/api/users/${second.id}/role`).send({ role: 'TRAINEE' });
      expect(lastAdmin.status).toBe(403); // the demoted admin no longer has admin rights at all
      await secondSession.patch(`/api/users/${me.id}/role`).send({ role: 'ADMIN' }).expect(200);
      admin = await loginAs('admin@imd.gov.in');
    });

    it('suspending a user signs them out immediately; reactivating restores access', async () => {
      const target = await createUser({ email: 'suspend@imd.gov.in' });
      const session = await loginAs(target.email);
      await admin.patch(`/api/users/${target.id}/status`).send({ status: 'SUSPENDED' }).expect(200);
      expect((await session.get('/api/users/me')).status).toBe(401);
      expect((await anonymous().post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD })).body.code).toBe('ACCOUNT_SUSPENDED');
      await admin.patch(`/api/users/${target.id}/status`).send({ status: 'ACTIVE' }).expect(200);
      expect((await loginAs(target.email)).get('/api/users/me')).toBeTruthy();
    });

    it('resets a password (temporary, single use, all sessions revoked)', async () => {
      const target = await createUser({ email: 'forgot@imd.gov.in' });
      const session = await loginAs(target.email);
      const reset = await admin.post(`/api/users/${target.id}/reset-password`).expect(200);
      expect((await session.get('/api/users/me')).status).toBe(401);
      expect((await anonymous().post('/api/auth/login').send({ email: target.email, password: TEST_PASSWORD })).status).toBe(401);
      const back = await loginAs(target.email, reset.body.data.temporaryPassword);
      expect((await back.get('/api/users/me')).body.data.mustChangePassword).toBe(true);
    });

    it('soft-deletes a user: history stays, the e-mail is freed, access ends', async () => {
      const target = await createUser({ email: 'leaver@imd.gov.in', name: 'Leaver' });
      await createUser({ email: 'other@imd.gov.in' });
      const session = await loginAs(target.email);
      await admin.delete(`/api/users/${target.id}`).expect(200);
      expect((await session.get('/api/users/me')).status).toBe(401);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.email).not.toBe('leaver@imd.gov.in');
      expect((await admin.get('/api/users?q=leaver').expect(200)).body.data).toEqual([]);
      expect((await admin.get(`/api/users/${target.id}`)).status).toBe(404);
      await admin.post('/api/users').send({ name: 'Leaver Again', email: 'leaver@imd.gov.in' }).expect(201); // the address is reusable
    });

    it('searches, filters and sorts the user list with pagination', async () => {
      const page = await admin.get('/api/users?pageSize=2&page=1&sort=name&order=asc').expect(200);
      expect(page.body.meta).toMatchObject({ page: 1, pageSize: 2 });
      expect(page.body.data).toHaveLength(2);
      expect((await admin.get('/api/users?role=TRAINER').expect(200)).body.data.every((u: { role: string }) => u.role === 'TRAINER')).toBe(true);
      expect((await admin.get(`/api/users?departmentId=${ids.deptRd}`).expect(200)).body.data.map((u: { email: string }) => u.email)).toEqual(['u3@imd.gov.in']);
      expect((await admin.get('/api/users?q=ASHA').expect(200)).body.data[0].email).toBe('u1@imd.gov.in');
      expect(JSON.stringify((await admin.get('/api/users').expect(200)).body)).not.toMatch(/passwordHash|argon2/i);
    });

    it('records or corrects a competency baseline with a reason (history + notification)', async () => {
      const set = await admin.put(`/api/users/${ids.u3}/competencies/${ids.forecasting}`).send({ level: 55, reason: 'Initial baseline review' }).expect(200);
      expect(set.body.data).toMatchObject({ changed: true, previousLevel: 0, newLevel: 55 });
      const fix = await admin.put(`/api/users/${ids.u3}/competencies/${ids.forecasting}`).send({ level: 60, reason: 'Corrected after moderation' }).expect(200);
      expect(fix.body.data).toMatchObject({ previousLevel: 55, newLevel: 60 });
      expect((await admin.put(`/api/users/${ids.u3}/competencies/${ids.forecasting}`).send({ level: 60, reason: 'No change' })).body.data.changed).toBe(false);
      expect((await admin.put(`/api/users/${ids.u3}/competencies/${ids.forecasting}`).send({ level: 101, reason: 'Too high' })).status).toBe(400);
      const history = await prisma.competencyHistory.findMany({ where: { userId: ids.u3, competencyId: ids.forecasting }, orderBy: { createdAt: 'asc' } });
      expect(history.map((h) => [h.source, h.previousLevel, h.newLevel])).toEqual([['BASELINE', 0, 55], ['ADMIN_ADJUSTMENT', 55, 60]]);
    });
  });

  describe('competency framework, departments and roles', () => {
    it('creates, edits, deactivates and deletes competencies, deriving a code when none is given', async () => {
      const created = await admin.post('/api/competencies').send({ name: 'Marine Weather', description: 'Forecasting for ocean areas and shipping.', category: 'Core Operations' }).expect(201);
      expect(created.body.data.code).toBe('MARINE_WEATHER');
      expect((await admin.post('/api/competencies').send({ name: 'Marine Weather', description: 'Duplicate name entered here.', category: 'Core' })).status).toBe(409);
      await admin.patch(`/api/competencies/${created.body.data.id}`).send({ description: 'Forecasting for ocean areas, coasts and shipping.', levelDescriptors: { expert: 'Leads ocean-warning operations' } }).expect(200);

      await admin.patch(`/api/competencies/${created.body.data.id}`).send({ isActive: false }).expect(200);
      const trainee = await loginAs('u1@imd.gov.in');
      expect((await trainee.get('/api/competencies').expect(200)).body.data.map((c: { name: string }) => c.name)).not.toContain('Marine Weather');
      expect((await trainee.get(`/api/competencies/${created.body.data.id}`)).status).toBe(404);
      expect((await admin.get('/api/competencies?includeInactive=true').expect(200)).body.data.map((c: { name: string }) => c.name)).toContain('Marine Weather');
      expect((await admin.put(`/api/roles/${ids.roleSwf}/competencies/${created.body.data.id}`).send({ requiredLevel: 70, importance: 3 })).body.code).toBe('COMPETENCY_INACTIVE');

      await admin.delete(`/api/competencies/${created.body.data.id}`).expect(200);
      const inUse = await admin.delete(`/api/competencies/${ids.radar}`);
      expect(inUse.status).toBe(409);
      expect(inUse.body.code).toBe('COMPETENCY_IN_USE');
      expect(inUse.body.details.roles).toBe(2);
    });

    it('maps competencies to roles with a required level and importance, and shows them in the competency detail', async () => {
      const extra = await createCompetency({ name: 'Climate Analysis', code: 'CLIMATE' });
      await admin.put(`/api/roles/${ids.roleSwf}/competencies/${extra.id}`).send({ requiredLevel: 60, importance: 2 }).expect(200);
      await admin.put(`/api/roles/${ids.roleSwf}/competencies/${extra.id}`).send({ requiredLevel: 65, importance: 3 }).expect(200); // upsert
      expect((await admin.put(`/api/roles/${ids.roleSwf}/competencies/${extra.id}`).send({ requiredLevel: 120 })).status).toBe(400);
      const role = (await admin.get(`/api/roles/${ids.roleSwf}`).expect(200)).body.data;
      expect(role.competencies.find((c: { name: string }) => c.name === 'Climate Analysis')).toMatchObject({ requiredLevel: 65, importance: 3, importanceLabel: 'Important' });
      const detail = (await admin.get(`/api/competencies/${extra.id}`).expect(200)).body.data;
      expect(detail.roles).toEqual([expect.objectContaining({ name: 'Severe Weather Forecaster', requiredLevel: 65 })]);
      await admin.delete(`/api/roles/${ids.roleSwf}/competencies/${extra.id}`).expect(200);
      expect((await admin.delete(`/api/roles/${ids.roleSwf}/competencies/${extra.id}`)).status).toBe(404);
    });

    it('manages departments and job roles, and protects the ones in use', async () => {
      const dept = await admin.post('/api/departments').send({ name: 'Marine Services', code: 'marine' }).expect(201);
      expect(dept.body.data.code).toBe('MARINE');
      expect((await admin.post('/api/departments').send({ name: 'Marine Services', code: 'MARINE2' })).status).toBe(409);
      await admin.patch(`/api/departments/${dept.body.data.id}`).send({ description: 'Ocean forecasting', isActive: false }).expect(200);
      expect((await anonymous().get('/api/meta/options')).body.data.departments.map((d: { name: string }) => d.name)).not.toContain('Marine Services');
      await admin.delete(`/api/departments/${dept.body.data.id}`).expect(200);
      expect((await admin.delete(`/api/departments/${ids.deptFc}`)).body.code).toBe('DEPARTMENT_IN_USE');

      const role = await admin.post('/api/roles').send({ name: 'Climate Scientist', code: 'CLS', criticality: 3 }).expect(201);
      expect((await admin.post('/api/roles').send({ name: 'Bad Role', code: 'BAD', criticality: 9 })).status).toBe(400);
      expect(role.body.data.criticality).toBe(3);
      await admin.delete(`/api/roles/${role.body.data.id}`).expect(200);
      expect((await admin.delete(`/api/roles/${ids.roleSwf}`)).body.code).toBe('ROLE_IN_USE');
    });

    it('exposes the registration options publicly without leaking anything sensitive', async () => {
      const response = await anonymous().get('/api/meta/options').expect(200);
      expect(response.body.data.registration).toMatchObject({ requiresApproval: true });
      expect(response.body.data.passwordPolicy.minLength).toBe(10);
      expect(response.body.data.uploads).toEqual({ maxMb: expect.any(Number) });
      expect(response.body.data.departments[0]).toEqual({ id: expect.any(String), name: expect.any(String), code: expect.any(String) });
    });
  });

  describe('announcements, reminders, audit log and search', () => {
    it('publishes announcements to an audience and fans them out as notifications', async () => {
      const response = await admin.post('/api/admin/announcements').send({ title: 'Radar training week', body: 'Radar interpretation workshops run next week.', audience: 'TRAINEES' }).expect(201);
      expect(response.body.data.notified).toBe(await prisma.user.count({ where: { role: 'TRAINEE', status: 'ACTIVE', deletedAt: null } }));
      const trainee = await loginAs('u1@imd.gov.in');
      expect((await trainee.get('/api/notifications?type=ANNOUNCEMENT').expect(200)).body.data[0].title).toBe('Radar training week');
      expect((await trainer.get('/api/notifications?type=ANNOUNCEMENT').expect(200)).body.data).toEqual([]);
      expect((await trainee.get('/api/announcements').expect(200)).body.data.map((a: { title: string }) => a.title)).toContain('Radar training week');
      expect((await trainer.get('/api/announcements').expect(200)).body.data).toEqual([]);

      const scoped = await admin.post('/api/admin/announcements').send({ title: 'Forecasting only', body: 'Only for the forecasting department.', audience: 'ALL', departmentId: ids.deptFc, notify: false }).expect(201);
      expect(scoped.body.data.notified).toBe(0);
      const other = await loginAs('u3@imd.gov.in');
      expect((await other.get('/api/announcements').expect(200)).body.data.map((a: { title: string }) => a.title)).not.toContain('Forecasting only');
      expect((await trainee.get('/api/announcements').expect(200)).body.data.map((a: { title: string }) => a.title)).toContain('Forecasting only');

      await admin.patch(`/api/admin/announcements/${scoped.body.data.announcement.id}`).send({ expiresAt: new Date(Date.now() - 1000).toISOString() }).expect(200);
      expect((await trainee.get('/api/announcements').expect(200)).body.data.map((a: { title: string }) => a.title)).not.toContain('Forecasting only');
      await admin.delete(`/api/admin/announcements/${scoped.body.data.announcement.id}`).expect(200);
      expect((await admin.post('/api/admin/announcements').send({ title: 'x', body: 'y' })).status).toBe(400);
    });

    it('sends assessment-deadline reminders once, and never twice', async () => {
      const learnerUser = await createUser({ email: 'deadline@imd.gov.in', jobRoleId: ids.roleSwf, departmentId: ids.deptFc });
      await setLevel(learnerUser.id, ids.radar, 40, 30);
      const learner = await loginAs(learnerUser.email);
      const course = await buildCourse(trainer, { title: 'Deadline course', competencyId: ids.radar, levelFrom: 0, levelTo: 60, questions: 4, deadline: new Date(Date.now() + 2 * 86_400_000).toISOString() });
      await learner.post(`/api/courses/${course.courseId}/enroll`).expect(201);

      const first = await admin.post('/api/admin/jobs/reminders').expect(200);
      expect(first.body.data.deadlineReminders).toBeGreaterThanOrEqual(1);
      const notes = (await learner.get('/api/notifications?type=ASSESSMENT_DEADLINE').expect(200)).body.data;
      expect(notes.some((n: { title: string }) => n.title.includes('Deadline course'))).toBe(true);

      const second = await admin.post('/api/admin/jobs/reminders').expect(200);
      expect(second.body.data.deadlineReminders).toBe(0); // deduplicated
      expect((await learner.get('/api/notifications?type=ASSESSMENT_DEADLINE').expect(200)).body.data).toHaveLength(notes.length);
      expect(await prisma.auditLog.count({ where: { action: 'REMINDERS_SENT' } })).toBe(2);
    });

    it('lists the audit trail with filters, pagination and the available actions', async () => {
      const all = await admin.get('/api/admin/audit-logs?pageSize=5').expect(200);
      expect(all.body.meta.total).toBeGreaterThan(10);
      expect(all.body.meta.actions).toEqual(expect.arrayContaining(['COMPETENCY_CREATED', 'USER_APPROVED', 'COURSE_PUBLISHED', 'ASSESSMENT_SUBMITTED', 'CERTIFICATE_ISSUED', 'USER_ROLE_CHANGED']));
      expect(all.body.data[0]).toHaveProperty('user');
      const created = (await admin.get('/api/admin/audit-logs?action=COMPETENCY_CREATED').expect(200)).body.data;
      expect(created.every((entry: { action: string }) => entry.action === 'COMPETENCY_CREATED')).toBe(true);
      expect(created[0].user).toMatchObject({ email: 'admin@imd.gov.in' });
      expect((await admin.get('/api/admin/audit-logs?q=trainer%40imd').expect(200)).body.data.length).toBeGreaterThan(0);
      const future = new Date(Date.now() + 86_400_000).toISOString();
      expect((await admin.get(`/api/admin/audit-logs?from=${encodeURIComponent(future)}`).expect(200)).body.data).toEqual([]);
    });

    it('searches courses, competencies, materials and employees within what each role may see', async () => {
      const trainee = await loginAs('u1@imd.gov.in');
      const asTrainee = (await trainee.get('/api/search?q=radar').expect(200)).body.data;
      expect(asTrainee.courses.length).toBeGreaterThan(0);
      expect(asTrainee.competencies[0].name).toBe('Radar Meteorology');
      expect(asTrainee.employees).toEqual([]); // trainees cannot search employees
      const short = (await trainee.get('/api/search?q=r').expect(200)).body.data;
      expect(short.courses).toEqual([]);

      const asAdmin = (await admin.get('/api/search?q=asha').expect(200)).body.data;
      expect(asAdmin.employees.map((e: { email: string }) => e.email)).toEqual(['u1@imd.gov.in']);
      // Trainers may only find trainees enrolled in their own courses: u1 enrolled in a trainer course above.
      expect((await trainer.get('/api/search?q=asha').expect(200)).body.data.employees.map((e: { email: string }) => e.email)).toEqual(['u1@imd.gov.in']);
      expect((await trainer.get('/api/search?q=chitra').expect(200)).body.data.employees).toEqual([]);
      const materials = (await trainer.get('/api/search?q=lecture%20notes').expect(200)).body.data.materials;
      expect(materials[0]).toMatchObject({ type: 'TEXT' });
      expect(materials[0].snippet).toContain('Lecture notes');
    });
  });

  describe('dashboards', () => {
    it('serves the trainee dashboard from real data', async () => {
      const learner = await loginAs('u2@imd.gov.in');
      const { data } = (await learner.get('/api/dashboard/trainee').expect(200)).body;
      expect(data.welcome).toMatchObject({ name: 'Bala Two', department: 'Forecasting' });
      expect(data.competency.radar.map((r: { competency: string }) => r.competency).sort()).toEqual(['Radar Meteorology', 'Weather Forecasting']);
      expect(data.learning).toMatchObject({ coursesCompleted: 1, certificates: 1 });
      expect(data.certificates).toHaveLength(1);
      expect(data.activity.length).toBeGreaterThan(0);
      expect(data.competency.readiness).toBeGreaterThan(0);
    });

    it('serves the trainer dashboard scoped to the trainer’s own courses', async () => {
      const { data } = (await trainer.get('/api/dashboard/trainer').expect(200)).body;
      expect(data.metrics).toMatchObject({ activeCourses: 3, totalTrainees: 3, averageScore: 100 });
      expect(data.metrics.completionRate).toBeGreaterThanOrEqual(0);
      expect(data.courses.map((c: { title: string }) => c.title)).toEqual(expect.arrayContaining(['Radar Fundamentals', 'Analytics course', 'Deadline course']));
      expect(data.competencyImprovement[0]).toHaveProperty('averageGain');
      expect(data.scoreTrend).toHaveLength(6);
      const otherTrainer = await loginAs((await createTrainer({ email: 'idle.trainer@imd.gov.in' })).email);
      expect((await otherTrainer.get('/api/dashboard/trainer').expect(200)).body.data.metrics).toMatchObject({ activeCourses: 0, totalTrainees: 0 });
    });
  });
});
