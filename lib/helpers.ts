import { round2 } from "./money";
import type { Activity, CartItem, OrderStatus, Voucher } from "./types";

// ─── Contract #4: order state machine ──────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING_PAYMENT"],
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// ─── Voucher validation ────────────────────────────────────────────────────
export type VoucherValidation = { ok: true } | { ok: false; reason: string };

export function validateVoucher(
  voucher: Voucher | undefined,
  subtotal: number,
  now: Date = new Date(),
): VoucherValidation {
  if (!voucher) return { ok: false, reason: "Voucher code not found." };
  if (new Date(voucher.expiresAt) < now) return { ok: false, reason: "This voucher has expired." };
  if (voucher.usageCount >= voucher.usageCap) return { ok: false, reason: "This voucher has reached its usage limit." };
  if (subtotal < voucher.minSpend) return { ok: false, reason: `Minimum spend of RM ${voucher.minSpend} not met.` };
  return { ok: true };
}

export function voucherDiscount(voucher: Voucher, subtotal: number): number {
  const raw = voucher.type === "percent" ? (subtotal * voucher.value) / 100 : voucher.value;
  return round2(Math.min(raw, subtotal));
}

// ─── Cart totals ────────────────────────────────────────────────────────────
export function unitPrice(activity: Activity, variantId: string): number {
  const variant = activity.variants.find((v) => v.id === variantId);
  return round2(activity.price + (variant?.priceDelta ?? 0));
}

export function cartTotals(
  items: CartItem[],
  activities: Activity[],
  voucher?: Voucher,
  now: Date = new Date(),
) {
  const subtotal = round2(
    items.reduce((sum, item) => {
      const activity = activities.find((a) => a.id === item.activityId);
      if (!activity) return sum;
      return sum + unitPrice(activity, item.variantId) * item.qty;
    }, 0),
  );

  let discount = 0;
  let voucherError: string | undefined;
  if (voucher) {
    const validation = validateVoucher(voucher, subtotal, now);
    if (validation.ok) {
      discount = voucherDiscount(voucher, subtotal);
    } else {
      voucherError = validation.reason;
    }
  }

  const total = round2(subtotal - discount);
  return { subtotal, discount, total, voucherError };
}

// ─── Distance (Near Me) ─────────────────────────────────────────────────────
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return round2(2 * R * Math.asin(Math.sqrt(h)));
}
