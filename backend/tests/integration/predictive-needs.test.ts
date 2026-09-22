import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { setAiClientForTesting, type AiClient, type AiRequest, type AiResult } from '../../src/modules/ai/ai.client';
import { resetDatabase } from '../helpers/db';
import { createAdmin, createCompetency, createDepartment, createJobRole, createTrainer, createUser } from '../helpers/factories';
import { loginAs, type Agent } from '../helpers/http';

/**
 * Predictive training needs on a workforce whose history is known month by month, so every number can be
 * reproduced by hand. Two employees in one role; five monthly data points each (four months ago .. now):
 *
 *   Radar Meteorology (required 80):   A 30,35,40,45,50   B 50,55,60,65,70   average 40..60, +5 / month
 *   Weather Forecasting (required 85): A 60 x5            B 60 x5             flat
 *   Disaster Risk Mgmt (required 80):  A 70,68,66,64,62   B the same          -2 / month
 */
describe('predictive training needs', () => {
  let admin: Agent;
  let trainer: Agent;
  let ids: { radar: string; forecasting: string; drm: string; department: string; role: string };

  /** The 15th of the month `monthsAgo` months ago (UTC), noon: far from any month boundary. */
  const midMonth = (monthsAgo: number) => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 15, 12));
  };

  const series = {
    radar: { A: [30, 35, 40, 45, 50], B: [50, 55, 60, 65, 70] },
    forecasting: { A: [60, 60, 60, 60, 60], B: [60, 60, 60, 60, 60] },
    drm: { A: [70, 68, 66, 64, 62], B: [70, 68, 66, 64, 62] },
  } as const;

  beforeAll(async () => {
    await resetDatabase();
    const department = await createDepartment({ name: 'Forecasting', code: 'FC' });
    const radar = await createCompetency({ name: 'Radar Meteorology', code: 'RADAR', category: 'Core Operations' });
    const forecasting = await createCompetency({ name: 'Weather Forecasting', code: 'FORECAST', category: 'Core Operations' });
    const drm = await createCompetency({ name: 'Disaster Risk Management', code: 'DRM', category: 'Public Safety' });
    const role = await createJobRole({ name: 'Severe Weather Forecaster', code: 'SWF', criticality: 4 });
    await prisma.roleCompetency.createMany({
      data: [
        { roleId: role.id, competencyId: radar.id, requiredLevel: 80, importance: 4 },
        { roleId: role.id, competencyId: forecasting.id, requiredLevel: 85, importance: 5 },
        { roleId: role.id, competencyId: drm.id, requiredLevel: 80, importance: 3 },
      ],
    });
    admin = await loginAs((await createAdmin({ email: 'admin@imd.gov.in' })).email);
    trainer = await loginAs((await createTrainer({ email: 'trainer@imd.gov.in' })).email);
    ids = { radar: radar.id, forecasting: forecasting.id, drm: drm.id, department: department.id, role: role.id };

    for (const [who, email] of [['A', 'a@imd.gov.in'], ['B', 'b@imd.gov.in']] as const) {
      const user = await createUser({ email, name: `Employee ${who}`, departmentId: department.id, jobRoleId: role.id });
      for (const [key, competencyId] of [['radar', radar.id], ['forecasting', forecasting.id], ['drm', drm.id]] as const) {
        const levels = series[key][who];
        await prisma.employeeCompetency.create({ data: { userId: user.id, competencyId, currentLevel: levels[4] } });
        for (let index = 0; index < 5; index += 1) {
          await prisma.competencyHistory.create({
            data: {
              userId: user.id,
              competencyId,
              previousLevel: index === 0 ? 0 : levels[index - 1]!,
              newLevel: levels[index]!,
              source: index === 0 ? 'BASELINE' : 'ASSESSMENT',
              createdAt: midMonth(4 - index), // index 0 is four months ago
            },
          });
        }
      }
    }
  });

  it('fits a straight line through the monthly averages and projects it', async () => {
    const { data } = (await admin.get('/api/admin/predictive-needs').expect(200)).body;
    expect(data).toMatchObject({ horizonMonths: 6, historyMonths: 12, summary: { employees: 2, competencies: 3, affectedNow: 6, projectedAffected: 4, atRisk: 2 } });
    expect(data.competencies.map((item: { name: string }) => item.name)).toEqual(['Disaster Risk Management', 'Weather Forecasting', 'Radar Meteorology']); // most affected in six months first

    const byName = Object.fromEntries(data.competencies.map((item: { name: string }) => [item.name, item]));
    // 40, 45, 50, 55, 60 -> +5 / month: 40 + 5 x (4 + 6) = 90 after six months, so the gap to 80 is closed in 20 / 5 = 4 months
    expect(byName['Radar Meteorology']).toMatchObject({
      employees: 2, currentAverage: 60, requiredAverage: 80, affectedNow: 2,
      trendPerMonth: 5, projectedAverage: 90, projectedGap: 0, projectedAffected: 0, monthsToClose: 4, outlook: 'CLOSING', confidence: 'MEDIUM',
    });
    expect(byName['Radar Meteorology'].history.map((point: { value: number }) => point.value)).toEqual([40, 45, 50, 55, 60]);
    expect(byName['Radar Meteorology'].history.at(-1).value).toBe(byName['Radar Meteorology'].currentAverage); // the chart's last point is today's average
    expect(byName['Radar Meteorology'].projection).toHaveLength(6);
    expect(byName['Radar Meteorology'].projection[5].value).toBe(90);

    // A flat line does not close anything
    expect(byName['Weather Forecasting']).toMatchObject({ currentAverage: 60, trendPerMonth: 0, projectedAverage: 60, projectedGap: 25, projectedAffected: 2, monthsToClose: null, outlook: 'STAGNANT' });
    // 70, 68, ... 62 -> -2 / month: 70 - 2 x 10 = 50 after six months, further from 80 than today
    expect(byName['Disaster Risk Management']).toMatchObject({ currentAverage: 62, trendPerMonth: -2, projectedAverage: 50, projectedGap: 30, projectedAffected: 2, monthsToClose: null, outlook: 'WIDENING' });
  });

  it('honours the horizon: a shorter look-ahead projects less and counts different employees', async () => {
    const { data } = (await admin.get('/api/admin/predictive-needs?horizon=3').expect(200)).body;
    const radar = data.competencies.find((item: { name: string }) => item.name === 'Radar Meteorology');
    // 40 + 5 x (4 + 3) = 75; moving everyone by +15 leaves employee A (50 -> 65) short of 80 but not B (70 -> 85)
    expect(radar).toMatchObject({ projectedAverage: 75, projectedGap: 5, projectedAffected: 1, outlook: 'CLOSING' });
    expect(radar.projection).toHaveLength(3);
    expect((await admin.get('/api/admin/predictive-needs?horizon=0')).status).toBe(400);
    expect((await admin.get('/api/admin/predictive-needs?horizon=13')).status).toBe(400);
  });

  it('is restricted to administrators', async () => {
    expect((await trainer.get('/api/admin/predictive-needs')).status).toBe(403);
  });

  describe('written briefing (AI)', () => {
    const calls: AiRequest<unknown>[] = [];
    const fake: AiClient = {
      model: 'fake-model',
      async generate<T>(request: AiRequest<T>): Promise<AiResult<T>> {
        calls.push(request as AiRequest<unknown>);
        const output = request.schema.parse({
          summary: 'Radar is closing on its own; Disaster Risk Management is drifting away.',
          priorities: [
            { competencyId: ids.drm, action: 'Commission a refresher course.' },
            { competencyId: 'not-a-competency', action: 'Invented priority.' },
            { competencyId: ids.forecasting, action: 'Enroll the two employees who have not started.' },
          ],
        });
        return { output, model: 'fake-model', usage: { inputTokens: 900, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 } };
      },
    };
    beforeAll(() => setAiClientForTesting(fake));
    afterAll(() => setAiClientForTesting(null));

    it('describes the calculated numbers and drops priorities that name unknown competencies', async () => {
      const { data } = (await admin.post('/api/ai/predictive-needs/summary').send({ horizon: 6 }).expect(200)).body;
      expect(data.horizonMonths).toBe(6);
      expect(data.summary).toContain('Disaster Risk Management');
      expect(data.priorities).toEqual([
        { competencyId: ids.drm, competency: 'Disaster Risk Management', action: 'Commission a refresher course.' },
        { competencyId: ids.forecasting, competency: 'Weather Forecasting', action: 'Enroll the two employees who have not started.' },
      ]);

      // The model is given the calculated facts (never employee names), and it does not change them.
      const facts = JSON.parse(calls[0]!.user);
      expect(facts.totals).toMatchObject({ employees: 2, affectedNow: 6, projectedAffected: 4 });
      expect(facts.competencies[0]).toMatchObject({ name: 'Disaster Risk Management', trendPerMonth: -2, projectedAverage: 50, outlook: 'WIDENING' });
      expect(calls[0]!.user).not.toMatch(/Employee [AB]|@imd\.gov\.in/);

      const [row] = await prisma.auditLog.findMany({ where: { action: 'AI_FORECAST_SUMMARISED' } });
      expect(row?.metadata).toMatchObject({ feature: 'forecast-briefing', priorities: 2, model: 'fake-model' });
    });

    it('is restricted to administrators', async () => {
      expect((await trainer.post('/api/ai/predictive-needs/summary').send({})).status).toBe(403);
    });
  });

  describe('an employee who is first assessed later', () => {
    beforeAll(async () => {
      // Employee C joins and is baselined this month: Radar 65, Forecasting 60, Disaster Risk 62.
      const late = await createUser({ email: 'c@imd.gov.in', name: 'Employee C', departmentId: ids.department, jobRoleId: ids.role });
      for (const [competencyId, level] of [[ids.radar, 65], [ids.forecasting, 60], [ids.drm, 62]] as const) {
        await prisma.employeeCompetency.create({ data: { userId: late.id, competencyId, currentLevel: level } });
        await prisma.competencyHistory.create({ data: { userId: late.id, competencyId, previousLevel: 0, newLevel: level, source: 'BASELINE', createdAt: midMonth(0) } });
      }
    });

    it('does not look like progress: the joiner counts at their first level in every month', async () => {
      const { data } = (await admin.get('/api/admin/predictive-needs').expect(200)).body;
      const radar = data.competencies.find((item: { name: string }) => item.name === 'Radar Meteorology');
      // Averages of A, B and C (C = 65 throughout): (30+50+65)/3 = 48.3, 51.7, 55, 58.3, 61.7.
      // Counting C only from this month would have given 40, 45, 50, 55, 61.7 and a pace of 5.7 a month.
      expect(radar.history.map((point: { value: number }) => point.value)).toEqual([48.3, 51.7, 55, 58.3, 61.7]);
      expect(radar).toMatchObject({ employees: 3, currentAverage: 61.7, trendPerMonth: 3.3, projectedAverage: 81.7 }); // 61.7 + 3.34 x 6
      expect(radar.history.at(-1).value).toBe(radar.currentAverage);
    });
  });
});
