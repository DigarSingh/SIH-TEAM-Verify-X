import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../../src/app';
import { CSRF_HEADER_VALUE } from '../../src/middleware/csrf';
import { TEST_PASSWORD } from './factories';

export const app = createApp();

export type Agent = ReturnType<typeof request.agent>;

/** A cookie-persisting client that sends the CSRF header like the real web app does. */
export function newAgent(): Agent {
  return request.agent(app).set('X-Requested-With', CSRF_HEADER_VALUE);
}

/** Signs in through the real login endpoint and returns the authenticated client. */
export async function loginAs(email: string, password: string = TEST_PASSWORD): Promise<Agent> {
  const agent = newAgent();
  const response = await agent.post('/api/auth/login').send({ email, password });
  expect(response.status, `login as ${email} failed: ${JSON.stringify(response.body)}`).toBe(200);
  return agent;
}

/** Unauthenticated one-off request helper (adds the CSRF header). */
export const anonymous = (): Agent => newAgent();
