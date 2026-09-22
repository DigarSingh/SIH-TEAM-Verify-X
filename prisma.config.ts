import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma CLI configuration (replaces the deprecated `package.json#prisma` block).
// `dotenv/config` loads the repository-root `.env` so DATABASE_URL is available
// to `prisma migrate`, `prisma generate` and `prisma db seed`.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
