import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';
import { loginAs, type Agent } from '../helpers/http';
import { agents, answersFor, buildCourse, completeAllModules, type BuiltCourse } from '../helpers/scenario';

describe('assessments', () => {
  let trainer: Agent;
  let admin: Agent;
  let radarId: string;
  let roleId: string;
  let counter = 0;

  beforeAll(async () => {
    await resetDatabase();
    const world = await agents();
    trainer = world.trainerAgent;
    admin = world.adminAgent;
    radarId = world.radar.id;
    roleId = world.role.id;
  });

  /** A fresh trainee (Radar 35%) so tests never interfere with each other. */
  async function newTrainee(): Promise<{ agent: Agent; id: string }> {
    counter += 1;
    const user = await createUser({ email: `learner${counter}@imd.gov.in`, name: `Learner ${counter}`, jobRoleId: roleId });
    await prisma.employeeCompetency.create({ data: { userId: user.id, competencyId: radarId, currentLevel: 35 } });
    return { agent: await loginAs(user.email), id: user.id };
  }

  /** 4 questions x 2 marks = 8 marks. Wrong markers are (b1)..(b4). */
  const smallCourse = (overrides: Partial<Parameters<typeof buildCourse>[1]> = {}) =>
    buildCourse(trainer, { title: `Small course ${++counter}`, competencyId: radarId, levelFrom: 0, levelTo: 75, questions: 4, ...overrides });

  const enrollAndStudy = async (agent: Agent, built: BuiltCourse) => {
    await agent.post(`/api/courses/${built.courseId}/enroll`).expect(201);
    await completeAllModules(agent, built.courseId, built.moduleIds);
  };

  const attempt = async (agent: Agent, built: BuiltCourse, wrong: string[] = []) => {
    const started = await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201);
    return agent.post(`/api/assessments/${built.assessmentId}/submit`).send(answersFor(started.body.data, built, wrong));
  };

  describe('authoring', () => {
    let courseId: string;
    beforeAll(async () => {
      courseId = (
        await trainer
          .post('/api/courses')
          .send({ title: 'Authoring course', description: 'A course used to author assessments.', category: 'Radar', competencies: [{ competencyId: radarId, levelFrom: 0, levelTo: 60 }], modules: [{ title: 'M1' }] })
          .expect(201)
      ).body.data.id;
    });

    const q = (options: { text: string; isCorrect: boolean }[], type: 'SINGLE' | 'MULTIPLE' = 'SINGLE') => ({ text: 'What does reflectivity measure?', type, marks: 1, options });
    const two = (a: boolean, b: boolean) => [{ text: 'Echo strength', isCorrect: a }, { text: 'Wind speed', isCorrect: b }];

    it.each([
      ['no option marked correct', q(two(false, false))],
      ['two correct options in a single-answer question', q(two(true, true))],
      ['only one correct option in a multiple-answer question', q(two(true, false), 'MULTIPLE')],
      ['duplicate option texts', q([{ text: 'Same', isCorrect: true }, { text: 'same', isCorrect: false }])],
      ['fewer than two options', q([{ text: 'Only one', isCorrect: true }])],
    ])('rejects a question with %s', async (_label, question) => {
      const response = await trainer.post('/api/assessments').send({ courseId, title: 'Bad assessment', questions: [question] });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('cannot be published without questions, nor with more questions per attempt than the bank holds', async () => {
      const created = await trainer.post('/api/assessments').send({ courseId, title: 'Authoring assessment', questions: [q(two(true, false))] }).expect(201);
      const id = created.body.data.id;
      expect((await trainer.patch(`/api/assessments/${id}`).send({ questionsPerAttempt: 5 })).body.code).toBe('INVALID_QUESTIONS_PER_ATTEMPT');
      await trainer.delete(`/api/assessments/${id}/questions/${created.body.data.questions[0].id}`).expect(200);
      const empty = await trainer.patch(`/api/assessments/${id}`).send({ isPublished: true });
      expect(empty.status).toBe(422);
      expect(empty.body.code).toBe('ASSESSMENT_INCOMPLETE');
    });

    it('allows one assessment per course', async () => {
      const again = await trainer.post('/api/assessments').send({ courseId, title: 'Second assessment' });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ASSESSMENT_EXISTS');
    });

    it('adds questions one at a time or in bulk, reorders them, and defaults the pass mark from the course', async () => {
      const bulk = await trainer
        .post(`/api/assessments/${(await prisma.assessment.findFirstOrThrow({ where: { courseId } })).id}/questions`)
        .send({ questions: [q(two(true, false)), { ...q(two(false, true)), text: 'Which product shows motion?' }] })
        .expect(201);
      expect(bulk.body.data.questionCount).toBe(2);
      const ids = bulk.body.data.questions.map((x: { id: string }) => x.id) as string[];
      const reordered = await trainer.put(`/api/assessments/${bulk.body.data.id}/questions/order`).send({ questionIds: [...ids].reverse() }).expect(200);
      expect(reordered.body.data.questions.map((x: { id: string }) => x.id)).toEqual([...ids].reverse());
      expect(bulk.body.data.passingScore).toBe(70); // course default
    });

    it('hides the assessment from trainees who are not enrolled, and never lists questions to trainees', async () => {
      const built = await smallCourse();
      const outsider = await newTrainee();
      expect((await outsider.agent.get(`/api/assessments/${built.assessmentId}`)).status).toBe(404);
      await enrollAndStudy(outsider.agent, built);
      const meta = (await outsider.agent.get(`/api/assessments/${built.assessmentId}`).expect(200)).body.data;
      expect(meta).toMatchObject({ passingScore: 70, questionCount: 4, availability: { eligible: true, state: 'AVAILABLE', attemptsRemaining: 3 } });
      expect(meta.questions).toBeUndefined();
      const mine = (await outsider.agent.get('/api/assessments/me').expect(200)).body.data;
      expect(mine[0]).toMatchObject({ state: 'AVAILABLE', courseTitle: built.courseId ? expect.any(String) : '' });
    });
  });

  describe('attempts', () => {
    it('resumes an open attempt instead of creating a second one, with a stable question and option order', async () => {
      const built = await smallCourse();
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      const first = await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201);
      const second = await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(200);
      expect(second.body.data.resumed).toBe(true);
      expect(second.body.data.attempt.id).toBe(first.body.data.attempt.id);
      expect(second.body.data.questions).toEqual(first.body.data.questions);
      expect(await prisma.assessmentAttempt.count({ where: { assessmentId: built.assessmentId } })).toBe(1);
    });

    it('enforces the attempt limit (failed attempts count) and never changes competency for a failed attempt', async () => {
      const built = await smallCourse({ maxAttempts: 2 });
      const { agent, id } = await newTrainee();
      await enrollAndStudy(agent, built);

      const failed = await attempt(agent, built, ['(b1)', '(b2)']); // 4 of 8 marks = 50% < 70%
      expect(failed.status).toBe(200);
      expect(failed.body.data.attempt).toMatchObject({ percentage: 50, passed: false });
      expect(failed.body.data.competencyImpacts).toEqual([]);
      expect(failed.body.data.certificate).toBeNull();
      expect(failed.body.data.enrollment.status).toBe('ASSESSMENT_PENDING');
      expect(failed.body.data.assessment.attemptsRemaining).toBe(1);
      expect((await prisma.employeeCompetency.findUniqueOrThrow({ where: { userId_competencyId: { userId: id, competencyId: radarId } } })).currentLevel).toBe(35);

      await attempt(agent, built, ['(b1)', '(b2)', '(b3)']);
      const third = await agent.post(`/api/assessments/${built.assessmentId}/start`);
      expect(third.status).toBe(409);
      expect(third.body.code).toBe('NO_ATTEMPTS_LEFT');

      const list = (await agent.get('/api/assessments/me').expect(200)).body.data;
      expect(list[0]).toMatchObject({ state: 'NO_ATTEMPTS_LEFT', attemptsUsed: 2 });
      const notes = (await agent.get('/api/notifications?type=ASSESSMENT_RESULT').expect(200)).body.data;
      expect(notes.some((n: { message: string }) => /1 attempt left/.test(n.message))).toBe(true);
      expect(notes.some((n: { message: string }) => /no attempts left/.test(n.message))).toBe(true);
    });

    it('lets a learner fail first and then pass; the pass earns the competency update and certificate, then locks further attempts', async () => {
      const built = await smallCourse({ levelTo: 60 });
      const { agent, id } = await newTrainee();
      await enrollAndStudy(agent, built);
      await attempt(agent, built, ['(b1)', '(b2)', '(b3)', '(b4)']); // 0%

      const passed = await attempt(agent, built);
      expect(passed.body.data.attempt).toMatchObject({ attemptNumber: 2, percentage: 100, passed: true });
      // 0.25 × 35 + 0.75 × 100 = 83.75, but this course certifies up to 60, so the gain is capped there.
      expect(passed.body.data.competencyImpacts[0]).toMatchObject({ previousLevel: 35, newLevel: 60, limitedBy: 'course-ceiling' });
      expect(passed.body.data.certificate).toBeTruthy();
      expect(passed.body.data.enrollment.status).toBe('CERTIFIED');
      expect((await prisma.competencyHistory.findMany({ where: { userId: id } })).map((h) => h.newLevel)).toEqual([60]);

      const again = await agent.post(`/api/assessments/${built.assessmentId}/start`);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ALREADY_PASSED');
      const achievements = (await agent.get('/api/achievements/me').expect(200)).body.data.items.filter((a: { earned: boolean }) => a.earned).map((a: { code: string }) => a.code);
      expect(achievements).toEqual(expect.arrayContaining(['PERFECT_SCORE', 'HIGH_ACHIEVER', 'CERTIFIED']));
      expect(achievements).not.toContain('FIRST_TIME_PASS'); // passed on the second attempt
    });

    it('expires a timed attempt that is submitted after its time limit (server-side clock) and counts it as used', async () => {
      const built = await smallCourse({ timeLimitMinutes: 10, maxAttempts: 2 });
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      const started = await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201);
      expect(started.body.data.attempt.remainingSeconds).toBeGreaterThan(590);
      expect(started.body.data.attempt.remainingSeconds).toBeLessThanOrEqual(600);

      // The learner's browser cannot extend the deadline: the server moved it into the past.
      await prisma.assessmentAttempt.update({ where: { id: started.body.data.attempt.id }, data: { expiresAt: new Date(Date.now() - 5 * 60_000) } });
      const late = await agent.post(`/api/assessments/${built.assessmentId}/submit`).send(answersFor(started.body.data, built));
      expect(late.status).toBe(409);
      expect(late.body.code).toBe('ATTEMPT_EXPIRED');
      expect((await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: started.body.data.attempt.id } })).status).toBe('EXPIRED');

      const next = await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201);
      expect(next.body.data.attempt.attemptNumber).toBe(2);
      expect((await agent.post(`/api/assessments/${built.assessmentId}/submit`).send(answersFor(started.body.data, built))).status).toBe(409); // old attempt id
    });

    it('marks an abandoned timed attempt EXPIRED when the learner comes back later', async () => {
      const built = await smallCourse({ timeLimitMinutes: 5 });
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      const started = await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201);
      await prisma.assessmentAttempt.update({ where: { id: started.body.data.attempt.id }, data: { expiresAt: new Date(Date.now() - 10 * 60_000) } });
      const fresh = await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201);
      expect(fresh.body.data.resumed).toBe(false);
      expect((await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: started.body.data.attempt.id } })).status).toBe('EXPIRED');
    });

    it('refuses to start after the deadline', async () => {
      const built = await smallCourse({ deadline: new Date(Date.now() - 24 * 3600_000).toISOString() });
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      const response = await agent.post(`/api/assessments/${built.assessmentId}/start`);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('DEADLINE_PASSED');
      expect((await agent.get('/api/assessments/me').expect(200)).body.data[0].state).toBe('OVERDUE');
    });

    it('rejects tampered submissions and never double-scores an attempt', async () => {
      const built = await smallCourse();
      const other = await smallCourse();
      const { agent } = await newTrainee();
      const { agent: intruder } = await newTrainee();
      await enrollAndStudy(agent, built);
      const started = (await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201)).body.data;
      const [q1, q2] = started.questions as { id: string; options: { id: string }[] }[];
      const submit = (body: object) => agent.post(`/api/assessments/${built.assessmentId}/submit`).send(body);

      const foreignQuestion = await submit({ attemptId: started.attempt.id, answers: [{ questionId: other.questions[0]!.id, optionIds: [other.answerKey.get(other.questions[0]!.id)!] }] });
      expect(foreignQuestion.status).toBe(400);
      expect(foreignQuestion.body.code).toBe('INVALID_ANSWER');

      const foreignOption = await submit({ attemptId: started.attempt.id, answers: [{ questionId: q1!.id, optionIds: [other.answerKey.get(other.questions[0]!.id)!] }] });
      expect(foreignOption.body.code).toBe('INVALID_ANSWER');

      const twoOptions = await submit({ attemptId: started.attempt.id, answers: [{ questionId: q1!.id, optionIds: q1!.options.slice(0, 2).map((o) => o.id) }] });
      expect(twoOptions.body.code).toBe('INVALID_ANSWER');

      const duplicate = await submit({ attemptId: started.attempt.id, answers: [{ questionId: q2!.id, optionIds: [] }, { questionId: q2!.id, optionIds: [] }] });
      expect(duplicate.body.code).toBe('DUPLICATE_ANSWER');

      // Someone else cannot submit this attempt - and gets no confirmation that it exists (404, not 403).
      const stolen = await intruder.post(`/api/assessments/${built.assessmentId}/submit`).send(answersFor(started, built));
      expect(stolen.status).toBe(404);
      expect(stolen.body.code).toBe('ATTEMPT_NOT_FOUND');
      expect(await prisma.assessmentAttempt.findUniqueOrThrow({ where: { id: started.attempt.id } })).toMatchObject({ status: 'IN_PROGRESS' });

      const ok = await submit(answersFor(started, built));
      expect(ok.status).toBe(200);
      const twice = await submit(answersFor(started, built));
      expect(twice.status).toBe(409);
      expect(twice.body.code).toBe('ATTEMPT_ALREADY_SUBMITTED');
      expect(await prisma.certificate.count({ where: { attemptId: started.attempt.id } })).toBe(1);
      expect(await prisma.assessmentAnswer.count({ where: { attemptId: started.attempt.id } })).toBe(4);
    });

    it('scores each unanswered question as zero and accepts an empty submission', async () => {
      const built = await smallCourse();
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      const started = (await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201)).body.data;
      const result = await agent.post(`/api/assessments/${built.assessmentId}/submit`).send({ attemptId: started.attempt.id, answers: [] });
      expect(result.body.data.attempt).toMatchObject({ score: 0, percentage: 0, passed: false });
      expect(result.body.data.review.every((row: { answered: boolean }) => !row.answered)).toBe(true);
    });
  });

  describe('question types and delivery', () => {
    it('scores multiple-answer questions all-or-nothing', async () => {
      const course = (
        await trainer.post('/api/courses').send({ title: 'Multi answer', description: 'Multiple correct answers course.', category: 'Radar', competencies: [{ competencyId: radarId, levelFrom: 0, levelTo: 70 }], modules: [{ title: 'M1' }] }).expect(201)
      ).body.data;
      const assessment = (
        await trainer
          .post('/api/assessments')
          .send({
            courseId: course.id,
            title: 'Multi',
            isPublished: true,
            questions: [
              { text: 'Which are weather radar bands?', type: 'MULTIPLE', marks: 4, options: [{ text: 'S-band', isCorrect: true }, { text: 'C-band', isCorrect: true }, { text: 'X-band', isCorrect: false }, { text: 'Y-band', isCorrect: false }] },
              { text: 'What does dBZ express?', type: 'SINGLE', marks: 1, options: [{ text: 'Reflectivity', isCorrect: true }, { text: 'Velocity', isCorrect: false }] },
            ],
          })
          .expect(201)
      ).body.data;
      await trainer.patch(`/api/courses/${course.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
      const multi = assessment.questions[0];
      const correct = multi.options.filter((o: { isCorrect: boolean }) => o.isCorrect).map((o: { id: string }) => o.id);
      const learn = async (optionIds: string[]) => {
        const { agent } = await newTrainee();
        await agent.post(`/api/courses/${course.id}/enroll`).expect(201);
        await completeAllModules(agent, course.id, [course.modules[0].id]);
        const started = (await agent.post(`/api/assessments/${assessment.id}/start`).expect(201)).body.data;
        return (await agent.post(`/api/assessments/${assessment.id}/submit`).send({ attemptId: started.attempt.id, answers: [{ questionId: multi.id, optionIds }] })).body.data.attempt;
      };
      expect((await learn(correct)).score).toBe(4);
      expect((await learn([correct[0]])).score).toBe(0);
      expect((await learn([...correct, multi.options.find((o: { isCorrect: boolean }) => !o.isCorrect).id])).score).toBe(0);
    });

    it('draws a random subset from the question bank when questionsPerAttempt is set', async () => {
      const built = await smallCourse({ questions: 10 });
      await trainer.patch(`/api/assessments/${built.assessmentId}`).send({ questionsPerAttempt: 4 }).expect(200);
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      const started = (await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201)).body.data;
      expect(started.questions).toHaveLength(4);
      const drawnMarks = started.questions.reduce((sum: number, question: { marks: number }) => sum + question.marks, 0);
      const result = await agent.post(`/api/assessments/${built.assessmentId}/submit`).send(answersFor(started, built));
      expect(result.body.data.attempt).toMatchObject({ totalMarks: drawnMarks, percentage: 100 });
      expect(result.body.data.review).toHaveLength(4);
    });

    it('can hide correct answers from learners after submission (trainers always see them)', async () => {
      const built = await smallCourse();
      await trainer.patch(`/api/assessments/${built.assessmentId}`).send({ showCorrectAnswers: false }).expect(200);
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      const result = await attempt(agent, built, ['(b1)']);
      const row = result.body.data.review[0];
      expect(row.isCorrect).toBeUndefined();
      expect(row.explanation).toBeUndefined();
      expect(JSON.stringify(row.options)).not.toContain('isCorrect');
      expect(row.marksAwarded).toBeDefined();

      const detail = await trainer.get(`/api/assessments/attempts/${result.body.data.attempt.id}`).expect(200);
      expect(detail.body.data.review[0].options.some((o: { isCorrect?: boolean }) => o.isCorrect === true)).toBe(true);
    });

    it('never sends the answer key or explanations while an attempt is open', async () => {
      const built = await smallCourse();
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      const started = await agent.post(`/api/assessments/${built.assessmentId}/start`).expect(201);
      expect(JSON.stringify(started.body)).not.toMatch(/isCorrect|explanation|Because that is how/);
    });
  });

  describe('editing after learners have attempted', () => {
    let built: BuiltCourse;
    beforeAll(async () => {
      built = await smallCourse();
      const { agent } = await newTrainee();
      await enrollAndStudy(agent, built);
      await attempt(agent, built);
    });

    it('protects scored results: options, marks and question removal are locked, wording is not', async () => {
      const questionId = built.questions[0]!.id;
      const edit = await trainer.patch(`/api/assessments/${built.assessmentId}/questions/${questionId}`).send({ marks: 5 });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe('ASSESSMENT_HAS_ATTEMPTS');
      expect((await trainer.patch(`/api/assessments/${built.assessmentId}/questions/${questionId}`).send({ options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] })).status).toBe(409);
      expect((await trainer.delete(`/api/assessments/${built.assessmentId}/questions/${questionId}`)).status).toBe(409);
      expect((await trainer.delete(`/api/assessments/${built.assessmentId}`)).body.code).toBe('ASSESSMENT_HAS_ATTEMPTS');

      const typo = await trainer.patch(`/api/assessments/${built.assessmentId}/questions/${questionId}`).send({ text: 'Question 1, reworded for clarity' });
      expect(typo.status).toBe(200);
      expect((await trainer.post(`/api/assessments/${built.assessmentId}/questions`).send({ text: 'A brand new question?', options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] })).status).toBe(201);
    });

    it('audits pass-mark changes that happen after attempts exist', async () => {
      await trainer.patch(`/api/assessments/${built.assessmentId}`).send({ passingScore: 60 }).expect(200);
      const entry = await prisma.auditLog.findFirstOrThrow({ where: { entityId: built.assessmentId, action: 'ASSESSMENT_UPDATED' }, orderBy: { createdAt: 'desc' } });
      expect(entry.metadata).toMatchObject({ passMarkChangedAfterAttempts: true });
    });

    it('lets an administrator manage any trainer’s assessment', async () => {
      expect((await admin.get(`/api/assessments/${built.assessmentId}`)).status).toBe(200);
      expect((await admin.get(`/api/assessments/${built.assessmentId}/results`)).status).toBe(200);
    });
  });
});
