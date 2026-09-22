/**
 * Creates an administrator account, for example the first one of a fresh installation (production never runs the
 * demo seed).
 *
 *   npm run admin:create -- --email admin@your-org.gov.in --name "Full Name"
 *   docker compose run --rm api node dist/cli/create-admin.js --email admin@your-org.gov.in --name "Full Name"
 *
 * A strong temporary password is generated and printed once; the account must change it at its first sign-in.
 * `ADMIN_EMAIL` and `ADMIN_NAME` are accepted instead of the flags. To supply your own first password (for example from
 * a secret manager) set `ADMIN_PASSWORD`: it must satisfy the password policy, and is still a temporary one.
 */
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { emailSchema, requiredText } from '../lib/schemas';
import { passwordSchema } from '../modules/auth/password';
import { createUser } from '../modules/users/users.service';

const inputSchema = z.strictObject({
  email: emailSchema,
  name: requiredText(2, 100, 'Name'),
  password: passwordSchema.optional(),
});
export type CreateAdminInput = z.input<typeof inputSchema>;

export interface CreatedAdmin {
  id: string;
  email: string;
  name: string;
  /** Present only when the password was generated: this is the one and only time it is available. */
  temporaryPassword?: string;
}

/** Validates the input like the API does, then creates an ACTIVE administrator who must change the password at first sign-in. */
export async function createAdministrator(rawInput: CreateAdminInput): Promise<CreatedAdmin> {
  const input = inputSchema.parse(rawInput);
  const { user, temporaryPassword } = await createUser(
    { name: input.name, email: input.email, role: 'ADMIN', password: input.password },
    { userId: null, ip: null, userAgent: 'cli:create-admin' },
  );
  return { id: user.id, email: user.email, name: user.name, ...(temporaryPassword ? { temporaryPassword } : {}) };
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) {
    console.log('Usage: create-admin --email <address> --name "<full name>"   (or ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD)');
    return;
  }
  const password = process.env['ADMIN_PASSWORD'];
  try {
    const admin = await createAdministrator({ email: values.email ?? process.env['ADMIN_EMAIL'] ?? '', name: values.name ?? process.env['ADMIN_NAME'] ?? '', ...(password ? { password } : {}) });
    console.log(`Administrator created: ${admin.name} <${admin.email}>`);
    if (admin.temporaryPassword) {
      console.log(`Temporary password (shown once, change it at first sign-in): ${admin.temporaryPassword}`);
    } else {
      console.log('The password you supplied was set; the account must still change it at first sign-in.');
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Cannot create the administrator:');
      for (const issue of error.issues) console.error(`  - ${issue.path.join('.') || 'input'}: ${issue.message}`);
    } else if (error instanceof AppError) {
      console.error(`Cannot create the administrator: ${error.message}`);
    } else {
      throw error;
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
