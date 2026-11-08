import { round2 } from "./money";
import type { Activity, CartItem, OrderStatus, PriceRule, StayBookingDetails, Voucher } from "./types";

/**
 * Canonical identity of a cart line. Defined once here because the client, the
 * cart domain and the checkout route all have to produce byte-identical keys —
 * a mismatch silently selects nothing (checkout) or deletes nothing (cart
 * clean-up) rather than failing loudly.
 *
 * The outlet is part of the identity: the same variant sold at two outlets has
 * two prices and two stock pools, so it must stay two lines.
 */
type CartItemIdentity = Pick<CartItem, "activityId" | "variantId" | "slotId" | "outletId" | "nights"> &
  Partial<Pick<CartItem, "cartItemId" | "stayDetails" | "qty">>;

export function cartItemTupleKey(item: Pick<CartItem, "activityId" | "variantId" | "slotId" | "outletId" | "nights">): string {
  return `${item.activityId}|${item.variantId}|${item.slotId ?? ""}|${item.outletId ?? ""}${(item.nights ?? 1) > 1 ? `|${item.nights}` : ""}`;
}

export function cartItemKey(item: CartItemIdentity): string {
  return item.cartItemId ? `cart-item:${item.cartItemId}` : cartItemTupleKey(item);
}

export function sameStayDetails(a: StayBookingDetails | null | undefined, b: StayBookingDetails | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.primaryGuestName === b.primaryGuestName
    && (a.additionalGuestNames ?? []).length === (b.additionalGuestNames ?? []).length
    && (a.additionalGuestNames ?? []).every((name, index) => name === (b.additionalGuestNames ?? [])[index])
    && a.adults === b.adults
    && a.estimatedArrival === b.estimatedArrival
    && (a.specialRequest ?? null) === (b.specialRequest ?? null);
}

/** Whether an existing cart line may absorb another quantity of the same selection. */
export function canMergeCartItemLines(existing: CartItemIdentity, incoming: CartItemIdentity): boolean {
  return cartItemTupleKey(existing) === cartItemTupleKey(incoming)
    && sameStayDetails(existing.stayDetails, incoming.stayDetails);
}

/** The database only accepts cart lines backed by a variant or booking slot. */
export function assertCartItemHasBackingRecord(item: Pick<CartItem, "variantId" | "slotId">): void {
  if (!item.variantId?.trim() && !item.slotId?.trim()) throw new Error("cart_item_requires_variant_or_slot");
}

// ─── Contract #4: order state machine ──────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING_PAYMENT"],
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["COMPLETED", "CANCELLED", "REFUNDED"],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
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

function voucherEligibleLines(voucher: Voucher, items: CartItem[], activities: Activity[], now = new Date()) {
  return items.flatMap((cartItem) => {
    const activity = activities.find((candidate) => candidate.id === cartItem.activityId);
    if (!activity) return [];
    const outletId = cartItem.outletId ?? activity.outletId;
    if (voucher.vendorId && activity.vendorId !== voucher.vendorId) return [];
    if (voucher.outletId && outletId !== voucher.outletId) return [];
    if (voucher.productId && activity.id !== voucher.productId) return [];
    const resolved = resolveCartLinePrice(activity, cartItem, {now,productIds:items.map(item=>item.activityId)});
    return resolved.available ? [{cartItem,activity,linePrice:resolved.unitPrice}] : [];
  });
}

export function voucherDiscount(voucher: Voucher, subtotal: number, items: CartItem[] = [], activities: Activity[] = []): number {
  const eligibleLines = voucherEligibleLines(voucher, items, activities);
  const hasScopedRule = Boolean(voucher.vendorId || voucher.outletId || voucher.productId);
  const eligibleSubtotal = hasScopedRule
    ? round2(eligibleLines.reduce((sum, line) => sum + line.linePrice * line.cartItem.qty, 0))
    : subtotal;
  if (hasScopedRule && eligibleLines.length === 0) return 0;

  if (voucher.type === "bogo") {
    if (!voucher.buyQuantity || !voucher.freeQuantity) return 0;
    const rawDiscount = eligibleLines.reduce((sum, { cartItem, linePrice }) => (
      sum + Math.floor(cartItem.qty / voucher.buyQuantity!) * voucher.freeQuantity! * linePrice
    ), 0);
    return round2(Math.min(rawDiscount, eligibleSubtotal));
  }
  const raw = voucher.type === "percent" ? (eligibleSubtotal * voucher.value) / 100 : voucher.value;
  return round2(Math.min(raw, eligibleSubtotal));
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

export type CartLinePrice = {available:true; unitPrice:number} | {available:false; reason:"outlet_unavailable" | "invalid_price"};

/** UI estimates and voucher lines share outlet pricing; checkout still re-quotes from the database. */
export function resolveCartLinePrice(activity: Activity, item: CartItem, context: {now:Date; productIds:string[]; slotPriceOverride?:number}): CartLinePrice {
  const outletId = item.outletId ?? activity.outletId;
  const offer = activity.offers?.find(candidate=>candidate.outletId === outletId && candidate.status === "active");
  if (activity.offers?.length ? !offer : outletId !== activity.outletId) return {available:false,reason:"outlet_unavailable"};
  const base = offer?.price ?? activity.price;
  const price = item.priceOverride ?? context.slotPriceOverride ?? unitPrice({...activity,price:base}, item.variantId, item.qty, context.now, context.productIds);
  return Number.isFinite(base) && base >= 0 && Number.isFinite(price) && price >= 0 ? {available:true,unitPrice:price} : {available:false,reason:"invalid_price"};
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
      const resolved = resolveCartLinePrice(activity, item, {now,productIds:cartProductIds});
      return resolved.available ? sum + resolved.unitPrice * item.qty : sum;
    }, 0),
  );

  let discount = 0;
  let voucherError: string | undefined;
  if (voucher) {
    const scopedLines = voucherEligibleLines(voucher, items, activities, now);
    const hasScopedRule = Boolean(voucher.vendorId || voucher.outletId || voucher.productId);
    const eligibleSubtotal = hasScopedRule
      ? round2(scopedLines.reduce((sum, line) => sum + line.linePrice * line.cartItem.qty, 0))
      : subtotal;
    const validation = hasScopedRule && scopedLines.length === 0
      ? { ok: false as const, reason: "Voucher is not valid for the selected items." }
      : validateVoucher(voucher, eligibleSubtotal, now);
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
