import { conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { notifyUser } from '../../services/notification.service';

/**
 * Administrator sets or corrects an employee's verified competency level
 * (e.g. an initial baseline when onboarding, or a correction after review).
 * Recorded in the competency history so the timeline stays complete and auditable.
 */
export async function adjustCompetencyLevel(params: { userId: string; competencyId: string; level: number; reason: string; actor: AuditContext }) {
  const { userId, competencyId, level, reason, actor } = params;
  const [user, competency] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.competency.findUnique({ where: { id: competencyId }, select: { id: true, name: true, isActive: true } }),
  ]);
  if (!user) throw notFound('USER_NOT_FOUND', 'Employee not found');
  if (!competency) throw notFound('COMPETENCY_NOT_FOUND', 'Competency not found');
  if (!competency.isActive) throw conflict('COMPETENCY_INACTIVE', 'Inactive competencies cannot be assessed');

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.employeeCompetency.findUnique({ where: { userId_competencyId: { userId, competencyId } } });
    const previousLevel = existing?.currentLevel ?? 0;
    if (existing && previousLevel === level) return { changed: false, previousLevel, newLevel: level };

    await tx.employeeCompetency.upsert({
      where: { userId_competencyId: { userId, competencyId } },
      create: { userId, competencyId, currentLevel: level, lastEvidenceAt: new Date() },
      update: { currentLevel: level, lastEvidenceAt: new Date() },
    });
    await tx.competencyHistory.create({
      data: {
        userId,
        competencyId,
        previousLevel,
        newLevel: level,
        source: existing ? 'ADMIN_ADJUSTMENT' : 'BASELINE',
        details: { reason, adjustedBy: actor.userId ?? null, explanation: `${existing ? 'Adjusted' : 'Baseline recorded'} by an administrator: ${reason}` },
      },
    });
    return { changed: true, previousLevel, newLevel: level };
  });

  if (result.changed) {
    await recordAudit(actor, {
      action: AuditActions.COMPETENCY_ADJUSTED,
      entityType: 'User',
      entityId: userId,
      metadata: { competency: competency.name, from: result.previousLevel, to: result.newLevel, reason },
    });
    await notifyUser(userId, {
      type: 'COMPETENCY_UPDATE',
      title: `${competency.name} level updated`,
      message: `Your ${competency.name} competency was recorded at ${result.newLevel}% (previously ${result.previousLevel}%).`,
      link: '/trainee/passport',
    });
  }
  return { competencyId, competencyName: competency.name, ...result };
}
