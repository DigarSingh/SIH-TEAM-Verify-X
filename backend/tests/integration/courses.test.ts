import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createCompetency, createUser } from '../helpers/factories';
import { app, loginAs, type Agent } from '../helpers/http';
import { agents, buildCourse, completeAllModules } from '../helpers/scenario';

// A valid 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]); // Windows executable header

describe('courses', () => {
  let trainer: Agent;
  let trainee: Agent;
  let admin: Agent;
  let radarId: string;
  let forecastingId: string;

  beforeAll(async () => {
    await resetDatabase();
    const world = await agents();
    trainer = world.trainerAgent;
    trainee = world.traineeAgent;
    admin = world.adminAgent;
    radarId = world.radar.id;
    forecastingId = world.forecasting.id;
  });

  const draft = (overrides: Record<string, unknown> = {}) => ({
    title: 'Satellite Meteorology',
    description: 'Interpret multi-spectral satellite imagery for operational forecasting.',
    category: 'Satellite Services',
    difficulty: 'INTERMEDIATE',
    ...overrides,
  });

  describe('creation and validation', () => {
    it('creates a DRAFT course owned by the trainer, with outcomes, competencies and initial modules', async () => {
      const response = await trainer.post('/api/courses').send(
        draft({
          outcomes: ['Read visible and infrared imagery'],
          passingScore: 65,
          competencies: [{ competencyId: forecastingId, levelFrom: 20, levelTo: 70 }],
          modules: [
            { title: 'Satellite sensors', durationMinutes: 40 },
            { title: 'Cloud typing', durationMinutes: 50 },
          ],
        }),
      );
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      expect(response.body.data).toMatchObject({
        title: 'Satellite Meteorology',
        status: 'DRAFT',
        difficulty: 'INTERMEDIATE',
        passingScore: 65,
        certificateEnabled: true,
        durationMinutes: 90, // derived from the modules
        trainer: { name: 'Dr. Arjun Mehta' },
        canManage: true,
      });
      expect(response.body.data.modules.map((m: { title: string }) => m.title)).toEqual(['Satellite sensors', 'Cloud typing']);
      expect(response.body.data.competencies[0]).toMatchObject({ id: forecastingId, levelFrom: 20, levelTo: 70 });
    });

    it.each<[string, Record<string, unknown>]>([
      ['a too-short title', { title: 'ab' }],
      ['an unknown field (mass assignment)', { status: 'PUBLISHED' }],
      ['a target level that is not above the entry level', { competencies: [{ competencyId: 'x', levelFrom: 60, levelTo: 60 }] }],
      ['a pass mark above 100', { passingScore: 120 }],
      ['a negative duration', { durationMinutes: -5 }],
    ])('rejects %s', async (_label, overrides) => {
      const response = await trainer.post('/api/courses').send(draft(overrides));
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate or unknown competency mappings and unknown prerequisites', async () => {
      const duplicate = await trainer.post('/api/courses').send(
        draft({
          competencies: [
            { competencyId: radarId, levelFrom: 0, levelTo: 50 },
            { competencyId: radarId, levelFrom: 50, levelTo: 90 },
          ],
        }),
      );
      expect(duplicate.status).toBe(400);
      const unknown = await trainer.post('/api/courses').send(draft({ competencies: [{ competencyId: '11111111-1111-4111-8111-111111111111', levelFrom: 0, levelTo: 50 }] }));
      expect(unknown.status).toBe(400);
      expect(unknown.body.code).toBe('INVALID_COMPETENCY');
      const prerequisite = await trainer.post('/api/courses').send(draft({ prerequisiteIds: ['11111111-1111-4111-8111-111111111111'] }));
      expect(prerequisite.status).toBe(400);
      expect(prerequisite.body.code).toBe('INVALID_PREREQUISITE');
    });

    it('does not let a trainee create courses', async () => {
      expect((await trainee.post('/api/courses').send(draft())).status).toBe(403);
    });

    it('lets an administrator create a course on behalf of a trainer', async () => {
      const trainerUser = await prisma.user.findFirstOrThrow({ where: { email: 'trainer@imd.gov.in' } });
      const response = await admin.post('/api/courses').send(draft({ title: 'Admin-created course', trainerId: trainerUser.id }));
      expect(response.status).toBe(201);
      expect(response.body.data.trainer.name).toBe('Dr. Arjun Mehta');
      const wrong = await admin.post('/api/courses').send(draft({ title: 'Bad trainer', trainerId: (await prisma.user.findFirstOrThrow({ where: { role: 'TRAINEE' } })).id }));
      expect(wrong.status).toBe(400);
      expect(wrong.body.code).toBe('INVALID_TRAINER');
    });
  });

  describe('modules and materials', () => {
    let courseId: string;
    let moduleIds: string[];

    beforeAll(async () => {
      const created = await trainer.post('/api/courses').send(draft({ title: 'Module playground', competencies: [{ competencyId: radarId, levelFrom: 0, levelTo: 60 }] })).expect(201);
      courseId = created.body.data.id;
      moduleIds = [];
      for (const [title, minutes] of [['One', 30], ['Two', 45], ['Three', 15]] as const) {
        const module = await trainer.post(`/api/courses/${courseId}/modules`).send({ title, durationMinutes: minutes }).expect(201);
        moduleIds.push(module.body.data.id);
      }
    });

    it('keeps the course duration in step with its modules, and re-packs positions on delete', async () => {
      expect((await trainer.get(`/api/courses/${courseId}`)).body.data.durationMinutes).toBe(90);
      await trainer.delete(`/api/courses/${courseId}/modules/${moduleIds[1]}`).expect(200);
      const detail = (await trainer.get(`/api/courses/${courseId}`)).body.data;
      expect(detail.durationMinutes).toBe(45);
      expect(detail.modules.map((m: { title: string; position: number }) => [m.title, m.position])).toEqual([['One', 0], ['Three', 1]]);
      moduleIds.splice(1, 1);
    });

    it('does not overwrite a duration the trainer typed by hand', async () => {
      await trainer.patch(`/api/courses/${courseId}`).send({ durationMinutes: 600 }).expect(200);
      await trainer.post(`/api/courses/${courseId}/modules`).send({ title: 'Four', durationMinutes: 20 }).expect(201);
      expect((await trainer.get(`/api/courses/${courseId}`)).body.data.durationMinutes).toBe(600);
    });

    it('reorders modules and rejects an ordering that omits a module', async () => {
      const modules = (await trainer.get(`/api/courses/${courseId}`)).body.data.modules.map((m: { id: string }) => m.id) as string[];
      const bad = await trainer.put(`/api/courses/${courseId}/modules/order`).send({ moduleIds: modules.slice(1) });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('INVALID_ORDER');
      const reversed = [...modules].reverse();
      const ok = await trainer.put(`/api/courses/${courseId}/modules/order`).send({ moduleIds: reversed }).expect(200);
      expect(ok.body.data.map((m: { id: string }) => m.id)).toEqual(reversed);
    });

    it('adds TEXT, LINK and VIDEO (URL) materials and validates their fields', async () => {
      const base = `/api/courses/${courseId}/modules/${moduleIds[0]}/materials`;
      expect((await trainer.post(base).send({ title: 'Notes', type: 'TEXT', content: 'Reflectivity is measured in dBZ.' })).status).toBe(201);
      expect((await trainer.post(base).send({ title: 'WMO guide', type: 'LINK', url: 'https://library.wmo.int/guide' })).status).toBe(201);
      expect((await trainer.post(base).send({ title: 'Lecture', type: 'VIDEO', url: 'https://www.youtube.com/watch?v=abc123' })).status).toBe(201);

      const missingContent = await trainer.post(base).send({ title: 'Empty', type: 'TEXT' });
      expect(missingContent.status).toBe(400);
      expect(missingContent.body.code).toBe('CONTENT_REQUIRED');
      const missingUrl = await trainer.post(base).send({ title: 'No link', type: 'LINK' });
      expect(missingUrl.body.code).toBe('URL_REQUIRED');
      const noFile = await trainer.post(base).send({ title: 'No file', type: 'DOCUMENT' });
      expect(noFile.body.code).toBe('FILE_REQUIRED');
    });

    it('refuses non-web URLs (javascript:, data:, file:) so a link can never run script', async () => {
      const base = `/api/courses/${courseId}/modules/${moduleIds[0]}/materials`;
      for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'ftp://example.com/x']) {
        const response = await trainer.post(base).send({ title: 'Bad link', type: 'LINK', url });
        expect(response.status, url).toBe(400);
      }
    });

    it('accepts real documents and validates uploads by CONTENT, not by name or declared type', async () => {
      const base = `/api/courses/${courseId}/modules/${moduleIds[0]}/materials`;
      const pdf = await trainer.post(base).field('title', 'Handbook').field('type', 'DOCUMENT').attach('file', PDF, { filename: 'handbook.pdf', contentType: 'application/pdf' });
      expect(pdf.status, JSON.stringify(pdf.body)).toBe(201);
      expect(pdf.body.data).toMatchObject({ mimeType: 'application/pdf', fileName: 'handbook.pdf', downloadUrl: expect.stringContaining('/download') });

      // An executable renamed to .pdf, even with a PDF content type, is refused.
      const disguised = await trainer.post(base).field('title', 'Totally a PDF').field('type', 'DOCUMENT').attach('file', EXE, { filename: 'report.pdf', contentType: 'application/pdf' });
      expect(disguised.status).toBe(400);
      expect(disguised.body.code).toBe('FILE_TYPE_NOT_ALLOWED');

      // HTML / SVG are never accepted: they can carry script.
      const html = await trainer.post(base).field('title', 'Page').field('type', 'DOCUMENT').attach('file', Buffer.from('<html><script>alert(1)</script></html>'), 'page.html');
      expect(html.status).toBe(400);
      const svg = await trainer.post(base).field('title', 'Image').field('type', 'DOCUMENT').attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'x.svg');
      expect(svg.status).toBe(400);

      // A video field cannot carry a document.
      const wrongKind = await trainer.post(base).field('title', 'Clip').field('type', 'VIDEO').attach('file', PDF, 'clip.mp4');
      expect(wrongKind.status).toBe(400);
    });

    it('stores uploaded files and removes them when the material is deleted', async () => {
      const base = `/api/courses/${courseId}/modules/${moduleIds[0]}/materials`;
      const uploaded = await trainer.post(base).field('title', 'Notes.txt').field('type', 'DOCUMENT').attach('file', Buffer.from('Doppler radar measures radial velocity.'), 'notes.txt');
      expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(201);
      const stored = await prisma.learningMaterial.findUniqueOrThrow({ where: { id: uploaded.body.data.id } });
      expect(stored.fileKey).toMatch(/^materials\//);
      expect(stored.extractedText).toContain('Doppler radar');

      const download = await trainer.get(uploaded.body.data.downloadUrl).buffer(true);
      expect(download.status).toBe(200);
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.headers['content-disposition']).toContain('notes.txt');

      await trainer.delete(`${base}/${uploaded.body.data.id}`).expect(200);
      expect(await prisma.learningMaterial.findUnique({ where: { id: uploaded.body.data.id } })).toBeNull();
      expect((await trainer.get(uploaded.body.data.downloadUrl)).status).toBe(404);
    });

    it('serves a course thumbnail publicly (images only)', async () => {
      const upload = await trainer.post(`/api/courses/${courseId}/thumbnail`).attach('file', PNG, 'cover.png');
      expect(upload.status, JSON.stringify(upload.body)).toBe(200);
      expect(upload.body.data.thumbnailUrl).toContain(`/api/courses/${courseId}/thumbnail`);

      const image = await request(app).get(upload.body.data.thumbnailUrl).buffer(true); // no cookies
      expect(image.status).toBe(200);
      expect(image.headers['content-type']).toBe('image/png');

      const notImage = await trainer.post(`/api/courses/${courseId}/thumbnail`).attach('file', PDF, 'cover.pdf');
      expect(notImage.status).toBe(400);
      await trainer.delete(`/api/courses/${courseId}/thumbnail`).expect(200);
      expect((await request(app).get(`/api/courses/${courseId}/thumbnail`)).status).toBe(404);
    });
  });

  describe('publishing lifecycle', () => {
    it('cannot be published without a module and a competency mapping', async () => {
      const empty = await trainer.post('/api/courses').send(draft({ title: 'Empty course' })).expect(201);
      const response = await trainer.patch(`/api/courses/${empty.body.data.id}/status`).send({ status: 'PUBLISHED' });
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('COURSE_INCOMPLETE');
      expect(response.body.details.missing).toEqual(['at least one module', 'at least one competency mapping']);
    });

    it('publishes with a warning when there is no assessment, hides drafts from trainees, and notifies affected trainees', async () => {
      const created = await trainer.post('/api/courses').send(draft({ title: 'Radar Interpretation', competencies: [{ competencyId: radarId, levelFrom: 0, levelTo: 70 }], modules: [{ title: 'Basics' }] })).expect(201);
      const id = created.body.data.id;
      expect((await trainee.get(`/api/courses/${id}`)).status).toBe(404); // draft

      const published = await trainer.patch(`/api/courses/${id}/status`).send({ status: 'PUBLISHED' });
      expect(published.status, JSON.stringify(published.body)).toBe(200);
      expect(published.body.data.status).toBe('PUBLISHED');
      expect(published.body.data.publishedAt).toBeTruthy();
      expect(published.body.meta.warnings[0]).toMatch(/no assessment/i);
      expect((await trainee.get(`/api/courses/${id}`)).status).toBe(200);

      // The trainee has a Radar gap (35 vs 80), so a recommendation notification was queued.
      const notifications = await trainee.get('/api/notifications?type=COURSE_RECOMMENDATION').expect(200);
      expect(notifications.body.data.some((n: { title: string }) => n.title.includes('Radar Interpretation'))).toBe(true);

      await trainer.patch(`/api/courses/${id}/status`).send({ status: 'DRAFT' }).expect(200);
      expect((await trainee.get(`/api/courses/${id}`)).status).toBe(404);
      const audit = await prisma.auditLog.findMany({ where: { entityId: id, action: { in: ['COURSE_PUBLISHED', 'COURSE_UNPUBLISHED'] } } });
      expect(audit.map((a) => a.action).sort()).toEqual(['COURSE_PUBLISHED', 'COURSE_UNPUBLISHED']);
    });

    it('keeps an enrolled learner’s access when a course is archived, but closes it to new enrollments', async () => {
      const built = await buildCourse(trainer, { title: 'Archivable course', competencyId: radarId, levelFrom: 0, levelTo: 60, questions: 4 });
      await trainee.post(`/api/courses/${built.courseId}/enroll`).expect(201);
      await trainer.patch(`/api/courses/${built.courseId}/status`).send({ status: 'ARCHIVED' }).expect(200);

      expect((await trainee.get(`/api/courses/${built.courseId}/learn`)).status).toBe(200);
      const newcomer = await loginAs((await createUser({ email: 'newcomer@imd.gov.in' })).email);
      expect((await newcomer.post(`/api/courses/${built.courseId}/enroll`)).status).toBe(404);
      const listed = await newcomer.get('/api/courses?pageSize=100').expect(200);
      expect(listed.body.data.map((c: { id: string }) => c.id)).not.toContain(built.courseId);
    });

    it('deletes a course nobody enrolled in (soft delete) but refuses when learners exist', async () => {
      const spare = await trainer.post('/api/courses').send(draft({ title: 'Never used' })).expect(201);
      await trainer.delete(`/api/courses/${spare.body.data.id}`).expect(200);
      expect((await trainer.get(`/api/courses/${spare.body.data.id}`)).status).toBe(404);
      expect((await prisma.course.findUniqueOrThrow({ where: { id: spare.body.data.id } })).deletedAt).not.toBeNull();

      const busy = await buildCourse(trainer, { title: 'Busy course', competencyId: radarId, levelFrom: 0, levelTo: 60, questions: 4 });
      await trainee.post(`/api/courses/${busy.courseId}/enroll`).expect(201);
      const refused = await trainer.delete(`/api/courses/${busy.courseId}`);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('COURSE_HAS_ENROLLMENTS');
    });
  });

  describe('catalog search and filters', () => {
    let doppler: string;
    let satellite: string;

    beforeAll(async () => {
      await resetDatabase();
      const world = await agents();
      trainer = world.trainerAgent;
      trainee = world.traineeAgent;
      radarId = world.radar.id;
      forecastingId = world.forecasting.id;
      const other = await createCompetency({ name: 'Satellite Meteorology' });
      doppler = (await buildCourse(trainer, { title: 'Doppler Radar Analysis', competencyId: radarId, levelFrom: 40, levelTo: 85, difficulty: 'ADVANCED', questions: 4 })).courseId;
      satellite = (await buildCourse(trainer, { title: 'Cloud Imagery', competencyId: other.id, levelFrom: 0, levelTo: 70, difficulty: 'BEGINNER', category: 'Satellite Services', questions: 4 })).courseId;
    });

    const titles = async (query: string, agent: Agent = trainee) => ((await agent.get(`/api/courses${query}`).expect(200)).body.data as { title: string }[]).map((c) => c.title);

    it('searches title, description, category and mapped competency names (case-insensitive)', async () => {
      expect(await titles('?q=doppler')).toEqual(['Doppler Radar Analysis']);
      expect(await titles('?q=radar%20meteorology')).toEqual(['Doppler Radar Analysis']); // via the mapped competency
      expect(await titles('?q=SATELLITE')).toContain('Cloud Imagery');
      expect(await titles('?q=no-such-thing')).toEqual([]);
    });

    it('filters by difficulty, competency and category', async () => {
      expect(await titles('?difficulty=BEGINNER')).toEqual(['Cloud Imagery']);
      expect(await titles(`?competencyId=${radarId}`)).toEqual(['Doppler Radar Analysis']);
      expect(await titles('?category=Radar%20Meteorology')).toEqual(['Doppler Radar Analysis']);
      expect(await titles('?category=Satellite%20Services')).toEqual(['Cloud Imagery']);
    });

    it('filters by completion status for the signed-in learner', async () => {
      expect((await titles('?completion=NOT_ENROLLED')).sort()).toEqual(['Cloud Imagery', 'Doppler Radar Analysis']);
      await trainee.post(`/api/courses/${satellite}/enroll`).expect(201);
      expect(await titles('?completion=NOT_ENROLLED')).toEqual(['Doppler Radar Analysis']);
      expect(await titles('?completion=ENROLLED')).toEqual(['Cloud Imagery']);
      expect(await titles('?completion=COMPLETED')).toEqual([]);
    });

    it('paginates with metadata, sorts, and lists the available categories', async () => {
      const page = await trainee.get('/api/courses?pageSize=1&page=2&sort=title').expect(200);
      expect(page.body.meta).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
      expect(page.body.data.map((c: { title: string }) => c.title)).toEqual(['Doppler Radar Analysis']);
      expect(page.body.meta.categories).toEqual(['Radar Meteorology', 'Satellite Services']);
      expect((await trainee.get('/api/courses?pageSize=1000')).status).toBe(400);
      expect((await trainee.get('/api/courses?difficulty=EXPERT')).status).toBe(400);
    });

    it('lets a trainer filter their own drafts and shows learners their enrollment on each card', async () => {
      await trainer.post('/api/courses').send(draft({ title: 'My draft' })).expect(201);
      expect(await titles('?mine=true&status=DRAFT', trainer)).toEqual(['My draft']);
      const card = (await trainee.get('/api/courses?q=cloud').expect(200)).body.data[0];
      expect(card.myEnrollment).toMatchObject({ status: 'ENROLLED', progress: 0 });
      expect(card).toMatchObject({ moduleCount: 3, hasAssessment: true, enrolledCount: 1 });
      void doppler;
    });
  });

  describe('enrollment rules and progress', () => {
    let first: string;
    let second: string;
    let firstModules: string[];

    beforeAll(async () => {
      await resetDatabase();
      const world = await agents();
      trainer = world.trainerAgent;
      trainee = world.traineeAgent;
      admin = world.adminAgent;
      radarId = world.radar.id;
      const a = await buildCourse(trainer, { title: 'Course A', competencyId: radarId, levelFrom: 0, levelTo: 60, questions: 4 });
      first = a.courseId;
      firstModules = a.moduleIds;
      second = (await buildCourse(trainer, { title: 'Course B', competencyId: radarId, levelFrom: 50, levelTo: 90, prerequisiteIds: [first], questions: 4 })).courseId;
    });

    it('only trainees can enroll; trainers and admins get 403', async () => {
      expect((await trainer.post(`/api/courses/${first}/enroll`)).status).toBe(403);
      expect((await admin.post(`/api/courses/${first}/enroll`)).status).toBe(403);
    });

    it('enforces prerequisites and explains what is missing', async () => {
      const detail = (await trainee.get(`/api/courses/${second}`).expect(200)).body.data;
      expect(detail.eligibility).toMatchObject({ allowed: false, code: 'PREREQUISITES_NOT_MET', missingPrerequisites: [{ title: 'Course A' }] });
      expect(detail.prerequisites).toEqual([{ id: first, title: 'Course A', status: 'PUBLISHED', completed: false }]);
      const blocked = await trainee.post(`/api/courses/${second}/enroll`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.details.prerequisites[0].title).toBe('Course A');
    });

    it('rejects circular prerequisites', async () => {
      const response = await trainer.put(`/api/courses/${first}/prerequisites`).send({ prerequisiteIds: [second] });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PREREQUISITE_CYCLE');
      const self = await trainer.put(`/api/courses/${first}/prerequisites`).send({ prerequisiteIds: [first] });
      expect(self.body.code).toBe('INVALID_PREREQUISITE');
    });

    it('tracks progress module by module and moves through the learning states', async () => {
      await trainee.post(`/api/courses/${first}/enroll`).expect(201);
      const enrollment = (await trainee.get(`/api/enrollments/me/${first}`).expect(200)).body.data;
      const complete = (moduleId: string) => trainee.post(`/api/enrollments/${enrollment.id}/modules/${moduleId}/complete`);

      const afterOne = (await complete(firstModules[0]!)).body.data;
      expect(afterOne).toMatchObject({ status: 'IN_PROGRESS', progress: 33 });
      expect(afterOne.startedAt).toBeTruthy();

      const undone = await trainee.delete(`/api/enrollments/${enrollment.id}/modules/${firstModules[0]}/complete`).expect(200);
      expect(undone.body.data).toMatchObject({ status: 'ENROLLED', progress: 0 });

      await completeAllModules(trainee, first, firstModules);
      expect((await trainee.get(`/api/enrollments/me/${first}`)).body.data).toMatchObject({ status: 'ASSESSMENT_PENDING', progress: 100 });
    });

    it('recalculates progress when the trainer adds a module to a course in progress', async () => {
      await trainer.post(`/api/courses/${first}/modules`).send({ title: 'Late addition' }).expect(201);
      // 3 of 4 modules done, so the learner is no longer at 100%.
      expect((await trainee.get(`/api/enrollments/me/${first}`)).body.data).toMatchObject({ progress: 75, status: 'IN_PROGRESS' });
    });

    it('rejects completing a module of another course, and un-doing after completion', async () => {
      const enrollment = (await trainee.get(`/api/enrollments/me/${first}`).expect(200)).body.data;
      const foreignModule = (await prisma.module.findFirstOrThrow({ where: { courseId: second } })).id;
      const response = await trainee.post(`/api/enrollments/${enrollment.id}/modules/${foreignModule}/complete`);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('MODULE_NOT_FOUND');
    });

    it('lets a learner withdraw and re-enroll, keeping earlier module progress', async () => {
      const enrollment = (await trainee.get(`/api/enrollments/me/${first}`).expect(200)).body.data;
      await trainee.post(`/api/enrollments/${enrollment.id}/withdraw`).expect(200);
      expect((await trainee.get(`/api/enrollments/me/${first}`)).status).toBe(404);
      expect((await trainee.get('/api/enrollments/me')).body.data).toEqual([]);
      const again = await trainee.post(`/api/courses/${first}/enroll`).expect(201);
      expect(again.body.data.progress).toBe(75);
    });

    it('a course without an assessment is COMPLETED when the last module is done', async () => {
      const bare = (await trainer.post('/api/courses').send(draft({ title: 'No exam', competencies: [{ competencyId: radarId, levelFrom: 0, levelTo: 40 }], modules: [{ title: 'Only module' }] })).expect(201)).body.data;
      await trainer.patch(`/api/courses/${bare.id}/status`).send({ status: 'PUBLISHED' }).expect(200);
      await trainee.post(`/api/courses/${bare.id}/enroll`).expect(201);
      const done = await completeAllModules(trainee, bare.id, [bare.modules[0].id]);
      expect(done).toMatchObject({ status: 'COMPLETED', progress: 100 });
      expect(await prisma.certificate.count()).toBe(0); // certificates are earned through assessments
    });
  });

  describe('feedback', () => {
    it('only enrolled learners can rate; ratings are upserted and summarised; learners stay anonymous to each other', async () => {
      await resetDatabase();
      const world = await agents();
      const built = await buildCourse(world.trainerAgent, { title: 'Rated course', competencyId: world.radar.id, levelFrom: 0, levelTo: 60, questions: 4 });

      const early = await world.traineeAgent.post(`/api/courses/${built.courseId}/feedback`).send({ rating: 5 });
      expect(early.status).toBe(409);
      expect(early.body.code).toBe('NOT_ENROLLED');

      await world.traineeAgent.post(`/api/courses/${built.courseId}/enroll`).expect(201);
      await world.traineeAgent.post(`/api/courses/${built.courseId}/feedback`).send({ rating: 4, trainerRating: 5, comment: 'Clear and practical.' }).expect(201);
      await world.traineeAgent.post(`/api/courses/${built.courseId}/feedback`).send({ rating: 5, trainerRating: 5, comment: 'Even better on second look.' }).expect(201);
      expect(await prisma.feedback.count()).toBe(1);
      expect((await world.traineeAgent.post(`/api/courses/${built.courseId}/feedback`).send({ rating: 6 })).status).toBe(400);

      const asTrainer = (await world.trainerAgent.get(`/api/courses/${built.courseId}/feedback`).expect(200)).body;
      expect(asTrainer.meta.summary).toMatchObject({ count: 1, averageRating: 5, averageTrainerRating: 5 });
      expect(asTrainer.data[0].author.name).toBe('Dr. Ananya Rao');

      const peer = await loginAs((await createUser({ email: 'peer@imd.gov.in' })).email);
      const asPeer = (await peer.get(`/api/courses/${built.courseId}/feedback`).expect(200)).body;
      expect(asPeer.data[0].author.name).toBe('Anonymous learner');
      expect(asPeer.meta.mine).toBeNull();

      const card = (await peer.get('/api/courses?q=Rated').expect(200)).body.data[0];
      expect(card.rating).toEqual({ average: 5, count: 1 });
    });
  });
});
