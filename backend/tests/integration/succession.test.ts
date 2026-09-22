import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createAdmin, createCompetency, createDepartment, createJobRole, createTrainer, createUser } from '../helpers/factories';
import { loginAs, type Agent } from '../helpers/http';

/**
 * Knowledge-loss risk and mentorship, end to end.
 *
 * Radar Analysis (criticality 5) has two experts, one of whom has a recorded
 * retirement inside the window, and two people developing towards it. Satellite
 * has comfortable cover. Nobody at all is expert in Numerical Weather Prediction.
 */
describe('succession and knowledge-loss risk', () => {
  let admin: Agent;
  let trainer: Agent;
  let learner: Agent;
  let ids: { radar: string; satellite: string; nwp: string; expert: string; leaving: string; developing: string };

  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

  interface Risk {
    competencyId: string;
    competencyName: string;
    risk: string;
    expertCount: number;
    leavingCount: number;
    developingCount: number;
    remainingExperts: number;
    minimumExperts: number;
    reason: string;
  }
  const riskFor = (risks: Risk[], id: string) => risks.find((risk) => risk.competencyId === id) as Risk;

  beforeAll(async () => {
    await resetDatabase();
    const department = await createDepartment({ name: 'Radar Operations', code: 'RD' });
    const radar = await createCompetency({ name: 'Advanced Radar Analysis', code: 'RADAR', category: 'Core Operations' });
    const satellite = await createCompetency({ name: 'Satellite Meteorology', code: 'SAT', category: 'Core Operations' });
    const nwp = await createCompetency({ name: 'Numerical Weather Prediction', code: 'NWP', category: 'Modelling' });
    const role = await createJobRole({ name: 'Radar Meteorologist', code: 'RDM', criticality: 5 });

    const people = {
      leaving: await createUser({ email: 'senior.expert@imd.gov.in', name: 'Senior Radar Expert', jobRoleId: role.id, departmentId: department.id, retirementDate: inDays(200), careerLevel: 'PRINCIPAL' }),
      expert: await createUser({ email: 'second.expert@imd.gov.in', name: 'Second Expert', jobRoleId: role.id, departmentId: department.id, careerLevel: 'SENIOR' }),
      developing: await createUser({ email: 'developing.one@imd.gov.in', name: 'Developing One', jobRoleId: role.id, departmentId: department.id, careerLevel: 'JUNIOR' }),
      developingTwo: await createUser({ email: 'developing.two@imd.gov.in', name: 'Developing Two', jobRoleId: role.id, departmentId: department.id, careerLevel: 'JUNIOR' }),
    };

    const level = (userId: string, competencyId: string, currentLevel: number) => ({ userId, competencyId, currentLevel, lastEvidenceAt: new Date(), lastPracticedAt: new Date() });
    await prisma.employeeCompetency.createMany({
      data: [
        level(people.leaving.id, radar.id, 95),
        level(people.expert.id, radar.id, 84),
        level(people.developing.id, radar.id, 64),
        level(people.developingTwo.id, radar.id, 58),
        // Satellite: comfortable cover and nobody leaving (the retiring expert is deliberately not one of them).
        level(people.expert.id, satellite.id, 88),
        level(people.developing.id, satellite.id, 88),
        level(people.developingTwo.id, satellite.id, 88),
        // NWP: everyone is below the expert level.
        level(people.leaving.id, nwp.id, 70),
        level(people.expert.id, nwp.id, 65),
      ],
    });

    admin = await loginAs((await createAdmin({ email: 'succ.admin@imd.gov.in' })).email);
    trainer = await loginAs((await createTrainer({ email: 'succ.trainer@imd.gov.in' })).email);
    learner = await loginAs(people.developing.email);
    ids = { radar: radar.id, satellite: satellite.id, nwp: nwp.id, expert: people.expert.id, leaving: people.leaving.id, developing: people.developing.id };

    // Radar is mission critical; satellite and NWP are ordinary.
    await admin
      .put(`/api/competencies/${radar.id}/decay-policy`)
      .send({ decayEnabled: true, halfLifeDays: 180, minimumSafeLevel: 45, recertificationIntervalDays: 365, criticality: 5, isSimulation: true })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('the organisation-wide view', () => {
    it('reproduces the example: 2 experts, 1 leaving, 2 developing, and HIGH risk', async () => {
      const { body } = await admin.get('/api/succession').expect(200);
      const radar = riskFor(body.data.risks, ids.radar);
      expect(radar).toMatchObject({ expertCount: 2, leavingCount: 1, developingCount: 2, remainingExperts: 1, risk: 'HIGH' });
      // Criticality 5 asks for one more expert than an ordinary competency.
      expect(radar.minimumExperts).toBe(3);
    });

    it('says why, in words an administrator can act on', async () => {
      const { body } = await admin.get('/api/succession').expect(200);
      const radar = riskFor(body.data.risks, ids.radar);
      expect(radar.reason).toContain('2 people reach the 80% expert level');
      expect(radar.reason).toContain('would leave 1 expert');
      expect(radar.reason).toContain('HIGH');
    });

    it('reports comfortable cover as low risk', async () => {
      const { body } = await admin.get('/api/succession').expect(200);
      expect(riskFor(body.data.risks, ids.satellite)).toMatchObject({ expertCount: 3, leavingCount: 0, risk: 'LOW' });
    });

    it('treats a competency nobody is expert in as critical', async () => {
      const { body } = await admin.get('/api/succession').expect(200);
      expect(riskFor(body.data.risks, ids.nwp)).toMatchObject({ expertCount: 0, risk: 'CRITICAL' });
    });

    it('puts the most serious competency first and summarises the organisation', async () => {
      const { body } = await admin.get('/api/succession').expect(200);
      expect(body.data.risks[0].competencyId).toBe(ids.nwp);
      expect(body.data.summary).toMatchObject({ competencies: 3, atRisk: 2, expertsLeaving: 1 });
    });

    it('is not visible to trainers or trainees', async () => {
      await trainer.get('/api/succession').expect(403);
      await learner.get('/api/succession').expect(403);
    });
  });

  describe('the readiness simulation applies here too', () => {
    it('counts a retirement that is outside the window today but inside it later', async () => {
      const distant = await createUser({ email: 'distant.retiree@imd.gov.in', name: 'Distant Retiree', retirementDate: inDays(900) });
      await prisma.employeeCompetency.create({ data: { userId: distant.id, competencyId: ids.satellite, currentLevel: 90, lastEvidenceAt: new Date(), lastPracticedAt: new Date() } });

      const today = await admin.get('/api/succession').expect(200);
      const ahead = await admin.get('/api/succession?offsetDays=365').expect(200);
      expect(riskFor(today.body.data.risks, ids.satellite).leavingCount).toBe(0);
      expect(riskFor(ahead.body.data.risks, ids.satellite).leavingCount).toBe(1);
      expect(ahead.body.data.asOf).toMatchObject({ simulated: true, offsetDays: 365 });
    });

    it('drops an expert whose competency has decayed below the expert level', async () => {
      // Radar decays with a 180-day half-life: by +365 days the 95% expert is under 80%.
      const { body } = await admin.get('/api/succession?offsetDays=365').expect(200);
      expect(riskFor(body.data.risks, ids.radar)).toMatchObject({ expertCount: 0, risk: 'CRITICAL' });
    });
  });

  describe('competency detail and mentor suggestions', () => {
    it('suggests pairing an expert who is staying with someone developing', async () => {
      const { body } = await admin.get(`/api/succession/competencies/${ids.radar}`).expect(200);
      expect(body.data.risk.competencyId).toBe(ids.radar);
      const mentors = body.data.suggestions.map((suggestion: { mentor: { userId: string } }) => suggestion.mentor.userId);
      expect(mentors).toContain(ids.expert); // the expert who is staying
      expect(mentors).not.toContain(ids.leaving); // the one who is leaving is not a durable mentor
    });

    it('is readable by a trainer, who has to arrange the mentoring', async () => {
      await trainer.get(`/api/succession/competencies/${ids.radar}`).expect(200);
    });
  });

  describe('mentorships', () => {
    let mentorshipId: string;

    it('pairs an expert with a developing employee', async () => {
      const { body } = await admin
        .post('/api/succession/mentorships')
        .send({ mentorId: ids.expert, menteeId: ids.developing, competencyId: ids.radar, note: 'Radar desk shadowing' })
        .expect(201);
      mentorshipId = body.data.mentorship.id;
      expect(body.data.mentorship).toMatchObject({ status: 'NOT_STARTED' });
      expect(body.data.mentorship.mentor.name).toBe('Second Expert');
    });

    it('shows the trainee their own mentor', async () => {
      const { body } = await learner.get('/api/succession/mentorships/me').expect(200);
      expect(body.data.asMentee).toHaveLength(1);
      expect(body.data.asMentee[0]).toMatchObject({ competency: { name: 'Advanced Radar Analysis' } });
      expect(body.data.asMentee[0].mentor.name).toBe('Second Expert');
      expect(body.data.asMentor).toEqual([]);
    });

    it('records the start date when the pairing becomes active', async () => {
      const { body } = await admin.patch(`/api/succession/mentorships/${mentorshipId}`).send({ status: 'ACTIVE' }).expect(200);
      expect(body.data.mentorship.status).toBe('ACTIVE');
      expect(body.data.mentorship.startedAt).not.toBeNull();
    });

    it('stops suggesting a pairing that already exists', async () => {
      const { body } = await admin.get(`/api/succession/competencies/${ids.radar}`).expect(200);
      const pairs = body.data.suggestions.flatMap((suggestion: { mentor: { userId: string }; candidates: { userId: string }[] }) =>
        suggestion.candidates.map((candidate) => `${suggestion.mentor.userId}:${candidate.userId}`),
      );
      expect(pairs).not.toContain(`${ids.expert}:${ids.developing}`);
    });

    it('refuses a duplicate pairing and self-mentoring', async () => {
      await admin.post('/api/succession/mentorships').send({ mentorId: ids.expert, menteeId: ids.developing, competencyId: ids.radar }).expect(409);
      await admin.post('/api/succession/mentorships').send({ mentorId: ids.expert, menteeId: ids.expert, competencyId: ids.radar }).expect(409);
    });

    it('cannot be reopened once completed', async () => {
      await admin.patch(`/api/succession/mentorships/${mentorshipId}`).send({ status: 'COMPLETED' }).expect(200);
      await admin.patch(`/api/succession/mentorships/${mentorshipId}`).send({ status: 'ACTIVE' }).expect(409);
    });

    it('is not something a trainee may arrange', async () => {
      await learner.post('/api/succession/mentorships').send({ mentorId: ids.expert, menteeId: ids.leaving, competencyId: ids.radar }).expect(403);
    });

    it('records the pairing in the audit log', async () => {
      const entries = await prisma.auditLog.findMany({ where: { action: 'MENTORSHIP_CREATED' } });
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });
});
