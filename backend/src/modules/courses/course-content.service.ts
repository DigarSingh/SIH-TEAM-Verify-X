import { randomUUID } from 'node:crypto';
import type { MaterialType } from '@prisma/client';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { requireAllowedFile, sanitizeFileName, type FileKind } from '../../middleware/upload';
import { AuditActions, recordAudit, type AuditContext } from '../../services/audit.service';
import { getStorage } from '../../services/storage';
import { recomputeCourseEnrollments } from '../enrollments/enrollments.service';
import type { CreateMaterialInput } from './courses.schemas';
import { loadManagedCourse } from './courses.service';

type Actor = Express.AuthUser;

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv']);

/** Total planned minutes of a course's modules. */
async function moduleMinutes(db: Db, courseId: string): Promise<number> {
  const sum = await db.module.aggregate({ where: { courseId }, _sum: { durationMinutes: true } });
  return sum._sum.durationMinutes ?? 0;
}

/**
 * Keeps the course duration in step with its modules - but only while the trainer
 * has not typed a custom duration (i.e. it still equals the previous module total).
 */
async function withDurationSync<T>(courseId: string, change: () => Promise<T>): Promise<T> {
  const [course, before] = await Promise.all([prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { durationMinutes: true } }), moduleMinutes(prisma, courseId)]);
  const result = await change();
  if (course.durationMinutes === before) {
    const after = await moduleMinutes(prisma, courseId);
    if (after !== before) await prisma.course.update({ where: { id: courseId }, data: { durationMinutes: after } });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------------------------

async function loadModule(courseId: string, moduleId: string) {
  const module = await prisma.module.findFirst({ where: { id: moduleId, courseId } });
  if (!module) throw notFound('MODULE_NOT_FOUND', 'Module not found in this course');
  return module;
}

export async function createModule(user: Actor, courseId: string, input: { title: string; description?: string | null | undefined; durationMinutes?: number | undefined }, ctx: AuditContext) {
  await loadManagedCourse(user, courseId);
  const module = await withDurationSync(courseId, async () => {
    const last = await prisma.module.aggregate({ where: { courseId }, _max: { position: true } });
    return prisma.module.create({
      data: { courseId, title: input.title, description: input.description ?? null, durationMinutes: input.durationMinutes ?? 0, position: (last._max.position ?? -1) + 1 },
    });
  });
  await recomputeCourseEnrollments(prisma, courseId);
  await recordAudit(ctx, { action: AuditActions.MODULE_CREATED, entityType: 'Course', entityId: courseId, metadata: { module: module.title } });
  return module;
}

export async function updateModule(user: Actor, courseId: string, moduleId: string, input: { title?: string | undefined; description?: string | null | undefined; durationMinutes?: number | undefined }, ctx: AuditContext) {
  await loadManagedCourse(user, courseId);
  await loadModule(courseId, moduleId);
  const module = await withDurationSync(courseId, () => prisma.module.update({ where: { id: moduleId }, data: stripUndefined(input) }));
  await recordAudit(ctx, { action: AuditActions.MODULE_UPDATED, entityType: 'Course', entityId: courseId, metadata: { module: module.title, changes: Object.keys(input) } });
  return module;
}

export async function deleteModule(user: Actor, courseId: string, moduleId: string, ctx: AuditContext): Promise<void> {
  await loadManagedCourse(user, courseId);
  const module = await loadModule(courseId, moduleId);
  const materials = await prisma.learningMaterial.findMany({ where: { moduleId }, select: { fileKey: true } });

  await withDurationSync(courseId, async () => {
    await prisma.$transaction(async (tx) => {
      await tx.module.delete({ where: { id: moduleId } });
      const remaining = await tx.module.findMany({ where: { courseId }, orderBy: { position: 'asc' }, select: { id: true } });
      for (const [index, item] of remaining.entries()) await tx.module.update({ where: { id: item.id }, data: { position: index } });
    });
  });
  await Promise.all(materials.filter((m) => m.fileKey).map((m) => getStorage().delete(m.fileKey as string).catch(() => undefined)));
  await recomputeCourseEnrollments(prisma, courseId);
  await recordAudit(ctx, { action: AuditActions.MODULE_DELETED, entityType: 'Course', entityId: courseId, metadata: { module: module.title } });
}

export async function reorderModules(user: Actor, courseId: string, moduleIds: string[], ctx: AuditContext) {
  await loadManagedCourse(user, courseId);
  const existing = await prisma.module.findMany({ where: { courseId }, select: { id: true } });
  const same = existing.length === moduleIds.length && existing.every((module) => moduleIds.includes(module.id)) && new Set(moduleIds).size === moduleIds.length;
  if (!same) throw badRequest('INVALID_ORDER', 'The ordering must list every module of the course exactly once');
  await prisma.$transaction(moduleIds.map((id, index) => prisma.module.update({ where: { id }, data: { position: index } })));
  await recordAudit(ctx, { action: AuditActions.MODULE_UPDATED, entityType: 'Course', entityId: courseId, metadata: { reordered: true } });
  return prisma.module.findMany({ where: { courseId }, orderBy: { position: 'asc' } });
}

// ---------------------------------------------------------------------------------------------
// Learning materials
// ---------------------------------------------------------------------------------------------

function allowedKinds(type: MaterialType): FileKind[] {
  return type === 'VIDEO' ? ['video'] : ['document', 'image'];
}

export async function addMaterial(user: Actor, courseId: string, moduleId: string, input: CreateMaterialInput, file: Express.Multer.File | undefined, ctx: AuditContext) {
  await loadManagedCourse(user, courseId);
  await loadModule(courseId, moduleId);

  const data: {
    title: string;
    type: MaterialType;
    url?: string | null;
    content?: string | null;
    fileKey?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    extractedText?: string;
  } = { title: input.title, type: input.type };

  if (file) {
    if (input.type !== 'VIDEO' && input.type !== 'DOCUMENT') throw badRequest('INVALID_MATERIAL', 'Files can only be attached to VIDEO or DOCUMENT materials');
    const { detected } = requireAllowedFile(file, allowedKinds(input.type));
    const key = `materials/${courseId}/${randomUUID()}${detected.ext}`;
    await getStorage().put(key, file.buffer, detected.mime);
    data.fileKey = key;
    data.fileName = sanitizeFileName(file.originalname);
    data.mimeType = detected.mime;
    data.sizeBytes = file.size;
    if (TEXT_EXTENSIONS.has(detected.ext)) data.extractedText = file.buffer.toString('utf8').slice(0, 200_000);
  } else {
    if (input.type === 'TEXT') {
      if (!input.content) throw badRequest('CONTENT_REQUIRED', 'Text materials need content');
      data.content = input.content;
    } else if (input.type === 'LINK') {
      if (!input.url) throw badRequest('URL_REQUIRED', 'Link materials need a URL');
      data.url = input.url;
    } else if (input.type === 'VIDEO') {
      if (!input.url) throw badRequest('URL_REQUIRED', 'Video materials need a video URL or an uploaded video file');
      data.url = input.url;
    } else {
      throw badRequest('FILE_REQUIRED', 'Document materials need an uploaded file');
    }
  }

  const last = await prisma.learningMaterial.aggregate({ where: { moduleId }, _max: { position: true } });
  const material = await prisma.learningMaterial.create({ data: { moduleId, position: (last._max.position ?? -1) + 1, ...data } });
  await recordAudit(ctx, { action: AuditActions.MATERIAL_ADDED, entityType: 'Course', entityId: courseId, metadata: { title: material.title, type: material.type, file: material.fileName ?? null } });
  return toMaterialDto(material);
}

export async function updateMaterial(user: Actor, courseId: string, moduleId: string, materialId: string, input: { title?: string | undefined; url?: string | undefined; content?: string | undefined }, ctx: AuditContext) {
  await loadManagedCourse(user, courseId);
  await loadModule(courseId, moduleId);
  const material = await prisma.learningMaterial.findFirst({ where: { id: materialId, moduleId } });
  if (!material) throw notFound('MATERIAL_NOT_FOUND', 'Material not found');
  if (input.url !== undefined && (material.fileKey || material.type === 'TEXT' || material.type === 'DOCUMENT')) throw badRequest('INVALID_MATERIAL', 'This material does not have an editable URL');
  if (input.content !== undefined && material.type !== 'TEXT') throw badRequest('INVALID_MATERIAL', 'Only text materials have editable content');
  const updated = await prisma.learningMaterial.update({ where: { id: materialId }, data: stripUndefined(input) });
  await recordAudit(ctx, { action: AuditActions.MATERIAL_UPDATED, entityType: 'Course', entityId: courseId, metadata: { title: updated.title, changes: Object.keys(input) } });
  return toMaterialDto(updated);
}

export async function deleteMaterial(user: Actor, courseId: string, moduleId: string, materialId: string, ctx: AuditContext): Promise<void> {
  await loadManagedCourse(user, courseId);
  await loadModule(courseId, moduleId);
  const material = await prisma.learningMaterial.findFirst({ where: { id: materialId, moduleId } });
  if (!material) throw notFound('MATERIAL_NOT_FOUND', 'Material not found');
  await prisma.learningMaterial.delete({ where: { id: materialId } });
  if (material.fileKey) await getStorage().delete(material.fileKey).catch(() => undefined);
  await recordAudit(ctx, { action: AuditActions.MATERIAL_DELETED, entityType: 'Course', entityId: courseId, metadata: { title: material.title } });
}

export function toMaterialDto(material: {
  id: string;
  title: string;
  type: MaterialType;
  url: string | null;
  content: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  fileKey: string | null;
  position: number;
}) {
  return {
    id: material.id,
    title: material.title,
    type: material.type,
    url: material.url,
    content: material.content,
    fileName: material.fileName,
    mimeType: material.mimeType,
    sizeBytes: material.sizeBytes,
    position: material.position,
    downloadUrl: material.fileKey ? `/api/courses/materials/${material.id}/download` : null,
  };
}

/**
 * Authorizes and returns a material for download / streaming: the course's
 * trainer, an administrator, or a trainee with an active enrollment.
 */
export async function authorizeMaterialAccess(user: Actor, materialId: string) {
  const material = await prisma.learningMaterial.findUnique({
    where: { id: materialId },
    include: { module: { select: { courseId: true, course: { select: { trainerId: true, deletedAt: true } } } } },
  });
  if (!material || material.module.course.deletedAt) throw notFound('MATERIAL_NOT_FOUND', 'Material not found');
  if (!material.fileKey) throw notFound('MATERIAL_NOT_FOUND', 'This material has no downloadable file');
  if (user.role === 'ADMIN' || material.module.course.trainerId === user.id) return material;
  const enrollment = await prisma.enrollment.findFirst({ where: { userId: user.id, courseId: material.module.courseId, status: { not: 'WITHDRAWN' } }, select: { id: true } });
  if (!enrollment) throw forbidden('NOT_ENROLLED', 'Enroll in this course to access its materials');
  return material;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
