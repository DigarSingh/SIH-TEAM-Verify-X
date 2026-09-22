import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAiLimiter, createLimiter, createLoginLimiter } from '../../src/middleware/rateLimit';
import { detectFile, sanitizeFileName } from '../../src/middleware/upload';
import { pdfSafe } from '../../src/modules/certificates/certificate-pdf';
import { LocalStorageProvider } from '../../src/services/storage/local';
import { S3StorageProvider } from '../../src/services/storage/s3';

const bytes = (...values: number[]) => Buffer.from(values);
const pad = (buffer: Buffer) => Buffer.concat([buffer, Buffer.alloc(64, 0x20)]);

describe('file type detection (by content, never by name)', () => {
  it.each([
    ['PDF', pad(Buffer.from('%PDF-1.7')), 'a.pdf', 'application/pdf', 'document'],
    ['PNG', pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'a.png', 'image/png', 'image'],
    ['JPEG', pad(bytes(0xff, 0xd8, 0xff, 0xe0)), 'a.jpg', 'image/jpeg', 'image'],
    ['GIF', pad(Buffer.from('GIF89a')), 'a.gif', 'image/gif', 'image'],
    ['WebP', pad(Buffer.concat([Buffer.from('RIFF'), bytes(0, 0, 0, 0), Buffer.from('WEBP')])), 'a.webp', 'image/webp', 'image'],
    ['MP4', pad(Buffer.concat([bytes(0, 0, 0, 0x18), Buffer.from('ftypmp42')])), 'a.mp4', 'video/mp4', 'video'],
    ['WebM', pad(bytes(0x1a, 0x45, 0xdf, 0xa3)), 'a.webm', 'video/webm', 'video'],
    ['DOCX (zip container)', pad(bytes(0x50, 0x4b, 0x03, 0x04)), 'notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
    ['plain text', Buffer.from('Just some lecture notes.'), 'notes.txt', 'text/plain', 'document'],
  ])('accepts %s', (_label, buffer, name, mime, kind) => {
    expect(detectFile(buffer, name)).toMatchObject({ mime, kind });
  });

  it.each([
    ['a Windows executable named .pdf', pad(Buffer.from('MZ')), 'report.pdf'],
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>'), 'page.html'],
    ['HTML disguised as text', Buffer.from('<html><script>alert(1)</script></html>'), 'page.txt'.replace('.txt', '.html')],
    ['SVG (can carry script)', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), 'x.svg'],
    ['a zip archive', pad(bytes(0x50, 0x4b, 0x03, 0x04)), 'archive.zip'],
    ['binary data with a .txt name', Buffer.concat([Buffer.from('hello'), bytes(0, 1, 2, 3)]), 'notes.txt'],
    ['an empty file', Buffer.alloc(0), 'empty.pdf'],
  ])('rejects %s', (_label, buffer, name) => {
    expect(detectFile(buffer, name)).toBeNull();
  });

  it('a zip container only counts as an Office document with an Office extension', () => {
    expect(detectFile(pad(bytes(0x50, 0x4b, 0x03, 0x04)), 'a.docx')).not.toBeNull();
    expect(detectFile(pad(bytes(0x50, 0x4b, 0x03, 0x04)), 'a.exe')).toBeNull();
  });

  it('sanitises download names (no path components or control characters)', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\me\\report final.pdf')).toBe('report final.pdf');
    expect(sanitizeFileName('bad\r\nname".pdf')).toBe('bad__name_.pdf');
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('x'.repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe('certificate PDF text safety', () => {
  it('strips accents and replaces glyphs the built-in fonts cannot draw', () => {
    expect(pdfSafe('José Müller')).toBe('Jose Muller');
    expect(pdfSafe('Dr. Ananya Rao')).toBe('Dr. Ananya Rao');
    expect(pdfSafe('अनन्या')).toMatch(/^\?+$/);
  });
});

describe('local storage provider', () => {
  let dir: string;
  let storage: LocalStorageProvider;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-storage-'));
    storage = new LocalStorageProvider(dir);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('stores, reads, checks and deletes objects', async () => {
    await storage.put('materials/course-1/file.txt', Buffer.from('hello'), 'text/plain');
    expect(await storage.exists('materials/course-1/file.txt')).toBe(true);
    const { stream, size } = await storage.getStream('materials/course-1/file.txt');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    expect(size).toBe(5);
    await storage.delete('materials/course-1/file.txt');
    expect(await storage.exists('materials/course-1/file.txt')).toBe(false);
    await storage.delete('materials/course-1/file.txt'); // deleting twice is harmless
  });

  it.each(['../secret.txt', '/etc/passwd', 'a/../../b', 'C:\\windows\\x', '', 'a b/c', '.hidden/../x'])('refuses the unsafe key %j', async (key) => {
    await expect(storage.put(key, Buffer.from('x'), 'text/plain')).rejects.toThrow();
    await expect(storage.getStream(key)).rejects.toThrow();
  });
});

describe('S3-compatible storage provider', () => {
  const options = { bucket: 'capacity-connect', region: 'us-east-1', endpoint: 'http://localhost:9000', accessKeyId: 'test-key', secretAccessKey: 'test-secret', forcePathStyle: true };

  it('sends the right commands to the object store', async () => {
    const send = vi.fn().mockResolvedValue({});
    const provider = new S3StorageProvider(options, { send } as unknown as S3Client);

    await provider.put('materials/c1/a.pdf', Buffer.from('%PDF'), 'application/pdf');
    const put = send.mock.calls[0]![0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({ Bucket: 'capacity-connect', Key: 'materials/c1/a.pdf', ContentType: 'application/pdf' });

    send.mockResolvedValueOnce({});
    expect(await provider.exists('materials/c1/a.pdf')).toBe(true);
    expect(send.mock.calls[1]![0]).toBeInstanceOf(HeadObjectCommand);

    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    expect(await provider.exists('missing.pdf')).toBe(false);
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 500 } });
    await expect(provider.exists('boom.pdf')).rejects.toBeDefined();

    send.mockResolvedValueOnce({ Body: Buffer.from('x'), ContentType: 'application/pdf', ContentLength: 1 });
    const object = await provider.getStream('materials/c1/a.pdf');
    expect(object).toMatchObject({ contentType: 'application/pdf', size: 1 });
    expect(send.mock.calls.at(-1)![0]).toBeInstanceOf(GetObjectCommand);
  });

  it('creates short-lived pre-signed download URLs with a safe content disposition', async () => {
    const provider = new S3StorageProvider(options);
    const url = await provider.getSignedUrl('materials/c1/a.pdf', { fileName: 'hand"book\r\n.pdf', contentType: 'application/pdf', expiresInSeconds: 60, inline: false });
    expect(url).toContain('localhost:9000');
    expect(url).toContain('materials/c1/a.pdf');
    expect(url).toContain('X-Amz-Expires=60');
    expect(url).toContain('X-Amz-Signature=');
    const disposition = new URL(url).searchParams.get('response-content-disposition') ?? '';
    expect(disposition).toBe('attachment; filename="hand_book__.pdf"');
  });
});

describe('rate limiting', () => {
  it('answers 429 with the standard error envelope once the limit is exceeded', async () => {
    const app = express();
    app.use(createLimiter({ limit: 2, windowMs: 60_000 }));
    app.get('/ping', (_req, res) => void res.json({ ok: true }));

    expect((await request(app).get('/ping')).status).toBe(200);
    expect((await request(app).get('/ping')).status).toBe(200);
    const blocked = await request(app).get('/ping');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(blocked.headers['ratelimit-policy'] ?? blocked.headers['ratelimit']).toBeDefined();
  });
});

describe('sign-in rate limiting', () => {
  const appWithLimit = (limit: number) => {
    const app = express();
    app.use(express.json());
    app.post('/login', createLoginLimiter(limit), (req, res) => void (req.body?.correct ? res.json({ ok: true }) : res.status(401).json({ success: false })));
    return app;
  };
  const attempt = (app: express.Express, correct: boolean) => request(app).post('/login').send({ correct });

  it('counts only failed attempts, so many people signing in from one address are never locked out by their own successes', async () => {
    const app = appWithLimit(2);
    for (let index = 0; index < 6; index += 1) expect((await attempt(app, true)).status).toBe(200);
    expect((await attempt(app, false)).status).toBe(401);
    expect((await attempt(app, false)).status).toBe(401);
    const blocked = await attempt(app, false);
    expect(blocked.status).toBe(429); // guessing passwords is still stopped
    expect(blocked.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
  });
});

describe('AI rate limiting', () => {
  const appWithLimit = (limit: number) => {
    const app = express();
    app.use(express.json());
    // Stands in for `authenticate`: the signed-in user comes from a header.
    app.use((req, _res, next) => {
      const id = req.get('x-test-user');
      if (id) req.user = { id, email: `${id}@imd.test`, name: id, role: 'TRAINEE', sessionId: 's', departmentId: null, jobRoleId: null };
      next();
    });
    app.post('/ask', createAiLimiter(limit), (req, res) => void (req.body?.valid ? res.json({ ok: true }) : res.status(400).json({ success: false })));
    return app;
  };
  const ask = (app: express.Express, user: string, valid = true) => request(app).post('/ask').set('x-test-user', user).send({ valid });

  it('limits each user separately, even when they share an address', async () => {
    const app = appWithLimit(2);
    expect((await ask(app, 'asha')).status).toBe(200);
    expect((await ask(app, 'asha')).status).toBe(200);
    const blocked = await ask(app, 'asha');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ success: false, code: 'AI_RATE_LIMITED' });
    expect(blocked.headers['retry-after']).toBeDefined();
    expect((await ask(app, 'bala')).status).toBe(200); // same IP, different person
  });

  it('does not charge requests that fail before reaching the AI', async () => {
    const app = appWithLimit(2);
    for (let index = 0; index < 5; index += 1) expect((await ask(app, 'chitra', false)).status).toBe(400);
    expect((await ask(app, 'chitra')).status).toBe(200);
    expect((await ask(app, 'chitra')).status).toBe(200);
    expect((await ask(app, 'chitra')).status).toBe(429);
  });
});

describe('environment validation', () => {
  const base = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(40),
  };
  const original = { ...process.env };
  const originalCwd = process.cwd();
  // Run from an empty directory so the loader cannot pick up a developer's real .env file.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-env-'));

  const load = async (overrides: Record<string, string | undefined>) => {
    vi.resetModules();
    process.chdir(sandbox);
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    for (const key of ['JWT_SECRET', 'DATABASE_URL', 'NODE_ENV', 'COOKIE_SECURE', 'COOKIE_SAMESITE', 'FRONTEND_URL', 'STORAGE_DRIVER', 'STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY', 'PORT', 'REGISTRATION_REQUIRES_APPROVAL']) delete process.env[key];
    Object.assign(process.env, base);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return (await import('../../src/config/env')).env;
  };

  afterEach(() => {
    process.chdir(originalCwd);
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, original);
  });

  it('parses a minimal valid configuration with sensible defaults', async () => {
    const env = await load({ FRONTEND_URL: 'https://a.example, https://b.example/' });
    expect(env).toMatchObject({ PORT: 4000, COOKIE_SECURE: false, COOKIE_SAMESITE: 'lax', REGISTRATION_REQUIRES_APPROVAL: true, STORAGE_DRIVER: 'local' });
    expect(env.FRONTEND_URL).toEqual(['https://a.example', 'https://b.example/']);
    expect(env.PUBLIC_WEB_URL).toBe('https://a.example');
  });

  it('fails fast with a readable message when secrets are missing or weak', async () => {
    await expect(load({ JWT_SECRET: 'short' })).rejects.toThrow(/JWT_SECRET must be at least 32 characters/);
    await expect(load({ DATABASE_URL: undefined })).rejects.toThrow(/DATABASE_URL/);
  });

  it('rejects unsafe cookie / production combinations', async () => {
    await expect(load({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })).rejects.toThrow(/COOKIE_SAMESITE=none requires COOKIE_SECURE=true/);
    await expect(load({ NODE_ENV: 'production', COOKIE_SECURE: 'false', FRONTEND_URL: 'https://a.example' })).rejects.toThrow(/COOKIE_SECURE must be true in production/);
    await expect(load({ NODE_ENV: 'production', COOKIE_SECURE: 'true' })).rejects.toThrow(/FRONTEND_URL is required in production/);
    const ok = await load({ NODE_ENV: 'production', COOKIE_SECURE: 'true', FRONTEND_URL: 'https://a.example' });
    expect(ok.isProduction).toBe(true);
  });

  it('requires credentials when the S3 storage driver is selected', async () => {
    await expect(load({ STORAGE_DRIVER: 's3' })).rejects.toThrow(/STORAGE_ACCESS_KEY is required when STORAGE_DRIVER=s3/);
    const ok = await load({ STORAGE_DRIVER: 's3', STORAGE_ACCESS_KEY: 'k', STORAGE_SECRET_KEY: 's' });
    expect(ok.STORAGE_DRIVER).toBe('s3');
  });

  it('rejects a port outside the valid range', async () => {
    await expect(load({ PORT: '70000' })).rejects.toThrow(/PORT/);
  });
});
