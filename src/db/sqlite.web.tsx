import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import type { BindParams, Database, SqlJsStatic, SqlValue } from 'sql.js';
import { acquireTabLock, isSqliteFile, loadDatabaseBytes, readLegacyOpfsDatabase, saveDatabaseBytes } from './webPersistence';

// The browser build has no Node `require('fs')`, so Metro can bundle it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic> = require('sql.js/dist/sql-wasm-browser.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const wasmModule: number = require('sql.js/dist/sql-wasm-browser.wasm');

type BindValue = string | number | null | boolean | Uint8Array | undefined;
export type SQLiteRunResult = { lastInsertRowId: number; changes: number };

let sqlPromise: Promise<SqlJsStatic> | null = null;
function loadSqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: () => Asset.fromModule(wasmModule).uri });
  return sqlPromise;
}

function toSqlValue(value: BindValue): SqlValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

// Accepts expo-sqlite's call styles: (sql, [a, b]), (sql, { $a }), or (sql, a, b).
function normalizeParams(params: unknown[]): BindParams | undefined {
  if (params.length === 0) return undefined;
  const [first] = params;
  if (params.length === 1 && first !== null && typeof first === 'object' && !(first instanceof Uint8Array)) {
    if (Array.isArray(first)) return first.map((v) => toSqlValue(v as BindValue));
    return Object.fromEntries(Object.entries(first as Record<string, BindValue>).map(([k, v]) => [k, toSqlValue(v)]));
  }
  return params.map((v) => toSqlValue(v as BindValue));
}

// sql.js keeps the database in memory and can't use WAL; the shared schema still asks for it.
function stripWal(source: string): string {
  return source.replace(/PRAGMA\s+journal_mode\s*=\s*'?wal'?\s*;?/gi, '');
}

// Images saved by native builds may carry a WAL header, which an in-memory database can't open.
function toRollbackJournal(bytes: Uint8Array): Uint8Array {
  if (bytes[18] === 2 || bytes[19] === 2) {
    bytes[18] = 1;
    bytes[19] = 1;
  }
  return bytes;
}

/** sql.js-backed stand-in for the subset of expo-sqlite's SQLiteDatabase the app uses. */
export class SQLiteDatabase {
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private sql: SqlJsStatic,
    private db: Database,
    private readonly persistAs: string | null
  ) {
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  getAllSync<T>(source: string, ...params: unknown[]): T[] {
    const stmt = this.db.prepare(source);
    try {
      const bind = normalizeParams(params);
      if (bind) stmt.bind(bind);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  getFirstSync<T>(source: string, ...params: unknown[]): T | null {
    const stmt = this.db.prepare(source);
    try {
      const bind = normalizeParams(params);
      if (bind) stmt.bind(bind);
      return stmt.step() ? (stmt.getAsObject() as T) : null;
    } finally {
      stmt.free();
    }
  }

  runSync(source: string, ...params: unknown[]): SQLiteRunResult {
    this.db.run(source, normalizeParams(params));
    const changes = this.db.getRowsModified();
    const lastInsertRowId = Number(this.db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0);
    this.scheduleSave();
    return { lastInsertRowId, changes };
  }

  execSync(source: string): void {
    this.db.exec(stripWal(source));
    this.scheduleSave();
  }

  withTransactionSync(task: () => void): void {
    this.db.exec('BEGIN');
    try {
      task();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.scheduleSave();
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.getAllSync<T>(source, ...params);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return this.getFirstSync<T>(source, ...params);
  }

  async runAsync(source: string, ...params: unknown[]): Promise<SQLiteRunResult> {
    return this.runSync(source, ...params);
  }

  async execAsync(source: string): Promise<void> {
    this.execSync(source);
  }

  async serializeAsync(): Promise<Uint8Array> {
    return this.exportBytes();
  }

  async closeAsync(): Promise<void> {
    await this.flush();
    this.db.close();
  }

  /** Replaces this database's contents with another one's (used by backup restore). */
  replaceWith(source: SQLiteDatabase): void {
    const bytes = source.exportBytes();
    this.db.close();
    this.db = new this.sql.Database(bytes);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.scheduleSave();
  }

  // export() closes and reopens the database, resetting connection pragmas.
  private exportBytes(): Uint8Array {
    const bytes = this.db.export();
    this.db.exec('PRAGMA foreign_keys = ON');
    return bytes;
  }

  private scheduleSave(): void {
    if (!this.persistAs || this.saveTimer) return;
    this.saveTimer = setTimeout(() => void this.flush(), 250);
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.persistAs) return;
    try {
      await saveDatabaseBytes(this.persistAs, this.exportBytes());
    } catch (error) {
      console.error('Failed to save database', error);
    }
  }
}

export async function deserializeDatabaseAsync(bytes: Uint8Array): Promise<SQLiteDatabase> {
  const SQL = await loadSqlJs();
  return new SQLiteDatabase(SQL, new SQL.Database(toRollbackJournal(bytes)), null);
}

export async function backupDatabaseAsync(options: {
  sourceDatabase: SQLiteDatabase;
  sourceDatabaseName: string;
  destDatabase: SQLiteDatabase;
  destDatabaseName: string;
}): Promise<void> {
  options.destDatabase.replaceWith(options.sourceDatabase);
}

class TabLockedError extends Error {}

const openDatabases = new Map<string, Promise<SQLiteDatabase>>();

// Cached per name so React StrictMode's double effects don't open (and lock) twice.
function openPersistentDatabase(name: string): Promise<SQLiteDatabase> {
  let promise = openDatabases.get(name);
  if (!promise) {
    promise = (async () => {
      if (!(await acquireTabLock(name))) throw new TabLockedError();
      const SQL = await loadSqlJs();
      let bytes = await loadDatabaseBytes(name);
      let migrated = false;
      if (!bytes) {
        bytes = await readLegacyOpfsDatabase(name);
        migrated = bytes !== null;
      }
      const db = new SQLiteDatabase(
        SQL,
        new SQL.Database(bytes && isSqliteFile(bytes) ? toRollbackJournal(bytes) : undefined),
        name
      );
      if (migrated) await db.flush();
      const flushOnHide = () => {
        if (document.visibilityState === 'hidden') void db.flush();
      };
      document.addEventListener('visibilitychange', flushOnHide);
      window.addEventListener('pagehide', () => void db.flush());
      return db;
    })();
    openDatabases.set(name, promise);
  }
  return promise;
}

const DatabaseContext = createContext<SQLiteDatabase | null>(null);

type ProviderState = { status: 'loading' } | { status: 'ready'; db: SQLiteDatabase } | { status: 'error'; error: unknown };

export function SQLiteProvider({
  databaseName,
  onInit,
  children,
}: {
  databaseName: string;
  onInit?: (db: SQLiteDatabase) => Promise<void>;
  children: ReactNode;
}) {
  const [state, setState] = useState<ProviderState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    openPersistentDatabase(databaseName)
      .then(async (db) => {
        await onInit?.(db);
        if (active) setState({ status: 'ready', db });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', error });
      });
    return () => {
      active = false;
    };
  }, [databaseName, onInit]);

  if (state.status === 'loading') return null;
  if (state.status === 'error') {
    const locked = state.error instanceof TabLockedError;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
          {locked ? 'Pasabuy Tracker is open in another tab' : 'Could not open your data'}
        </Text>
        <Text style={{ fontSize: 14, color: '#6B6A67', textAlign: 'center' }}>
          {locked
            ? 'Close the other tab, then reload this page. Only one tab can edit your data at a time.'
            : String(state.error)}
        </Text>
      </View>
    );
  }
  return <DatabaseContext.Provider value={state.db}>{children}</DatabaseContext.Provider>;
}

export function useSQLiteContext(): SQLiteDatabase {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useSQLiteContext must be used inside <SQLiteProvider>');
  return db;
}
