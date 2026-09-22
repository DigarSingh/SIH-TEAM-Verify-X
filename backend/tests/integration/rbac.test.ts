import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createTrainer, createUser } from '../helpers/factories';
import { anonymous as newAnonymous, app, loginAs, type Agent } from '../helpers/http';
import { agents, buildCourse, takeAssessment, type BuiltCourse } from '../helpers/scenario';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface Endpoint {
  method: Method;
  path: string;
  body?: Record<string, unknown>;
}

/**
 * Role-based access control is enforced on the server: a signed-in trainee who
 * simply types an admin URL (or calls the admin API directly) must be refused.
 */
describe('RBAC', () => {
  let anonymous: Agent;
  const sessions = {} as Record<'TRAINEE' | 'TRAINER' | 'ADMIN', Agent>;
  let ids: { victim: string; user: string; course: string; assessment: string; competency: string; role: string; department: string; certificate: string; announcement: string; module: string };
  let course: BuiltCourse;
  let otherTrainer: Agent;

  beforeAll(async () => {
    await resetDatabase();
    const world = await agents();
    sessions.TRAINEE = world.traineeAgent;
    sessions.TRAINER = world.trainerAgent;
    sessions.ADMIN = world.adminAgent;
    anonymous = newAnonymous();

    course = await buildCourse(world.trainerAgent, { title: 'Radar Fundamentals', competencyId: world.radar.id, levelFrom: 0, levelTo: 75 });
    const result = await takeAssessment(world.traineeAgent, course);
    expect(result.status).toBe(200);
    const certificate = await prisma.certificate.findFirstOrThrow();
    const announcement = await world.adminAgent.post('/api/admin/announcements').send({ title: 'Maintenance window', body: 'Portal maintenance on Sunday.' }).expect(201);
    // Destructive admin calls (password reset, suspension) target a throwaway user so they never
    // revoke the sessions the other tests in this file rely on.
    const victim = await createUser({ email: 'victim@imd.gov.in', name: 'Throwaway User' });
    ids = {
      victim: victim.id,
      user: world.trainee.id,
      course: course.courseId,
      assessment: course.assessmentId,
      competency: world.radar.id,
      role: world.role.id,
      department: world.department.id,
      certificate: certificate.id,
      announcement: announcement.body.data.announcement.id,
      module: course.moduleIds[0]!,
    };
    const trainerB = await createTrainer({ email: 'other.trainer@imd.gov.in', name: 'Other Trainer' });
    otherTrainer = await loginAs(trainerB.email);
  });

  /** Endpoints and the roles allowed to use them; every other role must get 403, anonymous 401. */
  const matrix = (): { allowed: ('TRAINEE' | 'TRAINER' | 'ADMIN')[]; endpoint: Endpoint }[] => [
    // ---- administration --------------------------------------------------------------------------------
    ...(
      [
        { method: 'get', path: '/api/admin/analytics' },
        { method: 'get', path: '/api/admin/heatmap' },
        { method: 'get', path: '/api/admin/heatmap/cell', query: `?competencyId=${ids.competency}` },
        { method: 'get', path: '/api/admin/training-needs' },
        { method: 'get', path: `/api/admin/training-needs/${ids.competency}` },
        { method: 'get', path: '/api/admin/skill-gaps' },
        { method: 'get', path: '/api/admin/audit-logs' },
        { method: 'get', path: '/api/admin/announcements' },
        { method: 'post', path: '/api/admin/announcements', body: { title: 'Hello', body: 'World message' } },
        { method: 'patch', path: `/api/admin/announcements/${ids.announcement}`, body: { title: 'Updated title' } },
        { method: 'post', path: '/api/admin/jobs/reminders' },
        { method: 'get', path: '/api/users' },
        { method: 'get', path: `/api/users/${ids.user}` },
        { method: 'post', path: '/api/users', body: { name: 'Nobody', email: 'nobody@imd.gov.in' } },
        { method: 'patch', path: `/api/users/${ids.user}`, body: { designation: 'Scientist' } },
        { method: 'patch', path: `/api/users/${ids.victim}/role`, body: { role: 'TRAINEE' } },
        { method: 'patch', path: `/api/users/${ids.victim}/status`, body: { status: 'ACTIVE' } },
        { method: 'post', path: `/api/users/${ids.victim}/reset-password` },
        { method: 'put', path: `/api/users/${ids.user}/competencies/${ids.competency}`, body: { level: 40, reason: 'Baseline' } },
        { method: 'post', path: '/api/departments', body: { name: 'Marine Met', code: 'MARINE' } },
        { method: 'patch', path: `/api/departments/${ids.department}`, body: { description: 'x' } },
        { method: 'post', path: '/api/roles', body: { name: 'Analyst', code: 'ANALYST' } },
        { method: 'put', path: `/api/roles/${ids.role}/competencies/${ids.competency}`, body: { requiredLevel: 80, importance: 4 } },
        { method: 'post', path: '/api/competencies', body: { name: 'Marine Weather', description: 'Forecasting over the seas', category: 'Core' } },
        { method: 'patch', path: `/api/competencies/${ids.competency}`, body: { category: 'Core Operations' } },
        { method: 'put', path: '/api/competencies/engine/config', body: {} },
        { method: 'post', path: '/api/competencies/engine/config/reset' },
        { method: 'get', path: '/api/certificates' },
        { method: 'post', path: `/api/certificates/${ids.certificate}/revoke`, body: { reason: 'Issued in error' } },
      ] as (Endpoint & { query?: string })[]
    ).map((endpoint) => ({ allowed: ['ADMIN' as const], endpoint: { ...endpoint, path: endpoint.path + (endpoint.query ?? '') } })),

    // ---- trainer or admin --------------------------------------------------------------------------------
    ...(
      [
        { method: 'post', path: '/api/courses', body: { title: 'RBAC course', description: 'A course created to test access', category: 'Test' } },
        { method: 'get', path: '/api/assessments' },
        { method: 'get', path: `/api/courses/${ids.course}/trainees` },
        { method: 'get', path: `/api/courses/${ids.course}/analytics` },
        { method: 'get', path: '/api/dashboard/trainer' },
        { method: 'get', path: '/api/evaluations' },
        { method: 'post', path: '/api/evaluations', body: {} },
        { method: 'post', path: '/api/competencies/engine/simulate', body: { requiredLevel: 80, currentLevel: 35, assessmentScore: 84 } },
      ] as Endpoint[]
    ).map((endpoint) => ({ allowed: ['TRAINER' as const, 'ADMIN' as const], endpoint })),

    // ---- trainee only ----------------------------------------------------------------------------------------
    ...(
      [
        { method: 'get', path: '/api/enrollments/me' },
        { method: 'get', path: '/api/assessments/me' },
        { method: 'get', path: '/api/dashboard/trainee' },
        { method: 'post', path: `/api/assessments/${ids.assessment}/start` },
        { method: 'post', path: `/api/courses/${ids.course}/feedback`, body: { rating: 5 } },
      ] as Endpoint[]
    ).map((endpoint) => ({ allowed: ['TRAINEE' as const], endpoint })),
  ];

  const send = (agent: Agent | undefined, endpoint: Endpoint) => {
    const target = agent ?? anonymous;
    const call = target[endpoint.method](endpoint.path);
    return endpoint.body ? call.send(endpoint.body) : call;
  };

  it('refuses anonymous access to every protected endpoint with 401', async () => {
    for (const { endpoint } of matrix()) {
      const response = await send(undefined, endpoint);
      expect(response.status, `${endpoint.method.toUpperCase()} ${endpoint.path}`).toBe(401);
      expect(response.body.success).toBe(false);
    }
  });

  it('refuses every role that is not allowed with 403 (a trainee cannot use admin APIs by knowing the URL)', async () => {
    for (const { allowed, endpoint } of matrix()) {
      for (const role of ['TRAINEE', 'TRAINER', 'ADMIN'] as const) {
        if (allowed.includes(role)) continue;
        const response = await send(sessions[role], endpoint);
        expect(response.status, `${role} → ${endpoint.method.toUpperCase()} ${endpoint.path}`).toBe(403);
        expect(response.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
      }
    }
  });

  it('lets each allowed role through the role check (the response is not 401/403)', async () => {
    for (const { allowed, endpoint } of matrix()) {
      for (const role of allowed) {
        const response = await send(sessions[role], endpoint);
        expect([401, 403], `${role} → ${endpoint.method.toUpperCase()} ${endpoint.path} → ${response.status} ${JSON.stringify(response.body)}`).not.toContain(response.status);
      }
    }
  });

  it('a trainer cannot use admin-only functions even for their own data', async () => {
    const analytics = await sessions.TRAINER.get('/api/admin/analytics');
    expect(analytics.status).toBe(403);
    const promote = await sessions.TRAINER.patch(`/api/users/${ids.user}/role`).send({ role: 'ADMIN' });
    expect(promote.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.user } })).role).toBe('TRAINEE');
  });

  it('a trainee cannot promote themself: role is not an editable profile field', async () => {
    const response = await sessions.TRAINEE.patch('/api/users/me').send({ role: 'ADMIN' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.user } })).role).toBe('TRAINEE');
  });

  describe('ownership rules', () => {
    it("a trainer cannot change another trainer's course, assessment or modules", async () => {
      const edit = await otherTrainer.patch(`/api/courses/${ids.course}`).send({ title: 'Hijacked title' });
      expect(edit.status).toBe(403);
      expect(edit.body.code).toBe('NOT_COURSE_OWNER');
      expect((await otherTrainer.post(`/api/courses/${ids.course}/modules`).send({ title: 'Injected module' })).status).toBe(403);
      expect((await otherTrainer.patch(`/api/assessments/${ids.assessment}`).send({ isPublished: false })).status).toBe(403);
      expect((await otherTrainer.get(`/api/assessments/${ids.assessment}`)).status).toBe(403);
      expect((await otherTrainer.get(`/api/courses/${ids.course}/trainees`)).status).toBe(403);
      expect((await otherTrainer.get(`/api/assessments/${ids.assessment}/results`)).status).toBe(403);
      expect((await prisma.course.findUniqueOrThrow({ where: { id: ids.course } })).title).toBe('Radar Fundamentals');
    });

    it("a trainer can only view (or evaluate) trainees enrolled in their own courses", async () => {
      expect((await otherTrainer.get(`/api/users/${ids.user}/passport`)).status).toBe(403);
      expect((await otherTrainer.get(`/api/skill-gaps/users/${ids.user}`)).status).toBe(403);
      expect((await sessions.TRAINER.get(`/api/users/${ids.user}/passport`)).status).toBe(200);
      const evaluation = await otherTrainer.post('/api/evaluations').send({
        traineeId: ids.user,
        competencyId: ids.competency,
        technicalKnowledge: 3,
        practicalAbility: 3,
        participation: 3,
        applicationOfKnowledge: 3,
        overallCompetency: 3,
      });
      expect(evaluation.status).toBe(403);
    });

    it("a trainee cannot read another learner's attempt, certificate or notifications", async () => {
      const attempt = await prisma.assessmentAttempt.findFirstOrThrow();
      const other = await agentForNewTrainee();
      expect((await other.get(`/api/assessments/attempts/${attempt.id}`)).status).toBe(403);
      expect((await other.get(`/api/certificates/${ids.certificate}/pdf`)).status).toBe(403);
      expect((await other.get(`/api/certificates/${ids.certificate}/qr`)).status).toBe(403);
      expect((await other.get('/api/notifications')).body.data).toEqual([]);
      const foreignNotification = await prisma.notification.findFirstOrThrow({ where: { userId: ids.user } });
      expect((await other.patch(`/api/notifications/${foreignNotification.id}/read`)).status).toBe(404);
      expect((await other.get(`/api/users/${ids.user}/passport`)).status).toBe(403);
    });

    it('a trainee cannot see draft courses or unpublished assessments', async () => {
      const draft = await sessions.TRAINER.post('/api/courses').send({ title: 'Secret draft', description: 'Not ready for learners yet', category: 'Radar' }).expect(201);
      const other = await agentForNewTrainee();
      expect((await other.get(`/api/courses/${draft.body.data.id}`)).status).toBe(404);
      expect((await other.post(`/api/courses/${draft.body.data.id}/enroll`)).status).toBe(404);
      const listed = await other.get('/api/courses?pageSize=100').expect(200);
      expect(listed.body.data.map((c: { title: string }) => c.title)).not.toContain('Secret draft');
    });

    it('course materials are downloadable only by enrolled trainees, the course trainer and admins', async () => {
      const upload = await sessions.TRAINER
        .post(`/api/courses/${ids.course}/modules/${ids.module}/materials`)
        .field('title', 'Radar handbook')
        .field('type', 'DOCUMENT')
        .attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'), 'handbook.pdf');
      expect(upload.status, JSON.stringify(upload.body)).toBe(201);
      const url = upload.body.data.downloadUrl as string;

      expect((await sessions.TRAINEE.get(url)).status).toBe(200); // enrolled
      expect((await sessions.TRAINER.get(url)).status).toBe(200); // owner
      expect((await sessions.ADMIN.get(url)).status).toBe(200);
      expect((await (await agentForNewTrainee()).get(url)).status).toBe(403); // not enrolled
      expect((await otherTrainer.get(url)).status).toBe(403); // someone else's course
      expect((await request(app).get(url)).status).toBe(401);
    });
  });

  it('an inactive or suspended user loses access immediately', async () => {
    const agent = await agentForNewTrainee();
    await agent.get('/api/enrollments/me').expect(200);
    await prisma.user.updateMany({ where: { email: { startsWith: 'fresh.trainee' } }, data: { status: 'SUSPENDED' } });
    expect((await agent.get('/api/enrollments/me')).status).toBe(401);
  });

  let counter = 0;
  async function agentForNewTrainee(): Promise<Agent> {
    counter += 1;
    const user = await createUser({ email: `fresh.trainee${counter}@imd.gov.in` });
    return loginAs(user.email);
  }
});
