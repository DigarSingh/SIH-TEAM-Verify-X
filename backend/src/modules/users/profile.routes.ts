import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { conflict, notFound } from '../../lib/errors';
import { created, ok, uuidParam } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { isoDate, nullableText, optionalText, requiredText } from '../../lib/schemas';
import { currentUser } from '../../middleware/authenticate';

/**
 * The signed-in user's professional profile: headline / bio / expertise,
 * qualifications, work experience and self-declared skills.
 * Mounted at `/api/users/me` (authentication is applied by the parent router).
 */
export const profileRouter = Router();

const profileInclude = {
  qualifications: { orderBy: [{ yearCompleted: 'desc' as const }, { createdAt: 'desc' as const }] },
  experiences: { orderBy: { startDate: 'desc' as const } },
  skills: { orderBy: { name: 'asc' as const } },
} satisfies Prisma.ProfessionalProfileInclude;

/** Profiles are created lazily on first access. */
async function ensureProfile(userId: string) {
  return prisma.professionalProfile.upsert({ where: { userId }, create: { userId }, update: {}, include: profileInclude });
}

const currentYear = new Date().getFullYear();

const profileSchema = z.strictObject({
  headline: nullableText(160),
  bio: nullableText(2000),
  expertise: z.array(requiredText(1, 60, 'Expertise')).max(20, 'At most 20 items').optional(),
});

const qualificationSchema = z.strictObject({
  degree: requiredText(2, 120, 'Degree'),
  institution: requiredText(2, 160, 'Institution'),
  fieldOfStudy: optionalText(120),
  yearCompleted: z.number().int().min(1950).max(currentYear + 1).optional(),
});

const experienceObject = z.strictObject({
  title: requiredText(2, 120, 'Title'),
  organization: requiredText(2, 160, 'Organisation'),
  location: optionalText(120),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  description: optionalText(1000),
});
const experienceSchema = experienceObject.refine((value) => !value.endDate || value.endDate >= value.startDate, {
  path: ['endDate'],
  message: 'End date cannot be before the start date',
});

const skillSchema = z.strictObject({
  name: requiredText(1, 60, 'Skill'),
  proficiency: z.number().int().min(1).max(5).default(3),
});

/** GET /api/users/me/profile */
profileRouter.get('/profile', async (req, res) => {
  ok(res, await ensureProfile(currentUser(req).id));
});

/** PUT /api/users/me/profile */
profileRouter.put('/profile', async (req, res) => {
  const { id } = currentUser(req);
  const input = profileSchema.parse(req.body);
  await prisma.professionalProfile.upsert({
    where: { userId: id },
    create: { userId: id, headline: input.headline ?? null, bio: input.bio ?? null, expertise: input.expertise ?? [] },
    update: {
      ...(input.headline !== undefined ? { headline: input.headline } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.expertise !== undefined ? { expertise: input.expertise } : {}),
    },
  });
  ok(res, await ensureProfile(id));
});

// ---- qualifications ----------------------------------------------------------------------------

profileRouter.post('/qualifications', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const input = qualificationSchema.parse(req.body);
  const qualification = await prisma.qualification.create({
    data: { profileId: profile.id, degree: input.degree, institution: input.institution, fieldOfStudy: input.fieldOfStudy ?? null, yearCompleted: input.yearCompleted ?? null },
  });
  created(res, qualification);
});

profileRouter.patch('/qualifications/:id', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const id = uuidParam(req, 'id');
  const input = qualificationSchema.partial().parse(req.body);
  const updated = await prisma.qualification.updateMany({ where: { id, profileId: profile.id }, data: input });
  if (updated.count === 0) throw notFound('QUALIFICATION_NOT_FOUND', 'Qualification not found');
  ok(res, await prisma.qualification.findUnique({ where: { id } }));
});

profileRouter.delete('/qualifications/:id', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const removed = await prisma.qualification.deleteMany({ where: { id: uuidParam(req, 'id'), profileId: profile.id } });
  if (removed.count === 0) throw notFound('QUALIFICATION_NOT_FOUND', 'Qualification not found');
  ok(res, { deleted: true });
});

// ---- experience --------------------------------------------------------------------------------------

profileRouter.post('/experiences', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const input = experienceSchema.parse(req.body);
  const experience = await prisma.workExperience.create({
    data: {
      profileId: profile.id,
      title: input.title,
      organization: input.organization,
      location: input.location ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      description: input.description ?? null,
    },
  });
  created(res, experience);
});

profileRouter.patch('/experiences/:id', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const id = uuidParam(req, 'id');
  const input = experienceObject.partial().parse(req.body);
  const existing = await prisma.workExperience.findFirst({ where: { id, profileId: profile.id } });
  if (!existing) throw notFound('EXPERIENCE_NOT_FOUND', 'Experience not found');
  const start = input.startDate ?? existing.startDate;
  const end = input.endDate === undefined ? existing.endDate : input.endDate;
  if (end && end < start) throw new z.ZodError([{ code: 'custom', path: ['endDate'], message: 'End date cannot be before the start date' }]);
  ok(res, await prisma.workExperience.update({ where: { id }, data: input }));
});

profileRouter.delete('/experiences/:id', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const removed = await prisma.workExperience.deleteMany({ where: { id: uuidParam(req, 'id'), profileId: profile.id } });
  if (removed.count === 0) throw notFound('EXPERIENCE_NOT_FOUND', 'Experience not found');
  ok(res, { deleted: true });
});

// ---- skills ------------------------------------------------------------------------------------------------

profileRouter.post('/skills', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const input = skillSchema.parse(req.body);
  try {
    created(res, await prisma.profileSkill.create({ data: { profileId: profile.id, name: input.name, proficiency: input.proficiency } }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw conflict('SKILL_EXISTS', 'You have already added this skill');
    throw error;
  }
});

profileRouter.patch('/skills/:id', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const id = uuidParam(req, 'id');
  const input = z.strictObject({ proficiency: z.number().int().min(1).max(5) }).parse(req.body);
  const updated = await prisma.profileSkill.updateMany({ where: { id, profileId: profile.id }, data: input });
  if (updated.count === 0) throw notFound('SKILL_NOT_FOUND', 'Skill not found');
  ok(res, await prisma.profileSkill.findUnique({ where: { id } }));
});

profileRouter.delete('/skills/:id', async (req, res) => {
  const profile = await ensureProfile(currentUser(req).id);
  const removed = await prisma.profileSkill.deleteMany({ where: { id: uuidParam(req, 'id'), profileId: profile.id } });
  if (removed.count === 0) throw notFound('SKILL_NOT_FOUND', 'Skill not found');
  ok(res, { deleted: true });
});
