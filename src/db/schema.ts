import type { SQLiteDatabase } from 'expo-sqlite';
import { itemFee, itemKg, itemSubtotal, nowISO } from '@/lib/money';

export const DATABASE_VERSION = 4;

const SCHEMA_SQL = `
PRAGMA journal_mode = 'wal';
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY, origin TEXT NOT NULL, destination TEXT NOT NULL,
  depart_date TEXT NOT NULL, return_date TEXT NOT NULL, cutoff_date TEXT NOT NULL,
  checked_kg REAL NOT NULL DEFAULT 30, cabin_kg REAL NOT NULL DEFAULT 7,
  fee_pct REAL NOT NULL DEFAULT 15, fee_per_kg REAL NOT NULL DEFAULT 150,
  excess_per_kg REAL DEFAULT 1250, status TEXT NOT NULL DEFAULT 'open',
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
  reference TEXT, proof_uri TEXT, paid_at TEXT NOT NULL,
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
  if (current < DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
  if (current === 0) {
    await seedIfEmpty(db);
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

// ---- Seed data (from the prototype's sample orders) ----

type SeedItem = { name: string; qty: number; unit_cost: number; kg: number; foreign_cost: string };
type SeedOrder = {
  id: string;
  ref: string;
  buyer: string;
  status: string;
  code: string;
  items: SeedItem[];
  // fraction of computed total that is paid: 1 = paid in full, 0 = unpaid.
  paidFraction: number;
  payment?: { method: string; reference: string; note: string; paid_at: string };
};

async function seedIfEmpty(db: SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM trips');
  if ((existing?.n ?? 0) > 0) return;

  const now = nowISO();
  const TRIP_ID = 'trip-dxb-mnl';
  const FEE_PCT = 15;
  const FEE_PER_KG = 150;

  await db.runAsync(
    `INSERT INTO trips (id, origin, destination, depart_date, return_date, cutoff_date,
      checked_kg, cabin_kg, fee_pct, fee_per_kg, excess_per_kg, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    [TRIP_ID, 'Dubai, DXB', 'Manila, MNL', '2026-10-03', '2026-10-12', '2026-09-28',
      30, 7, FEE_PCT, FEE_PER_KG, 1250, now, now]
  );

  const buyers: { id: string; name: string; phone: string; channel: string }[] = [
    { id: 'b-mariel', name: 'Mariel Santos', phone: '+63 917 224 8810', channel: 'viber' },
    { id: 'b-kenneth', name: 'Kenneth Uy', phone: '+63 928 771 3345', channel: 'messenger' },
    { id: 'b-grace', name: 'Grace Panganiban', phone: '+63 906 118 0042', channel: 'viber' },
    { id: 'b-dennis', name: 'Dennis Abalos', phone: '+63 915 662 9931', channel: 'viber' },
    { id: 'b-aira', name: 'Aira Delos Reyes', phone: '+63 999 340 2277', channel: 'viber' },
    { id: 'b-joy', name: 'Joy Villanueva', phone: null as unknown as string, channel: 'viber' },
  ];
  for (const b of buyers) {
    await db.runAsync(
      `INSERT INTO buyers (id, name, phone, channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [b.id, b.name, b.phone ?? null, b.channel, now, now]
    );
  }

  const orders: SeedOrder[] = [
    {
      id: 'o1', ref: 'ORD-2481', buyer: 'b-mariel', status: 'bought', code: '4829',
      paidFraction: 0.42,
      items: [
        { name: 'iPhone 16 Pro case', qty: 2, unit_cost: 1200, kg: 0.15, foreign_cost: 'AED 180 \u00B7 0.3 kg' },
        { name: 'Bath & Body Works set', qty: 1, unit_cost: 5600, kg: 1.1, foreign_cost: 'AED 420 \u00B7 1.1 kg' },
        { name: 'Nintendo Switch 2 dock', qty: 1, unit_cost: 14000, kg: 1.0, foreign_cost: 'AED 1,050 \u00B7 1.0 kg' },
      ],
      payment: { method: 'gcash', reference: '8842 1190', note: 'Downpayment. Balance due on handover.', paid_at: '2026-09-14T09:00:00.000Z' },
    },
    {
      id: 'o2', ref: 'ORD-2482', buyer: 'b-kenneth', status: 'confirmed', code: '7155',
      paidFraction: 0,
      items: [
        { name: 'Lego Icons Orchid', qty: 2, unit_cost: 3000, kg: 1.1, foreign_cost: 'AED 190 ea \u00B7 1.1 kg ea' },
      ],
    },
    {
      id: 'o3', ref: 'ORD-2483', buyer: 'b-grace', status: 'packed', code: '2306',
      paidFraction: 1,
      items: [
        { name: 'Charlotte Tilbury set', qty: 1, unit_cost: 8400, kg: 0.5, foreign_cost: 'AED 560 \u00B7 0.5 kg' },
      ],
      payment: { method: 'bank', reference: 'BPI 4471', note: 'Paid in full. Nothing left to collect.', paid_at: '2026-09-09T09:00:00.000Z' },
    },
    {
      id: 'o4', ref: 'ORD-2484', buyer: 'b-dennis', status: 'requested', code: '9041',
      paidFraction: 0,
      items: [
        { name: 'Ferrero Rocher (6 boxes)', qty: 6, unit_cost: 850, kg: 0.15, foreign_cost: 'AED 25 ea \u00B7 0.15 kg ea' },
      ],
    },
    {
      id: 'o5', ref: 'ORD-2485', buyer: 'b-aira', status: 'delivered', code: '6672',
      paidFraction: 1,
      items: [
        { name: 'Coach Tabby 26', qty: 1, unit_cost: 14000, kg: 1.4, foreign_cost: 'AED 1,190 \u00B7 1.4 kg' },
        { name: 'Skechers slip-ins', qty: 1, unit_cost: 2400, kg: 1.7, foreign_cost: 'AED 210 \u00B7 1.7 kg' },
      ],
      payment: { method: 'gcash', reference: '7710 4408', note: 'Handed over Sep 2 at NAIA 3.', paid_at: '2026-09-02T09:00:00.000Z' },
    },
  ];

  for (const o of orders) {
    const weightKg = o.items.reduce((total, item) => total + item.kg * item.qty, 0);
    await db.runAsync(
      `INSERT INTO orders (id, ref, trip_id, buyer_id, status, weight_kg, weight_fee_per_kg, handover_code, delivered_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [o.id, o.ref, TRIP_ID, o.buyer, o.status, weightKg, FEE_PER_KG, o.code,
        o.status === 'delivered' ? o.payment?.paid_at ?? now : null, now, now]
    );

    let total = 0;
    for (let i = 0; i < o.items.length; i++) {
      const it = o.items[i];
      total += itemSubtotal(it.unit_cost, it.qty) + itemFee(it.unit_cost, it.qty, it.kg, FEE_PCT, FEE_PER_KG);
      await db.runAsync(
        `INSERT INTO order_items (id, order_id, name, qty, unit_cost, foreign_cost, kg, fee_pct, fee_per_kg, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`${o.id}-i${i}`, o.id, it.name, it.qty, it.unit_cost, it.foreign_cost, it.kg, FEE_PCT, FEE_PER_KG, now, now]
      );
    }

    if (o.paidFraction > 0 && o.payment) {
      const amount = Math.round(total * o.paidFraction);
      await db.runAsync(
        `INSERT INTO payments (id, order_id, amount, method, reference, paid_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [`${o.id}-p0`, o.id, amount, o.payment.method, o.payment.reference, o.payment.paid_at, now, now]
      );
    }

    // Timeline events up to the reached status.
    const chain = ['confirmed', 'bought', 'packed', 'delivered'];
    const reached = ['requested', 'confirmed', 'bought', 'packed', 'delivered'].indexOf(o.status);
    for (const s of chain) {
      if (chain.indexOf(s) < reached) {
        await db.runAsync(
          `INSERT INTO order_events (id, order_id, status, note, at) VALUES (?, ?, ?, ?, ?)`,
          [`${o.id}-e-${s}`, o.id, s, null, now]
        );
      }
    }
  }

  // Void luggage kg is derived; nothing to store here.

  const requests: { id: string; buyer: string; channel: string; item: string; note: string; budget: number; est_kg: number }[] = [
    { id: 'r1', buyer: 'b-joy', channel: 'viber', item: 'Dyson Airwrap Origin', note: 'Any color, gift box please', budget: 32000, est_kg: 1.6 },
    { id: 'r2', buyer: 'b-kenneth', channel: 'messenger', item: 'Lego Icons Orchid \u00D72', note: 'Only if under \u20B14k each', budget: 7800, est_kg: 2.2 },
    { id: 'r3', buyer: 'b-grace', channel: 'viber', item: 'Charlotte Tilbury set', note: 'Pillow Talk shade', budget: 9400, est_kg: 0.5 },
  ];
  for (const r of requests) {
    await db.runAsync(
      `INSERT INTO requests (id, trip_id, buyer_id, item_name, note, budget, est_kg, channel, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [r.id, TRIP_ID, r.buyer, r.item, r.note, r.budget, r.est_kg, r.channel, now, now]
    );
  }
}
