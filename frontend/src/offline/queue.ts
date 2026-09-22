import { isApiError } from '../api/client';
import { completeModule, submitCourseFeedback, uncompleteModule } from '../services/learner';
import { submitAssessment } from '../services/assessments';
import type { SubmitResult } from '../types';
import { dbDelete, dbGetAll, dbPut, hasIndexedDb, STORES } from './db';

/**
 * The mutation queue.
 *
 * Work done offline is not lost: each write is stored in IndexedDB and sent
 * when the network returns. Two rules make this safe rather than merely
 * convenient:
 *
 *   1. Every entry carries an idempotency key generated when the learner acted,
 *      not when the request is sent. A submission replayed after a dropped
 *      connection returns the original result instead of burning an attempt.
 *   2. Only a client error (4xx) discards an entry. Anything that might be the
 *      network staying down keeps it, so nothing disappears silently.
 *
 * The queue is drained in the order the learner worked, so "complete module 3"
 * cannot overtake "complete module 2".
 */

export type SyncState = 'ONLINE' | 'OFFLINE' | 'SYNCING' | 'SYNC COMPLETE';

type Payloads = {
  'module.complete': { enrollmentId: string; moduleId: string; courseId: string };
  'module.uncomplete': { enrollmentId: string; moduleId: string; courseId: string };
  'assessment.submit': { assessmentId: string; attemptId: string; answers: { questionId: string; optionIds: string[] }[]; practical?: { stepId: string; optionId: string }[] };
  'course.feedback': { courseId: string; rating: number; trainerRating?: number; comment?: string };
};
export type QueuedKind = keyof Payloads;

/** What each kind gives back when it reaches the server. Only submission has a result worth showing. */
type Results = {
  'module.complete': void;
  'module.uncomplete': void;
  'assessment.submit': SubmitResult;
  'course.feedback': void;
};

export interface QueuedMutation<K extends QueuedKind = QueuedKind> {
  /** Also the idempotency key sent to the server. */
  id: string;
  kind: K;
  /** What the learner did, in their words, for the pending list. */
  label: string;
  payload: Payloads[K];
  createdAt: string;
  attempts: number;
  lastError: string | null;
  /** `failed` entries have stopped retrying and wait for the learner to discard them. */
  failed: boolean;
}

/** After this many failed sends an entry stops retrying and asks the learner what to do. */
const MAX_ATTEMPTS = 5;

const newId = (): string => (typeof globalThis.crypto?.randomUUID === 'function' ? crypto.randomUUID() : `q-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`);

// ---- observable state ------------------------------------------------------------------------------------------

let pending: QueuedMutation[] = [];
let state: SyncState = typeof navigator === 'undefined' || navigator.onLine ? 'ONLINE' : 'OFFLINE';
let lastSyncedAt: string | null = null;
const listeners = new Set<() => void>();

export interface QueueSnapshot {
  state: SyncState;
  pending: QueuedMutation[];
  lastSyncedAt: string | null;
}

/** A new object per change, so `useSyncExternalStore` can compare snapshots by identity. */
let snapshot: QueueSnapshot = { state, pending, lastSyncedAt };

function publish(): void {
  snapshot = { state, pending, lastSyncedAt };
  for (const listener of listeners) listener();
}

export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const queueSnapshot = (): QueueSnapshot => snapshot;

function setState(next: SyncState): void {
  if (state === next) return;
  state = next;
  publish();
}

/** Back to a resting state once the "SYNC COMPLETE" confirmation has been read. */
function settle(): void {
  window.setTimeout(() => {
    if (state === 'SYNC COMPLETE') setState(navigator.onLine ? 'ONLINE' : 'OFFLINE');
  }, 4000);
}

// ---- storage ---------------------------------------------------------------------------------------------------

async function reload(): Promise<void> {
  if (!hasIndexedDb()) return;
  const all = await dbGetAll<QueuedMutation>(STORES.mutations).catch(() => []);
  pending = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  publish();
}

async function persist(entry: QueuedMutation): Promise<void> {
  if (hasIndexedDb()) await dbPut(STORES.mutations, entry).catch(() => undefined);
  pending = [...pending.filter((item) => item.id !== entry.id), entry].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  publish();
}

async function forget(id: string): Promise<void> {
  if (hasIndexedDb()) await dbDelete(STORES.mutations, id).catch(() => undefined);
  pending = pending.filter((item) => item.id !== id);
  publish();
}

/** Removes an entry the learner has decided to abandon. */
export const discardMutation = (id: string): Promise<void> => forget(id);

// ---- sending ---------------------------------------------------------------------------------------------------

async function send(entry: QueuedMutation): Promise<unknown> {
  switch (entry.kind) {
    case 'module.complete': {
      const payload = entry.payload as Payloads['module.complete'];
      return completeModule(payload.enrollmentId, payload.moduleId);
    }
    case 'module.uncomplete': {
      const payload = entry.payload as Payloads['module.uncomplete'];
      return uncompleteModule(payload.enrollmentId, payload.moduleId);
    }
    case 'assessment.submit': {
      const payload = entry.payload as Payloads['assessment.submit'];
      // The entry id is the idempotency key, so a replay after a dropped connection is free.
      return submitAssessment(payload.assessmentId, payload.attemptId, payload.answers, { practical: payload.practical, idempotencyKey: entry.id });
    }
    case 'course.feedback': {
      const payload = entry.payload as Payloads['course.feedback'];
      return submitCourseFeedback(payload.courseId, { rating: payload.rating, ...(payload.trainerRating === undefined ? {} : { trainerRating: payload.trainerRating }), ...(payload.comment === undefined ? {} : { comment: payload.comment }) });
    }
    default: {
      const unreachable: never = entry.kind;
      throw new Error(`Unknown queued mutation: ${String(unreachable)}`);
    }
  }
}

/** A 4xx will never succeed on a retry; anything else might be the network. */
const isPermanent = (error: unknown): boolean => isApiError(error) && error.status >= 400 && error.status < 500;

let flushing: Promise<{ sent: number; failed: number }> | null = null;

/**
 * Sends everything waiting, oldest first. Stops at the first entry that looks
 * like a network failure so the rest keep their order and their turn.
 */
export function flushQueue(): Promise<{ sent: number; failed: number }> {
  flushing ??= (async () => {
    const queue = pending.filter((entry) => !entry.failed);
    if (queue.length === 0) {
      setState(navigator.onLine ? 'ONLINE' : 'OFFLINE');
      return { sent: 0, failed: 0 };
    }
    setState('SYNCING');
    let sent = 0;
    let failed = 0;
    for (const entry of queue) {
      try {
        await send(entry);
        await forget(entry.id);
        sent += 1;
      } catch (error) {
        const attempts = entry.attempts + 1;
        const permanent = isPermanent(error);
        const message = error instanceof Error ? error.message : 'Could not sync this change.';
        await persist({ ...entry, attempts, lastError: message, failed: permanent || attempts >= MAX_ATTEMPTS });
        failed += 1;
        if (!permanent) break; // the network is probably still down: keep the order and try again later
      }
    }
    if (sent > 0) {
      lastSyncedAt = new Date().toISOString();
      setState('SYNC COMPLETE');
      settle();
    } else {
      setState(navigator.onLine ? 'ONLINE' : 'OFFLINE');
    }
    return { sent, failed };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// ---- the entry point used by the app ---------------------------------------------------------------------------

/**
 * Either the server's answer, or an acknowledgement that the change is waiting.
 * The discriminant is `queued`, so a caller cannot read a result that does not exist.
 */
export type QueueResult<K extends QueuedKind> = { queued: false; result: Results[K] } | { queued: true; result?: undefined };

/**
 * Performs a write, or queues it when the device is offline.
 *
 * Callers get `{ queued }` back so the interface can say "saved" or "saved on
 * this device, will sync" - never a success message for something that has not
 * reached the server.
 */
export async function runOrQueue<K extends QueuedKind>(kind: K, label: string, payload: Payloads[K]): Promise<QueueResult<K>> {
  const entry: QueuedMutation<K> = { id: newId(), kind, label, payload, createdAt: new Date().toISOString(), attempts: 0, lastError: null, failed: false };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await persist(entry as QueuedMutation);
    setState('OFFLINE');
    return { queued: true };
  }

  try {
    // The switch in `send` returns the right type for this kind; the map cannot express that to TypeScript.
    return { queued: false, result: (await send(entry as QueuedMutation)) as Results[K] };
  } catch (error) {
    if (isPermanent(error)) throw error; // a real rejection: the learner must see it now
    await persist({ ...(entry as QueuedMutation), attempts: 1, lastError: error instanceof Error ? error.message : null });
    return { queued: true };
  }
}

// ---- lifecycle -------------------------------------------------------------------------------------------------

let started = false;

/** Starts watching the connection. Safe to call more than once. */
export function startQueue(): () => void {
  if (started || typeof window === 'undefined') return () => undefined;
  started = true;

  const online = () => {
    setState('ONLINE');
    void flushQueue();
  };
  const offline = () => setState('OFFLINE');
  const visible = () => {
    if (document.visibilityState === 'visible' && navigator.onLine && pending.some((entry) => !entry.failed)) void flushQueue();
  };

  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', visible);

  void reload().then(() => {
    if (navigator.onLine && pending.some((entry) => !entry.failed)) void flushQueue();
  });

  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', visible);
    started = false;
  };
}

/** Empties the queue. Used on sign-out, where the next person must not inherit these writes. */
export async function clearQueue(): Promise<void> {
  for (const entry of [...pending]) await forget(entry.id);
  lastSyncedAt = null;
  setState(navigator.onLine ? 'ONLINE' : 'OFFLINE');
}

/** Test seam: resets the in-memory view without touching storage. */
export function resetQueueForTesting(): void {
  pending = [];
  lastSyncedAt = null;
  state = typeof navigator === 'undefined' || navigator.onLine ? 'ONLINE' : 'OFFLINE';
  started = false;
  flushing = null;
  publish();
}
