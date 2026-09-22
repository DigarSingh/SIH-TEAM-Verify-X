import { clearOfflineDatabase } from './db';
import { clearQueue } from './queue';

/**
 * Service worker lifecycle.
 *
 * Registration is skipped in development: the worker would cache Vite's module
 * graph and fight hot reload. Set `VITE_ENABLE_SW=true` to exercise it locally,
 * or use `npm run build && npm run preview`, which serves a production bundle.
 */

const SW_URL = '/sw.js';

let updateListener: (() => void) | null = null;
let waitingWorker: ServiceWorker | null = null;

const supported = (): boolean => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/** Called when a newer version of the app has been downloaded and is ready. */
export function onUpdateReady(listener: () => void): () => void {
  updateListener = listener;
  if (waitingWorker) listener();
  return () => {
    updateListener = null;
  };
}

/** Activates the downloaded version and reloads once it has taken over. */
export function applyUpdate(): void {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
}

function watch(registration: ServiceWorkerRegistration): void {
  const check = (worker: ServiceWorker | null) => {
    if (!worker) return;
    const announce = () => {
      // A worker that installs while another controls the page is an update, not a first install.
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        waitingWorker = worker;
        updateListener?.();
      }
    };
    announce();
    worker.addEventListener('statechange', announce);
  };
  check(registration.waiting);
  registration.addEventListener('updatefound', () => check(registration.installing));
}

export function registerServiceWorker(): void {
  if (!supported()) return;
  const enabled = import.meta.env.PROD || import.meta.env['VITE_ENABLE_SW'] === 'true';
  if (!enabled) {
    // A worker registered by an earlier production build would otherwise keep serving the dev page.
    void navigator.serviceWorker.getRegistrations().then((registrations) => registrations.forEach((registration) => void registration.unregister()));
    return;
  }
  // Registering after load keeps the worker off the critical path of the first paint.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL)
      .then(watch)
      .catch(() => undefined); // an unregisterable worker must never break the app
  });
}

/**
 * Removes everything this device has stored: cached pages and API responses,
 * saved courses and any queued writes. Called on sign-out, because these
 * machines are shared.
 */
export async function clearOfflineData(): Promise<void> {
  await clearQueue().catch(() => undefined);
  await clearOfflineDatabase().catch(() => undefined);
  if (!supported()) return;
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const worker = registration?.active ?? navigator.serviceWorker.controller;
  worker?.postMessage({ type: 'CLEAR_OFFLINE_DATA' });
  // Belt and braces: the page can delete the caches itself if the worker is gone.
  if (typeof caches !== 'undefined') {
    const names = await caches.keys().catch(() => [] as string[]);
    await Promise.all(names.filter((name) => name.startsWith('cc-')).map((name) => caches.delete(name)));
  }
}
