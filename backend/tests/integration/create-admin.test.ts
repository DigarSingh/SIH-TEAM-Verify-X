import { beforeAll, describe, expect, it } from 'vitest';
import { createAdministrator } from '../../src/cli/create-admin';
import { prisma } from '../../src/lib/prisma';
import { passwordSchema, verifyPassword } from '../../src/modules/auth/password';
import { resetDatabase } from '../helpers/db';
import { loginAs } from '../helpers/http';

/**
 * The command that creates the first administrator of a production installation (which never runs the demo seed).
 * It reuses the API's own account creation, so the same rules apply.
 */
describe('create-admin command', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it('creates an active administrator with a generated temporary password that must be changed', async () => {
    const admin = await createAdministrator({ email: '  First.Admin@IMD.gov.in ', name: 'First Admin' });

    expect(admin.email).toBe('first.admin@imd.gov.in'); // trimmed and lower-cased like every other account
    const temporary = admin.temporaryPassword as string;
    expect(passwordSchema.safeParse(temporary).success).toBe(true); // it satisfies the platform's own password policy

    const row = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } });
    expect(row).toMatchObject({ role: 'ADMIN', status: 'ACTIVE', mustChangePassword: true, name: 'First Admin' });
    expect(row.passwordHash).not.toContain(temporary); // only an Argon2id hash is stored
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(row.passwordHash, temporary)).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_CREATED', entityId: row.id } });
    expect(audit.userAgent).toBe('cli:create-admin');
    expect(JSON.stringify(audit.metadata)).not.toContain(temporary); // the password never reaches the audit log
  });

  it('can sign in, but can do nothing else until the temporary password is replaced', async () => {
    const admin = await createAdministrator({ email: 'second.admin@imd.gov.in', name: 'Second Admin' });
    const session = await loginAs(admin.email, admin.temporaryPassword as string);

    const blocked = await session.get('/api/admin/analytics');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    await session.post('/api/auth/change-password').send({ currentPassword: admin.temporaryPassword, newPassword: 'My0wn!Passphrase' }).expect(200);
    await session.get('/api/admin/analytics').expect(200);
  });

  it('accepts a supplied first password if it meets the policy, and still requires it to be changed', async () => {
    const admin = await createAdministrator({ email: 'third.admin@imd.gov.in', name: 'Third Admin', password: 'Sup3r!SecretStart' });
    expect(admin.temporaryPassword).toBeUndefined(); // nothing to print: the operator already knows it
    const row = await prisma.user.findUniqueOrThrow({ where: { email: admin.email } });
    expect(row.mustChangePassword).toBe(true);
    expect(await verifyPassword(row.passwordHash, 'Sup3r!SecretStart')).toBe(true);
  });

  it('never overwrites an existing account', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { email: 'first.admin@imd.gov.in' } });
    await expect(createAdministrator({ email: 'FIRST.ADMIN@imd.gov.in', name: 'Somebody Else' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    const after = await prisma.user.findUniqueOrThrow({ where: { email: 'first.admin@imd.gov.in' } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.name).toBe('First Admin');
  });

  it.each([
    ['a weak password', { email: 'weak@imd.gov.in', name: 'Weak Password', password: 'short' }],
    ['a malformed e-mail address', { email: 'not-an-email', name: 'Bad Email' }],
    ['a missing name', { email: 'noname@imd.gov.in', name: '' }],
  ])('rejects %s without creating anything', async (_label, input) => {
    const before = await prisma.user.count();
    await expect(createAdministrator(input)).rejects.toThrow();
    expect(await prisma.user.count()).toBe(before);
  });
});
