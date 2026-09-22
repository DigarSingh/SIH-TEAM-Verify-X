import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { flushQueue, queueSnapshot, startQueue, subscribeToQueue, type QueuedMutation, type SyncState } from './queue';

/**
 * React bindings for the offline layer. The queue is a plain module-level store
 * (it has to outlive any component, and work before React mounts), so the hooks
 * here subscribe to it rather than owning the state.
 */

export interface SyncStatus {
  state: SyncState;
  pending: QueuedMutation[];
  lastSyncedAt: string | null;
  /** Retries now, rather than waiting for the browser to notice the network. */
  syncNow: () => void;
}

export function useSyncStatus(): SyncStatus {
  const snapshot = useSyncExternalStore(subscribeToQueue, queueSnapshot, queueSnapshot);
  const syncNow = useCallback(() => void flushQueue(), []);
  return { ...snapshot, syncNow };
}

/** Starts the connection watcher once, from the application shell. */
export function useOfflineRuntime(): void {
  useEffect(() => startQueue(), []);
}
