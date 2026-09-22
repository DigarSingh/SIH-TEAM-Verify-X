import { expect } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { createAdmin, createCompetency, createDepartment, createJobRole, createTrainer, createUser } from './factories';
import { loginAs, type Agent } from './http';

/** The framework from the brief: a role that requires Radar Meteorology 80 (importance 4, role criticality 4 = High). */
export async function buildRadarFramework() {
  const department = await createDepartment({ name: 'Forecasting', code: 'FC' });
  const radar = await createCompetency({ name: 'Radar Meteorology', code: 'RADAR', category: 'Core Operations' });
  const forecasting = await createCompetency({ name: 'Weather Forecasting', code: 'FORECAST', category: 'Core Operations' });
  const role = await createJobRole({ name: 'Severe Weather Forecaster', code: 'SWF', criticality: 4 });
  await prisma.roleCompetency.createMany({
    data: [
      { roleId: role.id, competencyId: radar.id, requiredLevel: 80, importance: 4 },
      { roleId: role.id, competencyId: forecasting.id, requiredLevel: 85, importance: 5 },
    ],
  });

  const admin = await createAdmin({ email: 'admin@imd.gov.in' });
  const trainer = await createTrainer({ email: 'trainer@imd.gov.in', name: 'Dr. Arjun Mehta', departmentId: department.id });
  const trainee = await createUser({ email: 'trainee@imd.gov.in', name: 'Dr. Ananya Rao', departmentId: department.id, jobRoleId: role.id, employeeId: 'IMD-TR-1024' });

  // Baseline: Radar 35 (the gap of 45 from the brief) and Forecasting 82.
  for (const [competencyId, level] of [
    [radar.id, 35],
    [forecasting.id, 82],
  ] as const) {
    await prisma.employeeCompetency.create({ data: { userId: trainee.id, competencyId, currentLevel: level } });
    await prisma.competencyHistory.create({ data: { userId: trainee.id, competencyId, previousLevel: 0, newLevel: level, source: 'BASELINE' } });
  }
  return { department, radar, forecasting, role, admin, trainer, trainee };
}

export interface BuiltCourse {
  courseId: string;
  assessmentId: string;
  moduleIds: string[];
  /** questionId -> id of the correct option (read back through the trainer API). */
  answerKey: Map<string, string>;
  questions: { id: string; text: string; marks: number }[];
}

export interface CourseOptions {
  title: string;
  competencyId: string;
  levelFrom: number;
  levelTo: number;
  difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  category?: string;
  prerequisiteIds?: string[];
  modules?: number;
  passingScore?: number;
  publish?: boolean;
  /** 15 one-mark + 5 two-mark questions = 25 marks, so 21 correct answers score exactly 84%. */
  questions?: number;
  timeLimitMinutes?: number | null;
  maxAttempts?: number;
  deadline?: string | null;
}

/** Creates, fills and publishes a course + assessment exactly as a trainer would through the API. */
export async function buildCourse(trainer: Agent, options: CourseOptions): Promise<BuiltCourse> {
  const created = await trainer.post('/api/courses').send({
    title: options.title,
    description: `${options.title} - a thorough, practical course for IMD staff.`,
    category: options.category ?? 'Radar Meteorology',
    difficulty: options.difficulty ?? 'BEGINNER',
    outcomes: ['Understand the fundamentals', 'Apply them in operations'],
    passingScore: options.passingScore ?? 70,
    competencies: [{ competencyId: options.competencyId, levelFrom: options.levelFrom, levelTo: options.levelTo }],
    prerequisiteIds: options.prerequisiteIds ?? [],
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const courseId = created.body.data.id as string;

  const moduleIds: string[] = [];
  for (let index = 0; index < (options.modules ?? 3); index += 1) {
    const module = await trainer.post(`/api/courses/${courseId}/modules`).send({ title: `Module ${index + 1}`, durationMinutes: 30 });
    expect(module.status, JSON.stringify(module.body)).toBe(201);
    moduleIds.push(module.body.data.id);
    const material = await trainer
      .post(`/api/courses/${courseId}/modules/${module.body.data.id}/materials`)
      .send({ title: `Reading ${index + 1}`, type: 'TEXT', content: 'Lecture notes for this module.' });
    expect(material.status, JSON.stringify(material.body)).toBe(201);
  }

  const total = options.questions ?? 20;
  const questions = Array.from({ length: total }, (_, index) => {
    const twoMark = index >= total - 5;
    return {
      text: `Question ${index + 1} (${twoMark ? 'b' : 'a'}${twoMark ? index - (total - 5) : index}) about radar interpretation`,
      type: 'SINGLE' as const,
      marks: twoMark ? 2 : 1,
      explanation: 'Because that is how radar works.',
      options: ['Option A', 'Option B', 'Option C', 'Option D'].map((text, optionIndex) => ({ text, isCorrect: optionIndex === index % 4 })),
    };
  });
  const assessment = await trainer.post('/api/assessments').send({
    courseId,
    title: `${options.title} Assessment`,
    timeLimitMinutes: options.timeLimitMinutes === undefined ? 30 : options.timeLimitMinutes,
    maxAttempts: options.maxAttempts ?? 3,
    deadline: options.deadline ?? null,
    questions,
  });
  expect(assessment.status, JSON.stringify(assessment.body)).toBe(201);
  const assessmentId = assessment.body.data.id as string;

  if (options.publish !== false) {
    const published = await trainer.patch(`/api/assessments/${assessmentId}`).send({ isPublished: true });
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const course = await trainer.patch(`/api/courses/${courseId}/status`).send({ status: 'PUBLISHED' });
    expect(course.status, JSON.stringify(course.body)).toBe(200);
  }

  const detail = await trainer.get(`/api/assessments/${assessmentId}`).expect(200);
  const answerKey = new Map<string, string>();
  for (const question of detail.body.data.questions as { id: string; options: { id: string; isCorrect: boolean }[] }[]) {
    answerKey.set(question.id, question.options.find((option) => option.isCorrect)!.id);
  }
  return {
    courseId,
    assessmentId,
    moduleIds,
    answerKey,
    questions: detail.body.data.questions.map((q: { id: string; text: string; marks: number }) => ({ id: q.id, text: q.text, marks: q.marks })),
  };
}

/** Marks every module of an enrollment complete through the API. */
export async function completeAllModules(trainee: Agent, courseId: string, moduleIds: string[]) {
  const enrollment = await trainee.get(`/api/enrollments/me/${courseId}`).expect(200);
  let last;
  for (const moduleId of moduleIds) {
    last = await trainee.post(`/api/enrollments/${enrollment.body.data.id}/modules/${moduleId}/complete`).expect(200);
  }
  return last!.body.data as { id: string; status: string; progress: number };
}

/**
 * Builds the answer payload for a started attempt. Every question is answered
 * correctly except the ones whose text contains one of `wrongMarkers`.
 */
export function answersFor(started: { attempt: { id: string }; questions: { id: string; text: string; options: { id: string }[] }[] }, built: BuiltCourse, wrongMarkers: string[] = []) {
  return {
    attemptId: started.attempt.id,
    answers: started.questions.map((question) => {
      const correct = built.answerKey.get(question.id)!;
      const wrong = wrongMarkers.some((marker) => question.text.includes(marker));
      const optionId = wrong ? question.options.find((option) => option.id !== correct)!.id : correct;
      return { questionId: question.id, optionIds: [optionId] };
    }),
  };
}

/** Enrolls, studies, and takes the assessment; returns the parsed submit response. */
export async function takeAssessment(trainee: Agent, built: BuiltCourse, wrongMarkers: string[] = []) {
  await trainee.post(`/api/courses/${built.courseId}/enroll`).expect(201);
  await completeAllModules(trainee, built.courseId, built.moduleIds);
  const started = await trainee.post(`/api/assessments/${built.assessmentId}/start`).expect(201);
  return trainee.post(`/api/assessments/${built.assessmentId}/submit`).send(answersFor(started.body.data, built, wrongMarkers));
}

export async function agents() {
  const framework = await buildRadarFramework();
  return {
    ...framework,
    trainerAgent: await loginAs(framework.trainer.email),
    traineeAgent: await loginAs(framework.trainee.email),
    adminAgent: await loginAs(framework.admin.email),
  };
}
