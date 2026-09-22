import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { issueCertificate } from '../../src/modules/certificates/certificate.service';
import { resetDatabase } from '../helpers/db';
import { app, loginAs, type Agent } from '../helpers/http';
import { agents, buildCourse, takeAssessment, type BuiltCourse } from '../helpers/scenario';

describe('certificates', () => {
  let trainee: Agent;
  let trainer: Agent;
  let admin: Agent;
  let traineeId: string;
  let radarId: string;
  let built: BuiltCourse;
  let certificate: { id: string; certificateNumber: string };

  beforeAll(async () => {
    await resetDatabase();
    const world = await agents();
    trainee = world.traineeAgent;
    trainer = world.trainerAgent;
    admin = world.adminAgent;
    traineeId = world.trainee.id;
    radarId = world.radar.id;
    built = await buildCourse(trainer, { title: 'Radar Fundamentals', competencyId: radarId, levelFrom: 0, levelTo: 75 });
    const result = await takeAssessment(trainee, built, ['(b0)', '(a0)', '(a1)']);
    certificate = result.body.data.certificate;
  });

  it('is generated when the assessment is passed, with the data printed on the certificate', async () => {
    const stored = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });
    expect(stored).toMatchObject({
      holderName: 'Dr. Ananya Rao',
      courseTitle: 'Radar Fundamentals',
      score: 84,
      status: 'VALID',
      userId: traineeId,
      courseId: built.courseId,
      issuer: expect.stringContaining('India Meteorological Department'),
    });
    expect(stored.certificateNumber).toMatch(/^CC-\d{4}-[A-HJKMNP-Z2-9]{8}$/); // unambiguous alphabet: no 0, O, 1, I, L
    expect(stored.attemptId).toBeTruthy();
  });

  it('lists my certificates with their verification link', async () => {
    const list = (await trainee.get('/api/certificates/me').expect(200)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ certificateNumber: certificate.certificateNumber, score: 84, status: 'VALID' });
    expect(list[0].verificationUrl).toBe(`http://localhost:5173/verify/${certificate.certificateNumber}`);
  });

  it('issuing again returns the same certificate (idempotent, one per learner and course)', async () => {
    const before = await prisma.certificate.count();
    const again = await issueCertificate(prisma, { userId: traineeId, courseId: built.courseId, enrollmentId: null, attemptId: null, score: 100 });
    expect(again.created).toBe(false);
    expect(again.certificate.id).toBe(certificate.id);
    expect(await prisma.certificate.count()).toBe(before);
  });

  it('cannot be earned without passing: a failed attempt issues nothing', async () => {
    const other = await buildCourse(trainer, { title: 'Failing course', competencyId: radarId, levelFrom: 0, levelTo: 60, questions: 4 });
    const result = await takeAssessment(trainee, other, ['(b1)', '(b2)', '(b3)', '(b4)']);
    expect(result.body.data.certificate).toBeNull();
    expect(await prisma.certificate.count({ where: { courseId: other.courseId } })).toBe(0);
  });

  it('is skipped when the course has certificates switched off, but the course is still completed', async () => {
    const plain = await buildCourse(trainer, { title: 'No certificate course', competencyId: radarId, levelFrom: 0, levelTo: 60, questions: 4 });
    await trainer.patch(`/api/courses/${plain.courseId}`).send({ certificateEnabled: false }).expect(200);
    const result = await takeAssessment(trainee, plain);
    expect(result.body.data.attempt.passed).toBe(true);
    expect(result.body.data.certificate).toBeNull();
    expect(result.body.data.enrollment.status).toBe('COMPLETED');
  });

  describe('public verification', () => {
    it('confirms a valid certificate without authentication and exposes only what is printed on it', async () => {
      const response = await request(app).get(`/api/certificates/verify/${certificate.certificateNumber}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ valid: true, holderName: 'Dr. Ananya Rao', courseTitle: 'Radar Fundamentals', score: 84 });
      // Pinned deliberately: every field here is printed on the certificate itself.
      // `competencies` and `signature` were added with certificate signing; neither
      // reveals anything private (the signature block names only the public key id).
      expect(Object.keys(response.body.data).sort()).toEqual([
        'certificateNumber',
        'competencies',
        'courseTitle',
        'holderName',
        'issuedAt',
        'issuer',
        'score',
        'signature',
        'valid',
        'verificationUrl',
      ]);
    });

    it('accepts lower-case ids and surrounding spaces', async () => {
      const response = await request(app).get(`/api/certificates/verify/${encodeURIComponent(` ${certificate.certificateNumber.toLowerCase()} `)}`);
      expect(response.body.data.valid).toBe(true);
    });

    it.each(['CC-2026-ZZZZZZZZ', 'not-a-certificate', "CC-2026-'; DROP TABLE", '../../etc/passwd'])('reports %j as not found without leaking anything', async (id) => {
      const response = await request(app).get(`/api/certificates/verify/${encodeURIComponent(id)}`);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ valid: false, reason: 'NOT_FOUND' });
      expect(response.body.data.holderName).toBeUndefined();
    });
  });

  describe('files', () => {
    it('renders a PDF with the QR code for the holder, and refuses everyone else', async () => {
      const pdf = await trainee.get(`/api/certificates/${certificate.id}/pdf`).buffer(true).parse(binary);
      expect(pdf.status).toBe(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect(pdf.headers['content-disposition']).toContain(`certificate-${certificate.certificateNumber}.pdf`);
      const body = pdf.body as Buffer;
      expect(body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(body.includes(Buffer.from('/Image'))).toBe(true); // the embedded QR code

      expect((await admin.get(`/api/certificates/${certificate.id}/pdf`)).status).toBe(200);
      expect((await trainer.get(`/api/certificates/${certificate.id}/pdf`)).status).toBe(200); // trainer of that course
      expect((await request(app).get(`/api/certificates/${certificate.id}/pdf`)).status).toBe(401);
      const inline = await trainee.get(`/api/certificates/${certificate.id}/pdf?inline=1`).buffer(true).parse(binary);
      expect(inline.headers['content-disposition']).toMatch(/^inline/);
    });

    it('produces a QR code that points at the public verification page', async () => {
      const response = await trainee.get(`/api/certificates/${certificate.id}/qr`).buffer(true).parse(binary);
      expect(response.headers['content-type']).toBe('image/png');
      expect((response.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
      const { certificateQrPng } = await import('../../src/modules/certificates/certificate-pdf');
      const { verificationUrl } = await import('../../src/modules/certificates/certificate.service');
      expect((await certificateQrPng(certificate.certificateNumber)).length).toBeGreaterThan(200);
      expect(verificationUrl(certificate.certificateNumber)).toBe(`http://localhost:5173/verify/${certificate.certificateNumber}`);
    });
  });

  describe('administration', () => {
    it('lets an admin search all certificates and filter by status', async () => {
      const all = await admin.get('/api/certificates').expect(200);
      expect(all.body.meta.total).toBeGreaterThanOrEqual(1);
      const byName = await admin.get('/api/certificates?q=ananya').expect(200);
      expect(byName.body.data.every((c: { holderName: string }) => c.holderName.includes('Ananya'))).toBe(true);
      expect((await admin.get('/api/certificates?status=REVOKED').expect(200)).body.data).toEqual([]);
    });

    it('revokes a certificate (reason required) so it fails public verification, then reinstates it', async () => {
      expect((await admin.post(`/api/certificates/${certificate.id}/revoke`).send({})).status).toBe(400);
      const revoked = await admin.post(`/api/certificates/${certificate.id}/revoke`).send({ reason: 'Assessment integrity review' });
      expect(revoked.status).toBe(200);
      expect(revoked.body.data).toMatchObject({ status: 'REVOKED', revokedReason: 'Assessment integrity review' });
      expect((await admin.post(`/api/certificates/${certificate.id}/revoke`).send({ reason: 'Again please' })).body.code).toBe('ALREADY_REVOKED');

      const verification = await request(app).get(`/api/certificates/verify/${certificate.certificateNumber}`);
      expect(verification.body.data).toMatchObject({ valid: false, reason: 'REVOKED', holderName: 'Dr. Ananya Rao' });
      const notice = (await trainee.get('/api/notifications?type=CERTIFICATE_ISSUED').expect(200)).body.data;
      expect(notice.some((n: { title: string }) => n.title.startsWith('Certificate revoked'))).toBe(true);
      expect((await admin.post('/api/certificates/x/reinstate')).status).toBe(400);

      await admin.post(`/api/certificates/${certificate.id}/reinstate`).expect(200);
      expect((await request(app).get(`/api/certificates/verify/${certificate.certificateNumber}`)).body.data.valid).toBe(true);
      expect((await admin.post(`/api/certificates/${certificate.id}/reinstate`)).body.code).toBe('NOT_REVOKED');

      const actions = (await prisma.auditLog.findMany({ where: { entityId: certificate.id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
      expect(actions).toEqual(['CERTIFICATE_ISSUED', 'CERTIFICATE_REVOKED', 'CERTIFICATE_REINSTATED']);
    });

    it('the holder cannot revoke their own certificate', async () => {
      expect((await trainee.post(`/api/certificates/${certificate.id}/revoke`).send({ reason: 'I changed my mind' })).status).toBe(403);
      expect(await loginAs('trainee@imd.gov.in')).toBeTruthy();
    });
  });
});

function binary(res: request.Response, callback: (error: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}
