import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { type Agent } from '../helpers/http';
import { agents, answersFor, buildCourse, completeAllModules, type BuiltCourse } from '../helpers/scenario';

/**
 * Scenario-based practical assessment and idempotent submission.
 *
 * Each group gets its own course: once a trainee passes an assessment they
 * cannot start another attempt, which is correct behaviour and would otherwise
 * make the later groups untestable.
 *
 * The scenario is worth 10 marks over two steps. With MCQ 60 / practical 40, a
 * trainee answering every question correctly and making one best (4/4) and one
 * partial (1.5/6) decision scores 100 x 0.6 + 55 x 0.4 = 82%.
 */
describe('practical assessment', () => {
  let trainee: Agent;
  let trainer: Agent;
  let radarId: string;

  interface Scenario {
    id: string;
    steps: { id: string; options: { id: string; credit: number }[] }[];
  }
  interface Prepared {
    course: BuiltCourse;
    scenario: Scenario;
  }

  /** A course whose assessment has one two-step cyclone scenario, weighted 60/40. */
  async function prepare(title: string, mcqWeight = 0.6): Promise<Prepared> {
    const course = await buildCourse(trainer, { title, competencyId: radarId, levelFrom: 0, levelTo: 80 });
    const scenario = await prisma.practicalScenario.create({
      data: {
        assessmentId: course.assessmentId,
        title: 'Rapid intensification off the east coast',
        briefing:
          'A simulated exercise. Radar and satellite show a tropical system deepening 180 km offshore, with the eye becoming better defined over three hours. This is a training scenario, not an operational procedure.',
        marks: 10,
        position: 1,
        steps: {
          create: [
            {
              type: 'INTERPRET',
              prompt: 'What does the improving eye definition most likely indicate?',
              marks: 4,
              position: 1,
              explanation: 'A clearing, better-defined eye is a classic signature of intensification.',
              options: {
                create: [
                  { text: 'The system is intensifying', credit: 1, position: 1, rationale: 'The best reading of the evidence.' },
                  { text: 'The system is steady but better sampled', credit: 0.5, position: 2, rationale: 'Defensible: sampling does change with range.' },
                  { text: 'The system is weakening', credit: 0, position: 3, rationale: 'Not supported by the evidence.' },
                ],
              },
            },
            {
              type: 'ACTION',
              prompt: 'What should the forecaster prioritise?',
              marks: 6,
              position: 2,
              options: {
                create: [
                  { text: 'Update the warning and brief the disaster manager', credit: 1, position: 1 },
                  { text: 'Wait for the next satellite pass before acting', credit: 0.25, position: 2 },
                  { text: 'Take no action; the system is offshore', credit: 0, position: 3 },
                ],
              },
            },
          ],
        },
      },
      include: { steps: { include: { options: true }, orderBy: { position: 'asc' } } },
    });
    await prisma.assessment.update({ where: { id: course.assessmentId }, data: { mcqWeight } });
    await trainee.post(`/api/courses/${course.courseId}/enroll`).expect(201);
    await completeAllModules(trainee, course.courseId, course.moduleIds);
    return { course, scenario: scenario as unknown as Scenario };
  }

  const start = async (course: BuiltCourse) => {
    const started = await trainee.post(`/api/assessments/${course.assessmentId}/start`).expect(201);
    return started.body.data as Parameters<typeof answersFor>[0];
  };

  /** The choice earning a particular credit at a given step. */
  const choice = (scenario: Scenario, step: number, credit: number) =>
    scenario.steps[step]?.options.find((option) => option.credit === credit)?.id as string;

  beforeAll(async () => {
    await resetDatabase();
    const world = await agents();
    trainee = world.traineeAgent;
    trainer = world.trainerAgent;
    radarId = world.radar.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('scoring', () => {
    let prepared: Prepared;
    let result: { percentage: number; mcqPercentage: number; practicalPercentage: number; passed: boolean };

    beforeAll(async () => {
      prepared = await prepare('Cyclone Nowcasting');
      const served = await start(prepared.course);
      const submitted = await trainee
        .post(`/api/assessments/${prepared.course.assessmentId}/submit`)
        .send({
          ...answersFor(served, prepared.course),
          practical: [
            { stepId: prepared.scenario.steps[0]?.id, optionId: choice(prepared.scenario, 0, 1) },
            { stepId: prepared.scenario.steps[1]?.id, optionId: choice(prepared.scenario, 1, 0.25) },
          ],
        })
        .expect(200);
      result = submitted.body.data.attempt;
    });

    it('marks a defensible but suboptimal decision with part of the marks', async () => {
      const responses = await prisma.practicalResponse.findMany({ where: { scenarioId: prepared.scenario.id }, orderBy: { creditAwarded: 'desc' } });
      expect(responses).toHaveLength(2);
      expect(responses[0]).toMatchObject({ creditAwarded: 1, marksAwarded: 4 });
      expect(responses[1]).toMatchObject({ creditAwarded: 0.25, marksAwarded: 1.5 });
    });

    it('turns 5.5 of 10 practical marks into 55%', () => {
      expect(result.practicalPercentage).toBe(55);
    });

    it('combines the two components with the configured weighting', () => {
      expect(result.mcqPercentage).toBe(100);
      expect(result.percentage).toBe(82); // 100 x 0.6 + 55 x 0.4
    });

    it('applies the pass mark to the combined score, not to either component', () => {
      expect(result.passed).toBe(true); // 82% against a 70% pass mark
    });
  });

  describe('a different weighting', () => {
    it('changes the final score without changing either component', async () => {
      const prepared = await prepare('Practical Heavy Course', 0.3);
      const served = await start(prepared.course);
      const { body } = await trainee
        .post(`/api/assessments/${prepared.course.assessmentId}/submit`)
        .send({
          ...answersFor(served, prepared.course),
          practical: [
            { stepId: prepared.scenario.steps[0]?.id, optionId: choice(prepared.scenario, 0, 1) },
            { stepId: prepared.scenario.steps[1]?.id, optionId: choice(prepared.scenario, 1, 0.25) },
          ],
        })
        .expect(200);
      // Same components, weighted 30/70: 100 x 0.3 + 55 x 0.7 = 68.5
      expect(body.data.attempt.mcqPercentage).toBe(100);
      expect(body.data.attempt.practicalPercentage).toBe(55);
      expect(body.data.attempt.percentage).toBe(68.5);
    });
  });

  describe('validation', () => {
    it('refuses a decision that belongs to another step, and a repeated step', async () => {
      const prepared = await prepare('Validation Course');
      const served = await start(prepared.course);
      const base = answersFor(served, prepared.course);
      const [stepOne, stepTwo] = prepared.scenario.steps;

      await trainee
        .post(`/api/assessments/${prepared.course.assessmentId}/submit`)
        .send({ ...base, practical: [{ stepId: stepOne?.id, optionId: stepTwo?.options[0]?.id }] })
        .expect(400);
      await trainee
        .post(`/api/assessments/${prepared.course.assessmentId}/submit`)
        .send({ ...base, practical: [{ stepId: stepOne?.id, optionId: stepOne?.options[0]?.id }, { stepId: stepOne?.id, optionId: stepOne?.options[1]?.id }] })
        .expect(400);
    });

    it('scores an unanswered scenario as zero rather than refusing the submission', async () => {
      const prepared = await prepare('Unanswered Scenario Course');
      const served = await start(prepared.course);
      const { body } = await trainee.post(`/api/assessments/${prepared.course.assessmentId}/submit`).send(answersFor(served, prepared.course)).expect(200);
      expect(body.data.attempt.practicalPercentage).toBe(0);
      expect(body.data.attempt.percentage).toBe(60); // 100 x 0.6 + 0 x 0.4
    });
  });

  describe('idempotent submission', () => {
    it('returns the original result when the same key is sent again, without a second attempt', async () => {
      const prepared = await prepare('Idempotency Course');
      const served = await start(prepared.course);
      const payload = { ...answersFor(served, prepared.course), idempotencyKey: `offline-submit-${Date.now()}` };

      const first = await trainee.post(`/api/assessments/${prepared.course.assessmentId}/submit`).send(payload).expect(200);
      const before = await prisma.assessmentAttempt.count({ where: { assessmentId: prepared.course.assessmentId } });

      const replay = await trainee.post(`/api/assessments/${prepared.course.assessmentId}/submit`).send(payload).expect(200);
      const after = await prisma.assessmentAttempt.count({ where: { assessmentId: prepared.course.assessmentId } });

      expect(replay.body.data.replayed).toBe(true);
      expect(replay.body.data.attempt.id).toBe(first.body.data.attempt.id);
      expect(replay.body.data.attempt.percentage).toBe(first.body.data.attempt.percentage);
      expect(after).toBe(before); // no second attempt was created
    });

    it('does not grade twice or issue a second certificate on a replay', async () => {
      const prepared = await prepare('Replay Certificate Course');
      const served = await start(prepared.course);
      // Best decisions throughout, so the attempt passes and a certificate is issued:
      // the point of this test is that the replay does not issue a second one.
      const payload = {
        ...answersFor(served, prepared.course),
        practical: [
          { stepId: prepared.scenario.steps[0]?.id, optionId: choice(prepared.scenario, 0, 1) },
          { stepId: prepared.scenario.steps[1]?.id, optionId: choice(prepared.scenario, 1, 1) },
        ],
        idempotencyKey: `cert-replay-${Date.now()}`,
      };

      await trainee.post(`/api/assessments/${prepared.course.assessmentId}/submit`).send(payload).expect(200);
      await trainee.post(`/api/assessments/${prepared.course.assessmentId}/submit`).send(payload).expect(200);

      expect(await prisma.certificate.count({ where: { courseId: prepared.course.courseId } })).toBe(1);
      expect(await prisma.assessmentAttempt.count({ where: { assessmentId: prepared.course.assessmentId, status: 'SUBMITTED' } })).toBe(1);
    });

    it('refuses a key that was already used for a different assessment', async () => {
      const first = await prepare('Key Reuse Course A');
      const second = await prepare('Key Reuse Course B');
      const key = `shared-key-${Date.now()}`;

      const servedFirst = await start(first.course);
      await trainee.post(`/api/assessments/${first.course.assessmentId}/submit`).send({ ...answersFor(servedFirst, first.course), idempotencyKey: key }).expect(200);

      const servedSecond = await start(second.course);
      await trainee.post(`/api/assessments/${second.course.assessmentId}/submit`).send({ ...answersFor(servedSecond, second.course), idempotencyKey: key }).expect(409);
    });
  });

  describe('delivering a scenario to the trainee', () => {
    it('sends the briefing and the choices, but never what they are worth', async () => {
      const prepared = await prepare('Delivery Course');
      const served = (await trainee.post(`/api/assessments/${prepared.course.assessmentId}/start`).expect(201)).body.data;

      expect(served.scenarios).toHaveLength(1);
      const [scenario] = served.scenarios;
      expect(scenario.title).toContain('Rapid intensification');
      expect(scenario.briefing).toContain('simulated exercise');
      expect(scenario.steps).toHaveLength(2);

      const serialised = JSON.stringify(served);
      expect(serialised).not.toContain('credit');
      expect(serialised).not.toContain('rationale');
      expect(serialised).not.toContain('classic signature'); // the step explanation
      for (const step of scenario.steps) {
        for (const option of step.options) expect(Object.keys(option).sort()).toEqual(['id', 'text']);
      }
    });

    it('tells the trainee how the two halves will be combined', async () => {
      const prepared = await prepare('Weighting Disclosure Course', 0.4);
      const served = (await trainee.post(`/api/assessments/${prepared.course.assessmentId}/start`).expect(201)).body.data;
      expect(served.assessment.mcqWeight).toBe(0.4);
      expect(served.assessment.practicalMarks).toBe(10);
    });
  });

  describe('the practical half of a result', () => {
    it('shows what was chosen, what it earned and why - including the better decision', async () => {
      const prepared = await prepare('Result Breakdown Course');
      const served = await start(prepared.course);
      const partial = choice(prepared.scenario, 1, 0.25);
      const submitted = await trainee
        .post(`/api/assessments/${prepared.course.assessmentId}/submit`)
        .send({
          ...answersFor(served, prepared.course),
          practical: [
            { stepId: prepared.scenario.steps[0]?.id, optionId: choice(prepared.scenario, 0, 1) },
            { stepId: prepared.scenario.steps[1]?.id, optionId: partial },
          ],
        })
        .expect(200);

      const detail = (await trainee.get(`/api/assessments/attempts/${submitted.body.data.attempt.id}`).expect(200)).body.data;
      expect(detail.practical).toHaveLength(1);
      const [scenario] = detail.practical;
      expect(scenario.marks).toBe(10);
      expect(scenario.marksAwarded).toBe(5.5);

      const [first, second] = scenario.steps;
      expect(first.marksAwarded).toBe(4);
      expect(first.explanation).toContain('classic signature');
      expect(second.selectedOptionId).toBe(partial);
      expect(second.marksAwarded).toBe(1.5);
      // The result teaches: the best decision is named even though it was not chosen.
      expect(second.bestOptionId).toBe(choice(prepared.scenario, 1, 1));
      expect(second.options.find((option: { id: string }) => option.id === partial).credit).toBe(0.25);
    });

    it('has no practical section when the assessment has no scenarios', async () => {
      const plain = await buildCourse(trainer, { title: 'No Practical Part', competencyId: radarId, levelFrom: 0, levelTo: 60 });
      await trainee.post(`/api/courses/${plain.courseId}/enroll`).expect(201);
      await completeAllModules(trainee, plain.courseId, plain.moduleIds);
      const served = await start(plain);
      const submitted = await trainee.post(`/api/assessments/${plain.assessmentId}/submit`).send(answersFor(served, plain)).expect(200);

      const detail = (await trainee.get(`/api/assessments/attempts/${submitted.body.data.attempt.id}`).expect(200)).body.data;
      expect(detail.practical).toBeNull();
    });
  });

  describe('authoring the practical component', () => {
    const scenarioBody = (title: string) => ({
      scenarios: [
        {
          title,
          briefing: 'A simulated squall line approaches a district with a large outdoor gathering. This is a training scenario.',
          steps: [
            {
              type: 'ACTION',
              prompt: 'What is the first thing to do?',
              marks: 5,
              options: [
                { text: 'Issue a nowcast warning to the district authority', credit: 1, rationale: 'Time-critical and within the forecaster\'s remit.' },
                { text: 'Wait for the next radar volume scan', credit: 0.25, rationale: 'Defensible, but the delay costs warning lead time.' },
                { text: 'Refer the decision upward and take no action', credit: 0 },
              ],
            },
          ],
        },
      ],
    });

    it('replaces the whole practical component and hands back its marking', async () => {
      const course = await buildCourse(trainer, { title: 'Authoring Scenarios', competencyId: radarId, levelFrom: 0, levelTo: 60 });
      const saved = await trainer.put(`/api/assessments/${course.assessmentId}/scenarios`).send(scenarioBody('Squall line over a public event')).expect(200);

      expect(saved.body.data.scenarios).toHaveLength(1);
      const [scenario] = saved.body.data.scenarios;
      expect(scenario.marks).toBe(5); // summed from its steps
      expect(scenario.steps[0].options.map((option: { credit: number }) => option.credit)).toEqual([1, 0.25, 0]);

      // Replacing again leaves one scenario, not two.
      await trainer.put(`/api/assessments/${course.assessmentId}/scenarios`).send(scenarioBody('Replaced scenario')).expect(200);
      const listed = (await trainer.get(`/api/assessments/${course.assessmentId}/scenarios`).expect(200)).body.data;
      expect(listed.scenarios).toHaveLength(1);
      expect(listed.scenarios[0].title).toBe('Replaced scenario');
    });

    it('insists that one option earns full credit, so the practical half can be scored out of 100', async () => {
      const course = await buildCourse(trainer, { title: 'Uncreditable Scenario', competencyId: radarId, levelFrom: 0, levelTo: 60 });
      const body = scenarioBody('No good answer');
      body.scenarios[0].steps[0].options[0].credit = 0.5;
      const response = await trainer.put(`/api/assessments/${course.assessmentId}/scenarios`).send(body).expect(400);
      expect(JSON.stringify(response.body)).toContain('full credit');
    });

    it('refuses to rewrite scenarios that people have already been marked against', async () => {
      const prepared = await prepare('Already Marked Course');
      const served = await start(prepared.course);
      await trainee
        .post(`/api/assessments/${prepared.course.assessmentId}/submit`)
        .send({ ...answersFor(served, prepared.course), practical: [{ stepId: prepared.scenario.steps[0]?.id, optionId: choice(prepared.scenario, 0, 1) }] })
        .expect(200);

      const refused = await trainer.put(`/api/assessments/${prepared.course.assessmentId}/scenarios`).send(scenarioBody('Rewritten after marking')).expect(409);
      expect(refused.body.code).toBe('SCENARIOS_IN_USE');
    });

    it('is not something a trainee can do', async () => {
      const course = await buildCourse(trainer, { title: 'Trainee Cannot Author', competencyId: radarId, levelFrom: 0, levelTo: 60 });
      await trainee.put(`/api/assessments/${course.assessmentId}/scenarios`).send(scenarioBody('Nice try')).expect(403);
    });
  });

  describe('an assessment with no scenarios', () => {
    it('is scored on its questions alone, whatever the weighting says', async () => {
      const plain = await buildCourse(trainer, { title: 'Questions Only', competencyId: radarId, levelFrom: 0, levelTo: 60 });
      await prisma.assessment.update({ where: { id: plain.assessmentId }, data: { mcqWeight: 0.3 } });
      await trainee.post(`/api/courses/${plain.courseId}/enroll`).expect(201);
      await completeAllModules(trainee, plain.courseId, plain.moduleIds);

      const served = await start(plain);
      const { body } = await trainee.post(`/api/assessments/${plain.assessmentId}/submit`).send(answersFor(served, plain)).expect(200);

      expect(body.data.attempt.practicalPercentage).toBeNull();
      expect(body.data.attempt.mcqPercentage).toBeNull();
      expect(body.data.attempt.percentage).toBe(100);
    });
  });
});
