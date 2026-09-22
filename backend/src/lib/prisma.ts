import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export const prisma = new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log: env.isDevelopment ? ['warn', 'error'] : ['error'],
});

/** Either the shared client or an interactive-transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

export { Prisma };
