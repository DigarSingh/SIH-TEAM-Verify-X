import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors';
import { created, ok, paginated, paginationSchema, uuidParam } from '../../lib/http';
import { prisma } from '../../lib/prisma';
import { searchQuery } from '../../lib/schemas';
import { authenticate, currentUser, requireRole } from '../../middleware/authenticate';
import { requireAllowedFile, uploadSingle } from '../../middleware/upload';
import { auditContext } from '../../services/audit.service';
import { serveStoredFile } from '../../services/storage/serve';
import { enrollUser } from '../enrollments/enrollments.service';
import * as content from './course-content.service';
import * as insights from './course-insights.service';
import { getLearningContent } from './course-learning.service';
import {
  competencyMappingSchema,
  competencyMappingsSchema,
  createCourseSchema,
  createMaterialSchema,
  createModuleSchema,
  feedbackSchema,
  listCoursesQuery,
  reorderModulesSchema,
  statusChangeSchema,
  updateCourseSchema,
  updateMaterialSchema,
  updateModuleSchema,
} from './courses.schemas';
import * as courses from './courses.service';

export const coursesRouter = Router();

const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

/**
 * GET /api/courses/:id/thumbnail - PUBLIC (course images are not sensitive and are
 * loaded by plain <img> tags, which cannot attach credentials across sites).
 */
coursesRouter.get('/:id/thumbnail', async (req, res) => {
  const id = uuidParam(req, 'id');
  const course = await prisma.course.findFirst({ where: { id, deletedAt: null }, select: { thumbnailKey: true } });
  if (!course?.thumbnailKey) throw notFound('THUMBNAIL_NOT_FOUND', 'This course has no thumbnail');
  const extension = course.thumbnailKey.split('.').pop() ?? 'png';
  const contentType = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[extension] ?? 'image/png';
  await serveStoredFile(res, course.thumbnailKey, { contentType, fileName: `thumbnail.${extension}`, inline: true, cacheControl: 'public, max-age=3600' });
});

coursesRouter.use(authenticate);

/** GET /api/courses/materials/:materialId/download - trainer, admin or enrolled trainee. */
coursesRouter.get('/materials/:materialId/download', async (req, res) => {
  const material = await content.authorizeMaterialAccess(currentUser(req), uuidParam(req, 'materialId'));
  const { inline } = z.object({ inline: z.enum(['0', '1']).default('1') }).parse(req.query);
  await serveStoredFile(res, material.fileKey as string, {
    contentType: material.mimeType ?? 'application/octet-stream',
    fileName: material.fileName ?? 'download',
    inline: inline === '1',
    cacheControl: 'private, no-store',
  });
});

/** GET /api/courses - catalog with search and filters (visibility depends on the caller's role). */
coursesRouter.get('/', async (req, res) => {
  const query = listCoursesQuery.parse(req.query);
  const result = await courses.listCourses(currentUser(req), query);
  paginated(res, result.items, query.page, query.pageSize, result.total, { categories: result.categories });
});

/** POST /api/courses - trainer/admin: create a draft course. */
coursesRouter.post('/', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  created(res, await courses.createCourse(currentUser(req), createCourseSchema.parse(req.body), auditContext(req)));
});

/** GET /api/courses/:id */
coursesRouter.get('/:id', async (req, res) => {
  ok(res, await courses.getCourseDetail(currentUser(req), uuidParam(req, 'id')));
});

/** PATCH /api/courses/:id - course owner or admin. */
coursesRouter.patch('/:id', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, await courses.updateCourse(currentUser(req), uuidParam(req, 'id'), updateCourseSchema.parse(req.body), auditContext(req)));
});

/** PATCH /api/courses/:id/status - publish, unpublish (back to DRAFT) or archive. */
coursesRouter.patch('/:id/status', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const { status } = statusChangeSchema.parse(req.body);
  const result = await courses.changeCourseStatus(currentUser(req), uuidParam(req, 'id'), status, auditContext(req));
  ok(res, result.course, { warnings: result.warnings });
});

/** DELETE /api/courses/:id - only courses without enrollments; others must be archived. */
coursesRouter.delete('/:id', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  await courses.deleteCourse(currentUser(req), uuidParam(req, 'id'), auditContext(req));
  ok(res, { deleted: true });
});

/** POST /api/courses/:id/enroll - trainee enrolls (prerequisites are enforced). */
coursesRouter.post('/:id/enroll', requireRole('TRAINEE'), async (req, res) => {
  created(res, await enrollUser(currentUser(req), uuidParam(req, 'id'), auditContext(req)));
});

/** GET /api/courses/:id/learn - the course player payload (enrolled trainee, or preview for trainer/admin). */
coursesRouter.get('/:id/learn', async (req, res) => {
  ok(res, await getLearningContent(currentUser(req), uuidParam(req, 'id')));
});

// ---- competency mapping & prerequisites ---------------------------------------------------------------------------

/** PUT /api/courses/:id/competencies - replace the whole competency mapping. */
coursesRouter.put('/:id/competencies', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const { competencies } = z.strictObject({ competencies: competencyMappingsSchema }).parse(req.body);
  ok(res, await courses.updateCourse(currentUser(req), uuidParam(req, 'id'), { competencies }, auditContext(req)));
});

/** PUT /api/courses/:id/competencies/:competencyId - map (or re-level) one competency. */
coursesRouter.put('/:id/competencies/:competencyId', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const input = competencyMappingSchema.parse({ ...(req.body ?? {}), competencyId: uuidParam(req, 'competencyId') });
  ok(res, await courses.upsertCompetencyMapping(currentUser(req), uuidParam(req, 'id'), input, auditContext(req)));
});

/** DELETE /api/courses/:id/competencies/:competencyId */
coursesRouter.delete('/:id/competencies/:competencyId', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, await courses.removeCompetencyMapping(currentUser(req), uuidParam(req, 'id'), uuidParam(req, 'competencyId'), auditContext(req)));
});

/** PUT /api/courses/:id/prerequisites - replace the prerequisite courses. */
coursesRouter.put('/:id/prerequisites', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const { prerequisiteIds } = z.strictObject({ prerequisiteIds: z.array(z.string().uuid()).max(10) }).parse(req.body);
  ok(res, await courses.updateCourse(currentUser(req), uuidParam(req, 'id'), { prerequisiteIds }, auditContext(req)));
});

// ---- thumbnail ---------------------------------------------------------------------------------------------------

/** POST /api/courses/:id/thumbnail - multipart image upload (PNG, JPEG, GIF, WebP up to 5 MB). */
coursesRouter.post('/:id/thumbnail', requireRole('TRAINER', 'ADMIN'), uploadSingle('file'), async (req, res) => {
  const { file, detected } = requireAllowedFile(req.file, ['image']);
  if (file.size > THUMBNAIL_MAX_BYTES) throw badRequest('FILE_TOO_LARGE', 'Thumbnails can be at most 5 MB');
  ok(res, await courses.setThumbnail(currentUser(req), uuidParam(req, 'id'), { buffer: file.buffer, ext: detected.ext, mime: detected.mime }, auditContext(req)));
});

coursesRouter.delete('/:id/thumbnail', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  await courses.removeThumbnail(currentUser(req), uuidParam(req, 'id'), auditContext(req));
  ok(res, { deleted: true });
});

// ---- modules & materials ------------------------------------------------------------------------------------------

coursesRouter.post('/:id/modules', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  created(res, await content.createModule(currentUser(req), uuidParam(req, 'id'), createModuleSchema.parse(req.body), auditContext(req)));
});

coursesRouter.put('/:id/modules/order', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const { moduleIds } = reorderModulesSchema.parse(req.body);
  ok(res, await content.reorderModules(currentUser(req), uuidParam(req, 'id'), moduleIds, auditContext(req)));
});

coursesRouter.patch('/:id/modules/:moduleId', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, await content.updateModule(currentUser(req), uuidParam(req, 'id'), uuidParam(req, 'moduleId'), updateModuleSchema.parse(req.body), auditContext(req)));
});

coursesRouter.delete('/:id/modules/:moduleId', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  await content.deleteModule(currentUser(req), uuidParam(req, 'id'), uuidParam(req, 'moduleId'), auditContext(req));
  ok(res, { deleted: true });
});

/**
 * POST /api/courses/:id/modules/:moduleId/materials
 * JSON for VIDEO (url) / LINK / TEXT, or multipart (fields title, type + file) for uploaded documents and videos.
 */
coursesRouter.post('/:id/modules/:moduleId/materials', requireRole('TRAINER', 'ADMIN'), uploadSingle('file'), async (req, res) => {
  const input = createMaterialSchema.parse(req.body ?? {});
  created(res, await content.addMaterial(currentUser(req), uuidParam(req, 'id'), uuidParam(req, 'moduleId'), input, req.file, auditContext(req)));
});

coursesRouter.patch('/:id/modules/:moduleId/materials/:materialId', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(
    res,
    await content.updateMaterial(currentUser(req), uuidParam(req, 'id'), uuidParam(req, 'moduleId'), uuidParam(req, 'materialId'), updateMaterialSchema.parse(req.body), auditContext(req)),
  );
});

coursesRouter.delete('/:id/modules/:moduleId/materials/:materialId', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  await content.deleteMaterial(currentUser(req), uuidParam(req, 'id'), uuidParam(req, 'moduleId'), uuidParam(req, 'materialId'), auditContext(req));
  ok(res, { deleted: true });
});

// ---- feedback -----------------------------------------------------------------------------------------------------

coursesRouter.get('/:id/feedback', async (req, res) => {
  const query = paginationSchema.parse(req.query);
  const result = await insights.listFeedback(currentUser(req), uuidParam(req, 'id'), query);
  paginated(res, result.items, query.page, query.pageSize, result.total, { summary: result.summary, mine: result.mine });
});

coursesRouter.post('/:id/feedback', requireRole('TRAINEE'), async (req, res) => {
  created(res, await insights.submitFeedback(currentUser(req), uuidParam(req, 'id'), feedbackSchema.parse(req.body), auditContext(req)));
});

// ---- trainer monitoring ---------------------------------------------------------------------------------------------

/** GET /api/courses/:id/trainees - enrolled trainees with progress and results (course trainer / admin). */
coursesRouter.get('/:id/trainees', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  const query = paginationSchema
    .extend({
      q: searchQuery,
      status: z.enum(['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING', 'COMPLETED', 'CERTIFIED', 'WITHDRAWN']).optional(),
    })
    .parse(req.query);
  const result = await insights.listCourseTrainees(currentUser(req), uuidParam(req, 'id'), query);
  paginated(res, result.items, query.page, query.pageSize, result.total, { statusCounts: result.statusCounts });
});

/** GET /api/courses/:id/analytics - completion, assessment performance and competency impact. */
coursesRouter.get('/:id/analytics', requireRole('TRAINER', 'ADMIN'), async (req, res) => {
  ok(res, await insights.courseAnalytics(currentUser(req), uuidParam(req, 'id')));
});
