import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { SignedUrlOptions, StorageProvider, StoredFileStream } from './types';

export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * Production storage on any S3-compatible object store (AWS S3, MinIO,
 * Cloudflare R2, Backblaze B2, ...). Downloads are served through short-lived
 * pre-signed URLs after the API has authorized the request.
 */
export class S3StorageProvider implements StorageProvider {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageOptions, client?: S3Client) {
    this.bucket = options.bucket;
    const config: S3ClientConfig = {
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    };
    this.client = client ?? new S3Client(config);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async getStream(key: string): Promise<StoredFileStream> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!response.Body) throw new Error(`Object ${key} has no body`);
    return {
      stream: response.Body as Readable,
      ...(response.ContentType ? { contentType: response.ContentType } : {}),
      ...(response.ContentLength !== undefined ? { size: response.ContentLength } : {}),
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getSignedUrl(key: string, options: SignedUrlOptions): Promise<string> {
    const safeName = options.fileName.replace(/[\r\n"]/g, '_');
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: options.contentType,
      ResponseContentDisposition: `${options.inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: options.expiresInSeconds });
  }
}
