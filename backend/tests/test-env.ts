import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/** Walks up from the working directory to the repository root (the folder holding prisma/schema.prisma). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(dir, 'prisma', 'schema.prisma'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate the repository root (prisma/schema.prisma)');
}

/**
 * Resolves the database the tests may destroy. Tests TRUNCATE every table, so
 * anything that does not look like a dedicated test database is refused.
 */
export function resolveTestDatabaseUrl(): string {
  const envFile = path.join(findRepoRoot(), '.env');
  if (fs.existsSync(envFile)) dotenv.config({ path: envFile });

  const raw = process.env['TEST_DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/capacity_connect_test?schema=public';
  const url = new URL(raw);
  const databaseName = url.pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run tests: database "${databaseName}" does not end with "_test". The tests TRUNCATE all tables.`);
  }
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
  return url.toString();
}
