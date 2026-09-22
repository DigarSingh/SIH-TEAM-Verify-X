/*
 * Capacity Connect service worker.
 *
 * Field staff lose connectivity; the app should keep working for what has
 * already been downloaded. This worker handles READS only:
 *
 *   - the app shell (HTML, hashed JS/CSS, icons, fonts) so the app starts offline;
 *   - a small allow-list of GET API responses so saved courses and assessment
 *     briefs can still be read.
 *
 * Writes are deliberately NOT handled here. They go through the app's mutation
 * queue (src/offline/queue.ts), which owns retry, ordering, the idempotency key
 * and the message the learner sees. Background sync in a worker cannot do any
 * of that, and a silently replayed POST is worse than a visible pending one.
 *
 * Everything cached here is cleared when the user signs out (CLEAR_OFFLINE_DATA),
 * because a shared device must not leak one person's data to the next.
 */

const VERSION = 'v1';
const SHELL_CACHE = `cc-shell-${VERSION}`;
const ASSET_CACHE = `cc-assets-${VERSION}`;
const DATA_CACHE = `cc-data-${VERSION}`;
const OUR_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE];

/** Precached so the very first offline start works even if nothing else was visited. */
const SHELL_URLS = ['/', '/index.html', '/offline.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];

/**
 * GET endpoints kept for offline reading. Deliberately narrow: a learner's own
 * courses, enrolments and assessment briefs. Administrative and workforce-wide
 * data is never written to disk.
 */
const CACHEABLE_API = [
  /^\/api\/users\/me$/,
  /^\/api\/meta\/options$/,
  /^\/api\/dashboard\/trainee$/,
  /^\/api\/enrollments\/me$/,
  /^\/api\/assessments\/me$/,
  /^\/api\/assessments\/[^/]+$/,
  /^\/api\/courses\/[^/]+$/,
  /^\/api\/courses\/[^/]+\/learn$/,
];

const isApi = (url) => url.origin === self.location.origin && url.pathname.startsWith('/api/');
const isCacheableApi = (url) => CACHEABLE_API.some((pattern) => pattern.test(url.pathname));
const isStaticAsset = (url) =>
  url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || /\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|ico)$/i.test(url.pathname));

/** Marks a response as a saved copy so the interface can say so rather than pretending it is live. */
function markOffline(response) {
  const headers = new Headers(response.headers);
  headers.set('X-CC-Offline', '1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `reload` bypasses the HTTP cache: a stale index.html here would pin an old build forever.
      .then((cache) => cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .catch(() => undefined), // a failed precache must not block activation; runtime caching still works
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('cc-') && !OUR_CACHES.includes(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (type === 'CLEAR_OFFLINE_DATA') {
    // Signing out: drop every cached response, including the shell, and confirm.
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name.startsWith('cc-')).map((name) => caches.delete(name)));
        if (event.source) event.source.postMessage({ type: 'OFFLINE_DATA_CLEARED' });
      })(),
    );
  }
});

/** App shell: network first so a new deployment is picked up, cache as the offline fallback. */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cached = (await caches.match('/index.html')) ?? (await caches.match('/'));
    if (cached) return markOffline(cached);
    const fallback = await caches.match('/offline.html');
    return fallback ?? new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

/** Hashed build assets never change under the same URL, so the cached copy is always correct. */
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(ASSET_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Learner data: always prefer the live answer, fall back to the last one we saw. */
async function handleApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return markOffline(cached);
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // writes belong to the mutation queue

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isApi(url)) {
    if (isCacheableApi(url)) event.respondWith(handleApi(request));
    return; // everything else goes straight to the network, uncached
  }
  if (isStaticAsset(url)) event.respondWith(handleAsset(request));
});
