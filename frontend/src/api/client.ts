import type { PageMeta } from '../types';

/**
 * HTTP client for the Capacity Connect API.
 *  - cookie sessions (HttpOnly, never readable by this code) with `credentials: 'include'`
 *  - the CSRF header on every state-changing request
 *  - the `{ success, data, meta }` / `{ success:false, code, message }` envelopes
 *  - transparent, single-flight session refresh when the access token has expired
 */

const CSRF_HEADER = 'X-Requested-With';
const CSRF_VALUE = 'CapacityConnect';

const configured = (import.meta.env['VITE_API_URL'] as string | undefined)?.trim();
export const API_BASE = (configured ? configured.replace(/\/+$/, '') : '/api') as string;

/** Origin of an absolute API base (thumbnails etc. are returned as API-relative paths). */
const API_ORIGIN = API_BASE.startsWith('http') ? new URL(API_BASE).origin : '';

/** Turns an API-relative path such as `/api/courses/x/thumbnail` into a URL the browser can load. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_ORIGIN}${path}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level errors from a 400 VALIDATION_ERROR response. */
  get fieldErrors(): { field: string; message: string }[] {
    return this.code === 'VALIDATION_ERROR' && Array.isArray(this.details) ? (this.details as { field: string; message: string }[]) : [];
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isApiError(error)) {
    if (error.code === 'VALIDATION_ERROR' && error.fieldErrors.length > 0) {
      return error.fieldErrors.map((item) => (item.field ? `${item.field}: ${item.message}` : item.message)).join(' · ');
    }
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

export interface ApiResult<T, M = Record<string, unknown>> {
  data: T;
  meta: (Partial<PageMeta> & M) | undefined;
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${url}?${text}` : url;
}

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let refreshInFlight: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

/** The auth provider registers this so an unrecoverable session ends in a clean redirect to sign-in. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { [CSRF_HEADER]: CSRF_VALUE } })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function send(method: string, path: string, options: RequestOptions, allowRefresh: boolean): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData; // the browser sets the multipart boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (method !== 'GET' && method !== 'HEAD') headers[CSRF_HEADER] = CSRF_VALUE;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), { method, headers, body, credentials: 'include', signal: options.signal ?? null });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  if (response.status === 401 && allowRefresh && !AUTH_PATHS.some((authPath) => path.startsWith(authPath))) {
    // The access cookie expires with the token, so an expired session usually arrives as "unauthenticated".
    const cloned = await response.clone().json().catch(() => null);
    const code = (cloned as { code?: string } | null)?.code;
    if (code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED') {
      if (await refreshSession()) return send(method, path, options, false);
      onSessionExpired?.();
    }
  }
  return response;
}

async function parse<T, M>(response: Response): Promise<ApiResult<T, M>> {
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!response.ok) {
    const body = (json ?? {}) as { code?: string; message?: string; details?: unknown; requestId?: string };
    throw new ApiError(response.status, body.code ?? 'HTTP_ERROR', body.message ?? `Request failed (${response.status})`, body.details, body.requestId);
  }
  const body = (json ?? {}) as { data?: T; meta?: Partial<PageMeta> & M };
  return { data: body.data as T, meta: body.meta };
}

async function request<T, M = Record<string, unknown>>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResult<T, M>> {
  return parse<T, M>(await send(method, path, options, true));
}

export const api = {
  get: <T, M = Record<string, unknown>>(path: string, query?: Query, signal?: AbortSignal) => request<T, M>('GET', path, { ...(query ? { query } : {}), ...(signal ? { signal } : {}) }),
  post: <T, M = Record<string, unknown>>(path: string, body?: unknown) => request<T, M>('POST', path, { body: body ?? {} }),
  put: <T, M = Record<string, unknown>>(path: string, body?: unknown) => request<T, M>('PUT', path, { body: body ?? {} }),
  patch: <T, M = Record<string, unknown>>(path: string, body?: unknown) => request<T, M>('PATCH', path, { body: body ?? {} }),
  delete: <T, M = Record<string, unknown>>(path: string) => request<T, M>('DELETE', path),
  upload: <T, M = Record<string, unknown>>(path: string, formData: FormData) => request<T, M>('POST', path, { formData }),
  /** Downloads a binary response (PDF, CSV) as a Blob, with the same error handling as JSON calls. */
  async blob(path: string, query?: Query): Promise<{ blob: Blob; fileName: string | null }> {
    const response = await send('GET', path, query ? { query } : {}, true);
    if (!response.ok) await parse(response);
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    return { blob: await response.blob(), fileName: match?.[1] ? decodeURIComponent(match[1]) : null };
  },
};

/** Saves a Blob through the browser's download mechanism. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens a Blob (for example a PDF) in a new tab. */
export function openBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
