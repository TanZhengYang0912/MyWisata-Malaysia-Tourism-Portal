import { round2 } from "./money";
import type { Activity, CartItem, OrderStatus, PriceRule, Voucher } from "./types";

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

export function voucherDiscount(voucher: Voucher, subtotal: number, items: CartItem[] = [], activities: Activity[] = []): number {
  if (voucher.type === "bogo") {
    const product = activities.find((activity) => activity.id === voucher.productId);
    const item = items.find((cartItem) => cartItem.activityId === voucher.productId);
    if (!product || !item || !voucher.buyQuantity || !voucher.freeQuantity) return 0;
    const freeUnits = Math.floor(item.qty / voucher.buyQuantity) * voucher.freeQuantity;
    return round2(Math.min(freeUnits * unitPrice(product, item.variantId), subtotal));
  }
  const raw = voucher.type === "percent" ? (subtotal * voucher.value) / 100 : voucher.value;
  return round2(Math.min(raw, subtotal));
}

// ─── Cart totals ────────────────────────────────────────────────────────────
function ruleApplies(rule: PriceRule, activity: Activity, quantity: number, now: Date, cartProductIds: string[]): boolean {
  const today = now.toISOString().slice(0, 10);
  if (rule.validFrom && today < rule.validFrom) return false;
  if (rule.validUntil && today > rule.validUntil) return false;
  if (rule.ruleType === "weekend") {
    const day = now.getDay();
    return day === 0 || day === 6;
  }
  if (["group_size", "tiered"].includes(rule.ruleType)) return quantity >= (rule.minQuantity ?? 1);
  if (rule.ruleType === "bundle") return (rule.bundleProductIds ?? []).every((id) => cartProductIds.includes(id));
  return true;
}

export function unitPrice(activity: Activity, variantId: string, quantity = 1, now: Date = new Date(), cartProductIds: string[] = [activity.id]): number {
  const variant = activity.variants.find((v) => v.id === variantId);
  const base = activity.price + (variant?.priceDelta ?? 0);
  const rule = (activity.priceRules ?? []).filter((candidate) => ruleApplies(candidate, activity, quantity, now, cartProductIds)).sort((a, b) => b.priority - a.priority)[0];
  if (!rule) return round2(base);
  if (rule.fixedAmount !== undefined) return round2(Math.max(0, rule.fixedAmount));
  if (rule.multiplier !== undefined) return round2(base * rule.multiplier);
  return round2(base);
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
      const cartProductIds = items.map((cartItem) => cartItem.activityId);
      const linePrice = item.priceOverride ?? unitPrice(activity, item.variantId, item.qty, now, cartProductIds);
      return sum + linePrice * item.qty;
    }, 0),
  );

  let discount = 0;
  let voucherError: string | undefined;
  if (voucher) {
    const validation = validateVoucher(voucher, subtotal, now);
    if (validation.ok) {
      discount = voucherDiscount(voucher, subtotal, items, activities);
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
