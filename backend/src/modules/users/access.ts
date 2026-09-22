import { forbidden } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

/**
 * Who may see an employee's competency data?
 *  - the employee themself
 *  - any administrator
 *  - a trainer, but only for trainees enrolled in one of the trainer's own courses
 */
export async function assertCanViewEmployee(viewer: Express.AuthUser, employeeId: string): Promise<void> {
  if (viewer.id === employeeId || viewer.role === 'ADMIN') return;
  if (viewer.role === 'TRAINER') {
    const shared = await prisma.enrollment.findFirst({ where: { userId: employeeId, course: { trainerId: viewer.id, deletedAt: null } }, select: { id: true } });
    if (shared) return;
  }
  throw forbidden('NOT_YOUR_TRAINEE', 'You can only view trainees who are enrolled in your courses');
}
