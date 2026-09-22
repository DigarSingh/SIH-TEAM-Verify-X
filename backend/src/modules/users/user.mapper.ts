import type { Prisma } from '@prisma/client';

/** Relations included whenever a user is returned to a client. */
export const userInclude = {
  department: { select: { id: true, name: true, code: true } },
  jobRole: { select: { id: true, name: true, code: true, criticality: true } },
} satisfies Prisma.UserInclude;

export type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/**
 * Public representation of a user. This is an explicit allow-list: the password
 * hash, lock-out counters and other internals can never leak through the API.
 */
export function toUserDto(user: UserWithRelations) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    employeeId: user.employeeId,
    phone: user.phone,
    designation: user.designation,
    location: user.location,
    joiningDate: user.joiningDate,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    approvedAt: user.approvedAt,
    rejectionReason: user.rejectionReason,
    createdAt: user.createdAt,
    department: user.department,
    jobRole: user.jobRole,
  };
}

export type UserDto = ReturnType<typeof toUserDto>;

/** Two-letter initials used for avatars. */
export function initials(name: string): string {
  return (
    name
      .replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}
