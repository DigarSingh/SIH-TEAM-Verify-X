import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

/**
 * The "approved materials" the assistant and the quiz generator are allowed to use: the readable text
 * of a course's own learning materials (typed text readings, and uploaded text documents whose text was
 * extracted at upload). Videos, links and PDFs without extracted text are listed by title only, so the
 * assistant can say a material exists but cannot claim to have read it.
 */

export interface ContextMaterial {
  id: string;
  title: string;
  type: 'VIDEO' | 'DOCUMENT' | 'LINK' | 'TEXT';
  /** The readable text, or null when the material has none the AI can use. */
  text: string | null;
}
export interface ContextModule {
  title: string;
  description: string | null;
  materials: ContextMaterial[];
}
export interface ContextCourse {
  id: string;
  title: string;
  category: string;
  difficulty: string;
  outcomes: string[];
  modules: ContextModule[];
}

export interface RenderedContext {
  /** The text sent to the model (escaped, with stable ids the answer can cite). */
  text: string;
  /** Materials whose text is inside `text`. */
  includedIds: Set<string>;
  /** Where each citable material sits, for showing sources to the user. */
  labels: Map<string, { title: string; moduleTitle: string }>;
  readable: number;
  omitted: number;
  truncated: boolean;
}

/** Text is placed inside pseudo-XML tags, so the characters that could close a tag are escaped. */
export const escapeForPrompt = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Renders the course as a prompt context of at most `maxChars` characters of material text.
 * Modules are taken in order; a material that no longer fits is omitted whole (and counted), so the
 * model never sees half a paragraph and the user can be told that the answer covers part of the course.
 */
export function renderCourseContext(course: ContextCourse, maxChars: number): RenderedContext {
  const perMaterialCap = Math.max(2_000, Math.floor(maxChars / 4));
  const includedIds = new Set<string>();
  const labels = new Map<string, { title: string; moduleTitle: string }>();
  const parts: string[] = [];
  let used = 0;
  let readable = 0;
  let omitted = 0;

  parts.push(`<course title="${escapeForPrompt(course.title)}" category="${escapeForPrompt(course.category)}" level="${escapeForPrompt(course.difficulty)}">`);
  if (course.outcomes.length > 0) parts.push(`<outcomes>\n${course.outcomes.map((outcome) => `- ${escapeForPrompt(outcome)}`).join('\n')}\n</outcomes>`);

  for (const module of course.modules) {
    parts.push(`<module title="${escapeForPrompt(module.title)}">`);
    if (module.description) parts.push(`<description>${escapeForPrompt(module.description)}</description>`);
    for (const material of module.materials) {
      const head = `id="${material.id}" title="${escapeForPrompt(material.title)}" type="${material.type}"`;
      const text = material.text?.trim() ?? '';
      if (!text) {
        parts.push(`<material ${head} note="no readable text is available to the assistant" />`);
        continue;
      }
      readable += 1;
      const body = text.length > perMaterialCap ? `${text.slice(0, perMaterialCap)}\n[...the rest of this material is not included]` : text;
      if (used + body.length > maxChars) {
        omitted += 1;
        continue;
      }
      used += body.length;
      includedIds.add(material.id);
      labels.set(material.id, { title: material.title, moduleTitle: module.title });
      parts.push(`<material ${head}>\n${escapeForPrompt(body)}\n</material>`);
    }
    parts.push('</module>');
  }
  parts.push('</course>');

  return { text: parts.join('\n'), includedIds, labels, readable, omitted, truncated: omitted > 0 };
}

/** Loads a (non-deleted) course with everything needed to build its context. */
export async function loadCourseForContext(courseId: string): Promise<{ course: ContextCourse; trainerId: string; status: string }> {
  const row = await prisma.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: {
      id: true,
      title: true,
      category: true,
      difficulty: true,
      outcomes: true,
      trainerId: true,
      status: true,
      modules: {
        orderBy: { position: 'asc' },
        select: {
          title: true,
          description: true,
          materials: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: { id: true, title: true, type: true, content: true, extractedText: true } },
        },
      },
    },
  });
  if (!row) throw notFound('COURSE_NOT_FOUND', 'Course not found');
  return {
    trainerId: row.trainerId,
    status: row.status,
    course: {
      id: row.id,
      title: row.title,
      category: row.category,
      difficulty: row.difficulty,
      outcomes: row.outcomes,
      modules: row.modules.map((module) => ({
        title: module.title,
        description: module.description,
        materials: module.materials.map((material) => ({
          id: material.id,
          title: material.title,
          type: material.type,
          text: material.type === 'TEXT' ? material.content : material.extractedText,
        })),
      })),
    },
  };
}
