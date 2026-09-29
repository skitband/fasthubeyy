// Peso formatting and fee / derived-value calculations. Derive, don't store.

export function peso(n: number): string {
  return '\u20B1' + Math.round(n).toLocaleString('en-US');
}

export function kgLabel(n: number): string {
  return n.toFixed(1) + ' kg';
}

export type PayStatus = 'paid' | 'partial' | 'unpaid';

export function payStatus(total: number, paid: number): PayStatus {
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0 && paid < total) return 'partial';
  return 'unpaid';
}

export function itemSubtotal(unitCost: number, qty: number): number {
  return unitCost * qty;
}

export function itemFee(
  unitCost: number,
  qty: number,
  kg: number,
  feePct: number,
  feePerKg: number
): number {
  return itemSubtotal(unitCost, qty) * (feePct / 100) + kg * qty * feePerKg;
}

export function itemKg(kg: number, qty: number): number {
  return kg * qty;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + 'T00:00:00');
  const b = new Date(toISO + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Format a YYYY-MM-DD string like "Sep 28". */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format a route date range like "Oct 3 – Oct 12, 2026". */
export function dateRange(departISO: string, returnISO: string): string {
  const a = new Date(departISO + 'T00:00:00');
  const b = new Date(returnISO + 'T00:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return `${departISO} – ${returnISO}`;
  const left = a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const right = b.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${left} \u2013 ${right}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** 4-digit handover code generated at order creation. */
export function handoverCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Space the 4-digit code for display: "4 8 2 9". */
export function spacedCode(code: string): string {
  return code.split('').join(' ');
}

export function uuid(): string {
  // RFC4122-ish v4, sufficient for local row ids.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
