import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createAdmin, createCompetency, createDepartment, createJobRole, createTrainer, createUser } from '../helpers/factories';
import { loginAs, type Agent } from '../helpers/http';

/**
 * Competency freshness end to end, on the worked example from the brief:
 *
 *   Radar Meteorology, required 80, verified at 72%, practised 90 days ago,
 *   configured half-life 180 days  ->  72 x 0.5^(90/180) = 50.9 -> an effective 51%.
 *
 * The same analysis is asked for at several dates through `?offsetDays=`; the
 * stored data never changes, which is the whole point of the simulation.
 */
describe('competency decay and recertification', () => {
  let admin: Agent;
  let trainer: Agent;
  let learner: Agent;
  let ids: { radar: string; forecasting: string; user: string };

  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

  interface Freshness {
    baselineLevel: number;
    effectiveLevel: number;
    decayPoints: number;
    decayApplied: boolean;
    status: string;
    reason: string;
  }
  interface Gap {
    competencyId: string;
    currentLevel: number;
    gap: number;
    freshness: Freshness;
  }
  const gapsOf = (body: { data: { gaps: Gap[] } }) => body.data.gaps;
  const radarGap = (body: { data: { gaps: Gap[] } }) => gapsOf(body).find((gap) => gap.competencyId === ids.radar) as Gap;
  const forecastGap = (body: { data: { gaps: Gap[] } }) => gapsOf(body).find((gap) => gap.competencyId === ids.forecasting) as Gap;

  beforeAll(async () => {
    await resetDatabase();
    await createDepartment({ name: 'Forecasting', code: 'FC' });
    const radar = await createCompetency({ name: 'Radar Meteorology', code: 'RADAR', category: 'Core Operations' });
    const forecasting = await createCompetency({ name: 'Weather Forecasting', code: 'FORECAST', category: 'Core Operations' });
    const role = await createJobRole({ name: 'Severe Weather Forecaster', code: 'SWF', criticality: 4 });
    await prisma.roleCompetency.createMany({
      data: [
        { roleId: role.id, competencyId: radar.id, requiredLevel: 80, importance: 4 },
        { roleId: role.id, competencyId: forecasting.id, requiredLevel: 85, importance: 5 },
      ],
    });

    const employee = await createUser({ email: 'radar.learner@imd.gov.in', name: 'Arjun Sharma', jobRoleId: role.id });
    // Radar verified at 72% and practised 90 days ago; forecasting is fresh and comfortable.
    await prisma.employeeCompetency.createMany({
      data: [
        { userId: employee.id, competencyId: radar.id, currentLevel: 72, lastEvidenceAt: daysAgo(90), lastPracticedAt: daysAgo(90) },
        { userId: employee.id, competencyId: forecasting.id, currentLevel: 88, lastEvidenceAt: daysAgo(10), lastPracticedAt: daysAgo(10) },
      ],
    });

    const adminUser = await createAdmin({ email: 'decay.admin@imd.gov.in' });
    const trainerUser = await createTrainer({ email: 'decay.trainer@imd.gov.in' });
    admin = await loginAs(adminUser.email);
    trainer = await loginAs(trainerUser.email);
    learner = await loginAs(employee.email);
    ids = { radar: radar.id, forecasting: forecasting.id, user: employee.id };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('without a configured policy', () => {
    it('does not decay a competency at all, so existing behaviour is unchanged', async () => {
      const radar = radarGap((await learner.get('/api/skill-gaps/me').expect(200)).body);
      expect(radar.currentLevel).toBe(72);
      expect(radar.freshness.effectiveLevel).toBe(72);
      expect(radar.freshness.decayApplied).toBe(false);
      expect(radar.freshness.status).toBe('WATCH'); // 8 points short of the requirement, but not through decay
    });
  });

  describe('once an administrator configures a policy', () => {
    beforeAll(async () => {
      await admin
        .put(`/api/competencies/${ids.radar}/decay-policy`)
        .send({ decayEnabled: true, halfLifeDays: 180, minimumSafeLevel: 45, recertificationIntervalDays: 365, criticality: 5, isSimulation: true, notes: 'Demonstration value' })
        .expect(200);
    });

    it('reproduces the worked example: 72% practised 90 days ago is an effective 51%', async () => {
      const radar = radarGap((await learner.get('/api/skill-gaps/me').expect(200)).body);
      expect(radar.freshness.baselineLevel).toBe(72);
      expect(radar.freshness.effectiveLevel).toBe(51);
      expect(radar.freshness.decayPoints).toBe(21);
      expect(radar.currentLevel).toBe(51); // the gap is measured against the effective level
      expect(radar.gap).toBe(29);
      expect(radar.freshness.status).toBe('AT_RISK');
      expect(radar.freshness.reason).toContain('180');
    });

    it('leaves the stored record untouched: only the reading changes', async () => {
      const stored = await prisma.employeeCompetency.findFirstOrThrow({ where: { userId: ids.user, competencyId: ids.radar } });
      expect(stored.currentLevel).toBe(72);
    });

    it('offers a refresher for what decayed, separately from courses never taken', async () => {
      const { body } = await learner.get('/api/skill-gaps/me').expect(200);
      const refreshers = body.data.refreshers as { competencyId: string; status: string; baselineLevel: number; effectiveLevel: number }[];
      expect(refreshers.map((item) => item.competencyId)).toEqual([ids.radar]);
      expect(refreshers[0]).toMatchObject({ status: 'AT_RISK', baselineLevel: 72, effectiveLevel: 51 });
    });

    it('does not touch a competency that is still fresh', async () => {
      const forecasting = forecastGap((await learner.get('/api/skill-gaps/me').expect(200)).body);
      expect(forecasting.freshness.decayPoints).toBe(0);
      expect(forecasting.freshness.status).toBe('CURRENT');
    });
  });

  describe('readiness simulation (time travel)', () => {
    it('decays further the further ahead it looks, without writing anything', async () => {
      const levels: number[] = [];
      for (const offsetDays of [0, 90, 180, 365]) {
        const { body } = await learner.get(`/api/skill-gaps/me?offsetDays=${offsetDays}`).expect(200);
        levels.push(radarGap(body).freshness.effectiveLevel);
      }
      expect(levels).toEqual([51, 36, 25, 12]);
      const stored = await prisma.employeeCompetency.findFirstOrThrow({ where: { userId: ids.user, competencyId: ids.radar } });
      expect(stored.currentLevel).toBe(72);
    });

    it('says whether the answer is a simulation and how far ahead it looked', async () => {
      const today = await learner.get('/api/skill-gaps/me').expect(200);
      expect(today.body.data.asOf).toMatchObject({ simulated: false, offsetDays: 0 });
      const ahead = await learner.get('/api/skill-gaps/me?offsetDays=90').expect(200);
      expect(ahead.body.data.asOf).toMatchObject({ simulated: true, offsetDays: 90 });
    });

    it('accepts an explicit date as well as an offset', async () => {
      const date = new Date(Date.now() + 90 * 86_400_000).toISOString();
      const { body } = await learner.get(`/api/skill-gaps/me?asOf=${encodeURIComponent(date)}`).expect(200);
      expect(radarGap(body).freshness.effectiveLevel).toBe(36);
    });

    it('refuses a date beyond the configured simulation window, and an unreadable one', async () => {
      await learner.get('/api/skill-gaps/me?offsetDays=99999').expect(400);
      await learner.get('/api/skill-gaps/me?asOf=not-a-date').expect(400);
    });

    it('marks the competency expired once the simulation passes its recertification date', async () => {
      const { body } = await learner.get('/api/skill-gaps/me?offsetDays=400').expect(200);
      expect(radarGap(body).freshness.status).toBe('EXPIRED');
      // Forecasting has no policy of its own, so nothing about it changes.
      expect(forecastGap(body).freshness.status).toBe('CURRENT');
    });
  });

  describe('recording practice', () => {
    it('resets the decay clock without changing the verified level', async () => {
      await trainer.post('/api/competencies/practice').send({ userId: ids.user, competencyId: ids.radar, source: 'OPERATIONAL_DUTY', note: 'Radar desk duty' }).expect(201);

      const radar = radarGap((await learner.get('/api/skill-gaps/me').expect(200)).body);
      expect(radar.freshness.effectiveLevel).toBe(72); // freshly practised, so nothing has decayed
      expect(radar.freshness.decayPoints).toBe(0);

      const stored = await prisma.employeeCompetency.findFirstOrThrow({ where: { userId: ids.user, competencyId: ids.radar } });
      expect(stored.currentLevel).toBe(72);
      // Practice is not verification: the assessment date, which drives recertification, is untouched.
      expect(stored.lastEvidenceAt?.getTime()).toBeLessThan(Date.now() - 80 * 86_400_000);
    });

    it('keeps the practice history', async () => {
      const records = await prisma.competencyPracticeRecord.findMany({ where: { userId: ids.user, competencyId: ids.radar } });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ source: 'OPERATIONAL_DUTY', note: 'Radar desk duty' });
    });

    it('refuses a practice date in the future', async () => {
      const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
      await trainer.post('/api/competencies/practice').send({ userId: ids.user, competencyId: ids.radar, practicedAt: future }).expect(409);
    });

    it('is not something a trainee may record for themselves', async () => {
      await learner.post('/api/competencies/practice').send({ userId: ids.user, competencyId: ids.radar }).expect(403);
    });
  });

  describe('policy administration', () => {
    it('lists every competency with its policy and says which are configured', async () => {
      const { body } = await admin.get('/api/competencies/decay/policies').expect(200);
      const policies = body.data.policies as { competencyId: string; configured: boolean; decayEnabled: boolean }[];
      expect(policies.find((policy) => policy.competencyId === ids.radar)).toMatchObject({ configured: true, halfLifeDays: 180, criticality: 5, isSimulation: true });
      expect(policies.find((policy) => policy.competencyId === ids.forecasting)).toMatchObject({ configured: false, decayEnabled: false });
    });

    it('validates the policy: a half-life must be positive and the scales bounded', async () => {
      const base = { decayEnabled: true, halfLifeDays: 180, minimumSafeLevel: 45, recertificationIntervalDays: 365, criticality: 5, isSimulation: true };
      await admin.put(`/api/competencies/${ids.radar}/decay-policy`).send({ ...base, halfLifeDays: 0 }).expect(400);
      await admin.put(`/api/competencies/${ids.radar}/decay-policy`).send({ ...base, criticality: 9 }).expect(400);
      await admin.put(`/api/competencies/${ids.radar}/decay-policy`).send({ ...base, minimumSafeLevel: 101 }).expect(400);
    });

    it('is not something a trainer may change', async () => {
      const base = { decayEnabled: true, halfLifeDays: 90, minimumSafeLevel: 45, recertificationIntervalDays: 365, criticality: 5, isSimulation: true };
      await trainer.put(`/api/competencies/${ids.radar}/decay-policy`).send(base).expect(403);
    });

    it('removing the policy stops the competency decaying', async () => {
      await admin.delete(`/api/competencies/${ids.radar}/decay-policy`).expect(200);
      const radar = radarGap((await learner.get('/api/skill-gaps/me?offsetDays=365').expect(200)).body);
      expect(radar.freshness.effectiveLevel).toBe(72);
      expect(radar.freshness.decayApplied).toBe(false);
    });

    it('records policy changes in the audit log', async () => {
      const entries = await prisma.auditLog.findMany({ where: { action: 'DECAY_POLICY_UPDATED' } });
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });
  });
});
