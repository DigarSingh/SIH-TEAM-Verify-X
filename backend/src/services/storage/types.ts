import type { Readable } from 'node:stream';

export interface StoredFileStream {
  stream: Readable;
  contentType?: string;
  size?: number;
}

export interface SignedUrlOptions {
  fileName: string;
  contentType: string;
  expiresInSeconds: number;
  inline: boolean;
}

/**
 * Storage abstraction. Application code depends only on this interface, so the
 * backing store (local disk in development, S3-compatible object storage in
 * production) is a configuration choice, not a code change.
 */
export interface StorageProvider {
  readonly driver: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getStream(key: string): Promise<StoredFileStream>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /**
   * Optional short-lived direct-download URL (object storage). When absent the
   * API streams the bytes itself after performing its authorization checks.
   */
  getSignedUrl?(key: string, options: SignedUrlOptions): Promise<string>;
}
