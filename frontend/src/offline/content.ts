import { api, isApiError, openBlob, saveBlob } from '../api/client';
import { fetchLearnContent } from '../services/learner';
import type { LearnContent, LearningMaterial } from '../types';
import { dbDelete, dbGet, dbGetAll, dbPut, hasIndexedDb, STORES } from './db';

/**
 * Saved course content.
 *
 * "Save for offline" downloads a course the way a field officer would expect:
 * the module text and structure, plus the bytes of its documents and videos, so
 * the course still opens with no network at all. The service worker also caches
 * these API responses, but that cache is the browser's to evict - this store is
 * the learner's own copy and is only removed when they say so, or when they
 * sign out.
 */

/** Anything larger is left online: a 200 MB training video should not be downloaded by accident. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface SavedFile {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string | null;
}

export interface SavedPack {
  courseId: string;
  title: string;
  savedAt: string;
  content: LearnContent;
  fileIds: string[];
  /** Approximate size of the downloaded files, for the offline library. */
  bytes: number;
  /** Materials too large to store, named so the learner knows what is missing. */
  skipped: string[];
}

export type PackSummary = Omit<SavedPack, 'content'> & { moduleCount: number; materialCount: number };

const summarise = (pack: SavedPack): PackSummary => ({
  courseId: pack.courseId,
  title: pack.title,
  savedAt: pack.savedAt,
  fileIds: pack.fileIds,
  bytes: pack.bytes,
  skipped: pack.skipped,
  moduleCount: pack.content.modules.length,
  materialCount: pack.content.modules.reduce((total, module) => total + module.materials.length, 0),
});

const isNetworkError = (error: unknown): boolean => isApiError(error) && error.status === 0;

/** The materials whose bytes are worth keeping (uploaded files, not external links). */
const downloadable = (content: LearnContent): LearningMaterial[] =>
  content.modules.flatMap((module) => module.materials.filter((material) => Boolean(material.downloadUrl) && (material.sizeBytes ?? 0) <= MAX_FILE_BYTES));

/**
 * Downloads a course for offline use.
 *
 * `onProgress` reports completed downloads so the button can count them out.
 * A file that fails to download does not fail the save: the course text is the
 * part that matters most, and the missing file is listed as skipped.
 */
export async function savePack(courseId: string, onProgress?: (done: number, total: number) => void): Promise<PackSummary> {
  if (!hasIndexedDb()) throw new Error('This browser cannot save courses for offline use.');
  const content = await fetchLearnContent(courseId);
  const files = downloadable(content);
  const oversize = content.modules
    .flatMap((module) => module.materials)
    .filter((material) => Boolean(material.downloadUrl) && (material.sizeBytes ?? 0) > MAX_FILE_BYTES)
    .map((material) => material.title);

  const fileIds: string[] = [];
  const skipped = [...oversize];
  let bytes = 0;
  let done = 0;
  onProgress?.(0, files.length);

  for (const material of files) {
    try {
      const { blob, fileName } = await api.blob(`/courses/materials/${material.id}/download`);
      await dbPut<SavedFile>(STORES.files, { id: material.id, blob, fileName: material.fileName ?? fileName ?? material.title, mimeType: material.mimeType });
      fileIds.push(material.id);
      bytes += blob.size;
    } catch {
      skipped.push(material.title);
    }
    done += 1;
    onProgress?.(done, files.length);
  }

  const pack: SavedPack = { courseId, title: content.course.title, savedAt: new Date().toISOString(), content, fileIds, bytes, skipped };
  await dbPut(STORES.packs, pack);
  return summarise(pack);
}

export async function listPacks(): Promise<PackSummary[]> {
  if (!hasIndexedDb()) return [];
  const packs = await dbGetAll<SavedPack>(STORES.packs).catch(() => []);
  return packs.map(summarise).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export const getPack = async (courseId: string): Promise<SavedPack | undefined> => (hasIndexedDb() ? dbGet<SavedPack>(STORES.packs, courseId).catch(() => undefined) : undefined);

export async function removePack(courseId: string): Promise<void> {
  if (!hasIndexedDb()) return;
  const pack = await getPack(courseId);
  for (const id of pack?.fileIds ?? []) await dbDelete(STORES.files, id).catch(() => undefined);
  await dbDelete(STORES.packs, courseId).catch(() => undefined);
}

/**
 * Reads a course, preferring the live version.
 *
 * Offline, the saved copy is used and its module completion is patched with
 * anything still waiting in the mutation queue, so the learner sees their own
 * progress rather than the state at the moment they saved.
 */
export async function loadLearnContent(courseId: string): Promise<LearnContent> {
  try {
    const content = await fetchLearnContent(courseId);
    // Keep an existing saved copy current, but never turn a plain visit into a download.
    const pack = await getPack(courseId);
    if (pack) await dbPut<SavedPack>(STORES.packs, { ...pack, content, title: content.course.title });
    return content;
  } catch (error) {
    const pack = isNetworkError(error) ? await getPack(courseId) : undefined;
    if (pack) return pack.content;
    throw error;
  }
}

/**
 * Records a module completion in a copy of the course content.
 *
 * Offline there is no server to recompute progress, so the same arithmetic the
 * API uses is applied locally: the learner sees the progress bar move, and the
 * real value replaces it when the queued change syncs.
 */
export function applyModuleCompletion(content: LearnContent, moduleId: string, completed: boolean): LearnContent {
  const modules = content.modules.map((module) => (module.id === moduleId ? { ...module, completed } : module));
  const completedIds = modules.filter((module) => module.completed).map((module) => module.id);
  return {
    ...content,
    modules,
    enrollment: content.enrollment ? { ...content.enrollment, progress: modules.length > 0 ? Math.round((completedIds.length / modules.length) * 100) : 0, completedModuleIds: completedIds } : null,
  };
}

/** Marks a module complete in the saved copy, so offline progress survives a reload. */
export async function markModuleInPack(courseId: string, moduleId: string, completed: boolean): Promise<void> {
  const pack = await getPack(courseId);
  if (!pack) return;
  await dbPut<SavedPack>(STORES.packs, { ...pack, content: applyModuleCompletion(pack.content, moduleId, completed) });
}

/**
 * Opens or downloads a material, falling back to the saved copy when there is
 * no network. Used by the course player in place of the online-only download.
 */
export async function openMaterial(material: { id: string; fileName: string | null; title: string }, mode: 'download' | 'open' = 'download'): Promise<{ offline: boolean }> {
  try {
    const { blob, fileName } = await api.blob(`/courses/materials/${material.id}/download`);
    if (mode === 'open') openBlob(blob);
    else saveBlob(blob, material.fileName ?? fileName ?? material.title);
    return { offline: false };
  } catch (error) {
    const saved = isNetworkError(error) ? await dbGet<SavedFile>(STORES.files, material.id).catch(() => undefined) : undefined;
    if (!saved) throw error;
    if (mode === 'open') openBlob(saved.blob);
    else saveBlob(saved.blob, saved.fileName);
    return { offline: true };
  }
}

/** An object URL for a saved video, so the player works offline. Callers revoke it. */
export async function savedMediaUrl(materialId: string): Promise<string | null> {
  const saved = await dbGet<SavedFile>(STORES.files, materialId).catch(() => undefined);
  return saved ? URL.createObjectURL(saved.blob) : null;
}
