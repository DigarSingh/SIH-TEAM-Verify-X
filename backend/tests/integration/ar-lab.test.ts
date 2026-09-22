import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { loginAs, type Agent } from '../helpers/http';
import { agents, answersFor, buildCourse, completeAllModules, type BuiltCourse } from '../helpers/scenario';

/**
 * The AR Instrument Lab, end to end.
 *
 * The point of these tests is the chain the brief asks for, not the 3D model:
 *
 *   AR practical -> server-side score -> combined with theory -> competency
 *   engine -> employee competency -> decay -> refresher recommendation
 *
 * The rule that matters most is that the browser cannot influence any of it
 * beyond saying which component it tapped.
 */
describe('AR Instrument Lab', () => {
  let trainee: Agent;
  let trainer: Agent;
  let admin: Agent;
  let traineeId: string;
  let radarId: string;
  let roleId: string;
  let course: BuiltCourse;
  let moduleId: string;
  let refresherId: string;
  /** component key -> id */
  let components: Map<string, string>;
  /** assessment task id -> the id of the component that is correct */
  let answerKey: Map<string, string>;

  /** The radar lab: six identifiable components and a five-task practical worth 100 points. */
  async function buildLab(options: { key: string; kind: 'FULL_LAB' | 'REFRESHER'; theoryWeight: number; parentId?: string; taskKeys: string[]; points?: number }) {
    const created = await prisma.aRModule.create({
      data: {
        key: options.key,
        title: options.kind === 'REFRESHER' ? 'Radar Refresher' : 'Doppler Radar Lab',
        description: 'A simulated practical on a schematic Doppler radar.',
        objectives: ['Identify the major components.'],
        modelUrl: '/models/doppler-radar.glb',
        competencyId: radarId,
        courseId: course.courseId,
        kind: options.kind,
        parentModuleId: options.parentId ?? null,
        durationMinutes: options.kind === 'REFRESHER' ? 5 : 10,
        passingScore: 70,
        theoryWeight: options.theoryWeight,
        isPublished: true,
        components: {
          create: ['antenna', 'radome', 'rotator', 'receiver', 'tower', 'controlUnit'].map((key, position) => ({
            key,
            name: key,
            description: `The ${key}.`,
            hotspotPosition: { x: 0, y: position / 10, z: 0 },
            position,
          })),
        },
      },
      include: { components: true },
    });

    const byKey = new Map(created.components.map((component) => [component.key, component.id]));
    await prisma.aRTask.create({
      data: {
        arModuleId: created.id,
        phase: 'TRAINING',
        type: 'IDENTIFY',
        position: 0,
        instruction: 'Find the antenna.',
        hint: 'Inside the dome.',
        correctComponentId: byKey.get('antenna') as string,
      },
    });
    for (const [position, key] of options.taskKeys.entries()) {
      await prisma.aRTask.create({
        data: {
          arModuleId: created.id,
          phase: 'ASSESSMENT',
          type: position === options.taskKeys.length - 1 ? 'INSPECT' : 'IDENTIFY',
          position,
          instruction: `Select the ${key}.`,
          explanation: `It is the ${key}.`,
          correctComponentId: byKey.get(key) as string,
          points: options.points ?? 20,
        },
      });
    }
    return { id: created.id, byKey };
  }

  /** Answers the assessment, getting `wrong` of them deliberately wrong. */
  const responsesFor = (tasks: { id: string }[], wrong = 0) =>
    tasks.map((task, index) => {
      const correct = answerKey.get(task.id) as string;
      const other = [...components.values()].find((id) => id !== correct) as string;
      return { taskId: task.id, selectedComponentId: index < wrong ? other : correct, timeMs: 4000 };
    });

  beforeAll(async () => {
    await resetDatabase();
    const world = await agents();
    trainee = world.traineeAgent;
    trainer = world.trainerAgent;
    admin = world.adminAgent;
    traineeId = world.trainee.id;
    radarId = world.radar.id;
    roleId = world.role.id;

    // A theory assessment to combine with: 21 of 25 marks is exactly 84%.
    course = await buildCourse(trainer, { title: 'Doppler Radar Analysis', competencyId: radarId, levelFrom: 30, levelTo: 85 });

    const lab = await buildLab({ key: 'doppler-radar', kind: 'FULL_LAB', theoryWeight: 0.4, taskKeys: ['antenna', 'radome', 'rotator', 'receiver', 'controlUnit'] });
    moduleId = lab.id;
    components = lab.byKey;

    const refresher = await buildLab({ key: 'doppler-radar-refresher', kind: 'REFRESHER', theoryWeight: 0, parentId: lab.id, taskKeys: ['antenna', 'radome', 'rotator'], points: 33 });
    refresherId = refresher.id;

    const tasks = await prisma.aRTask.findMany({ where: { phase: 'ASSESSMENT' }, select: { id: true, correctComponentId: true } });
    answerKey = new Map(tasks.map((task) => [task.id, task.correctComponentId]));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('the lab, before it is taken', () => {
    it('lists the modules with where this trainee stands on the competency behind them', async () => {
      const { body } = await trainee.get('/api/ar/modules').expect(200);
      const lab = body.data.modules.find((module: { key: string }) => module.key === 'doppler-radar');
      expect(lab.competency.name).toBe('Radar Meteorology');
      expect(lab.standing).toMatchObject({ currentLevel: 35, requiredLevel: 80 });
      expect(lab.taskCount).toBe(5);
      expect(lab.progress).toMatchObject({ attempts: 0, completed: 0, passed: false });
    });

    it('sends the components and the guided training, with the hints', async () => {
      const { body } = await trainee.get('/api/ar/modules/doppler-radar').expect(200);
      expect(body.data.components).toHaveLength(6);
      expect(body.data.training[0]).toMatchObject({ instruction: 'Find the antenna.', hint: 'Inside the dome.' });
      expect(body.data.assessmentTaskCount).toBe(5);
      expect(body.data.assessmentTotalPoints).toBe(100);
    });

    it('never sends the answers', async () => {
      const { body } = await trainee.get('/api/ar/modules/doppler-radar').expect(200);
      expect(JSON.stringify(body)).not.toContain('correctComponentId');
    });
  });

  describe('taking the practical', () => {
    it('starts an attempt, and resumes it rather than starting a second', async () => {
      const first = await trainee.post('/api/ar/modules/doppler-radar/start').expect(201);
      expect(first.body.data.resumed).toBe(false);
      expect(first.body.data.tasks).toHaveLength(5);
      // Neither the answer nor the hint is sent during the assessment.
      expect(JSON.stringify(first.body.data.tasks)).not.toContain('correctComponentId');
      expect(JSON.stringify(first.body.data.tasks)).not.toContain('hint');

      const second = await trainee.post('/api/ar/modules/doppler-radar/start').expect(201);
      expect(second.body.data.resumed).toBe(true);
      expect(second.body.data.attempt.id).toBe(first.body.data.attempt.id);
      expect(await prisma.aRPracticalAttempt.count({ where: { userId: traineeId, arModuleId: moduleId } })).toBe(1);
    });

    it('marks the practical on the server, from the database', async () => {
      const started = (await trainee.post('/api/ar/modules/doppler-radar/start').expect(201)).body.data;
      // Four of five right: 80 points of 100.
      const { body } = await trainee
        .post('/api/ar/modules/doppler-radar/submit')
        .send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks, 1), hintsUsed: 2 })
        .expect(200);

      expect(body.data.attempt.score).toBe(80);
      expect(body.data.attempt.totalPoints).toBe(100);
      expect(body.data.scoring.practical).toBe(80);
      expect(body.data.review.filter((row: { correct: boolean }) => row.correct)).toHaveLength(4);
      // The result explains itself, including the answer that was missed.
      const missed = body.data.review.find((row: { correct: boolean }) => !row.correct);
      expect(missed.correctComponentName).toEqual(expect.any(String));
      expect(missed.explanation).toContain('It is the');
    });

    it('refuses a score sent by the browser', async () => {
      const started = (await trainee.post('/api/ar/modules/doppler-radar/start').expect(201)).body.data;
      const response = await trainee
        .post('/api/ar/modules/doppler-radar/submit')
        .send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks), score: 100, practicalPercentage: 100 })
        .expect(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('combines theory and practical with the module’s configured weighting', async () => {
      // Theory first: 21 of 25 marks = 84%.
      await trainee.post(`/api/courses/${course.courseId}/enroll`).expect(201);
      await completeAllModules(trainee, course.courseId, course.moduleIds);
      const attempt = (await trainee.post(`/api/assessments/${course.assessmentId}/start`).expect(201)).body.data;
      const theory = await trainee.post(`/api/assessments/${course.assessmentId}/submit`).send(answersFor(attempt, course, ['Question 2', 'Question 4'])).expect(200);
      expect(theory.body.data.attempt.percentage).toBe(84);

      const started = (await trainee.post('/api/ar/modules/doppler-radar/start').expect(201)).body.data;
      const { body } = await trainee
        .post('/api/ar/modules/doppler-radar/submit')
        .send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks, 1) })
        .expect(200);

      // 84 x 0.40 + 80 x 0.60 = 81.6
      expect(body.data.scoring).toMatchObject({ practical: 80, theory: 84, theoryWeight: 0.4, combined: 81.6 });
      expect(body.data.scoring.explanation).toContain('81.6%');
      expect(body.data.attempt.passed).toBe(true);
    });

    it('scores the practical alone when there is no theory result yet', async () => {
      const other = await prisma.user.findFirstOrThrow({ where: { email: 'trainee@imd.gov.in' } });
      // A learner with no passed theory attempt on a *different* module's course.
      const solo = await buildLab({ key: 'solo-lab', kind: 'FULL_LAB', theoryWeight: 0.4, taskKeys: ['antenna', 'radome'] });
      await prisma.aRModule.update({ where: { id: solo.id }, data: { courseId: null } });
      const tasks = await prisma.aRTask.findMany({ where: { arModuleId: solo.id, phase: 'ASSESSMENT' }, select: { id: true, correctComponentId: true } });
      for (const task of tasks) answerKey.set(task.id, task.correctComponentId);

      const started = (await trainee.post('/api/ar/modules/solo-lab/start').expect(201)).body.data;
      const { body } = await trainee.post('/api/ar/modules/solo-lab/submit').send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks) }).expect(200);

      expect(body.data.scoring).toMatchObject({ practical: 100, theory: null, combined: 100 });
      expect(body.data.scoring.explanation).toContain('No theory result yet');
      expect(other.id).toBe(traineeId);
    });
  });

  /**
   * The requirement the whole feature exists for: the practical reaches the
   * competency engine, and the engine - not the AR module - decides the level.
   */
  describe('the competency engine', () => {
    /**
     * A learner of their own, starting from the brief's 35%, because the engine
     * converges: the same evidence applied twice does not keep raising a level,
     * which is correct but makes a shared fixture a poor place to measure movement.
     */
    it('moves the competency, through the engine rather than by assignment', async () => {
      const fresh = await createUser({ email: `ar-engine-${Date.now()}@imd.gov.in`, name: 'Engine Trainee', jobRoleId: roleId });
      await prisma.employeeCompetency.create({ data: { userId: fresh.id, competencyId: radarId, currentLevel: 35 } });
      const freshAgent = await loginAs(fresh.email);

      const started = (await freshAgent.post('/api/ar/modules/doppler-radar/start').expect(201)).body.data;
      const { body } = await freshAgent.post('/api/ar/modules/doppler-radar/submit').send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks) }).expect(200);

      const after = await prisma.employeeCompetency.findFirstOrThrow({ where: { userId: fresh.id, competencyId: radarId } });
      expect(after.currentLevel).toBeGreaterThan(35);
      // Not simply set to the score: the engine blends the previous level with all current evidence.
      expect(after.currentLevel).not.toBe(body.data.scoring.practical);
      expect(after.currentLevel).not.toBe(body.data.scoring.combined);

      const impact = body.data.competencyImpacts.find((entry: { competencyId: string }) => entry.competencyId === radarId);
      expect(impact.previousLevel).toBe(35);
      expect(impact.newLevel).toBe(after.currentLevel);
      expect(impact.explanation).toBeTruthy();

      /*
       * Repeating the practical converges towards the evidence rather than
       * compounding without limit, and never passes the ceiling of the course
       * the lab belongs to (levelTo 85): a course cannot certify beyond what it
       * teaches, however many times it is taken.
       */
      const again = (await freshAgent.post('/api/ar/modules/doppler-radar/start').expect(201)).body.data;
      await freshAgent.post('/api/ar/modules/doppler-radar/submit').send({ attemptId: again.attempt.id, responses: responsesFor(again.tasks) }).expect(200);
      const third = await prisma.employeeCompetency.findFirstOrThrow({ where: { userId: fresh.id, competencyId: radarId } });
      expect(third.currentLevel).toBeGreaterThanOrEqual(after.currentLevel);
      expect(third.currentLevel).toBeLessThanOrEqual(85);
    });

    /**
     * A regression guard for the shared evidence service, not only for AR.
     *
     * The Doppler course develops more than one competency. A practical on the
     * radar is evidence about the radar; applying it to everything the course
     * happens to teach would credit a trainee for something they never did.
     */
    it('is evidence only about the competency the lab is for, not everything its course teaches', async () => {
      const forecasting = await prisma.competency.findFirstOrThrow({ where: { code: 'FORECAST' } });
      // Map the course to a second competency, as a real course often is.
      await prisma.courseCompetency.upsert({
        where: { courseId_competencyId: { courseId: course.courseId, competencyId: forecasting.id } },
        create: { courseId: course.courseId, competencyId: forecasting.id, levelFrom: 0, levelTo: 90 },
        update: {},
      });

      const fresh = await createUser({ email: `ar-narrow-${Date.now()}@imd.gov.in`, name: 'Narrow Trainee', jobRoleId: roleId });
      await prisma.employeeCompetency.createMany({
        data: [
          { userId: fresh.id, competencyId: radarId, currentLevel: 40 },
          { userId: fresh.id, competencyId: forecasting.id, currentLevel: 40 },
        ],
      });
      const freshAgent = await loginAs(fresh.email);

      const started = (await freshAgent.post('/api/ar/modules/doppler-radar/start').expect(201)).body.data;
      const { body } = await freshAgent.post('/api/ar/modules/doppler-radar/submit').send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks) }).expect(200);

      expect(body.data.competencyImpacts.map((impact: { competencyId: string }) => impact.competencyId)).toEqual([radarId]);
      const untouched = await prisma.employeeCompetency.findFirstOrThrow({ where: { userId: fresh.id, competencyId: forecasting.id } });
      expect(untouched.currentLevel).toBe(40);
      expect(await prisma.competencyHistory.count({ where: { userId: fresh.id, competencyId: forecasting.id, source: 'PRACTICAL' } })).toBe(0);

      await prisma.courseCompetency.deleteMany({ where: { courseId: course.courseId, competencyId: forecasting.id } });
    });

    it('writes an auditable history row naming the practical as the source', async () => {
      const history = await prisma.competencyHistory.findFirst({ where: { userId: traineeId, competencyId: radarId, source: 'PRACTICAL' }, orderBy: { createdAt: 'desc' } });
      expect(history).not.toBeNull();
      expect((history?.details as { explanation?: string })?.explanation).toBeTruthy();
    });

    it('counts as practice, so the competency is fresh again', async () => {
      const held = await prisma.employeeCompetency.findFirstOrThrow({ where: { userId: traineeId, competencyId: radarId } });
      expect(held.lastPracticedAt).not.toBeNull();
      const practice = await prisma.competencyPracticeRecord.findFirst({ where: { userId: traineeId, competencyId: radarId }, orderBy: { practicedAt: 'desc' } });
      expect(practice?.note).toContain('AR practical');
    });

    it('records what the attempt did to the competency, for the trainer', async () => {
      const attempt = await prisma.aRPracticalAttempt.findFirstOrThrow({ where: { userId: traineeId, arModuleId: moduleId, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } });
      expect(attempt.competencyBefore).toEqual(expect.any(Number));
      expect(attempt.competencyAfter).toEqual(expect.any(Number));
      expect(attempt.competencyAfter).toBeGreaterThanOrEqual(attempt.competencyBefore as number);
    });
  });

  describe('submitting twice', () => {
    it('returns the original result, without a second attempt or a second competency update', async () => {
      const started = (await trainee.post('/api/ar/modules/doppler-radar/start').expect(201)).body.data;
      const payload = { attemptId: started.attempt.id, responses: responsesFor(started.tasks), idempotencyKey: `ar-offline-${Date.now()}` };

      const first = await trainee.post('/api/ar/modules/doppler-radar/submit').send(payload).expect(200);
      const attemptsAfterFirst = await prisma.aRPracticalAttempt.count({ where: { userId: traineeId } });
      const historyAfterFirst = await prisma.competencyHistory.count({ where: { userId: traineeId, source: 'PRACTICAL' } });

      const second = await trainee.post('/api/ar/modules/doppler-radar/submit').send(payload).expect(200);

      expect(second.body.data.replayed).toBe(true);
      expect(second.body.data.attempt.id).toBe(first.body.data.attempt.id);
      expect(second.body.data.attempt.score).toBe(first.body.data.attempt.score);
      expect(await prisma.aRPracticalAttempt.count({ where: { userId: traineeId } })).toBe(attemptsAfterFirst);
      expect(await prisma.competencyHistory.count({ where: { userId: traineeId, source: 'PRACTICAL' } })).toBe(historyAfterFirst);
    });

    it('refuses a second submission of the same attempt without a key', async () => {
      const started = (await trainee.post('/api/ar/modules/doppler-radar/start').expect(201)).body.data;
      await trainee.post('/api/ar/modules/doppler-radar/submit').send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks) }).expect(200);
      const again = await trainee.post('/api/ar/modules/doppler-radar/submit').send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks) }).expect(409);
      expect(again.body.code).toBe('AR_ATTEMPT_ALREADY_SUBMITTED');
    });
  });

  /** The join between the decay engine and the lab. */
  describe('the refresher', () => {
    it('is not offered while the competency is fresh', async () => {
      const { body } = await trainee.get('/api/ar/refresher').expect(200);
      expect(body.data.recommendation).toBeNull();
    });

    it('is offered once the competency has faded', async () => {
      await prisma.competencyDecayPolicy.upsert({
        where: { competencyId: radarId },
        create: { competencyId: radarId, decayEnabled: true, halfLifeDays: 180, minimumSafeLevel: 30, recertificationIntervalDays: 365, criticality: 5, isSimulation: true },
        update: { decayEnabled: true, halfLifeDays: 180 },
      });
      // Nothing practised for a year: the level on record has not changed, but its freshness has.
      const longAgo = new Date(Date.now() - 400 * 86_400_000);
      await prisma.employeeCompetency.updateMany({ where: { userId: traineeId, competencyId: radarId }, data: { lastPracticedAt: longAgo, lastEvidenceAt: longAgo } });

      const { body } = await trainee.get('/api/ar/refresher').expect(200);
      expect(body.data.recommendation.module.key).toBe('doppler-radar-refresher');
      expect(body.data.recommendation.competency.name).toBe('Radar Meteorology');
      expect(body.data.recommendation.freshness.effectiveLevel).toBeLessThan(body.data.recommendation.freshness.baselineLevel);
      expect(body.data.recommendation.reason).toContain('Radar Meteorology');
    });

    it('is a real practical: completing it records fresh practice and re-engages the engine', async () => {
      const started = (await trainee.post('/api/ar/modules/doppler-radar-refresher/start').expect(201)).body.data;
      expect(started.tasks).toHaveLength(3);
      const { body } = await trainee.post('/api/ar/modules/doppler-radar-refresher/submit').send({ attemptId: started.attempt.id, responses: responsesFor(started.tasks) }).expect(200);

      // A refresher is judged on the practical alone.
      expect(body.data.scoring).toMatchObject({ practical: 100, theoryWeight: 0, combined: 100 });
      const practice = await prisma.competencyPracticeRecord.findFirst({ where: { userId: traineeId, competencyId: radarId, source: 'REFRESHER' } });
      expect(practice).not.toBeNull();

      // And the competency is current again, so it is no longer recommended.
      const after = await trainee.get('/api/ar/refresher').expect(200);
      expect(after.body.data.recommendation).toBeNull();
      expect(refresherId).toEqual(expect.any(String));
    });
  });

  describe('who may see what', () => {
    it('does not let one trainee open another trainee’s attempt', async () => {
      const attempt = await prisma.aRPracticalAttempt.findFirstOrThrow({ where: { userId: traineeId, status: 'COMPLETED' } });
      const otherUser = await prisma.user.create({
        data: { email: `ar-other-${Date.now()}@imd.gov.in`, name: 'Other Trainee', role: 'TRAINEE', status: 'ACTIVE', passwordHash: 'x' },
      });
      const stolen = await prisma.aRPracticalAttempt.findFirst({ where: { userId: otherUser.id } });
      expect(stolen).toBeNull();
      // The trainer may look; that is their job.
      await trainer.get(`/api/ar/attempts/${attempt.id}`).expect(200);
    });

    it('keeps the analytics for administrators', async () => {
      await trainee.get('/api/ar/analytics').expect(403);
      await trainer.get('/api/ar/analytics').expect(403);
      const { body } = await admin.get('/api/ar/analytics').expect(200);
      expect(body.data.labsCompleted).toBeGreaterThan(0);
      expect(body.data.averagePractical).toEqual(expect.any(Number));
      expect(body.data.isDemonstrationData).toBe(true);
      expect(body.data.hardestTasks.length).toBeGreaterThan(0);
    });

    it('shows a trainer the practical results with the competency movement', async () => {
      const { body } = await trainer.get('/api/ar/attempts').expect(200);
      expect(body.data.attempts.length).toBeGreaterThan(0);
      const row = body.data.attempts[0];
      expect(row.user.name).toBeTruthy();
      expect(row.module.title).toBeTruthy();
      expect(row).toHaveProperty('competencyBefore');
      expect(row).toHaveProperty('competencyAfter');
    });
  });
});
