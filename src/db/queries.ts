import type { SQLiteDatabase } from 'expo-sqlite';
import {
  handoverCode,
  itemSubtotal,
  nowISO,
  payStatus,
  uuid,
} from '@/lib/money';
import type {
  Buyer,
  Order,
  OrderAttachment,
  OrderEvent,
  OrderItem,
  OrderView,
  Payment,
  Request,
  Trip,
} from './types';

export interface RequestView extends Request {
  buyer_name: string;
}

// ---- Reads ----

function getSetting(db: SQLiteDatabase, key: string): string | null {
  try {
    const r = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return r?.value ?? null;
  } catch {
    // settings table may not exist yet on first migration; fall back to defaults.
    return null;
  }
}

export function setActiveTrip(db: SQLiteDatabase, id: string): void {
  db.runSync(
    `INSERT INTO settings (key, value) VALUES ('active_trip_id', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [id]
  );
}

export function listTrips(db: SQLiteDatabase): Trip[] {
  return db.getAllSync<Trip>(
    `SELECT * FROM trips WHERE deleted_at IS NULL
     ORDER BY (status = 'open') DESC, created_at DESC`
  );
}

export function getActiveTrip(db: SQLiteDatabase): Trip | null {
  const id = getSetting(db, 'active_trip_id');
  if (id) {
    const selected = db.getFirstSync<Trip>('SELECT * FROM trips WHERE id = ? AND deleted_at IS NULL', [id]);
    if (selected) return selected;
  }
  return db.getFirstSync<Trip>(
    `SELECT * FROM trips WHERE deleted_at IS NULL
     ORDER BY (status = 'open') DESC, created_at DESC LIMIT 1`
  );
}

export function getTrip(db: SQLiteDatabase, id: string): Trip | null {
  return db.getFirstSync<Trip>('SELECT * FROM trips WHERE id = ?', [id]);
}

export function listBuyers(db: SQLiteDatabase): Buyer[] {
  return db.getAllSync<Buyer>(
    'SELECT * FROM buyers WHERE deleted_at IS NULL ORDER BY name ASC'
  );
}

export function getBuyer(db: SQLiteDatabase, id: string): Buyer | null {
  return db.getFirstSync<Buyer>('SELECT * FROM buyers WHERE id = ?', [id]);
}

function assembleOrder(db: SQLiteDatabase, order: Order & { buyer_name: string; buyer_phone: string | null; buyer_channel: string | null }): OrderView {
  const items = db.getAllSync<OrderItem>(
    'SELECT * FROM order_items WHERE order_id = ? AND deleted_at IS NULL ORDER BY created_at ASC',
    [order.id]
  );
  let total = 0;
  let fee = 0;
  for (const it of items) {
    const subtotal = itemSubtotal(it.unit_cost, it.qty);
    const serviceFee = subtotal * (it.fee_pct / 100);
    total += subtotal + serviceFee;
    fee += serviceFee;
  }
  const kg = order.weight_kg;
  const handlingFee = kg * order.weight_fee_per_kg;
  total += handlingFee;
  fee += handlingFee;
  const paidRow = db.getFirstSync<{ paid: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE order_id = ? AND deleted_at IS NULL',
    [order.id]
  );
  const paid = paidRow?.paid ?? 0;
  return {
    ...order,
    items,
    total,
    fee,
    kg,
    paid,
    pay: payStatus(total, paid),
  };
}

const ORDER_SELECT = `
  SELECT o.*, b.name AS buyer_name, b.phone AS buyer_phone, b.channel AS buyer_channel
  FROM orders o JOIN buyers b ON b.id = o.buyer_id
  WHERE o.deleted_at IS NULL`;

export function listOrders(db: SQLiteDatabase, tripId: string): OrderView[] {
  const rows = db.getAllSync<Order & { buyer_name: string; buyer_phone: string | null; buyer_channel: string | null }>(
    `${ORDER_SELECT} AND o.trip_id = ? ORDER BY o.created_at ASC`,
    [tripId]
  );
  return rows.map((r) => assembleOrder(db, r));
}

export function getOrder(db: SQLiteDatabase, id: string): OrderView | null {
  const row = db.getFirstSync<Order & { buyer_name: string; buyer_phone: string | null; buyer_channel: string | null }>(
    `${ORDER_SELECT} AND o.id = ? LIMIT 1`,
    [id]
  );
  return row ? assembleOrder(db, row) : null;
}

export function canAddItemsToOrder(order: Pick<OrderView, 'pay' | 'status'> | null): boolean {
  return !!order && !(order.pay === 'paid' && order.status === 'delivered');
}

export function listRequests(db: SQLiteDatabase, tripId: string): RequestView[] {
  return db.getAllSync<RequestView>(
    `SELECT r.*, b.name AS buyer_name FROM requests r
     JOIN buyers b ON b.id = r.buyer_id
     WHERE r.deleted_at IS NULL AND r.status = 'pending' AND r.trip_id = ?
     ORDER BY r.created_at ASC`,
    [tripId]
  );
}

export function listPayments(db: SQLiteDatabase, orderId: string): Payment[] {
  return db.getAllSync<Payment>(
    'SELECT * FROM payments WHERE order_id = ? AND deleted_at IS NULL ORDER BY paid_at DESC',
    [orderId]
  );
}

export function listOrderAttachments(db: SQLiteDatabase, orderId: string): OrderAttachment[] {
  return db.getAllSync<OrderAttachment>(
    'SELECT * FROM order_attachments WHERE order_id = ? ORDER BY created_at DESC',
    [orderId]
  );
}

export function addOrderAttachment(
  db: SQLiteDatabase,
  input: { orderId: string; name: string; uri: string; source: OrderAttachment['source']; mimeType?: string | null }
): void {
  db.runSync(
    `INSERT INTO order_attachments (id, order_id, name, uri, source, mime_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), input.orderId, input.name, input.uri, input.source, input.mimeType ?? null, nowISO()]
  );
}

export function deleteOrderAttachment(db: SQLiteDatabase, attachmentId: string): void {
  db.runSync('DELETE FROM order_attachments WHERE id = ?', [attachmentId]);
}

export function listOrderEvents(db: SQLiteDatabase, orderId: string): OrderEvent[] {
  return db.getAllSync<OrderEvent>(
    'SELECT * FROM order_events WHERE order_id = ? ORDER BY at ASC',
    [orderId]
  );
}

/** Luggage kg used = sum item kg*qty for orders on trip not yet delivered. */
export function luggageUsed(orders: OrderView[]): number {
  return orders.filter((o) => o.status !== 'delivered').reduce((a, o) => a + o.kg, 0);
}

// ---- Mutations ----

export function addPayment(
  db: SQLiteDatabase,
  input: { orderId: string; amount: number; method: string; reference?: string; proofUri?: string }
): void {
  const now = nowISO();
  db.runSync(
    `INSERT INTO payments (id, order_id, amount, method, reference, proof_uri, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), input.orderId, input.amount, input.method, input.reference ?? null, input.proofUri ?? null, now, now, now]
  );
}

export function markOrderFullyPaid(db: SQLiteDatabase, orderId: string): void {
  const order = getOrder(db, orderId);
  if (!order) return;
  const balance = order.total - order.paid;
  if (balance > 0) {
    addPayment(db, { orderId, amount: balance, method: 'cash', reference: 'Marked paid' });
  }
}

export function markOrderUnpaid(db: SQLiteDatabase, orderId: string): void {
  const now = nowISO();
  db.runSync('UPDATE payments SET deleted_at = ?, updated_at = ? WHERE order_id = ?', [now, now, orderId]);
}

export function setOrderStatus(db: SQLiteDatabase, orderId: string, status: string, note?: string): void {
  const now = nowISO();
  db.runSync(
    `UPDATE orders SET status = ?, updated_at = ?, delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END WHERE id = ?`,
    [status, now, status, now, orderId]
  );
  db.runSync(
    'INSERT INTO order_events (id, order_id, status, note, at) VALUES (?, ?, ?, ?, ?)',
    [uuid(), orderId, status, note ?? null, now]
  );
}

export function updateOrderShipment(
  db: SQLiteDatabase,
  orderId: string,
  input: { trackingCode?: string; deliveryProofUri: string }
): void {
  db.runSync(
    'UPDATE orders SET tracking_code = ?, delivery_proof_uri = ?, updated_at = ? WHERE id = ?',
    [input.trackingCode?.trim() || null, input.deliveryProofUri, nowISO(), orderId]
  );
}

function nextOrderRef(db: SQLiteDatabase): string {
  const row = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM orders');
  const n = 2481 + (row?.n ?? 0);
  return `ORD-${n}`;
}

/** Create a buyer if one with the same name does not exist; returns buyer id. */
export function ensureBuyer(
  db: SQLiteDatabase,
  input: { name: string; phone?: string; channel?: string }
): string {
  const existing = db.getFirstSync<Buyer>(
    'SELECT * FROM buyers WHERE deleted_at IS NULL AND name = ? LIMIT 1',
    [input.name]
  );
  if (existing) return existing.id;
  const now = nowISO();
  const id = uuid();
  db.runSync(
    'INSERT INTO buyers (id, name, phone, channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, input.name, input.phone ?? null, input.channel ?? null, now, now]
  );
  return id;
}

/** Create a new customer with full contact details; returns buyer id. */
export function createBuyer(
  db: SQLiteDatabase,
  input: { name: string; contact?: string; address?: string; email?: string }
): string {
  const now = nowISO();
  const id = uuid();
  db.runSync(
    'INSERT INTO buyers (id, name, phone, address, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, input.name, input.contact ?? null, input.address ?? null, input.email ?? null, now, now]
  );
  return id;
}

export function updateBuyer(
  db: SQLiteDatabase,
  id: string,
  input: { name: string; contact?: string; address?: string; email?: string }
): void {
  const now = nowISO();
  db.runSync(
    `UPDATE buyers SET name = ?, phone = ?, address = ?, email = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [input.name, input.contact ?? null, input.address ?? null, input.email ?? null, now, id]
  );
}

export function deleteBuyer(db: SQLiteDatabase, id: string): void {
  const now = nowISO();
  db.runSync(
    'UPDATE buyers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [now, now, id]
  );
}

export function resetDatabase(db: SQLiteDatabase): void {
  db.withTransactionSync(() => {
    db.execSync(`
      DELETE FROM order_events;
      DELETE FROM payments;
      DELETE FROM order_attachments;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM requests;
      DELETE FROM buyers;
      DELETE FROM trips;
      DELETE FROM settings;
    `);
  });
}

export function createOrder(
  db: SQLiteDatabase,
  input: { tripId: string; buyerId: string; status?: string; weightKg?: number; weightFeePerKg?: number }
): string {
  const now = nowISO();
  const id = uuid();
  db.runSync(
    `INSERT INTO orders (id, ref, trip_id, buyer_id, status, weight_kg, weight_fee_per_kg, handover_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, nextOrderRef(db), input.tripId, input.buyerId, input.status ?? 'confirmed', input.weightKg ?? 0, input.weightFeePerKg ?? 0, handoverCode(), now, now]
  );
  db.runSync('INSERT INTO order_events (id, order_id, status, note, at) VALUES (?, ?, ?, ?, ?)', [
    uuid(),
    id,
    input.status ?? 'confirmed',
    'Order created',
    now,
  ]);
  return id;
}

export function setOrderWeight(db: SQLiteDatabase, orderId: string, weightKg: number): void {
  db.runSync('UPDATE orders SET weight_kg = ?, updated_at = ? WHERE id = ?', [weightKg, nowISO(), orderId]);
}

export function addOrderItem(
  db: SQLiteDatabase,
  input: {
    orderId: string;
    name: string;
    qty: number;
    unitCost: number;
    kg: number;
    feePct: number;
    feePerKg: number;
    foreignCost?: string;
    photoUri?: string;
  }
): void {
  const now = nowISO();
  db.runSync(
    `INSERT INTO order_items (id, order_id, name, qty, unit_cost, foreign_cost, kg, fee_pct, fee_per_kg, photo_uri, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), input.orderId, input.name, input.qty, input.unitCost, input.foreignCost ?? null, input.kg, input.feePct, input.feePerKg, input.photoUri ?? null, now, now]
  );
}

export function updateOrderItem(
  db: SQLiteDatabase,
  itemId: string,
  input: { name: string; qty: number; unitCost: number; photoUri: string | null }
): void {
  db.runSync(
    `UPDATE order_items SET name = ?, qty = ?, unit_cost = ?, photo_uri = ?, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [input.name, input.qty, input.unitCost, input.photoUri, nowISO(), itemId]
  );
}

export function deleteOrderItem(db: SQLiteDatabase, itemId: string): void {
  const now = nowISO();
  db.runSync(
    'UPDATE order_items SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [now, now, itemId]
  );
}

export function deleteOrder(db: SQLiteDatabase, orderId: string): void {
  const now = nowISO();
  db.withTransactionSync(() => {
    db.runSync('UPDATE order_items SET deleted_at = ?, updated_at = ? WHERE order_id = ? AND deleted_at IS NULL', [now, now, orderId]);
    db.runSync('UPDATE payments SET deleted_at = ?, updated_at = ? WHERE order_id = ? AND deleted_at IS NULL', [now, now, orderId]);
    db.runSync('UPDATE orders SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [now, now, orderId]);
  });
}

/** The active (non-delivered) order for a buyer on a trip, if any. */
export function findOpenOrderForBuyer(db: SQLiteDatabase, tripId: string, buyerId: string): Order | null {
  return db.getFirstSync<Order>(
    `SELECT * FROM orders WHERE deleted_at IS NULL AND trip_id = ? AND buyer_id = ? AND status != 'delivered'
     ORDER BY created_at DESC LIMIT 1`,
    [tripId, buyerId]
  );
}

/** Accept a request: ensure buyer + order + item, mark request accepted; returns order id. */
export function acceptRequest(db: SQLiteDatabase, requestId: string): string | null {
  const req = db.getFirstSync<Request>('SELECT * FROM requests WHERE id = ?', [requestId]);
  if (!req || !req.trip_id || !req.buyer_id) return null;
  const trip = getTrip(db, req.trip_id);
  if (!trip) return null;

  const existing = findOpenOrderForBuyer(db, req.trip_id, req.buyer_id);
  const estimatedKg = req.est_kg ?? 0;
  const orderId = existing
    ? existing.id
    : createOrder(db, { tripId: req.trip_id, buyerId: req.buyer_id, weightKg: estimatedKg, weightFeePerKg: trip.fee_per_kg });
  if (existing) setOrderWeight(db, orderId, existing.weight_kg + estimatedKg);

  addOrderItem(db, {
    orderId,
    name: req.item_name ?? 'Item',
    qty: 1,
    unitCost: req.budget ?? 0,
    kg: 0,
    feePct: trip.fee_pct,
    feePerKg: trip.fee_per_kg,
  });

  const now = nowISO();
  db.runSync('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?', ['accepted', now, requestId]);
  return orderId;
}

export function declineRequest(db: SQLiteDatabase, requestId: string): void {
  const now = nowISO();
  db.runSync('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?', ['declined', now, requestId]);
}

export function createTrip(
  db: SQLiteDatabase,
  input: {
    origin: string;
    destination: string;
    departDate: string;
    returnDate: string;
    cutoffDate: string;
    checkedKg: number;
    cabinKg: number;
    feePct: number;
    feePerKg: number;
  }
): string {
  const now = nowISO();
  const id = uuid();
  db.runSync(
    `INSERT INTO trips (id, origin, destination, depart_date, return_date, cutoff_date,
      checked_kg, cabin_kg, fee_pct, fee_per_kg, excess_per_kg, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    [id, input.origin, input.destination, input.departDate, input.returnDate, input.cutoffDate,
      input.checkedKg, input.cabinKg, input.feePct, input.feePerKg, 1250, now, now]
  );
  setActiveTrip(db, id);
  return id;
}
