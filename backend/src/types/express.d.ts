import type { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    /** The authenticated principal, loaded from the database on every request. */
    interface AuthUser {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      sessionId: string;
      departmentId: string | null;
      jobRoleId: string | null;
    }

    interface Request {
      requestId: string;
      user?: AuthUser;
    }
  }
}

export {};
