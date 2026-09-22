import { execSync } from 'node:child_process';
import { findRepoRoot, resolveTestDatabaseUrl } from './test-env';

/** Applies all migrations to the test database once, before any test file runs. */
export default function setup(): void {
  const databaseUrl = resolveTestDatabaseUrl();
  try {
    execSync('npx prisma migrate deploy', {
      cwd: findRepoRoot(),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (error) {
    const detail = error instanceof Error && 'stderr' in error ? String((error as { stderr: Buffer }).stderr) : String(error);
    throw new Error(
      `Could not prepare the test database.\nIs PostgreSQL running? Start the local one with "npm run db:local" or set TEST_DATABASE_URL.\n${detail}`,
    );
  }
}
