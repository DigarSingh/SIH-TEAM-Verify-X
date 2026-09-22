#!/usr/bin/env node
/**
 * Creates a local `.env` from `.env.example` and generates a random JWT_SECRET.
 * Idempotent: an existing `.env` is never overwritten.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = path.join(root, '.env.example');
const targetPath = path.join(root, '.env');

if (fs.existsSync(targetPath)) {
  console.log('.env already exists - leaving it untouched.');
  process.exit(0);
}

let content = fs.readFileSync(examplePath, 'utf8');
const secret = crypto.randomBytes(48).toString('base64url');
content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
fs.writeFileSync(targetPath, content, { mode: 0o600 });

console.log('Created .env with a freshly generated JWT_SECRET.');
console.log('Next steps:');
console.log('  1. npm run db:local      (starts a local PostgreSQL, or point DATABASE_URL at your own)');
console.log('  2. npm run db:deploy     (apply migrations)');
console.log('  3. npm run db:seed       (load demo data)');
console.log('  4. npm run dev           (API on :4000, web on :5173)');
