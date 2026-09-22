import { env } from '../../config/env';
import { LocalStorageProvider } from './local';
import { S3StorageProvider } from './s3';
import type { StorageProvider } from './types';

export type { StorageProvider, StoredFileStream, SignedUrlOptions } from './types';

/** Builds the storage provider selected by `STORAGE_DRIVER`. */
export function createStorage(): StorageProvider {
  if (env.STORAGE_DRIVER === 's3') {
    return new S3StorageProvider({
      bucket: env.STORAGE_BUCKET,
      region: env.STORAGE_REGION,
      ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
      // Presence of these two is guaranteed by the environment validation.
      accessKeyId: env.STORAGE_ACCESS_KEY as string,
      secretAccessKey: env.STORAGE_SECRET_KEY as string,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
    });
  }
  return new LocalStorageProvider(env.STORAGE_LOCAL_DIR);
}

let instance: StorageProvider | undefined;

/** Process-wide storage singleton (tests may replace it with `setStorage`). */
export function getStorage(): StorageProvider {
  instance ??= createStorage();
  return instance;
}

export function setStorage(provider: StorageProvider | undefined): void {
  instance = provider;
}
