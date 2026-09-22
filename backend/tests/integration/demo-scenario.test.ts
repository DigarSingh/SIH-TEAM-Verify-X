import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { app, type Agent } from '../helpers/http';
import { agents, answersFor, buildCourse, completeAllModules, type BuiltCourse } from '../helpers/scenario';

/**
 * The end-to-end demo from the brief, driven purely through the HTTP API against a
 * real PostgreSQL database:
 *
 *   trainee opens the passport (Radar 35%, required 80%, gap 45, HIGH priority)
 *   → gets the recommended Radar course → enrolls → completes the modules
 *   → takes the assessment (84%) → competency 35% → 72% → certificate → public verification
 *   → trainer reviews the trainee → trainer evaluation feeds the competency engine
 */
describe('demo scenario: from course completion to competency development', () => {
  let trainee: Agent;
  let trainer: Agent;
  let radarId: string;
  let traineeId: string;
  let fundamentals: BuiltCourse;
  let doppler: BuiltCourse;
  let advanced: BuiltCourse;
  let certificate: { id: string; certificateNumber: string };

  beforeAll(async () => {
    await resetDatabase();
    const ctx = await agents();
    trainee = ctx.traineeAgent;
    trainer = ctx.trainerAgent;
    radarId = ctx.radar.id;
    traineeId = ctx.trainee.id;

    // Three radar courses forming the path Fundamentals → Doppler → Advanced (prerequisite chain).
    fundamentals = await buildCourse(trainer, { title: 'Radar Fundamentals', competencyId: radarId, levelFrom: 0, levelTo: 75, difficulty: 'BEGINNER' });
    doppler = await buildCourse(trainer, {
      title: 'Doppler Radar Analysis',
      competencyId: radarId,
      levelFrom: 55,
      levelTo: 88,
      difficulty: 'INTERMEDIATE',
      prerequisiteIds: [fundamentals.courseId],
    });
    advanced = await buildCourse(trainer, {
      title: 'Advanced Radar Analysis',
      competencyId: radarId,
      levelFrom: 75,
      levelTo: 96,
      difficulty: 'ADVANCED',
      prerequisiteIds: [doppler.courseId],
    });
  });

  it('1. the Competency Passport shows Radar at 35% against a required 80% (gap 45, HIGH priority)', async () => {
    const response = await trainee.get('/api/competencies/me/passport').expect(200);
    const radar = response.body.data.competencies.find((c: { competencyName: string }) => c.competencyName === 'Radar Meteorology');
    expect(radar).toMatchObject({
      currentLevel: 35,
      requiredLevel: 80,
      gap: 45,
      met: false,
      severity: 'HIGH',
      priorityScore: 28.8,
      priorityLevel: 'HIGH',
      criticalityLabel: 'High',
    });
    expect(radar.progression).toEqual([35]);
    expect(radar.reason).toContain('45 points');
    expect(response.body.data.jobRole).toMatchObject({ name: 'Severe Weather Forecaster', criticality: 4 });
    expect(response.body.data.certificates.count).toBe(0);
  });

  it('2. the skill-gap report ranks Radar first and recommends the Radar course', async () => {
    const response = await trainee.get('/api/skill-gaps/me').expect(200);
    const [top] = response.body.data.gaps;
    expect(top.competencyName).toBe('Radar Meteorology');
    expect(top.recommendedCourses.map((c: { title: string }) => c.title)).toEqual(['Radar Fundamentals', 'Doppler Radar Analysis', 'Advanced Radar Analysis']);
    expect(response.body.data.summary.bySeverity.HIGH).toBe(1);
  });

  it('3. the recommendation engine builds Radar Fundamentals → Doppler Radar → Advanced Radar Analysis, with reasons', async () => {
    const response = await trainee.get('/api/recommendations/me').expect(200);
    const { recommendations, learningPaths } = response.body.data;

    expect(recommendations[0]).toMatchObject({ title: 'Radar Fundamentals', ready: true, rank: 1 });
    expect(recommendations[0].reasons.join(' ')).toContain('Radar Meteorology');
    expect(recommendations[0].reasons.join(' ')).toContain('45 points');

    // One path per competency gap: Radar (courses available) and Weather Forecasting (a 3-point gap, no course yet).
    expect(learningPaths.map((p: { competencyName: string }) => p.competencyName).sort()).toEqual(['Radar Meteorology', 'Weather Forecasting']);
    const radarPath = learningPaths.find((p: { competencyName: string }) => p.competencyName === 'Radar Meteorology');
    expect(learningPaths.find((p: { competencyName: string }) => p.competencyName === 'Weather Forecasting').steps).toEqual([]);
    expect(radarPath.steps.map((s: { title: string; stage: string; locked: boolean }) => [s.title, s.stage, s.locked])).toEqual([
      ['Radar Fundamentals', 'BEGINNER', false],
      ['Doppler Radar Analysis', 'INTERMEDIATE', true],
      ['Advanced Radar Analysis', 'ADVANCED', true],
    ]);
    expect(radarPath.nextStepCourseId).toBe(fundamentals.courseId);

    // A locked step names the course it waits for (a display name, not only an opaque id).
    expect(radarPath.steps[1].blockedBy).toEqual([{ id: fundamentals.courseId, title: 'Radar Fundamentals' }]);
    expect(radarPath.steps[2].blockedBy).toEqual([{ id: doppler.courseId, title: 'Doppler Radar Analysis' }]);
    const dopplerRecommendation = recommendations.find((r: { title: string }) => r.title === 'Doppler Radar Analysis');
    expect(dopplerRecommendation).toMatchObject({ ready: false, blockedBy: [{ id: fundamentals.courseId, title: 'Radar Fundamentals' }] });
  });

  it('4. enrolling enforces prerequisites and records the enrollment', async () => {
    const blocked = await trainee.post(`/api/courses/${doppler.courseId}/enroll`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('PREREQUISITES_NOT_MET');

    const enrolled = await trainee.post(`/api/courses/${fundamentals.courseId}/enroll`).expect(201);
    expect(enrolled.body.data).toMatchObject({ status: 'ENROLLED', progress: 0 });
    await trainee.post(`/api/courses/${fundamentals.courseId}/enroll`).expect(409); // already enrolled

    const me = await trainee.get('/api/enrollments/me').expect(200);
    expect(me.body.data).toHaveLength(1);
    expect(me.body.data[0]).toMatchObject({ modulesTotal: 3, modulesCompleted: 0, progress: 0 });
  });

  it('5. the assessment stays locked until every module is complete', async () => {
    const early = await trainee.post(`/api/assessments/${fundamentals.assessmentId}/start`);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('MODULES_INCOMPLETE');

    const learn = await trainee.get(`/api/courses/${fundamentals.courseId}/learn`).expect(200);
    expect(learn.body.data.modules).toHaveLength(3);
    expect(learn.body.data.modules[0].materials[0]).toMatchObject({ type: 'TEXT', content: 'Lecture notes for this module.' });
  });

  it('6. completing the modules tracks progress and unlocks the assessment', async () => {
    const enrollment = await trainee.get(`/api/enrollments/me/${fundamentals.courseId}`).expect(200);
    const first = await trainee.post(`/api/enrollments/${enrollment.body.data.id}/modules/${fundamentals.moduleIds[0]}/complete`).expect(200);
    expect(first.body.data).toMatchObject({ status: 'IN_PROGRESS', progress: 33 });
    // idempotent
    await trainee.post(`/api/enrollments/${enrollment.body.data.id}/modules/${fundamentals.moduleIds[0]}/complete`).expect(200);

    const done = await completeAllModules(trainee, fundamentals.courseId, fundamentals.moduleIds);
    expect(done).toMatchObject({ status: 'ASSESSMENT_PENDING', progress: 100 });
  });

  it('7. taking the assessment scores 84%, updates the competency 35% → 72% and issues a certificate', async () => {
    const started = await trainee.post(`/api/assessments/${fundamentals.assessmentId}/start`).expect(201);
    expect(started.body.data.questions).toHaveLength(20);
    expect(started.body.data.attempt.remainingSeconds).toBeGreaterThan(0);
    // The answer key must never reach the browser while an attempt is open.
    expect(JSON.stringify(started.body)).not.toMatch(/isCorrect|explanation/);

    // 25 marks in total; miss one 2-mark and two 1-mark questions → 21/25 = 84%.
    const submitted = await trainee
      .post(`/api/assessments/${fundamentals.assessmentId}/submit`)
      .send(answersFor(started.body.data, fundamentals, ['(b0)', '(a0)', '(a1)']));
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);

    const result = submitted.body.data;
    expect(result.attempt).toMatchObject({ score: 21, totalMarks: 25, percentage: 84, passed: true, status: 'SUBMITTED', attemptNumber: 1 });
    expect(result.enrollment).toMatchObject({ status: 'CERTIFIED', progress: 100 });

    const radar = result.competencyImpacts.find((impact: { competencyName: string }) => impact.competencyName === 'Radar Meteorology');
    expect(radar).toMatchObject({ previousLevel: 35, newLevel: 72, changed: true, requiredLevel: 80, gapBefore: 45, gapAfter: 8, requirementMet: false });
    expect(radar.explanation).toContain('72%');

    expect(result.certificate.certificateNumber).toMatch(/^CC-\d{4}-[A-Z0-9]{8}$/);
    certificate = result.certificate;

    // The review reveals the answers only after submission.
    expect(result.review).toHaveLength(20);
    expect(result.review.filter((q: { isCorrect: boolean }) => q.isCorrect)).toHaveLength(17);
  });

  it('8. the database reflects the new competency level and its history timeline', async () => {
    const stored = await prisma.employeeCompetency.findUniqueOrThrow({ where: { userId_competencyId: { userId: traineeId, competencyId: radarId } } });
    expect(stored.currentLevel).toBe(72);
    const history = await prisma.competencyHistory.findMany({ where: { userId: traineeId, competencyId: radarId }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => [h.previousLevel, h.newLevel, h.source])).toEqual([
      [0, 35, 'BASELINE'],
      [35, 72, 'ASSESSMENT'],
    ]);
    expect(history[1]!.attemptId).toBeTruthy();
  });

  it('9. the passport now shows Radar 72% (gap 8), 1 course, 84% average, 1 certificate and the progression 35% → 72%', async () => {
    const { data } = (await trainee.get('/api/competencies/me/passport').expect(200)).body;
    const radar = data.competencies.find((c: { competencyName: string }) => c.competencyName === 'Radar Meteorology');
    expect(radar).toMatchObject({ currentLevel: 72, requiredLevel: 80, gap: 8, severity: 'LOW' });
    expect(radar.progression).toEqual([35, 72]);
    expect(data.training.coursesCompleted).toBe(1);
    expect(data.assessments).toMatchObject({ attempted: 1, passed: 1, averageScore: 84 });
    expect(data.certificates.count).toBe(1);
    expect(data.summary.remainingGapPoints).toBe(8 + 3); // Radar 8 + Forecasting 3 (82 vs 85)
  });

  it('10. the learning path advances: Fundamentals is done, Doppler is next, Advanced stays locked', async () => {
    const { data } = (await trainee.get('/api/recommendations/me').expect(200)).body;
    const path = data.learningPaths.find((p: { competencyName: string }) => p.competencyName === 'Radar Meteorology');
    expect(path.steps.map((s: { title: string; status: string; locked: boolean }) => [s.title, s.status, s.locked])).toEqual([
      ['Radar Fundamentals', 'CERTIFIED', false],
      ['Doppler Radar Analysis', 'NOT_STARTED', false],
      ['Advanced Radar Analysis', 'NOT_STARTED', true],
    ]);
    expect(path.nextStepCourseId).toBe(doppler.courseId);
    expect(data.recommendations.map((r: { title: string }) => r.title)).not.toContain('Radar Fundamentals');
    // The follow-up course can now be enrolled in.
    await trainee.post(`/api/courses/${doppler.courseId}/enroll`).expect(201);
    void advanced;
  });

  it('11. the certificate verifies publicly (no login), downloads as a PDF and shows a QR code', async () => {
    const verified = await request(app).get(`/api/certificates/verify/${certificate.certificateNumber}`);
    expect(verified.status).toBe(200);
    expect(verified.body.data).toMatchObject({
      valid: true,
      holderName: 'Dr. Ananya Rao',
      courseTitle: 'Radar Fundamentals',
      score: 84,
      issuer: expect.stringContaining('India Meteorological Department'),
    });
    expect(JSON.stringify(verified.body)).not.toMatch(/trainee@imd\.gov\.in|IMD-TR-1024|userId/);

    const unknown = await request(app).get('/api/certificates/verify/CC-2026-ZZZZZZZZ');
    expect(unknown.status).toBe(200);
    expect(unknown.body.data).toMatchObject({ valid: false, reason: 'NOT_FOUND' });

    const pdf = await trainee.get(`/api/certificates/${certificate.id}/pdf`).buffer(true).parse(binaryParser);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.body as Buffer).length).toBeGreaterThan(3000);

    const qr = await trainee.get(`/api/certificates/${certificate.id}/qr`).buffer(true).parse(binaryParser);
    expect(qr.headers['content-type']).toBe('image/png');
    expect((qr.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
  });

  it('12. the trainee received notifications and earned achievements', async () => {
    const response = await trainee.get('/api/notifications').expect(200);
    const types = response.body.data.map((n: { type: string }) => n.type);
    expect(types).toEqual(expect.arrayContaining(['COURSE_ENROLLMENT', 'ASSESSMENT_RESULT', 'CERTIFICATE_ISSUED', 'COMPETENCY_UPDATE', 'ACHIEVEMENT']));
    expect(response.body.meta.unreadCount).toBeGreaterThan(0);

    const achievements = await trainee.get('/api/achievements/me').expect(200);
    const earned = achievements.body.data.items.filter((a: { earned: boolean }) => a.earned).map((a: { code: string }) => a.code);
    expect(earned).toEqual(expect.arrayContaining(['FIRST_STEPS', 'COURSE_COMPLETED', 'CERTIFIED', 'FIRST_TIME_PASS']));
  });

  it('13. the trainer sees the trainee’s progress, score and competency change', async () => {
    const response = await trainer.get(`/api/courses/${fundamentals.courseId}/trainees`).expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      learner: { name: 'Dr. Ananya Rao' },
      status: 'CERTIFIED',
      progress: 100,
      bestScore: 84,
      passed: true,
    });
    expect(response.body.data[0].competencyChanges).toEqual([{ competencyName: 'Radar Meteorology', previousLevel: 35, newLevel: 72 }]);

    const analytics = await trainer.get(`/api/courses/${fundamentals.courseId}/analytics`).expect(200);
    expect(analytics.body.data.completionRate).toBe(100);
    expect(analytics.body.data.assessment).toMatchObject({ attempts: 1, passRate: 100, averageScore: 84 });
    expect(analytics.body.data.competencyImpact[0]).toMatchObject({ competencyName: 'Radar Meteorology', averageGain: 37 });

    const results = await trainer.get(`/api/assessments/${fundamentals.assessmentId}/results`).expect(200);
    expect(results.body.data[0]).toMatchObject({ percentage: 84, passed: true, learner: { name: 'Dr. Ananya Rao' } });
    expect(results.body.meta.stats).toMatchObject({ passRate: 100, averageScore: 84, learners: 1 });
    expect(results.body.meta.stats.questions).toHaveLength(20);
  });

  it('14. a trainer evaluation feeds the competency engine (weighted rubric, no course ceiling)', async () => {
    const response = await trainer
      .post('/api/evaluations')
      .send({
        traineeId,
        competencyId: radarId,
        technicalKnowledge: 4,
        practicalAbility: 4,
        participation: 5,
        applicationOfKnowledge: 4,
        overallCompetency: 4,
        comments: 'Strong grasp of reflectivity products; interprets velocity data well.',
      });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    // 0.30 × 80 + 0.25 × 80 + 0.10 × 100 + 0.20 × 80 + 0.15 × 80 = 82
    expect(response.body.data.evaluation.weightedScore).toBe(82);
    const impact = response.body.data.competencyImpacts[0];
    // evidence = (0.60 × 84 + 0.25 × 82) / 0.85 = 83.41 ; level = 0.25 × 72 + 0.75 × 83.41 = 80.6 → 81
    expect(impact).toMatchObject({ previousLevel: 72, newLevel: 81, changed: true, requirementMet: true, gapAfter: 0 });

    const passport = (await trainee.get('/api/competencies/me/passport').expect(200)).body.data;
    const radar = passport.competencies.find((c: { competencyName: string }) => c.competencyName === 'Radar Meteorology');
    expect(radar.progression).toEqual([35, 72, 81]);
    expect(radar.met).toBe(true);
    expect(passport.evaluations[0]).toMatchObject({ weightedScore: 82, trainerName: 'Dr. Arjun Mehta' });
  });
});

/** Collects a binary response body (Supertest parses text/JSON by default). */
function binaryParser(res: request.Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}
