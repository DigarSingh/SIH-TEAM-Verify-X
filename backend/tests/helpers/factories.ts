import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../src/lib/prisma';
import { hashPassword } from '../../src/modules/auth/password';

/** Password shared by every factory-created account (satisfies the password policy). */
export const TEST_PASSWORD = 'Str0ng!Passw0rd';

let passwordHashPromise: Promise<string> | undefined;
const sharedPasswordHash = () => (passwordHashPromise ??= hashPassword(TEST_PASSWORD));

let sequence = 0;
export const nextId = (): number => {
  sequence += 1;
  return sequence;
};

export async function createUser(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const n = nextId();
  return prisma.user.create({
    data: {
      email: `user${n}@imd.test`,
      name: `Test User ${n}`,
      passwordHash: await sharedPasswordHash(),
      role: 'TRAINEE',
      status: 'ACTIVE',
      approvedAt: new Date(),
      ...overrides,
    },
  });
}

export const createAdmin = (overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
  createUser({ role: 'ADMIN' as UserRole, name: 'Admin User', ...overrides });

export const createTrainer = (overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
  createUser({ role: 'TRAINER' as UserRole, name: 'Trainer User', ...overrides });

export async function createDepartment(overrides: Partial<Prisma.DepartmentUncheckedCreateInput> = {}) {
  const n = nextId();
  return prisma.department.create({ data: { name: `Department ${n}`, code: `DEP${n}`, ...overrides } });
}

export async function createJobRole(overrides: Partial<Prisma.RoleUncheckedCreateInput> = {}) {
  const n = nextId();
  return prisma.role.create({ data: { name: `Job Role ${n}`, code: `ROLE${n}`, criticality: 3, ...overrides } });
}

export async function createCompetency(overrides: Partial<Prisma.CompetencyUncheckedCreateInput> = {}) {
  const n = nextId();
  return prisma.competency.create({
    data: { name: `Competency ${n}`, code: `COMP${n}`, description: 'Test competency', category: 'Core', ...overrides },
  });
}
