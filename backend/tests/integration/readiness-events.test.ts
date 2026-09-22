import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createAdmin, createCompetency, createDepartment, createJobRole, createTrainer, createUser } from '../helpers/factories';
import { loginAs, type Agent } from '../helpers/http';

/**
 * Hazard-season readiness sprints.
 *
 * A cyclone event 120 days away needs Radar at 75 and Disaster Risk Management
 * at 70. Three forecasters are in scope with different standings, and radar
 * decays with a 180-day half-life, so readiness measured at the event's start
 * differs from readiness measured today — which is the point.
 */
describe('readiness events', () => {
  let admin: Agent;
  let trainer: Agent;
  let learner: Agent;
  let ids: { radar: string; drm: string; department: string; otherDepartment: string; ready: string; short: string; outside: string };
  let eventId: string;

  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

  beforeAll(async () => {
    await resetDatabase();
    const department = await createDepartment({ name: 'Cyclone Warning', code: 'CDW' });
    const otherDepartment = await createDepartment({ name: 'Climate Research', code: 'CLR' });
    const radar = await createCompetency({ name: 'Radar Meteorology', code: 'RADAR', category: 'Core Operations' });
    const drm = await createCompetency({ name: 'Disaster Risk Management', code: 'DRM', category: 'Public Safety' });
    const role = await createJobRole({ name: 'Cyclone Warning Officer', code: 'CWO', criticality: 5 });

    const ready = await createUser({ email: 'ready.officer@imd.gov.in', name: 'Ready Officer', departmentId: department.id, jobRoleId: role.id });
    const short = await createUser({ email: 'short.officer@imd.gov.in', name: 'Short Officer', departmentId: department.id, jobRoleId: role.id });
    const outside = await createUser({ email: 'climate.officer@imd.gov.in', name: 'Climate Officer', departmentId: otherDepartment.id, jobRoleId: role.id });

    const fresh = new Date();
    await prisma.employeeCompetency.createMany({
      data: [
        // Comfortably above what the event needs, and freshly practised.
        { userId: ready.id, competencyId: radar.id, currentLevel: 92, lastEvidenceAt: fresh, lastPracticedAt: fresh },
        { userId: ready.id, competencyId: drm.id, currentLevel: 88, lastEvidenceAt: fresh, lastPracticedAt: fresh },
        // Meets radar today but is well short on disaster risk management.
        { userId: short.id, competencyId: radar.id, currentLevel: 80, lastEvidenceAt: fresh, lastPracticedAt: fresh },
        { userId: short.id, competencyId: drm.id, currentLevel: 40, lastEvidenceAt: fresh, lastPracticedAt: fresh },
        // In a department the event does not cover.
        { userId: outside.id, competencyId: radar.id, currentLevel: 10, lastEvidenceAt: fresh, lastPracticedAt: fresh },
      ],
    });

    admin = await loginAs((await createAdmin({ email: 'ready.admin@imd.gov.in' })).email);
    trainer = await loginAs((await createTrainer({ email: 'ready.trainer@imd.gov.in' })).email);
    learner = await loginAs(short.email);
    ids = { radar: radar.id, drm: drm.id, department: department.id, otherDepartment: otherDepartment.id, ready: ready.id, short: short.id, outside: outside.id };

    await admin
      .put(`/api/competencies/${radar.id}/decay-policy`)
      .send({ decayEnabled: true, halfLifeDays: 180, minimumSafeLevel: 45, recertificationIntervalDays: 3650, criticality: 5, isSimulation: true })
      .expect(200);

    const { body } = await admin
      .post('/api/readiness/events')
      .send({
        name: 'Cyclone Readiness Sprint',
        description: 'Simulated readiness event for the pre-cyclone period.',
        startDate: inDays(120).toISOString(),
        endDate: inDays(180).toISOString(),
        hazardType: 'CYCLONE',
        priority: 5,
        isSimulation: true,
        departmentIds: [department.id],
        requirements: [
          { competencyId: radar.id, requiredLevel: 75, importance: 5 },
          { competencyId: drm.id, requiredLevel: 70, importance: 4 },
        ],
      })
      .expect(201);
    eventId = body.data.event.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('defining an event', () => {
    it('stores the requirements and the departments it covers', async () => {
      const { body } = await admin.get(`/api/readiness/events/${eventId}`).expect(200);
      expect(body.data.event.requirements).toHaveLength(2);
      expect(body.data.event.departments[0].department.code).toBe('CDW');
      expect(body.data.event.isSimulation).toBe(true);
    });

    it('refuses an event that ends before it starts, or repeats a competency', async () => {
      const base = { name: 'Bad Event', startDate: inDays(30).toISOString(), hazardType: 'FLOOD', isSimulation: true, departmentIds: [], requirements: [{ competencyId: ids.radar, requiredLevel: 70, importance: 3 }] };
      await admin.post('/api/readiness/events').send({ ...base, endDate: inDays(10).toISOString() }).expect(409);
      await admin
        .post('/api/readiness/events')
        .send({
          ...base,
          endDate: inDays(40).toISOString(),
          requirements: [
            { competencyId: ids.radar, requiredLevel: 70, importance: 3 },
            { competencyId: ids.radar, requiredLevel: 80, importance: 3 },
          ],
        })
        .expect(409);
    });

    it('requires at least one competency', async () => {
      await admin
        .post('/api/readiness/events')
        .send({ name: 'Empty Event', startDate: inDays(30).toISOString(), endDate: inDays(40).toISOString(), hazardType: 'OTHER', isSimulation: true, departmentIds: [], requirements: [] })
        .expect(400);
    });

    it('is not something a trainer may create', async () => {
      await trainer
        .post('/api/readiness/events')
        .send({ name: 'Trainer Event', startDate: inDays(30).toISOString(), endDate: inDays(40).toISOString(), hazardType: 'OTHER', isSimulation: true, departmentIds: [], requirements: [{ competencyId: ids.radar, requiredLevel: 70, importance: 3 }] })
        .expect(403);
    });
  });

  describe('measuring readiness', () => {
    it('covers only the departments the event names', async () => {
      const { body } = await admin.get(`/api/readiness/events/${eventId}/readiness`).expect(200);
      expect(body.data.totalPeople).toBe(2);
      expect(body.data.people.map((person: { userId: string }) => person.userId).sort()).toEqual([ids.ready, ids.short].sort());
    });

    it('measures at the event start, not today, so decay before the season counts', async () => {
      const { body } = await admin.get(`/api/readiness/events/${eventId}/readiness`).expect(200);
      expect(body.data.daysUntilStart).toBe(120);
      // Radar 92% decays to about 59% over 120 days with a 180-day half-life, so even
      // the strong officer falls below the 75% the event needs.
      const readyOfficer = body.data.people.find((person: { userId: string }) => person.userId === ids.ready);
      expect(readyOfficer.shortfalls.map((shortfall: { competencyId: string }) => shortfall.competencyId)).toEqual([ids.radar]);
    });

    it('names who is short and on what', async () => {
      const { body } = await admin.get(`/api/readiness/events/${eventId}/readiness`).expect(200);
      const shortOfficer = body.data.people.find((person: { userId: string }) => person.userId === ids.short);
      expect(shortOfficer.shortfalls.map((shortfall: { competencyName: string }) => shortfall.competencyName).sort()).toEqual(['Disaster Risk Management', 'Radar Meteorology']);
      expect(shortOfficer.reason).toContain('Short on');
    });

    it('ranks the competencies holding the organisation back', async () => {
      const { body } = await admin.get(`/api/readiness/events/${eventId}/readiness`).expect(200);
      expect(body.data.weakestCompetencies[0]).toMatchObject({ competencyId: ids.radar, peopleShort: 2 });
    });

    it('reports headline numbers an administrator can quote', async () => {
      const { body } = await admin.get(`/api/readiness/events/${eventId}/readiness`).expect(200);
      expect(body.data).toMatchObject({ totalPeople: 2, readyCount: 0, needingPreparation: 2 });
      expect(body.data.workforceReady).toBe(0);
      expect(body.data.averageReadiness).toBeGreaterThan(0);
      expect(body.data.reason).toContain('of 2 people');
    });

    it('shows a healthier picture when measured today rather than at the season', async () => {
      // offsetDays=0 is "today", which for these people is before the decay bites.
      const { body } = await admin.get(`/api/readiness/events/${eventId}/readiness?offsetDays=1`).expect(200);
      const readyOfficer = body.data.people.find((person: { userId: string }) => person.userId === ids.ready);
      expect(readyOfficer.state).toBe('READY');
      expect(body.data.asOf.simulated).toBe(true);
    });
  });

  describe('the readiness calendar', () => {
    it('lists upcoming events with their headline readiness', async () => {
      const { body } = await admin.get('/api/readiness/calendar').expect(200);
      const event = body.data.events.find((entry: { id: string }) => entry.id === eventId);
      expect(event).toMatchObject({ name: 'Cyclone Readiness Sprint', hazardType: 'CYCLONE', totalPeople: 2, isSimulation: true });
      expect(event.weakestCompetencies.length).toBeGreaterThan(0);
    });

    it('is readable by a trainer, who has to run the preparation', async () => {
      await trainer.get('/api/readiness/calendar').expect(200);
    });

    it('is not open to trainees', async () => {
      await learner.get('/api/readiness/calendar').expect(403);
    });
  });

  describe('assigning preparation', () => {
    it('assigns work to everyone who is short, once per competency', async () => {
      const { body } = await admin.post(`/api/readiness/events/${eventId}/assign`).expect(200);
      // Ready Officer is short on radar; Short Officer on radar and DRM.
      expect(body.data.created).toBe(3);
    });

    it('tells each person once, however many competencies they are short on', async () => {
      const notifications = await prisma.notification.findMany({ where: { dedupeKey: `readiness-assignment:${eventId}` } });
      // Two people are short (one on radar, one on radar and DRM): one message each, not one per competency.
      expect(notifications).toHaveLength(2);
      expect(notifications[0]?.type).toBe('TRAINING_REMINDER');
      expect(notifications[0]?.title).toContain('Cyclone Readiness Sprint');
      expect(notifications[0]?.link).toBe('/trainee/readiness');
    });

    it('is idempotent: running it again creates nothing new, and notifies nobody a second time', async () => {
      const { body } = await admin.post(`/api/readiness/events/${eventId}/assign`).expect(200);
      expect(body.data.created).toBe(0);
      expect(body.data.total).toBe(3);
      expect(body.data.notified).toBe(0);
      expect(await prisma.notification.count({ where: { dedupeKey: `readiness-assignment:${eventId}` } })).toBe(2);
    });

    it('shows a trainee what they have been asked to prepare', async () => {
      const { body } = await learner.get('/api/readiness/assignments/me').expect(200);
      expect(body.data.assignments).toHaveLength(2);
      expect(body.data.assignments[0].event.name).toBe('Cyclone Readiness Sprint');
    });

    it('records the assignment in the audit log', async () => {
      const entries = await prisma.auditLog.findMany({ where: { action: 'READINESS_PREPARATION_ASSIGNED' } });
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('changing and removing an event', () => {
    it('replaces the requirements wholesale', async () => {
      const { body } = await admin
        .put(`/api/readiness/events/${eventId}`)
        .send({
          name: 'Cyclone Readiness Sprint',
          startDate: inDays(120).toISOString(),
          endDate: inDays(180).toISOString(),
          hazardType: 'CYCLONE',
          priority: 5,
          isSimulation: true,
          departmentIds: [ids.department],
          requirements: [{ competencyId: ids.drm, requiredLevel: 70, importance: 4 }],
        })
        .expect(200);
      expect(body.data.event.requirements).toHaveLength(1);
      expect(body.data.event.requirements[0].competencyId).toBe(ids.drm);
    });

    it('deletes the event and its assignments together', async () => {
      await admin.delete(`/api/readiness/events/${eventId}`).expect(200);
      expect(await prisma.readinessAssignment.count({ where: { eventId } })).toBe(0);
      await admin.get(`/api/readiness/events/${eventId}`).expect(404);
    });
  });
});
