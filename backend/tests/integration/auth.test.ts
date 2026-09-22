import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { prisma } from '../../src/lib/prisma';
import { resetDatabase } from '../helpers/db';
import { createAdmin, createDepartment, createJobRole, createUser, TEST_PASSWORD } from '../helpers/factories';
import { anonymous, app, loginAs, newAgent } from '../helpers/http';

const validRegistration = {
  name: 'Asha Verma',
  email: 'asha.verma@imd.gov.in',
  password: 'Sup3r!Secret#Pass',
};

function setCookies(response: request.Response): string[] {
  return (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

function cookieNames(response: request.Response): string[] {
  return setCookies(response).map((cookie) => cookie.split('=')[0] ?? '');
}

/** Raw value of a cookie set by a response, e.g. the refresh token. */
function cookieValue(response: request.Response, name: string): string {
  const cookie = setCookies(response).find((item) => item.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Cookie ${name} was not set`);
  return cookie.split(';')[0]!.slice(name.length + 1);
}

describe('authentication', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('creates a PENDING trainee, sets no session cookies and never returns the password hash', async () => {
      const response = await anonymous().post('/api/auth/register').send(validRegistration);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.requiresApproval).toBe(true);
      expect(response.body.data.user).toMatchObject({ email: 'asha.verma@imd.gov.in', role: 'TRAINEE', status: 'PENDING' });
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/i);
      expect(cookieNames(response)).toEqual([]);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'asha.verma@imd.gov.in' } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored.passwordHash).not.toContain(validRegistration.password);
    });

    it('notifies administrators about the pending registration', async () => {
      const admin = await createAdmin();
      await anonymous().post('/api/auth/register').send(validRegistration).expect(201);

      const notifications = await prisma.notification.findMany({ where: { userId: admin.id } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({ type: 'ACCOUNT', isRead: false });
    });

    it('always registers as TRAINEE even if a role is smuggled into the payload', async () => {
      const response = await anonymous().post('/api/auth/register').send({ ...validRegistration, role: 'ADMIN' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(await prisma.user.count()).toBe(0);
    });

    it('rejects a duplicate email with 409 EMAIL_TAKEN (case-insensitive)', async () => {
      await anonymous().post('/api/auth/register').send(validRegistration).expect(201);
      const response = await anonymous()
        .post('/api/auth/register')
        .send({ ...validRegistration, email: 'ASHA.VERMA@IMD.GOV.IN' });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ success: false, code: 'EMAIL_TAKEN' });
    });

    it.each([
      ['too short', 'Ab1!'],
      ['no upper-case letter', 'lowercase1!lowercase'],
      ['no lower-case letter', 'UPPERCASE1!UPPERCASE'],
      ['no digit', 'NoDigits!Here!!'],
      ['no symbol', 'NoSymbols1234Here'],
    ])('rejects a weak password (%s)', async (_label, password) => {
      const response = await anonymous().post('/api/auth/register').send({ ...validRegistration, password });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details[0].field).toBe('password');
    });

    it('validates the email format', async () => {
      const response = await anonymous().post('/api/auth/register').send({ ...validRegistration, email: 'not-an-email' });
      expect(response.status).toBe(400);
      expect(response.body.details.map((d: { field: string }) => d.field)).toContain('email');
    });

    it('rejects unknown department / role references', async () => {
      const response = await anonymous()
        .post('/api/auth/register')
        .send({ ...validRegistration, departmentId: '11111111-1111-4111-8111-111111111111' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_DEPARTMENT');
    });

    it('stores department, job role and employee id when provided', async () => {
      const department = await createDepartment();
      const jobRole = await createJobRole();
      const response = await anonymous()
        .post('/api/auth/register')
        .send({ ...validRegistration, departmentId: department.id, jobRoleId: jobRole.id, employeeId: 'IMD-1234' });
      expect(response.status).toBe(201);
      expect(response.body.data.user.department.id).toBe(department.id);
      expect(response.body.data.user.jobRole.id).toBe(jobRole.id);
      expect(response.body.data.user.employeeId).toBe('IMD-1234');
    });

    it('activates the account and signs the user in when approval is not required', async () => {
      const original = env.REGISTRATION_REQUIRES_APPROVAL;
      env.REGISTRATION_REQUIRES_APPROVAL = false;
      try {
        const agent = newAgent();
        const response = await agent.post('/api/auth/register').send(validRegistration);
        expect(response.status).toBe(201);
        expect(response.body.data.requiresApproval).toBe(false);
        expect(response.body.data.user.status).toBe('ACTIVE');
        await agent.get('/api/users/me').expect(200);
      } finally {
        env.REGISTRATION_REQUIRES_APPROVAL = original;
      }
    });
  });

  describe('POST /api/auth/login', () => {
    it('signs in with valid credentials and sets HttpOnly cookies', async () => {
      const user = await createUser({ email: 'trainee@imd.gov.in' });
      const response = await anonymous().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.body.data.user).toMatchObject({ email: 'trainee@imd.gov.in', role: 'TRAINEE' });
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('cc_at=') && /HttpOnly/i.test(c))).toBe(true);
      expect(cookies.some((c) => c.startsWith('cc_rt=') && /HttpOnly/i.test(c) && /Path=\/api\/auth/i.test(c))).toBe(true);
      expect(JSON.stringify(response.body)).not.toMatch(/token/i);
    });

    it('is case-insensitive on the email', async () => {
      await createUser({ email: 'mixed@imd.gov.in' });
      await anonymous().post('/api/auth/login').send({ email: 'MiXeD@IMD.gov.in', password: TEST_PASSWORD }).expect(200);
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const user = await createUser();
      const wrongPassword = await anonymous().post('/api/auth/login').send({ email: user.email, password: 'Wr0ng!Password' });
      const unknownEmail = await anonymous().post('/api/auth/login').send({ email: 'nobody@imd.gov.in', password: 'Wr0ng!Password' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    });

    it.each([
      ['PENDING', 'ACCOUNT_PENDING'],
      ['REJECTED', 'ACCOUNT_REJECTED'],
      ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
    ] as const)('refuses a %s account with %s', async (status, code) => {
      const user = await createUser({ status });
      const response = await anonymous().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe(code);
    });

    it('does not reveal the account status when the password is wrong', async () => {
      const user = await createUser({ status: 'SUSPENDED' });
      const response = await anonymous().post('/api/auth/login').send({ email: user.email, password: 'Wr0ng!Password' });
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('locks the account after too many failed attempts, even for the correct password', async () => {
      const user = await createUser();
      for (let attempt = 0; attempt < env.MAX_FAILED_LOGINS; attempt += 1) {
        const failed = await anonymous().post('/api/auth/login').send({ email: user.email, password: 'Wr0ng!Password' });
        expect(failed.status).toBe(401);
      }
      const locked = await anonymous().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
      expect(locked.status).toBe(423);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    });

    it('resets the failed-attempt counter after a successful login', async () => {
      const user = await createUser();
      await anonymous().post('/api/auth/login').send({ email: user.email, password: 'Wr0ng!Password' }).expect(401);
      await anonymous().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.failedLoginCount).toBe(0);
      expect(stored.lastLoginAt).not.toBeNull();
    });

    it('validates the request body', async () => {
      const response = await anonymous().post('/api/auth/login').send({ email: 'x' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('sessions', () => {
    it('GET /api/users/me requires authentication', async () => {
      const response = await request(app).get('/api/users/me');
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ success: false, code: 'UNAUTHENTICATED' });
    });

    it('returns the signed-in user', async () => {
      const user = await createUser({ name: 'Priya Singh' });
      const agent = await loginAs(user.email);
      const response = await agent.get('/api/users/me').expect(200);
      expect(response.body.data).toMatchObject({ id: user.id, name: 'Priya Singh', role: 'TRAINEE', unreadNotifications: 0 });
    });

    it('rejects a tampered token', async () => {
      const user = await createUser();
      const forged = jwt.sign({ sub: user.id, sid: 'x', role: 'ADMIN' }, 'a-different-secret-that-is-long-enough-123', { issuer: 'capacity-connect' });
      const response = await request(app).get('/api/users/me').set('Cookie', `cc_at=${forged}`);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('rejects an expired token with TOKEN_EXPIRED', async () => {
      const user = await createUser();
      const agent = await loginAs(user.email);
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      const expired = jwt.sign({ sub: user.id, sid: session.id, role: 'TRAINEE' }, env.JWT_SECRET, { issuer: 'capacity-connect', expiresIn: -30 });
      const response = await request(app).get('/api/users/me').set('Cookie', `cc_at=${expired}`);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('TOKEN_EXPIRED');
      await agent.get('/api/users/me').expect(200); // the real session is unaffected
    });

    it('logout revokes the session so the old access token stops working immediately', async () => {
      const user = await createUser();
      const agent = newAgent();
      const login = await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      const accessCookie = `cc_at=${cookieValue(login, 'cc_at')}`;
      await request(app).get('/api/users/me').set('Cookie', accessCookie).expect(200);

      const logout = await agent.post('/api/auth/logout').expect(200);
      expect(cookieNames(logout).sort()).toEqual(['cc_at', 'cc_rt']);

      const stale = await request(app).get('/api/users/me').set('Cookie', accessCookie);
      expect(stale.status).toBe(401);
      expect(stale.body.code).toBe('SESSION_INVALID');
    });

    it('logout is idempotent and works without a session', async () => {
      await anonymous().post('/api/auth/logout').expect(200);
      const agent = await loginAs((await createUser()).email);
      await agent.post('/api/auth/logout').expect(200);
      await agent.post('/api/auth/logout').expect(200);
    });

    it('applies role and status changes immediately, not when the token expires', async () => {
      const user = await createUser();
      const agent = await loginAs(user.email);
      await agent.get('/api/users/me').expect(200);

      await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
      const response = await agent.get('/api/users/me');
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('rotates the refresh token and keeps the session alive', async () => {
      const user = await createUser();
      const agent = await loginAs(user.email);
      const before = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });

      const response = await agent.post('/api/auth/refresh').expect(200);
      expect(cookieNames(response).sort()).toEqual(['cc_at', 'cc_rt']);

      const after = await prisma.session.findUniqueOrThrow({ where: { id: before.id } });
      expect(after.tokenHash).not.toBe(before.tokenHash);
      expect(after.previousTokenHash).toBe(before.tokenHash);
      await agent.get('/api/users/me').expect(200);
    });

    it('revokes the whole session when an old refresh token is replayed after the grace window', async () => {
      const user = await createUser();
      const bystander = await loginAs(user.email); // a second, unrelated login session
      const login = await anonymous().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
      const stolen = cookieValue(login, 'cc_rt');
      const refreshWith = (token: string) =>
        request(app).post('/api/auth/refresh').set('X-Requested-With', 'CapacityConnect').set('Cookie', `cc_rt=${token}`);

      // Legitimate rotation, then make that rotation look old.
      await refreshWith(stolen).expect(200);
      await prisma.session.updateMany({ where: { userId: user.id }, data: { lastUsedAt: new Date(Date.now() - 60_000) } });

      // Replaying the already-rotated token is treated as theft and kills that session.
      const replay = await refreshWith(stolen);
      expect(replay.status).toBe(401);
      expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');
      expect(await prisma.session.count({ where: { userId: user.id, revokedAt: { not: null } } })).toBe(1);
      await bystander.get('/api/users/me').expect(200); // other sessions are untouched
    });

    it('tolerates a concurrent refresh from a second tab inside the grace window', async () => {
      const user = await createUser();
      const login = await anonymous().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
      const rawOld = cookieValue(login, 'cc_rt');

      const post = () => request(app).post('/api/auth/refresh').set('X-Requested-With', 'CapacityConnect').set('Cookie', `cc_rt=${rawOld}`);
      const first = await post();
      const second = await post();
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(cookieNames(second)).toEqual(['cc_at']);
    });

    it('rejects a missing or unknown refresh token', async () => {
      const missing = await anonymous().post('/api/auth/refresh');
      expect(missing.status).toBe(401);
      expect(missing.body.code).toBe('NO_REFRESH_TOKEN');

      const unknown = await request(app).post('/api/auth/refresh').set('X-Requested-With', 'CapacityConnect').set('Cookie', 'cc_rt=not-a-real-token');
      expect(unknown.status).toBe(401);
      expect(unknown.body.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('requires the correct current password', async () => {
      const agent = await loginAs((await createUser()).email);
      const response = await agent.post('/api/auth/change-password').send({ currentPassword: 'Wr0ng!Password', newPassword: 'N3w!Password#2026' });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INCORRECT_PASSWORD');
    });

    it('enforces the password policy and rejects reuse of the current password', async () => {
      const agent = await loginAs((await createUser()).email);
      const weak = await agent.post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: 'weak' });
      expect(weak.status).toBe(400);
      const same = await agent.post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD });
      expect(same.status).toBe(400);
      expect(same.body.details[0].field).toBe('newPassword');
    });

    it('changes the password, signs out other sessions and clears a forced-change flag', async () => {
      const user = await createUser({ mustChangePassword: true });
      const other = await loginAs(user.email);
      const current = await loginAs(user.email);

      // While a change is pending only the allow-listed endpoints work.
      const blocked = await current.get('/api/notifications');
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await current.get('/api/users/me').expect(200);

      await current.post('/api/auth/change-password').send({ currentPassword: TEST_PASSWORD, newPassword: 'N3w!Password#2026' }).expect(200);

      await current.get('/api/users/me').expect(200);
      const revoked = await other.get('/api/users/me');
      expect(revoked.status).toBe(401);

      await anonymous().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(401);
      await anonymous().post('/api/auth/login').send({ email: user.email, password: 'N3w!Password#2026' }).expect(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).mustChangePassword).toBe(false);
    });
  });

  describe('request hardening', () => {
    it('rejects state-changing requests that lack the CSRF header', async () => {
      const response = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('CSRF_REJECTED');
    });

    it('returns the standard error envelope for unknown routes', async () => {
      const response = await request(app).get('/api/does-not-exist');
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, code: 'ROUTE_NOT_FOUND' });
    });

    it('returns 400 INVALID_JSON for malformed JSON bodies', async () => {
      const response = await newAgent().post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_JSON');
    });

    it('sends security headers and never caches API responses', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-request-id']).toBeTruthy();
    });

    it('only allows configured browser origins (CORS)', async () => {
      const allowed = await request(app).options('/api/auth/login').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');

      const blocked = await request(app).options('/api/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
