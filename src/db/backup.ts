import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { DATABASE_VERSION, migrateDb } from './schema';

const REQUIRED_TABLES = ['trips', 'buyers', 'orders', 'order_items', 'payments'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function backupTimestamp(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

export async function exportDatabaseBackup(db: SQLiteDatabase): Promise<File> {
  const bytes = await db.serializeAsync();
  const file = new File(Paths.document, `pasabuy-backup-${backupTimestamp()}.db`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file;
}

async function validateBackup(sourceDb: SQLiteDatabase): Promise<void> {
  const quickCheck = await sourceDb.getFirstAsync<Record<string, string>>('PRAGMA quick_check');
  const result = quickCheck ? String(Object.values(quickCheck)[0]) : null;
  if (result !== 'ok') {
    throw new Error('Selected file failed SQLite integrity check.');
  }

  const rows = await sourceDb.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'"
  );
  const tableNames = new Set(rows.map((row) => row.name));
  const missing = REQUIRED_TABLES.filter((name) => !tableNames.has(name));
  if (missing.length > 0) {
    throw new Error(`Selected file is not a valid Pasabuy backup. Missing: ${missing.join(', ')}`);
  }
  const version = await sourceDb.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((version?.user_version ?? 0) > DATABASE_VERSION) {
    throw new Error('This backup was created by a newer version of the app. Update the app before restoring.');
  }
}

export async function importDatabaseBackup(db: SQLiteDatabase, backupUri: string): Promise<void> {
  const backupFile = new File(backupUri);
  if (!backupFile.exists) {
    throw new Error('Selected backup file is no longer accessible.');
  }

  const bytes = await backupFile.bytes();
  if (bytes.length < 100 || String.fromCharCode(...bytes.subarray(0, 15)) !== 'SQLite format 3') {
    throw new Error('Selected file is not a SQLite database backup.');
  }
  // In-memory (deserialized) databases can't open WAL-mode images; switch header to rollback journal.
  if (bytes[18] === 2 || bytes[19] === 2) {
    bytes[18] = 1;
    bytes[19] = 1;
  }

  let sourceDb: SQLiteDatabase | null = null;
  try {
    sourceDb = await SQLite.deserializeDatabaseAsync(bytes);
    await validateBackup(sourceDb);
    await SQLite.backupDatabaseAsync({
      sourceDatabase: sourceDb,
      sourceDatabaseName: 'main',
      destDatabase: db,
      destDatabaseName: 'main',
    });
    await migrateDb(db);
  } finally {
    if (sourceDb) {
      await sourceDb.closeAsync();
    }
  }
}