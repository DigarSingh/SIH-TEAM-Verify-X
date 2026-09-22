/**
 * The offline database.
 *
 * A very small promise wrapper around IndexedDB - the browser's own storage, so
 * there is no dependency to keep up to date. Three stores:
 *
 *   mutations  writes made while offline, waiting to be sent
 *   packs      saved course content (the JSON a learner needs to keep reading)
 *   files      the bytes of saved documents and videos
 *
 * Everything here is per-device and per-origin, and all of it is deleted when
 * the user signs out: see `clearOfflineDatabase`.
 */

const DB_NAME = 'capacity-connect-offline';
const DB_VERSION = 1;

export const STORES = { mutations: 'mutations', packs: 'packs', files: 'files' } as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];

/** IndexedDB is unavailable in private modes, in some embedded browsers, and in jsdom. */
export const hasIndexedDb = (): boolean => typeof indexedDB !== 'undefined';

let connection: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.mutations)) db.createObjectStore(STORES.mutations, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.packs)) db.createObjectStore(STORES.packs, { keyPath: 'courseId' });
      if (!db.objectStoreNames.contains(STORES.files)) db.createObjectStore(STORES.files, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading the schema would block forever otherwise.
      db.onversionchange = () => {
        db.close();
        connection = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open the offline database.'));
  }).catch((error) => {
    connection = null;
    throw error;
  });
  return connection;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = work(transaction.objectStore(store));
        transaction.onabort = () => reject(transaction.error ?? new Error('Offline storage transaction failed.'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Offline storage request failed.'));
      }),
  );
}

export const dbPut = <T>(store: StoreName, value: T): Promise<IDBValidKey> => run(store, 'readwrite', (objectStore) => objectStore.put(value as unknown as object) as IDBRequest<IDBValidKey>);
export const dbGet = <T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> => run(store, 'readonly', (objectStore) => objectStore.get(key) as IDBRequest<T | undefined>);
export const dbGetAll = <T>(store: StoreName): Promise<T[]> => run(store, 'readonly', (objectStore) => objectStore.getAll() as IDBRequest<T[]>);
export const dbDelete = (store: StoreName, key: IDBValidKey): Promise<undefined> => run(store, 'readwrite', (objectStore) => objectStore.delete(key) as IDBRequest<undefined>);
export const dbClear = (store: StoreName): Promise<undefined> => run(store, 'readwrite', (objectStore) => objectStore.clear() as IDBRequest<undefined>);

/** Wipes every store. Called on sign-out so a shared device keeps nothing behind. */
export async function clearOfflineDatabase(): Promise<void> {
  if (!hasIndexedDb()) return;
  await Promise.all(Object.values(STORES).map((store) => dbClear(store)));
}
