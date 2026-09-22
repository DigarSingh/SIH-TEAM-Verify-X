import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { keys } from '../api/keys';
import { ConfirmProvider, ToastProvider } from '../components/ui';
import { AuthProvider } from '../hooks/useAuth';
import type { RegistrationOptions, Role, User } from '../types';

// ---- a scripted API ---------------------------------------------------------------------------------------------

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}
export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Headers;
}
type Responder = (call: RecordedCall) => MockResponse | Promise<MockResponse>;

/** The API's success envelope. */
export const okBody = (data: unknown, meta?: Record<string, unknown>): MockResponse => ({ status: 200, body: meta ? { success: true, data, meta } : { success: true, data } });
/** The API's error envelope. */
export const errorBody = (status: number, code: string, message: string, details?: unknown): MockResponse => ({ status, body: { success: false, code, message, ...(details ? { details } : {}) } });

/**
 * Replaces `fetch` with a scripted API: `api.on('GET', '/courses', () => okBody([...]))`. A request nobody
 * scripted fails the test with a clear message instead of silently returning nothing.
 */
export function mockApi() {
  const handlers: { method: string; path: string; respond: Responder }[] = [];
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/api/, '');
    const raw = typeof init?.body === 'string' ? init.body : undefined;
    const call: RecordedCall = { method, path, query: url.searchParams, body: raw ? JSON.parse(raw) : undefined, headers: new Headers(init?.headers) };
    calls.push(call);
    // Newest handler first, so a test can override a default.
    const handler = [...handlers].reverse().find((item) => item.method === method && item.path === path);
    if (!handler) throw new Error(`Unscripted API call: ${method} ${path}`);
    const response = await handler.respond(call);
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), { status: response.status ?? 200, headers: { 'content-type': 'application/json', ...response.headers } });
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    on(method: string, path: string, respond: Responder | MockResponse) {
      handlers.push({ method: method.toUpperCase(), path, respond: typeof respond === 'function' ? respond : () => respond });
    },
    calls,
    callsTo: (method: string, path: string) => calls.filter((call) => call.method === method.toUpperCase() && call.path === path),
  };
}

// ---- fixtures ---------------------------------------------------------------------------------------------------

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'trainee@imd.gov.in',
    name: 'Dr. Ananya Rao',
    employeeId: 'IMD-TR-1024',
    phone: null,
    designation: 'Scientist C',
    location: 'New Delhi',
    joiningDate: null,
    role: 'TRAINEE' as Role,
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: null,
    approvedAt: null,
    rejectionReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    department: null,
    jobRole: null,
    ...overrides,
  };
}

export const makeOptions = (ai: boolean, aiProvider: string | null = ai ? 'OpenAI' : null): RegistrationOptions => ({
  departments: [],
  roles: [],
  registration: { requiresApproval: true, allowedEmailDomains: [] },
  passwordPolicy: { minLength: 10, requires: ['lowercase', 'uppercase', 'digit', 'symbol'] },
  features: { ai, aiProvider },
  uploads: { maxMb: 25 },
});

// ---- rendering --------------------------------------------------------------------------------------------------

interface RenderOptions {
  /** The initial URL, or a URL with router state (for example where a redirect came from). */
  route?: string | { pathname: string; state?: unknown };
  /** The signed-in user; `null` means signed out. Omit to let the app ask the (scripted) API. */
  user?: User | null;
  /** Whether the server reports the optional AI features as switched on. */
  ai?: boolean;
  /** Who the server says receives the AI text (default OpenAI when the features are on). */
  aiProvider?: string;
}

/** Renders inside the same providers as the real app (query cache, router, toasts, auth). */
export function renderApp(ui: ReactElement, { route = '/', user, ai, aiProvider }: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
  if (user !== undefined) queryClient.setQueryData(keys.me, user);
  if (ai !== undefined) queryClient.setQueryData(keys.options, makeOptions(ai, aiProvider));
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>{ui}</AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}
