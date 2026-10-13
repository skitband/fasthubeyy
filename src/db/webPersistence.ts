const IDB_NAME = 'pasabuy';
const IDB_STORE = 'databases';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const idb = await openIdb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, mode);
      const req = run(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    idb.close();
  }
}

export async function loadDatabaseBytes(name: string): Promise<Uint8Array | null> {
  const value = await withStore<unknown>('readonly', (store) => store.get(name));
  return value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
}

export async function saveDatabaseBytes(name: string, bytes: Uint8Array): Promise<void> {
  await withStore('readwrite', (store) => store.put(bytes, name));
}

/** Holds an exclusive cross-tab lock for the page lifetime; false if another tab already has the database open. */
export function acquireTabLock(name: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    void navigator.locks.request(`pasabuy-db:${name}`, { ifAvailable: true }, (lock) => {
      resolve(lock !== null);
      return lock ? new Promise<void>(() => {}) : undefined;
    });
  });
}

// Layout of expo-sqlite's previous web storage (wa-sqlite AccessHandlePoolVFS in OPFS).
const LEGACY_OPFS_DIR = 'expo-sqlite';
const LEGACY_HEADER_PATH_SIZE = 512;
const LEGACY_HEADER_DATA_OFFSET = 4096;

/** Reads the database the expo-sqlite web build saved in OPFS, so existing web users keep their data. */
export async function readLegacyOpfsDatabase(name: string): Promise<Uint8Array | null> {
  try {
    if (!navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(LEGACY_OPFS_DIR);
    const wanted = `/${name}`;
    // FileSystemDirectoryHandle is async-iterable in browsers; TS DOM lib may not declare it.
    for await (const [, handle] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== 'file') continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      if (file.size <= LEGACY_HEADER_DATA_OFFSET) continue;
      const header = new Uint8Array(await file.slice(0, LEGACY_HEADER_PATH_SIZE).arrayBuffer());
      const end = header.indexOf(0);
      const path = new TextDecoder().decode(header.subarray(0, end === -1 ? header.length : end));
      if (path !== wanted) continue;
      const bytes = new Uint8Array(await file.slice(LEGACY_HEADER_DATA_OFFSET).arrayBuffer());
      return isSqliteFile(bytes) ? bytes : null;
    }
  } catch {
    // No legacy data or OPFS unavailable.
  }
  return null;
}

export function isSqliteFile(bytes: Uint8Array): boolean {
  return bytes.length >= 100 && new TextDecoder().decode(bytes.subarray(0, 15)) === 'SQLite format 3';
}
