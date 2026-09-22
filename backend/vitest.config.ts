import { defineConfig } from 'vitest/config';

/**
 * Two test projects:
 *  - unit:        pure logic (competency engine, formulas). No database, runs anywhere, fast.
 *  - integration: the real Express app against a REAL PostgreSQL test database
 *                 (TEST_DATABASE_URL, must end in "_test" because tables are truncated).
 *                 Files share one database, so they run sequentially in a single fork.
 */
export default defineConfig({
  test: {
    // Integration files share one database, so files never run concurrently.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup-env.ts', 'tests/setup-hooks.ts'],
          globalSetup: ['tests/global-setup.ts'],
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/types/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
