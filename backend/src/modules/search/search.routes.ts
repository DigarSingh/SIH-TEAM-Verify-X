import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../lib/http';
import { prisma, type Prisma } from '../../lib/prisma';
import { searchQuery } from '../../lib/schemas';
import { authenticate, currentUser } from '../../middleware/authenticate';

export const searchRouter = Router();
searchRouter.use(authenticate);

/** A short excerpt around the first match, so users see why a result matched. */
function snippet(text: string | null | undefined, term: string, radius = 70): string | null {
  if (!text) return null;
  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index < 0) return null;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

/**
 * GET /api/search?q=  - global search over courses, competencies, learning materials
 * and (where authorised) employees. Every group respects what the caller may see:
 *  - trainees: published courses; materials of courses they are enrolled in; no employees
 *  - trainers: published + own courses; materials of own courses; trainees of their courses
 *  - admins:   everything
 */
searchRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const { q, limit } = z.object({ q: searchQuery, limit: z.coerce.number().int().min(1).max(10).default(5) }).parse(req.query);
  if (!q || q.length < 2) {
    ok(res, { query: q ?? '', courses: [], competencies: [], materials: [], employees: [] });
    return;
  }
  const contains = { contains: q, mode: 'insensitive' as const };

  const courseVisibility: Prisma.CourseWhereInput =
    user.role === 'ADMIN' ? { deletedAt: null } : user.role === 'TRAINER' ? { deletedAt: null, OR: [{ status: 'PUBLISHED' }, { trainerId: user.id }] } : { deletedAt: null, status: 'PUBLISHED' };

  const materialScope: Prisma.LearningMaterialWhereInput =
    user.role === 'ADMIN'
      ? {}
      : user.role === 'TRAINER'
        ? { module: { course: { trainerId: user.id, deletedAt: null } } }
        : { module: { course: { deletedAt: null, enrollments: { some: { userId: user.id, status: { not: 'WITHDRAWN' } } } } } };

  const [courses, competencies, materials, employees] = await Promise.all([
    prisma.course.findMany({
      where: { AND: [courseVisibility, { OR: [{ title: contains }, { description: contains }, { category: contains }, { competencies: { some: { competency: { name: contains } } } }] }] },
      orderBy: { title: 'asc' },
      take: limit,
      select: { id: true, title: true, category: true, difficulty: true, status: true },
    }),
    prisma.competency.findMany({ where: { isActive: true, OR: [{ name: contains }, { code: contains }, { description: contains }] }, orderBy: { name: 'asc' }, take: limit, select: { id: true, name: true, category: true, description: true } }),
    prisma.learningMaterial.findMany({
      where: { AND: [materialScope, { OR: [{ title: contains }, { content: contains }, { extractedText: contains }] }] },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, type: true, content: true, extractedText: true, module: { select: { title: true, course: { select: { id: true, title: true } } } } },
    }),
    user.role === 'TRAINEE'
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: {
            deletedAt: null,
            status: 'ACTIVE',
            OR: [{ name: contains }, { email: contains }, { employeeId: contains }],
            ...(user.role === 'TRAINER' ? { enrollments: { some: { course: { trainerId: user.id }, status: { not: 'WITHDRAWN' } } } } : {}),
          },
          orderBy: { name: 'asc' },
          take: limit,
          select: { id: true, name: true, email: true, role: true, employeeId: true, department: { select: { name: true } } },
        }),
  ]);

  ok(res, {
    query: q,
    courses,
    competencies: competencies.map((competency) => ({ id: competency.id, name: competency.name, category: competency.category, snippet: snippet(competency.description, q) })),
    materials: materials.map((material) => ({
      id: material.id,
      title: material.title,
      type: material.type,
      moduleTitle: material.module.title,
      courseId: material.module.course.id,
      courseTitle: material.module.course.title,
      snippet: snippet(material.content, q) ?? snippet(material.extractedText, q),
    })),
    employees: employees.map((employee) => ({ id: employee.id, name: employee.name, email: employee.email, role: employee.role, employeeId: employee.employeeId, department: employee.department?.name ?? null })),
  });
});
