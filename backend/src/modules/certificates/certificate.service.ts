import { randomInt } from 'node:crypto';
import type { Certificate } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';
import { canonicalPayload, signCertificate, verifySignature, type CertificatePayload, type SignatureCheck } from './certificate-signing';

/** Unambiguous alphabet (no 0/O, 1/I/L) so ids can be read out or typed without mistakes. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** e.g. `CC-2026-7K3M9PQX` = prefix - year - 8 random characters (about 1e12 combinations). */
export function generateCertificateNumber(now: Date = new Date()): string {
  const suffix = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${env.CERTIFICATE_ID_PREFIX}-${now.getUTCFullYear()}-${suffix}`;
}

export const CERTIFICATE_NUMBER_PATTERN = /^[A-Z0-9]{2,8}-\d{4}-[A-Z0-9]{8}$/;

/** Public URL a QR code points to. */
export const verificationUrl = (certificateNumber: string): string => `${env.PUBLIC_WEB_URL}/verify/${certificateNumber}`;

export interface IssueCertificateParams {
  userId: string;
  courseId: string;
  enrollmentId: string | null;
  attemptId: string | null;
  score: number | null;
}

/**
 * Issues the certificate for a completed course. Idempotent: a learner holds at
 * most one certificate per course (unique user + course), so retries and races
 * return the existing certificate instead of creating a duplicate.
 */
export async function issueCertificate(db: Db, params: IssueCertificateParams): Promise<{ certificate: Certificate; created: boolean }> {
  const existing = await db.certificate.findUnique({ where: { userId_courseId: { userId: params.userId, courseId: params.courseId } } });
  if (existing) return { certificate: existing, created: false };

  const [user, course] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: params.userId }, select: { name: true } }),
    db.course.findUniqueOrThrow({
      where: { id: params.courseId },
      select: { title: true, competencies: { select: { competency: { select: { name: true } } } } },
    }),
  ]);
  const competencies = course.competencies.map((mapping) => mapping.competency.name).sort();

  // The random id may (very rarely) collide: retry with a fresh one.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      // The signature must cover exactly what is stored, so the payload is built
      // from the same values the row is created with, including the issue time.
      const certificateNumber = generateCertificateNumber();
      const issuedAt = new Date();
      const signed = signCertificate({
        certificateNumber,
        holderName: user.name,
        courseTitle: course.title,
        issuer: env.CERTIFICATE_ISSUER,
        score: params.score,
        issuedAt: issuedAt.toISOString(),
        competencies,
      });

      const certificate = await db.certificate.create({
        data: {
          certificateNumber,
          userId: params.userId,
          courseId: params.courseId,
          enrollmentId: params.enrollmentId,
          attemptId: params.attemptId,
          holderName: user.name,
          courseTitle: course.title,
          issuer: env.CERTIFICATE_ISSUER,
          score: params.score,
          issuedAt,
          signedCompetencies: competencies,
          ...(signed ? { signature: signed.signature, signatureKeyId: signed.keyId, signedAt: issuedAt } : {}),
        },
      });
      return { certificate, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.['target'] ?? '');
        if (target.includes('certificateNumber')) continue;
        const raced = await db.certificate.findUnique({ where: { userId_courseId: { userId: params.userId, courseId: params.courseId } } });
        if (raced) return { certificate: raced, created: false };
      }
      throw error;
    }
  }
  throw new Error('Could not allocate a unique certificate number');
}

/** Announces a newly issued certificate and writes the audit entry. */
export async function announceCertificate(db: Db, certificate: Certificate, ctx: AuditContext): Promise<void> {
  await notifyUser(
    certificate.userId,
    {
      type: 'CERTIFICATE_ISSUED',
      title: `Certificate issued: ${certificate.courseTitle}`,
      message: `Your certificate ${certificate.certificateNumber} is ready to download and share.`,
      link: '/trainee/certificates',
      dedupeKey: `certificate:${certificate.id}`,
    },
    db,
  );
  await recordAudit(ctx, { action: AuditActions.CERTIFICATE_ISSUED, entityType: 'Certificate', entityId: certificate.id, metadata: { certificateNumber: certificate.certificateNumber, course: certificate.courseTitle } }, db);
}

export type VerificationResult =
  | {
      valid: true;
      certificateNumber: string;
      holderName: string;
      courseTitle: string;
      issuer: string;
      score: number | null;
      issuedAt: Date;
      competencies: string[];
      signature: SignatureCheck;
    }
  | {
      valid: false;
      reason: 'NOT_FOUND' | 'REVOKED' | 'TAMPERED';
      certificateNumber: string;
      revokedAt?: Date | null;
      holderName?: string;
      courseTitle?: string;
      signature?: SignatureCheck;
    };

/** The signed facts of a stored certificate, rebuilt exactly as they were at issue. */
export function payloadFor(certificate: Pick<Certificate, 'certificateNumber' | 'holderName' | 'courseTitle' | 'issuer' | 'score' | 'issuedAt' | 'signedCompetencies'>): CertificatePayload {
  return {
    certificateNumber: certificate.certificateNumber,
    holderName: certificate.holderName,
    courseTitle: certificate.courseTitle,
    issuer: certificate.issuer,
    score: certificate.score,
    issuedAt: certificate.issuedAt.toISOString(),
    competencies: certificate.signedCompetencies,
  };
}

/**
 * Public verification. Exposes only what is printed on the certificate itself
 * (holder, course, score, date, issuer) - never e-mail, employee id or any internal identifier.
 */
export async function verifyCertificate(rawNumber: string): Promise<VerificationResult> {
  const certificateNumber = rawNumber.trim().toUpperCase();
  if (!CERTIFICATE_NUMBER_PATTERN.test(certificateNumber)) return { valid: false, reason: 'NOT_FOUND', certificateNumber };
  const certificate = await prisma.certificate.findUnique({ where: { certificateNumber } });
  if (!certificate) return { valid: false, reason: 'NOT_FOUND', certificateNumber };
  const signature = verifySignature(payloadFor(certificate), certificate.signature, certificate.signatureKeyId);

  if (certificate.status === 'REVOKED') {
    return { valid: false, reason: 'REVOKED', certificateNumber, revokedAt: certificate.revokedAt, holderName: certificate.holderName, courseTitle: certificate.courseTitle, signature };
  }
  // A signature that does not match means the stored record was altered after issue.
  // That is a stronger failure than "not found": the certificate must not be trusted.
  if (signature.state === 'INVALID') {
    return { valid: false, reason: 'TAMPERED', certificateNumber, holderName: certificate.holderName, courseTitle: certificate.courseTitle, signature };
  }

  return {
    valid: true,
    certificateNumber,
    holderName: certificate.holderName,
    courseTitle: certificate.courseTitle,
    issuer: certificate.issuer,
    score: certificate.score,
    issuedAt: certificate.issuedAt,
    competencies: certificate.signedCompetencies,
    signature,
  };
}

/** The exact bytes a signature covers, for anyone verifying a certificate themselves. */
export const canonicalFor = (certificate: Parameters<typeof payloadFor>[0]): string => canonicalPayload(payloadFor(certificate));

export async function loadCertificate(id: string): Promise<Certificate> {
  const certificate = await prisma.certificate.findUnique({ where: { id } });
  if (!certificate) throw notFound('CERTIFICATE_NOT_FOUND', 'Certificate not found');
  return certificate;
}
