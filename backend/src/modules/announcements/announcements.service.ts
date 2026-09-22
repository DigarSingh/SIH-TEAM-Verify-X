import type { AnnouncementAudience, Prisma } from '@prisma/client';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUsers } from '../../services/notification.service';

const audienceRoles: Record<Exclude<AnnouncementAudience, 'ALL'>, 'TRAINEE' | 'TRAINER' | 'ADMIN'> = {
  TRAINEES: 'TRAINEE',
  TRAINERS: 'TRAINER',
  ADMINS: 'ADMIN',
};

export interface AnnouncementInput {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  departmentId?: string | null | undefined;
  expiresAt?: Date | null | undefined;
}

/** Users an announcement is addressed to. */
async function recipientIds(audience: AnnouncementAudience, departmentId: string | null | undefined): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      ...(audience === 'ALL' ? {} : { role: audienceRoles[audience] }),
      ...(departmentId ? { departmentId } : {}),
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

/** Publishes an announcement and delivers it as a notification to every recipient. */
export async function createAnnouncement(authorId: string, input: AnnouncementInput, notify: boolean, ctx: AuditContext) {
  if (input.departmentId && !(await prisma.department.findUnique({ where: { id: input.departmentId }, select: { id: true } }))) {
    throw notFound('DEPARTMENT_NOT_FOUND', 'Department not found');
  }
  const announcement = await prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      audience: input.audience,
      departmentId: input.departmentId ?? null,
      expiresAt: input.expiresAt ?? null,
      createdById: authorId,
    },
  });
  const notified = notify
    ? await notifyUsers(await recipientIds(input.audience, input.departmentId), {
        type: 'ANNOUNCEMENT',
        title: input.title,
        message: input.body.length > 240 ? `${input.body.slice(0, 237)}...` : input.body,
        link: '/announcements',
        dedupeKey: `announcement:${announcement.id}`,
        metadata: { announcementId: announcement.id },
      })
    : 0;
  await recordAudit(ctx, { action: AuditActions.ANNOUNCEMENT_CREATED, entityType: 'Announcement', entityId: announcement.id, metadata: { title: input.title, audience: input.audience, notified } });
  return { announcement, notified };
}

export async function updateAnnouncement(id: string, input: Partial<AnnouncementInput>, ctx: AuditContext) {
  if (!(await prisma.announcement.findUnique({ where: { id }, select: { id: true } }))) throw notFound('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
  const data: Prisma.AnnouncementUncheckedUpdateInput = {};
  for (const [key, value] of Object.entries(input)) if (value !== undefined) (data as Record<string, unknown>)[key] = value;
  const announcement = await prisma.announcement.update({ where: { id }, data });
  await recordAudit(ctx, { action: AuditActions.ANNOUNCEMENT_UPDATED, entityType: 'Announcement', entityId: id, metadata: { changes: Object.keys(input) } });
  return announcement;
}

export async function deleteAnnouncement(id: string, ctx: AuditContext): Promise<void> {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw notFound('ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
  await prisma.announcement.delete({ where: { id } });
  await recordAudit(ctx, { action: AuditActions.ANNOUNCEMENT_DELETED, entityType: 'Announcement', entityId: id, metadata: { title: existing.title } });
}

/** Announcements currently visible to a user (their audience, not expired), newest first. */
export async function listActiveAnnouncements(user: Express.AuthUser, departmentId: string | null) {
  const now = new Date();
  const audiences: AnnouncementAudience[] = ['ALL', user.role === 'TRAINEE' ? 'TRAINEES' : user.role === 'TRAINER' ? 'TRAINERS' : 'ADMINS'];
  const rows = await prisma.announcement.findMany({
    where: {
      publishedAt: { lte: now },
      audience: { in: audiences },
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, { OR: [{ departmentId: null }, ...(departmentId ? [{ departmentId }] : [])] }],
    },
    orderBy: { publishedAt: 'desc' },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map((row) => ({ id: row.id, title: row.title, body: row.body, audience: row.audience, publishedAt: row.publishedAt, expiresAt: row.expiresAt, author: row.createdBy.name }));
}
