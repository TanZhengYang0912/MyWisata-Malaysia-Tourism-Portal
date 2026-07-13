// Owner: Member 2/4 (Cart/Order/Booking/Wallet)
import { supabase } from "@/backend/supabase";
import { getCollection, KEYS, setCollection } from "../core/mockdb";
import { cartTotals } from "@/backend/core/helpers";
import { emit } from "@/backend/core/events";
import { getActivities, getVoucherByCode } from "./catalogue";
import type { Booking, CartItem, Order, OrderItem, WithdrawalRequest } from "@/backend/core/types";

// ─── Cart ───────────────────────────────────────────────────────────────────
// Kept in localStorage (not Supabase): cart is ephemeral session state, and
// there's no signed-in session (demo auth) to key a server-side cart on.
// carts/cart_items tables exist in the schema but stay unused for now.
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

// ─── Orders + bookings ──────────────────────────────────────────────────────
type OrderItemRow = {
  product_id: string | null;
  product_name: string;
  variant_name: string | null;
  slot_starts_at: string | null;
  unit_price: number;
  quantity: number;
  outlet_id: string;
};

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    activityId: row.product_id ?? "",
    activityName: row.product_name,
    variantLabel: row.variant_name ?? "Standard",
    slotStartsAt: row.slot_starts_at ?? undefined,
    unitPrice: Number(row.unit_price),
    qty: row.quantity,
    outletId: row.outlet_id,
  };
}

type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  voucher_code: string | null;
  created_at: string;
  order_items: OrderItemRow[];
};

const ORDER_SELECT =
  "id,user_id,status,subtotal,discount_amount,total_amount,voucher_code,created_at,order_items(product_id,product_name,variant_name,slot_starts_at,unit_price,quantity,outlet_id)";

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    items: (row.order_items ?? []).map(mapOrderItem),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount_amount),
    total: Number(row.total_amount),
    voucherCode: row.voucher_code ?? undefined,
    // orders.status is stored lowercase in the DB (check constraint); the app-wide OrderStatus type is uppercase.
    status: row.status.toUpperCase() as Order["status"],
    createdAt: row.created_at,
  };
}

export async function getOrdersForUser(userId: string): Promise<Order[]> {
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as OrderRow[]).map(mapOrder);
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapOrder(data as unknown as OrderRow) : undefined;
}

/** Vendor-side: orders containing at least one item from the given outlets. */
export async function getOrdersForOutlets(outletIds: string[]): Promise<Order[]> {
  if (outletIds.length === 0) return [];
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as OrderRow[]).map(mapOrder).filter((o) => o.items.some((item) => outletIds.includes(item.outletId)));
}

type BookingRow = {
  id: string;
  demo_qr_code: string | null;
  order_items: { order_id: string; product_id: string | null; product_name: string; outlet_id: string; slot_starts_at: string | null; quantity: number };
};

function mapBooking(row: BookingRow): Booking | null {
  // order_items can be undefined if the RLS join returns no related row
  if (!row.order_items) return null;
  return {
    id: row.id,
    orderId: row.order_items.order_id,
    activityId: row.order_items.product_id ?? "",
    activityName: row.order_items.product_name,
    outletId: row.order_items.outlet_id,
    slotStartsAt: row.order_items.slot_starts_at ?? undefined,
    qty: row.order_items.quantity,
    qrCode: row.demo_qr_code ?? "",
  };
}

const BOOKING_SELECT = "id,demo_qr_code,order_items!inner(order_id,product_id,product_name,outlet_id,slot_starts_at,quantity)";

export async function getBookingsForOrder(orderId: string): Promise<Booking[]> {
  const { data, error } = await supabase.from("bookings").select(BOOKING_SELECT).eq("order_items.order_id", orderId);
  if (error) throw error;
  return (data as unknown as BookingRow[]).map(mapBooking).filter((b): b is Booking => b !== null);
}

export async function getBookingsForOutlets(outletIds: string[]): Promise<Booking[]> {
  if (outletIds.length === 0) return [];
  const { data, error } = await supabase.from("bookings").select(BOOKING_SELECT).in("order_items.outlet_id", outletIds);
  if (error) throw error;
  return (data as unknown as BookingRow[]).map(mapBooking).filter((b): b is Booking => b !== null);
}

/** Checkout: creates a PAID order from the current cart, snapshots items,
 * generates bookings for requiresBooking activities, and clears the cart. */
export async function createOrder(userId: string, voucherCode?: string): Promise<Order> {
  const cart = getCart();
  const activities = await getActivities();
  const voucher = voucherCode ? await getVoucherByCode(voucherCode) : undefined;
  const totals = cartTotals(cart, activities, voucher);
  const appliedVoucherCode = voucher && !totals.voucherError ? voucher.code : undefined;

  const outletIds = [...new Set(cart.map((c) => activities.find((a) => a.id === c.activityId)?.outletId).filter(Boolean))] as string[];
  const { data: outletRows } = await supabase.from("outlets").select("id,vendor_id").in("id", outletIds);
  const vendorByOutlet = new Map((outletRows ?? []).map((o) => [o.id, o.vendor_id]));

  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      status: "paid", // lowercase — matches the orders.status CHECK constraint
      subtotal: totals.subtotal,
      discount_amount: totals.discount,
      total_amount: totals.total,
      voucher_code: appliedVoucherCode ?? null,
      paid_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (orderErr) throw orderErr;

  const itemRows = cart.map((c) => {
    const activity = activities.find((a) => a.id === c.activityId)!;
    const variant = activity.variants.find((v) => v.id === c.variantId);
    const unitPrice = activity.price + (variant?.priceDelta ?? 0);
    return {
      order_id: orderRow.id,
      vendor_id: vendorByOutlet.get(activity.outletId) ?? null,
      outlet_id: activity.outletId,
      product_id: activity.id,
      variant_id: c.variantId,
      slot_id: c.slotId ?? null,
      product_name: activity.name,
      variant_name: variant?.label ?? "Standard",
      unit_price: unitPrice,
      quantity: c.qty,
      line_total: unitPrice * c.qty,
      fulfil_status: "fulfilled",
    };
  });

  const { data: insertedItems, error: itemsErr } = await supabase.from("order_items").insert(itemRows).select("*");
  if (itemsErr) throw itemsErr;

  const bookingRows = insertedItems
    .filter((item) => item.slot_id && activities.find((a) => a.id === item.product_id)?.requiresBooking)
    .map((item) => ({
      order_item_id: item.id,
      slot_id: item.slot_id,
      customer_id: userId,
      demo_qr_code: `MY-2026-${String(orderRow.id).slice(-6).toUpperCase()}`,
    }));
  if (bookingRows.length > 0) {
    const { error: bookingErr } = await supabase.from("bookings").insert(bookingRows);
    if (bookingErr) throw bookingErr;
  }

  if (appliedVoucherCode && voucher) {
    await supabase.from("vouchers").update({ uses_count: voucher.usageCount + 1 }).eq("code", appliedVoucherCode);
  }

  clearCart();
  emit("order.paid", { orderId: orderRow.id, userId, total: totals.total });

  return {
    id: orderRow.id,
    userId,
    items: cart.map((c) => {
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
    }),
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    voucherCode: appliedVoucherCode,
    status: "paid",
    createdAt: orderRow.created_at,
  };
}

// ─── Withdrawals (P4 wallet governance) ────────────────────────────────────
type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  requires_dual_approval: boolean;
  destination_label: string | null;
  created_at: string;
};

const WITHDRAWAL_SELECT = "id,user_id,amount,status,requires_dual_approval,destination_label,created_at";

function mapWithdrawal(row: WithdrawalRow): WithdrawalRequest {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number(row.amount),
    destination: row.destination_label ?? "",
    status: row.status as WithdrawalRequest["status"],
    requiresDualApproval: row.requires_dual_approval,
    createdAt: row.created_at,
  };
}

export async function getWithdrawals(): Promise<WithdrawalRequest[]> {
  const { data, error } = await supabase.from("withdrawal_requests").select(WITHDRAWAL_SELECT);
  if (error) throw error;
  return (data as unknown as WithdrawalRow[]).map(mapWithdrawal);
}

export async function getMyWithdrawals(userId: string): Promise<WithdrawalRequest[]> {
  const { data, error } = await supabase.from("withdrawal_requests").select(WITHDRAWAL_SELECT).eq("user_id", userId);
  if (error) throw error;
  return (data as unknown as WithdrawalRow[]).map(mapWithdrawal);
}

export async function requestWithdrawal(userId: string, amount: number): Promise<WithdrawalRequest> {
  const { data: rpcData, error: rpcErr } = await supabase.rpc("debit_withdrawal", {
    p_user_id:   userId,
    p_amount_rm: amount,
  });
  if (rpcErr) throw rpcErr;
  const requestId = (rpcData as { request_id: string }).request_id;
  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select(WITHDRAWAL_SELECT)
    .eq("id", requestId)
    .single();
  if (error) throw error;
  return mapWithdrawal(data as unknown as WithdrawalRow);
}

export async function getWalletBuckets(userId: string): Promise<{ topup: number; earnings: number }> {
  const { data } = await supabase
    .from("wallets")
    .select("topup_sen,earnings_sen")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { topup: 0, earnings: 0 };
  const row = data as { topup_sen: number; earnings_sen: number };
  return { topup: row.topup_sen / 100, earnings: row.earnings_sen / 100 };
}

export async function getWalletBalance(userId: string): Promise<number> {
  const { topup, earnings } = await getWalletBuckets(userId);
  return topup + earnings;
}

export async function getConnectStatus(userId: string): Promise<{
  accountId: string | null;
  payoutsEnabled: boolean;
  kycStatus: string;
}> {
  const { data } = await supabase
    .from("users")
    .select("stripe_connect_account_id, stripe_payouts_enabled, kyc_status")
    .eq("id", userId)
    .maybeSingle();
  const row = data as {
    stripe_connect_account_id: string | null;
    stripe_payouts_enabled: boolean;
    kyc_status: string;
  } | null;
  return {
    accountId:      row?.stripe_connect_account_id ?? null,
    payoutsEnabled: row?.stripe_payouts_enabled    ?? false,
    kycStatus:      row?.kyc_status                ?? "unverified",
  };
}

export async function reviewWithdrawal(id: string, status: "approved" | "rejected"): Promise<void> {
  const { error } = await supabase.from("withdrawal_requests").update({ status }).eq("id", id);
  if (error) throw error;
  emit("withdrawal.reviewed", { id, status });
}
