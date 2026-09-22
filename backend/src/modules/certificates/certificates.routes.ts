import { Router } from 'express';
import { z } from 'zod';
import { conflict, forbidden } from '../../lib/errors';
import { ok, paginated, paginationSchema, skipTake, uuidParam } from '../../lib/http';
import { prisma, type Prisma } from '../../lib/prisma';
import { requiredText, searchQuery } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { verifyLimiter } from '../../middleware/rateLimit';
import { AuditActions, auditContext, recordAudit } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';
import { certificateQrPng, renderCertificatePdf } from './certificate-pdf';
import { verificationKey } from './certificate-signing';
import { loadCertificate, verificationUrl, verifyCertificate } from './certificate.service';

export const certificatesRouter = Router();

/**
 * GET /api/certificates/verify/:certificateId - PUBLIC.
 * Anyone (an employer, an auditor, a QR scanner) can check a certificate without signing in.
 * Always answers 200 with `valid: true|false` so a scanner can render the outcome.
 */
certificatesRouter.get('/verify/:certificateId', verifyLimiter, async (req, res) => {
  const result = await verifyCertificate(z.string().max(60).parse(req.params['certificateId']));
  ok(res, { ...result, verificationUrl: verificationUrl(result.certificateNumber) });
});

/**
 * GET /api/certificates/verification-key - PUBLIC.
 *
 * The Ed25519 public key this server signs certificates with, so a third party
 * can verify one offline without trusting this API. The private key is never
 * exposed here or anywhere else.
 */
certificatesRouter.get('/verification-key', verifyLimiter, (_req, res) => {
  const key = verificationKey();
  ok(res, key ?? { publicKey: null, keyId: null, algorithm: null, signingEnabled: false });
});

certificatesRouter.use(authenticate);

const certificateDto = (certificate: {
  id: string;
  certificateNumber: string;
  holderName: string;
  courseTitle: string;
  issuer: string;
  score: number | null;
  issuedAt: Date;
  status: string;
  revokedAt: Date | null;
  revokedReason: string | null;
  courseId: string;
}) => ({
  id: certificate.id,
  certificateNumber: certificate.certificateNumber,
  courseId: certificate.courseId,
  holderName: certificate.holderName,
  courseTitle: certificate.courseTitle,
  issuer: certificate.issuer,
  score: certificate.score,
  issuedAt: certificate.issuedAt,
  status: certificate.status,
  revokedAt: certificate.revokedAt,
  revokedReason: certificate.revokedReason,
  verificationUrl: verificationUrl(certificate.certificateNumber),
});

/** GET /api/certificates/me - certificates I hold. */
certificatesRouter.get('/me', async (req, res) => {
  const certificates = await prisma.certificate.findMany({ where: { userId: currentUser(req).id }, orderBy: { issuedAt: 'desc' } });
  ok(res, certificates.map(certificateDto));
});

/** GET /api/certificates - admin: every certificate with search and filters. */
certificatesRouter.get('/', requireRole('ADMIN'), async (req, res) => {
  const query = paginationSchema
    .extend({ q: searchQuery, status: z.enum(['VALID', 'REVOKED']).optional(), courseId: z.string().uuid().optional() })
    .parse(req.query);
  const where: Prisma.CertificateWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.courseId ? { courseId: query.courseId } : {}),
    ...(query.q
      ? {
          OR: [
            { certificateNumber: { contains: query.q, mode: 'insensitive' } },
            { holderName: { contains: query.q, mode: 'insensitive' } },
            { courseTitle: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, rows] = await Promise.all([prisma.certificate.count({ where }), prisma.certificate.findMany({ where, orderBy: { issuedAt: 'desc' }, ...skipTake(query) })]);
  paginated(res, rows.map(certificateDto), query.page, query.pageSize, total);
});

/** Holder, an administrator, or the trainer of the course may access a certificate file. */
async function loadAccessible(req: Parameters<typeof currentUser>[0], id: string) {
  const user = currentUser(req);
  const certificate = await loadCertificate(id);
  if (certificate.userId === user.id || user.role === 'ADMIN') return certificate;
  if (user.role === 'TRAINER') {
    const course = await prisma.course.findUnique({ where: { id: certificate.courseId }, select: { trainerId: true } });
    if (course?.trainerId === user.id) return certificate;
  }
  throw forbidden('NOT_YOUR_CERTIFICATE', 'You do not have access to this certificate');
}

/** GET /api/certificates/:id/pdf - the certificate as a PDF (with QR code). `?inline=1` displays it in the browser. */
certificatesRouter.get('/:id/pdf', async (req, res) => {
  const certificate = await loadAccessible(req, uuidParam(req, 'id'));
  const { inline } = z.object({ inline: z.enum(['0', '1']).default('0') }).parse(req.query);
  const pdf = await renderCertificatePdf(certificate);
  res
    .status(200)
    .set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Content-Disposition': `${inline === '1' ? 'inline' : 'attachment'}; filename="certificate-${certificate.certificateNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
    })
    .end(pdf);
});

/** GET /api/certificates/:id/qr - the verification QR code as a PNG. */
certificatesRouter.get('/:id/qr', async (req, res) => {
  const certificate = await loadAccessible(req, uuidParam(req, 'id'));
  const png = await certificateQrPng(certificate.certificateNumber);
  res.status(200).set({ 'Content-Type': 'image/png', 'Content-Length': String(png.length), 'Cache-Control': 'private, max-age=3600' }).end(png);
});

/** POST /api/certificates/:id/revoke - admin. A revoked certificate fails public verification. */
certificatesRouter.post('/:id/revoke', requireRole('ADMIN'), async (req, res) => {
  const { reason } = z.strictObject({ reason: requiredText(3, 300, 'Reason') }).parse(req.body);
  const certificate = await loadCertificate(uuidParam(req, 'id'));
  if (certificate.status === 'REVOKED') throw conflict('ALREADY_REVOKED', 'This certificate is already revoked');
  const updated = await prisma.certificate.update({ where: { id: certificate.id }, data: { status: 'REVOKED', revokedAt: new Date(), revokedReason: reason } });
  await recordAudit(auditContext(req), { action: AuditActions.CERTIFICATE_REVOKED, entityType: 'Certificate', entityId: certificate.id, metadata: { certificateNumber: certificate.certificateNumber, reason } });
  await notifyUser(certificate.userId, {
    type: 'CERTIFICATE_ISSUED',
    title: `Certificate revoked: ${certificate.courseTitle}`,
    message: `Your certificate ${certificate.certificateNumber} was revoked. Reason: ${reason}`,
    link: '/trainee/certificates',
  });
  ok(res, certificateDto(updated));
});

/** POST /api/certificates/:id/reinstate - admin: undo a revocation. */
certificatesRouter.post('/:id/reinstate', requireRole('ADMIN'), async (req, res) => {
  const certificate = await loadCertificate(uuidParam(req, 'id'));
  if (certificate.status !== 'REVOKED') throw conflict('NOT_REVOKED', 'This certificate is not revoked');
  const updated = await prisma.certificate.update({ where: { id: certificate.id }, data: { status: 'VALID', revokedAt: null, revokedReason: null } });
  await recordAudit(auditContext(req), { action: AuditActions.CERTIFICATE_REINSTATED, entityType: 'Certificate', entityId: certificate.id, metadata: { certificateNumber: certificate.certificateNumber } });
  ok(res, certificateDto(updated));
});
