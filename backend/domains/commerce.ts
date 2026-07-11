// Owner: Member 2/4 (Cart/Order/Booking/Wallet)
import { getCollection, KEYS, setCollection } from "../core/mockdb";
import { cartTotals } from "@/backend/core/helpers";
import { emit } from "@/backend/core/events";
import { getActivities, getVoucherByCode } from "./catalogue";
import type { Booking, CartItem, Order, OrderItem, Voucher, WithdrawalRequest } from "@/backend/core/types";

// ─── Cart ───────────────────────────────────────────────────────────────────
export function getCart(): CartItem[] {
  return getCollection<CartItem>(KEYS.cart);
}

export function addToCart(item: CartItem): CartItem[] {
  const cart = getCart();
  const existingIndex = cart.findIndex(
    (c) => c.activityId === item.activityId && c.variantId === item.variantId && c.slotId === item.slotId,
  );
  let next: CartItem[];
  if (existingIndex >= 0) {
    next = cart.map((c, i) => (i === existingIndex ? { ...c, qty: c.qty + item.qty } : c));
  } else {
    next = [...cart, item];
  }
  setCollection(KEYS.cart, next);
  return next;
}

export function updateCartQty(index: number, qty: number): CartItem[] {
  const cart = getCart();
  const next = qty <= 0 ? cart.filter((_, i) => i !== index) : cart.map((c, i) => (i === index ? { ...c, qty } : c));
  setCollection(KEYS.cart, next);
  return next;
}

export function removeFromCart(index: number): CartItem[] {
  const next = getCart().filter((_, i) => i !== index);
  setCollection(KEYS.cart, next);
  return next;
}

export function clearCart(): void {
  setCollection<CartItem>(KEYS.cart, []);
}

export function getCartTotalsNow(voucherCode?: string) {
  const cart = getCart();
  const activities = getActivities();
  const voucher = voucherCode ? getVoucherByCode(voucherCode) : undefined;
  return { cart, activities, voucher, totals: cartTotals(cart, activities, voucher) };
}

// ─── Orders + bookings ──────────────────────────────────────────────────────
export function getOrdersForUser(userId: string): Order[] {
  return getCollection<Order>(KEYS.orders)
    .filter((o) => o.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getOrder(id: string): Order | undefined {
  return getCollection<Order>(KEYS.orders).find((o) => o.id === id);
}

export function getBookingsForOrder(orderId: string): Booking[] {
  return getCollection<Booking>(KEYS.bookings).filter((b) => b.orderId === orderId);
}

/** Vendor-side: orders containing at least one item from the given outlets. */
export function getOrdersForOutlets(outletIds: string[]): Order[] {
  return getCollection<Order>(KEYS.orders)
    .filter((o) => o.items.some((item) => outletIds.includes(item.outletId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBookingsForOutlets(outletIds: string[]): Booking[] {
  return getCollection<Booking>(KEYS.bookings).filter((b) => outletIds.includes(b.outletId));
}

/** Mock checkout: creates a PAID order from the current cart, snapshots items,
 * generates bookings for requiresBooking activities, and clears the cart. */
export function createOrder(userId: string, voucherCode?: string): Order {
  const cart = getCart();
  const activities = getActivities();
  const voucher = voucherCode ? getVoucherByCode(voucherCode) : undefined;
  const totals = cartTotals(cart, activities, voucher);

  const items: OrderItem[] = cart.map((c) => {
    const activity = activities.find((a) => a.id === c.activityId)!;
    const variant = activity.variants.find((v) => v.id === c.variantId);
    return {
      activityId: activity.id,
      activityName: activity.name,
      variantLabel: variant?.label ?? "Standard",
      unitPrice: activity.price + (variant?.priceDelta ?? 0),
      qty: c.qty,
      outletId: activity.outletId,
    };
  });

  const order: Order = {
    id: `ord-${Date.now()}`,
    userId,
    items,
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    voucherCode: voucher && !totals.voucherError ? voucher.code : undefined,
    status: "PAID",
    createdAt: new Date().toISOString(),
  };

  const orders = getCollection<Order>(KEYS.orders);
  setCollection(KEYS.orders, [order, ...orders]);

  const bookings = getCollection<Booking>(KEYS.bookings);
  const newBookings: Booking[] = order.items
    .filter((item) => activities.find((a) => a.id === item.activityId)?.requiresBooking)
    .map((item, i) => ({
      id: `bk-${Date.now()}-${i}`,
      orderId: order.id,
      activityId: item.activityId,
      activityName: item.activityName,
      outletId: item.outletId,
      qty: item.qty,
      qrCode: `MY-2026-${order.id.slice(-6).toUpperCase()}${i}`,
    }));
  setCollection(KEYS.bookings, [...newBookings, ...bookings]);

  if (order.voucherCode) {
    const vouchers = getCollection<Voucher>(KEYS.vouchers);
    setCollection(
      KEYS.vouchers,
      vouchers.map((v) => (v.code === order.voucherCode ? { ...v, usageCount: v.usageCount + 1 } : v)),
    );
  }

  clearCart();
  emit("order.paid", { orderId: order.id, userId, total: order.total });
  return order;
}

// ─── Withdrawals (P4 wallet governance — shell) ────────────────────────────
export function getWithdrawals(): WithdrawalRequest[] {
  return getCollection<WithdrawalRequest>(KEYS.withdrawals);
}

export function reviewWithdrawal(id: string, status: "approved" | "rejected"): void {
  const withdrawals = getWithdrawals();
  setCollection(
    KEYS.withdrawals,
    withdrawals.map((w) => (w.id === id ? { ...w, status } : w)),
  );
  emit("withdrawal.reviewed", { id, status });
}
