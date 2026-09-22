import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockApi, okBody } from '../test/utils';
import { ApiError, api, assetUrl, errorMessage, isApiError, setSessionExpiredHandler } from './client';

afterEach(() => setSessionExpiredHandler(null));

describe('API client: requests', () => {
  it('sends the CSRF header and cookies on state-changing requests, but not on reads', async () => {
    const server = mockApi();
    server.on('GET', '/courses', okBody([]));
    server.on('POST', '/courses', okBody({ id: 'c1' }));
    server.on('PATCH', '/courses/c1', okBody({}));
    server.on('DELETE', '/courses/c1', okBody({}));

    await api.get('/courses');
    await api.post('/courses', { title: 'Radar' });
    await api.patch('/courses/c1', { title: 'Radar 2' });
    await api.delete('/courses/c1');

    const [read, ...writes] = server.calls;
    expect(read?.headers.get('X-Requested-With')).toBeNull();
    for (const write of writes) expect(write.headers.get('X-Requested-With')).toBe('CapacityConnect');
    expect(server.calls[1]?.headers.get('Content-Type')).toBe('application/json');
    expect(server.calls[1]?.body).toEqual({ title: 'Radar' });
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.credentials).toBe('include'); // the session cookie is HttpOnly: the browser attaches it
  });

  it('drops empty query values but keeps zero and false', async () => {
    const server = mockApi();
    server.on('GET', '/courses', okBody([]));
    await api.get('/courses', { q: '', category: undefined, difficulty: null, page: 0, mine: false, sort: 'newest' });
    expect(Object.fromEntries(server.calls[0]?.query ?? [])).toEqual({ page: '0', mine: 'false', sort: 'newest' });
  });

  it('unwraps the { data, meta } envelope', async () => {
    const server = mockApi();
    server.on('GET', '/courses', okBody([{ id: 'c1' }], { total: 1 }));
    const result = await api.get<{ id: string }[], { total: number }>('/courses');
    expect(result.data).toEqual([{ id: 'c1' }]);
    expect(result.meta).toEqual({ total: 1 });
  });
});

describe('API client: errors', () => {
  it('turns an error envelope into an ApiError with status, code and field errors', async () => {
    const server = mockApi();
    server.on('POST', '/courses', errorBody(400, 'VALIDATION_ERROR', 'Validation failed', [{ field: 'title', message: 'Enter a title' }, { field: 'category', message: 'Enter a category' }]));

    const failure = await api.post('/courses', {}).catch((error: unknown) => error);
    expect(isApiError(failure)).toBe(true);
    const error = failure as ApiError;
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed' });
    expect(error.fieldErrors).toEqual([{ field: 'title', message: 'Enter a title' }, { field: 'category', message: 'Enter a category' }]);
    expect(errorMessage(error)).toBe('title: Enter a title · category: Enter a category');
  });

  it('shows the server message for other errors and a safe fallback for unknown ones', () => {
    expect(errorMessage(new ApiError(409, 'DUPLICATE_ENTRY', 'A record with the same email already exists'))).toBe('A record with the same email already exists');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('not an error')).toBe('Something went wrong. Please try again.');
    expect(new ApiError(400, 'VALIDATION_ERROR', 'x').fieldErrors).toEqual([]);
  });

  it('reports an unreachable server as a network error, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.get('/courses')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR', message: expect.stringContaining('Cannot reach the server') });
  });

  it('handles an error page that is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })));
    await expect(api.get('/courses')).rejects.toMatchObject({ status: 502, code: 'HTTP_ERROR', message: 'Request failed (502)' });
  });
});

describe('API client: session refresh', () => {
  it('refreshes an expired session once, then repeats the request', async () => {
    const server = mockApi();
    let refreshed = false;
    server.on('POST', '/auth/refresh', () => {
      refreshed = true;
      return okBody({});
    });
    server.on('GET', '/courses', () => (refreshed ? okBody(['ok']) : errorBody(401, 'TOKEN_EXPIRED', 'Your session has expired')));

    const result = await api.get<string[]>('/courses');
    expect(result.data).toEqual(['ok']);
    expect(server.callsTo('POST', '/auth/refresh')).toHaveLength(1);
    expect(server.callsTo('GET', '/courses')).toHaveLength(2);
  });

  it('shares one refresh between requests that expire together', async () => {
    const server = mockApi();
    let refreshed = false;
    server.on('POST', '/auth/refresh', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      refreshed = true;
      return okBody({});
    });
    server.on('GET', '/courses', () => (refreshed ? okBody(['courses']) : errorBody(401, 'TOKEN_EXPIRED', 'expired')));
    server.on('GET', '/notifications', () => (refreshed ? okBody(['notes']) : errorBody(401, 'TOKEN_EXPIRED', 'expired')));

    const [courses, notes] = await Promise.all([api.get('/courses'), api.get('/notifications')]);
    expect([courses.data, notes.data]).toEqual([['courses'], ['notes']]);
    expect(server.callsTo('POST', '/auth/refresh')).toHaveLength(1); // not one refresh per request (that would rotate the token twice)
  });

  it('tells the app the session is over when the refresh fails, and still surfaces the 401', async () => {
    const server = mockApi();
    server.on('POST', '/auth/refresh', errorBody(401, 'INVALID_TOKEN', 'Invalid authentication token'));
    server.on('GET', '/courses', errorBody(401, 'TOKEN_EXPIRED', 'Your session has expired'));
    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    await expect(api.get('/courses')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not try to refresh a failed sign-in (wrong password is not an expired session)', async () => {
    const server = mockApi();
    server.on('POST', '/auth/login', errorBody(401, 'INVALID_CREDENTIALS', 'Incorrect email or password'));
    await expect(api.post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(server.callsTo('POST', '/auth/refresh')).toHaveLength(0);
  });

  it('does not refresh for other failures such as 403', async () => {
    const server = mockApi();
    server.on('GET', '/admin/analytics', errorBody(403, 'FORBIDDEN', 'This action requires one of the following roles: ADMIN'));
    await expect(api.get('/admin/analytics')).rejects.toMatchObject({ status: 403 });
    expect(server.callsTo('POST', '/auth/refresh')).toHaveLength(0);
  });
});

/** The Blob a fetch response returns has no text() under jsdom on newer Node versions, so fall back to FileReader. */
const readText = (blob: Blob): Promise<string> =>
  typeof blob.text === 'function'
    ? blob.text()
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });

describe('API client: downloads and assets', () => {
  it('returns a file with the name the server gave it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('%PDF-1.7', { status: 200, headers: { 'content-disposition': 'attachment; filename="CC-2026-0001.pdf"' } })));
    const { blob, fileName } = await api.blob('/certificates/c1/download');
    expect(fileName).toBe('CC-2026-0001.pdf');
    expect(await readText(blob)).toBe('%PDF-1.7');
  });

  it('raises the API error for a failed download instead of saving an error page as a file', async () => {
    const server = mockApi();
    server.on('GET', '/certificates/c1/download', errorBody(404, 'CERTIFICATE_NOT_FOUND', 'Certificate not found'));
    await expect(api.blob('/certificates/c1/download')).rejects.toMatchObject({ status: 404, code: 'CERTIFICATE_NOT_FOUND' });
  });

  it('resolves API-relative asset paths and leaves absolute URLs alone', () => {
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl('/api/courses/c1/thumbnail')).toBe('/api/courses/c1/thumbnail');
    expect(assetUrl('https://cdn.example.org/a.png')).toBe('https://cdn.example.org/a.png');
  });
});
