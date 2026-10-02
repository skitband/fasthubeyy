import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { toDataUri } from '@/lib/dataUri';

export const DATABASE_VERSION = 5;

const SCHEMA_SQL = `
PRAGMA journal_mode = 'wal';
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY, origin TEXT NOT NULL, destination TEXT NOT NULL,
  depart_date TEXT NOT NULL, return_date TEXT NOT NULL, cutoff_date TEXT NOT NULL,
  checked_kg REAL NOT NULL DEFAULT 30, cabin_kg REAL NOT NULL DEFAULT 7,
  fee_pct REAL NOT NULL DEFAULT 15, fee_per_kg REAL NOT NULL DEFAULT 150,
  excess_per_kg REAL DEFAULT 1250, status TEXT NOT NULL DEFAULT 'open', status_override TEXT,
  created_at TEXT, updated_at TEXT, deleted_at TEXT, synced_at TEXT);

CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, channel TEXT,
  address TEXT, email TEXT,
  created_at TEXT, updated_at TEXT, deleted_at TEXT, synced_at TEXT);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY, trip_id TEXT REFERENCES trips(id), buyer_id TEXT REFERENCES buyers(id),
  item_name TEXT, note TEXT, budget REAL, est_kg REAL, channel TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT, updated_at TEXT, deleted_at TEXT, synced_at TEXT);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, ref TEXT UNIQUE, trip_id TEXT NOT NULL REFERENCES trips(id),
  buyer_id TEXT NOT NULL REFERENCES buyers(id),
  status TEXT NOT NULL DEFAULT 'requested',
  weight_kg REAL NOT NULL DEFAULT 0, weight_fee_per_kg REAL NOT NULL DEFAULT 0,
  tracking_code TEXT, delivery_proof_uri TEXT,
  handover_code TEXT, delivered_at TEXT,
  created_at TEXT, updated_at TEXT, deleted_at TEXT, synced_at TEXT);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
  name TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 1, unit_cost REAL NOT NULL,
  foreign_cost TEXT,
  kg REAL NOT NULL DEFAULT 0, fee_pct REAL NOT NULL, fee_per_kg REAL NOT NULL,
  photo_uri TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, synced_at TEXT);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
  amount REAL NOT NULL, method TEXT,
  reference TEXT, proof_uri TEXT, note TEXT, paid_at TEXT NOT NULL,
  created_at TEXT, updated_at TEXT, deleted_at TEXT, synced_at TEXT);

CREATE TABLE IF NOT EXISTS order_attachments (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
  name TEXT NOT NULL, uri TEXT NOT NULL, source TEXT NOT NULL, mime_type TEXT,
  created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL, status TEXT NOT NULL, note TEXT, at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`;

export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  await db.execAsync(SCHEMA_SQL);
  await addColumnIfMissing(db, 'buyers', 'address', 'TEXT');
  await addColumnIfMissing(db, 'buyers', 'email', 'TEXT');
  await addColumnIfMissing(db, 'orders', 'weight_kg', 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'weight_fee_per_kg', 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'orders', 'tracking_code', 'TEXT');
  await addColumnIfMissing(db, 'orders', 'delivery_proof_uri', 'TEXT');
  await addColumnIfMissing(db, 'payments', 'note', 'TEXT');
  await addColumnIfMissing(db, 'trips', 'status_override', 'TEXT');
  if (current < 2) {
    await db.execAsync(`
      UPDATE orders
      SET weight_kg = COALESCE((
            SELECT SUM(oi.kg * oi.qty)
            FROM order_items oi
            WHERE oi.order_id = orders.id AND oi.deleted_at IS NULL
          ), 0),
          weight_fee_per_kg = COALESCE((
            SELECT SUM(oi.kg * oi.qty * oi.fee_per_kg) / NULLIF(SUM(oi.kg * oi.qty), 0)
            FROM order_items oi
            WHERE oi.order_id = orders.id AND oi.deleted_at IS NULL
          ), 0)
    `);
  }
  if (current < 5) {
    await inlineStoredFiles(db);
  }
  if (current < DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
}

// Moves images/attachments that were saved as on-device file paths into the database as data URIs.
async function inlineStoredFiles(db: SQLiteDatabase): Promise<void> {
  if (Platform.OS === 'web') return;
  const columns = [
    { table: 'order_items', column: 'photo_uri', mime: null },
    { table: 'payments', column: 'proof_uri', mime: null },
    { table: 'orders', column: 'delivery_proof_uri', mime: null },
    { table: 'order_attachments', column: 'uri', mime: 'mime_type' },
  ] as const;
  for (const { table, column, mime } of columns) {
    const rows = await db.getAllAsync<{ id: string; uri: string; mime: string | null }>(
      `SELECT id, ${column} AS uri, ${mime ?? 'NULL'} AS mime FROM ${table} WHERE ${column} LIKE 'file:%'`
    );
    for (const row of rows) {
      try {
        if (!new File(row.uri).exists) continue;
        const dataUri = await toDataUri(row.uri, row.mime);
        await db.runAsync(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [dataUri, row.id]);
      } catch {
        // Leave unreadable files as they are rather than blocking app start.
      }
    }
  }
}

// Adds a column to an existing table only if it isn't already present.
async function addColumnIfMissing(
  db: SQLiteDatabase,
  table: string,
  column: string,
  type: string
): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
