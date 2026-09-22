import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest } from '../lib/errors';

/** Accepts a single in-memory file; size is capped by MAX_UPLOAD_MB. */
export const uploadSingle = (field = 'file') =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 20 },
  }).single(field);

export type FileKind = 'image' | 'document' | 'video';

export interface DetectedFile {
  mime: string;
  ext: string;
  kind: FileKind;
}

const startsWith = (buffer: Buffer, bytes: number[], offset = 0) => bytes.every((byte, index) => buffer[offset + index] === byte);

const OFFICE_TYPES: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const TEXT_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
};

/**
 * Identifies a file by its CONTENT (magic bytes), never by the client-supplied
 * MIME type or extension alone. Returns null for anything outside the allow-list.
 * SVG and HTML are deliberately not allowed because they can carry script.
 */
export function detectFile(buffer: Buffer, originalName: string): DetectedFile | null {
  const ext = path.extname(originalName).toLowerCase();

  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', ext: '.pdf', kind: 'document' };
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: '.png', kind: 'image' };
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: '.jpg', kind: 'image' };
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38]) && (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61) {
    return { mime: 'image/gif', ext: '.gif', kind: 'image' };
  }
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: 'image/webp', ext: '.webp', kind: 'image' };
  }
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) return { mime: 'video/mp4', ext: '.mp4', kind: 'video' };
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: 'video/webm', ext: '.webm', kind: 'video' };
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) && OFFICE_TYPES[ext]) {
    return { mime: OFFICE_TYPES[ext] as string, ext, kind: 'document' };
  }
  if (TEXT_TYPES[ext] && !buffer.subarray(0, 8000).includes(0)) {
    return { mime: TEXT_TYPES[ext] as string, ext, kind: 'document' };
  }
  return null;
}

/** Validates an uploaded file against an allowed set of kinds. */
export function requireAllowedFile(file: Express.Multer.File | undefined, allowed: FileKind[]): { file: Express.Multer.File; detected: DetectedFile } {
  if (!file) throw badRequest('FILE_REQUIRED', 'A file is required (multipart field "file")');
  if (file.size === 0) throw badRequest('FILE_EMPTY', 'The uploaded file is empty');
  const detected = detectFile(file.buffer, file.originalname);
  if (!detected || !allowed.includes(detected.kind)) {
    throw badRequest(
      'FILE_TYPE_NOT_ALLOWED',
      `Unsupported file type. Allowed: ${allowed.includes('image') && allowed.length === 1 ? 'PNG, JPEG, GIF, WebP images' : 'PDF, Office documents, text, images, MP4/WebM video'}`,
    );
  }
  return { file, detected };
}

/**
 * A safe display name for downloads (no path components or control characters).
 *
 * Both separators are stripped explicitly rather than with path.basename(),
 * which follows the platform it runs on: on Linux (Docker, CI, any Unix host)
 * it does not treat "\" as a separator, so a Windows-style upload name such as
 * "C:\Users\me\report final.pdf" kept its directories and merely had them
 * rewritten to underscores. The uploader's platform is not the server's, so the
 * leading directories are removed for either separator everywhere.
 */
export function sanitizeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[^\w.\- ()]/g, '_').trim();
  return (base || 'file').slice(0, 120);
}
