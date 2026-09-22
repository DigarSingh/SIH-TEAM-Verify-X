import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { app, type Agent } from '../helpers/http';
import { agents, buildCourse, takeAssessment, type BuiltCourse } from '../helpers/scenario';

/**
 * Signed certificates, through the public verification endpoint that a QR scan
 * lands on. The signing key is generated per test run (see `tests/setup-env.ts`),
 * so these exercise real Ed25519 signatures rather than a stub.
 */
describe('signed certificates', () => {
  let trainee: Agent;
  let trainer: Agent;
  let admin: Agent;
  let built: BuiltCourse;
  let radarId: string;
  let certificate: { id: string; certificateNumber: string };

  const verify = (certificateNumber: string) => request(app).get(`/api/certificates/verify/${certificateNumber}`);

  beforeAll(async () => {
    await resetDatabase();
    const world = await agents();
    trainee = world.traineeAgent;
    trainer = world.trainerAgent;
    admin = world.adminAgent;
    radarId = world.radar.id;
    built = await buildCourse(trainer, { title: 'Radar Fundamentals', competencyId: radarId, levelFrom: 0, levelTo: 75 });
    certificate = (await takeAssessment(trainee, built, ['(b0)', '(a0)', '(a1)'])).body.data.certificate;
  });

  describe('issuing', () => {
    it('signs the certificate and records which key signed it', async () => {
      const stored = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });
      expect(stored.signature).toBeTruthy();
      expect(stored.signatureKeyId).toMatch(/^[0-9a-f]{16}$/);
      expect(stored.signedAt).not.toBeNull();
    });

    it('snapshots the competencies the signature covers', async () => {
      const stored = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });
      expect(stored.signedCompetencies).toEqual(['Radar Meteorology']);
    });
  });

  describe('public verification', () => {
    it('reports a genuine certificate as valid with a valid signature', async () => {
      const { body } = await verify(certificate.certificateNumber).expect(200);
      expect(body.data.valid).toBe(true);
      expect(body.data.signature.state).toBe('VALID');
      expect(body.data.signature.keyId).toMatch(/^[0-9a-f]{16}$/);
      expect(body.data.competencies).toEqual(['Radar Meteorology']);
    });

    it('never exposes the private key or any internal identifier', async () => {
      const { body } = await verify(certificate.certificateNumber).expect(200);
      const text = JSON.stringify(body);
      expect(text).not.toContain('PRIVATE');
      expect(text).not.toContain(certificate.id); // the internal row id stays internal
      expect(text).not.toContain('@'); // no e-mail address
    });

    it('publishes the public key so anyone can verify independently', async () => {
      const { body } = await request(app).get('/api/certificates/verification-key').expect(200);
      expect(body.data.algorithm).toBe('Ed25519');
      expect(body.data.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(body.data.publicKey).not.toContain('PRIVATE');
      expect(body.data.keyId).toMatch(/^[0-9a-f]{16}$/);
    });

    it('verifies against the published key outside the application', async () => {
      const { verify: cryptoVerify, createPublicKey } = await import('node:crypto');
      const { canonicalFor } = await import('../../src/modules/certificates/certificate.service');

      const keyResponse = await request(app).get('/api/certificates/verification-key').expect(200);
      const stored = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });

      const ok = cryptoVerify(
        null,
        Buffer.from(canonicalFor(stored), 'utf8'),
        createPublicKey(keyResponse.body.data.publicKey as string),
        Buffer.from(stored.signature as string, 'base64'),
      );
      expect(ok).toBe(true);
    });
  });

  describe('tamper detection', () => {
    it('refuses a certificate whose holder name was altered in the database', async () => {
      const course = await buildCourse(trainer, { title: 'Tamper Course', competencyId: radarId, levelFrom: 0, levelTo: 70 });
      const issued = (await takeAssessment(trainee, course, ['(b0)', '(a0)', '(a1)'])).body.data.certificate as { id: string; certificateNumber: string };

      await expect(verify(issued.certificateNumber).expect(200)).resolves.toMatchObject({ body: { data: { valid: true } } });

      // Someone edits the record directly, bypassing the application.
      await prisma.certificate.update({ where: { id: issued.id }, data: { holderName: 'Someone Else' } });

      const { body } = await verify(issued.certificateNumber).expect(200);
      expect(body.data.valid).toBe(false);
      expect(body.data.reason).toBe('TAMPERED');
      expect(body.data.signature.state).toBe('INVALID');
    });

    it('detects an altered score just as readily', async () => {
      const stored = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });
      await prisma.certificate.update({ where: { id: certificate.id }, data: { score: 100 } });
      const { body } = await verify(certificate.certificateNumber).expect(200);
      expect(body.data.reason).toBe('TAMPERED');

      // Put it back so later expectations still hold.
      await prisma.certificate.update({ where: { id: certificate.id }, data: { score: stored.score } });
      await expect(verify(certificate.certificateNumber).expect(200)).resolves.toMatchObject({ body: { data: { valid: true } } });
    });

    it('detects a forged signature', async () => {
      const stored = await prisma.certificate.findUniqueOrThrow({ where: { id: certificate.id } });
      await prisma.certificate.update({ where: { id: certificate.id }, data: { signature: Buffer.from('forged').toString('base64') } });
      const { body } = await verify(certificate.certificateNumber).expect(200);
      expect(body.data.reason).toBe('TAMPERED');
      await prisma.certificate.update({ where: { id: certificate.id }, data: { signature: stored.signature } });
    });

    it('still reports a revoked certificate as revoked, with its signature state', async () => {
      await admin.post(`/api/certificates/${certificate.id}/revoke`).send({ reason: 'Issued in error during testing' }).expect(200);

      const { body } = await verify(certificate.certificateNumber).expect(200);
      expect(body.data.valid).toBe(false);
      expect(body.data.reason).toBe('REVOKED');
      expect(body.data.signature.state).toBe('VALID'); // genuine, but withdrawn
    });
  });

  describe('a certificate issued before signing was configured', () => {
    it('is reported as unsigned rather than invalid', async () => {
      const course = await buildCourse(trainer, { title: 'Legacy Course', competencyId: radarId, levelFrom: 0, levelTo: 70 });
      const issued = (await takeAssessment(trainee, course, ['(b0)', '(a0)', '(a1)'])).body.data.certificate as { id: string; certificateNumber: string };
      await prisma.certificate.update({ where: { id: issued.id }, data: { signature: null, signatureKeyId: null, signedAt: null } });

      const { body } = await verify(issued.certificateNumber).expect(200);
      expect(body.data.valid).toBe(true);
      expect(body.data.signature.state).toBe('UNSIGNED');
    });
  });
});
