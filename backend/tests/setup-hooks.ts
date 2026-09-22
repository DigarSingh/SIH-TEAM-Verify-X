import { afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma';

// Each test file gets a fresh module registry (and PrismaClient); close it so
// connections do not pile up across the suite.
afterAll(async () => {
  await prisma.$disconnect();
});
