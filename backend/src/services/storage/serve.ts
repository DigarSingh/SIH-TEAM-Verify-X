import type { Response } from 'express';
import { getStorage } from './index';
import { LocalStorageProvider } from './local';

/** Content types that are safe to render inline in the browser (no script execution). */
const INLINE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

export interface ServeOptions {
  contentType: string;
  fileName: string;
  /** Ask the browser to display the file instead of downloading it (only honoured for safe types). */
  inline: boolean;
  cacheControl: string;
}

/**
 * Sends a stored object to the client after the caller has authorized access.
 *  - object storage → short-lived pre-signed URL (redirect)
 *  - local disk     → `sendFile`, which supports Range requests (video seeking) and ETags
 *  - anything else  → plain stream
 */
export async function serveStoredFile(res: Response, key: string, options: ServeOptions): Promise<void> {
  const storage = getStorage();
  const inline = options.inline && INLINE_TYPES.has(options.contentType);
  const safeName = options.fileName.replace(/[\r\n"\\]/g, '_');
  const headers = {
    'Content-Type': options.contentType,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': options.cacheControl,
  };

  if (storage.getSignedUrl) {
    const url = await storage.getSignedUrl(key, { fileName: options.fileName, contentType: options.contentType, expiresInSeconds: 60, inline });
    res.redirect(302, url);
    return;
  }

  if (storage instanceof LocalStorageProvider) {
    await new Promise<void>((resolve, reject) => {
      res.sendFile(storage.absolutePath(key), { headers, dotfiles: 'allow' }, (error) => (error ? reject(error) : resolve()));
    });
    return;
  }

  const { stream, size } = await storage.getStream(key);
  res.set(headers);
  if (size !== undefined) res.set('Content-Length', String(size));
  await new Promise<void>((resolve, reject) => {
    stream.on('error', reject);
    res.on('finish', resolve);
    stream.pipe(res);
  });
}
