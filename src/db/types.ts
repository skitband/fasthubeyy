// SQLite row types (source of truth on device).

export type TripStatus = 'open' | 'closed';
export type RequestStatus = 'pending' | 'accepted' | 'declined';
export type OrderStatus = 'requested' | 'confirmed' | 'bought' | 'packed' | 'delivered';
export type PayMethod = 'gcash' | 'bank' | 'cash';
export type Channel = 'viber' | 'messenger' | 'sms' | string;

export interface Trip {
  id: string;
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string;
  cutoff_date: string;
  checked_kg: number;
  cabin_kg: number;
  fee_pct: number;
  fee_per_kg: number;
  excess_per_kg: number | null;
  status: TripStatus;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  synced_at: string | null;
}

export interface Buyer {
  id: string;
  name: string;
  phone: string | null;
  channel: Channel | null;
  address: string | null;
  email: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  synced_at: string | null;
}

export interface Request {
  id: string;
  trip_id: string | null;
  buyer_id: string | null;
  item_name: string | null;
  note: string | null;
  budget: number | null;
  est_kg: number | null;
  channel: Channel | null;
  status: RequestStatus;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  synced_at: string | null;
}

export interface Order {
  id: string;
  ref: string | null;
  trip_id: string;
  buyer_id: string;
  status: OrderStatus;
  weight_kg: number;
  weight_fee_per_kg: number;
  tracking_code: string | null;
  delivery_proof_uri: string | null;
  handover_code: string | null;
  delivered_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  synced_at: string | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  name: string;
  qty: number;
  unit_cost: number;
  foreign_cost: string | null;
  kg: number;
  fee_pct: number;
  fee_per_kg: number;
  photo_uri: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  synced_at: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  method: PayMethod | null;
  reference: string | null;
  proof_uri: string | null;
  paid_at: string;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  synced_at: string | null;
}

export interface OrderAttachment {
  id: string;
  order_id: string;
  name: string;
  uri: string;
  source: 'file' | 'photo' | 'camera';
  mime_type: string | null;
  created_at: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  status: string;
  note: string | null;
  at: string;
}

// Derived shape used by the UI (order + buyer + computed totals).
export interface OrderView extends Order {
  buyer_name: string;
  buyer_phone: string | null;
  buyer_channel: Channel | null;
  items: OrderItem[];
  total: number;
  fee: number;
  paid: number;
  kg: number;
  pay: 'paid' | 'partial' | 'unpaid';
}
