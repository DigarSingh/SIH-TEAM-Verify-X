import { Router } from 'express';
import { env } from '../../config/env';
import { aiProviderLabel, isAiConfigured } from '../ai/ai.client';
import { ok } from '../../lib/http';
import { prisma } from '../../lib/prisma';

export const metaRouter = Router();

/**
 * GET /api/meta/options - PUBLIC. Everything the registration form needs:
 * active departments and job roles, the approval policy and the password rules.
 * It also tells the web app the upload size limit so file pickers can warn early, and whether the optional AI features are on
 * and which service receives their text (shown in the notice next to each AI feature).
 */
metaRouter.get('/options', async (_req, res) => {
  const [departments, roles] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.role.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
  ]);
  ok(res, {
    departments,
    roles,
    registration: { requiresApproval: env.REGISTRATION_REQUIRES_APPROVAL, allowedEmailDomains: env.ALLOWED_EMAIL_DOMAINS },
    passwordPolicy: { minLength: 10, requires: ['lowercase', 'uppercase', 'digit', 'symbol'] },
    features: { ai: isAiConfigured(), aiProvider: aiProviderLabel() },
    uploads: { maxMb: env.MAX_UPLOAD_MB },
  });
});
