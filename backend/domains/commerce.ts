// Owner: Member 2/4 (Cart/Order/Booking/Wallet)
import { supabase } from "@/backend/supabase";
import { assertCartItemHasBackingRecord, cartItemKey, cartTotals, unitPrice } from "@/backend/core/helpers";
import { emit } from "@/backend/core/events";
import { getActivities, getVoucherByCode } from "./catalogue";
import type { PaymentMethod } from "@/lib/constants";
import type { Booking, CartItem, Order, OrderItem, WalletTransaction, WithdrawalRequest } from "@/backend/core/types";
import { buildCustomerHistoryQuery, type CustomerHistoryFilters } from "@/lib/wallet/customer-transaction-filters";


// ─── Supabase cart ──────────────────────────────────────────────────────────
type CartItemRow = {
  id: string;
  variant_id: string | null;
  slot_id: string | null;
  outlet_id: string | null;
  quantity: number;
  unit_price: number;
  product_variants: { product_id: string } | { product_id: string }[] | null;
  booking_slots: { product_id: string } | { product_id: string }[] | null;
};

const CART_ITEM_SELECT = "id,variant_id,slot_id,outlet_id,quantity,unit_price,product_variants(product_id),booking_slots(product_id)";

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function getOrCreateCart(userId: string): Promise<{ id: string }> {
  const { data: existing, error: readError } = await supabase.from("carts").select("id").eq("user_id", userId).maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;
  const { data: created, error: createError } = await supabase.from("carts").insert({ user_id: userId }).select("id").single();
  if (createError) throw createError;
  return created;
}

async function getCartRows(userId: string): Promise<CartItemRow[]> {
  const cart = await getOrCreateCart(userId);
  const { data, error } = await supabase.from("cart_items").select(CART_ITEM_SELECT).eq("cart_id", cart.id).order("created_at");
  if (error) throw error;
  return (data ?? []) as unknown as CartItemRow[];
}

function mapCartItem(row: CartItemRow): CartItem {
  const productId = relation(row.product_variants)?.product_id ?? relation(row.booking_slots)?.product_id;
  return { activityId: productId ?? "", variantId: row.variant_id ?? "", slotId: row.slot_id ?? undefined, outletId: row.outlet_id ?? undefined, qty: row.quantity, priceOverride: row.unit_price > 0 ? Number(row.unit_price) : undefined };
}

export async function getCart(userId: string): Promise<CartItem[]> {
  return (await getCartRows(userId)).map(mapCartItem).filter((item) => item.activityId);
}

export async function addToCart(userId: string, item: CartItem): Promise<CartItem[]> {
  assertCartItemHasBackingRecord(item);
  const cart = await getOrCreateCart(userId);
  const rows = await getCartRows(userId);
  // The outlet is part of the line's identity: the same variant bought from two
  // outlets must stay two lines (different price and stock).
  const existing = rows.find((row) =>
    row.variant_id === item.variantId
    && row.slot_id === (item.slotId ?? null)
    && row.outlet_id === (item.outletId ?? null),
  );
  if (existing) {
    const { error } = await supabase.from("cart_items").update({ quantity: existing.quantity + item.qty }).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("cart_items").insert({ cart_id: cart.id, variant_id: item.variantId || null, slot_id: item.slotId ?? null, outlet_id: item.outletId ?? null, quantity: item.qty, unit_price: item.priceOverride ?? 0 });
    if (error) throw error;
  }
  return getCart(userId);
}

export async function updateCartQty(userId: string, index: number, qty: number): Promise<CartItem[]> {
  const rows = await getCartRows(userId);
  const row = rows[index];
  if (!row) return rows.map(mapCartItem);
  const { error } = qty <= 0
    ? await supabase.from("cart_items").delete().eq("id", row.id)
    : await supabase.from("cart_items").update({ quantity: qty }).eq("id", row.id);
  if (error) throw error;
  return getCart(userId);
}

export async function removeFromCart(userId: string, index: number): Promise<CartItem[]> {
  return updateCartQty(userId, index, 0);
}

export async function clearCart(userId: string): Promise<void> {
  const cart = await getOrCreateCart(userId);
  const { error } = await supabase.from("cart_items").delete().eq("cart_id", cart.id);
  if (error) throw error;
}

/** Removes only the cart rows matching the given item keys, leaving the rest. */
export async function clearCartItems(userId: string, keys: string[]): Promise<void> {
  const rows = await getCartRows(userId);
  const keySet = new Set(keys);
  const idsToDelete = rows.filter((row) => keySet.has(cartItemKey(mapCartItem(row)))).map((row) => row.id);
  if (idsToDelete.length === 0) return;
  const { error } = await supabase.from("cart_items").delete().in("id", idsToDelete);
  if (error) throw error;
}

// ─── Orders + bookings ──────────────────────────────────────────────────────
type OrderItemRow = {
  product_id: string | null;
  product_name: string;
  image_url: string | null;
  variant_name: string | null;
  slot_starts_at: string | null;
  unit_price: number;
  quantity: number;
  outlet_id: string;
  products?: { cover_url: string | null } | null;
};

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    activityId: row.product_id ?? "",
    activityName: row.product_name,
    imageUrl: row.image_url ?? row.products?.cover_url ?? undefined,
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
  payment_method: string | null;
  voucher_code: string | null;
  created_at: string;
  order_items: OrderItemRow[];
};

const ORDER_SELECT =
  "id,user_id,status,subtotal,discount_amount,total_amount,payment_method,voucher_code,created_at,order_items(product_id,product_name,image_url,variant_name,slot_starts_at,unit_price,quantity,outlet_id,products(cover_url))";

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    items: (row.order_items ?? []).map(mapOrderItem),
    subtotal: Number(row.subtotal),
    discount: Number(row.discount_amount),
    total: Number(row.total_amount),
    voucherCode: row.voucher_code ?? undefined,
    status: row.status.toUpperCase() as Order["status"],
    createdAt: row.created_at,
    paymentMethod: row.payment_method ?? undefined,
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

type TicketPassRow = {
  id: string;
  policy: "single_entry" | "multi_entry" | "group_entry";
  entry_limit: number;
  entries_used: number;
  status: string;
};

type BookingRow = {
  id: string;
  status: Booking["status"];
  order_items: { order_id: string; product_id: string | null; product_name: string; outlet_id: string; slot_starts_at: string | null; quantity: number };
  ticket_passes?: TicketPassRow | TicketPassRow[] | null;
};

function mapBooking(row: BookingRow): Booking | null {
  // order_items can be undefined if the RLS join returns no related row
  if (!row.order_items) return null;
  const pass = Array.isArray(row.ticket_passes) ? row.ticket_passes[0] : row.ticket_passes;
  let passToken: string | undefined = undefined;
  if (pass?.id && typeof window === "undefined") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { signTicketPassToken } = require("@/lib/tickets/tokens");
      passToken = signTicketPassToken({
        passId: pass.id,
        bookingId: row.id,
        outletId: row.order_items.outlet_id,
        policy: pass.policy,
        entryLimit: pass.entry_limit,
        issuedAt: Date.now(),
      });
    } catch {
      // client bundle safe fallback
    }
  }

  return {
    id: row.id,
    orderId: row.order_items.order_id,
    activityId: row.order_items.product_id ?? "",
    activityName: row.order_items.product_name,
    outletId: row.order_items.outlet_id,
    slotStartsAt: row.order_items.slot_starts_at ?? undefined,
    qty: row.order_items.quantity,
    status: row.status,
    qrCode: row.id,
    passToken,
    policy: pass?.policy,
    entryLimit: pass?.entry_limit,
    entriesUsed: pass?.entries_used,
  };
}

const BOOKING_SELECT = "id,status,order_items!inner(order_id,product_id,product_name,outlet_id,slot_starts_at,quantity),ticket_passes(id,policy,entry_limit,entries_used,status)";

export async function getBookingsForOrder(orderId: string): Promise<Booking[]> {
  const { data, error } = await supabase.from("bookings").select(BOOKING_SELECT).eq("order_items.order_id", orderId);
  if (error) throw error;
  return (data as unknown as BookingRow[]).map(mapBooking).filter((b): b is Booking => b !== null);
}

export async function getBookingForUser(userId: string, bookingId: string): Promise<Booking | undefined> {
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .eq("customer_id", userId)
    .maybeSingle();
  if (error) throw error;
  const booking = data ? mapBooking(data as unknown as BookingRow) : null;
  return booking ?? undefined;
}

export async function getBookingsForOutlets(outletIds: string[]): Promise<Booking[]> {
  if (outletIds.length === 0) return [];
  const { data, error } = await supabase.from("bookings").select(BOOKING_SELECT).in("order_items.outlet_id", outletIds);
  if (error) throw error;
  return (data as unknown as BookingRow[]).map(mapBooking).filter((b): b is Booking => b !== null);
}

export async function getBookingsForUser(userId: string): Promise<Booking[]> {
  const { data, error } = await supabase.from("bookings").select(BOOKING_SELECT).eq("customer_id", userId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as BookingRow[]).map(mapBooking).filter((b): b is Booking => b !== null);
}

/** Checkout: creates a PAID order from the current cart (or, if `selectedKeys` is
 * given, only the matching subset), snapshots items, generates bookings for
 * requiresBooking activities, and clears just those cart rows. */
export async function createOrder(userId: string, voucherCode?: string, paymentMethod: PaymentMethod = "mock_card", selectedKeys?: string[]): Promise<Order> {
  const fullCart = await getCart(userId);
  const cart = selectedKeys ? fullCart.filter((item) => selectedKeys.includes(cartItemKey(item))) : fullCart;
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
      status: "paid",
      subtotal: totals.subtotal,
      discount_amount: totals.discount,
      total_amount: totals.total,
      payment_method: paymentMethod,
      voucher_code: appliedVoucherCode ?? null,
      paid_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (orderErr) throw orderErr;

  // Compatibility path for the legacy demo helper. The customer checkout UI
  // uses prepare_checkout/finalize_checkout now, but every order created here
  // must still have an auditable payment row.
  const { error: paymentErr } = await supabase.from("payments").insert({
    order_id: orderRow.id,
    method: paymentMethod,
    amount: totals.total,
    status: "succeeded",
    processed_at: new Date().toISOString(),
  });
  if (paymentErr) throw paymentErr;

  const cartProductIds = cart.map((item) => item.activityId);
  const itemRows = cart.map((c) => {
    const activity = activities.find((a) => a.id === c.activityId)!;
    const variant = activity.variants.find((v) => v.id === c.variantId);
    const lineUnitPrice = c.priceOverride ?? unitPrice(activity, c.variantId, c.qty, new Date(), cartProductIds);
    return {
      order_id: orderRow.id,
      vendor_id: vendorByOutlet.get(activity.outletId) ?? null,
      outlet_id: activity.outletId,
      product_id: activity.id,
      variant_id: c.variantId,
      slot_id: c.slotId ?? null,
      product_name: activity.name,
      image_url: activity.image || null,
      variant_name: variant?.label ?? "Standard",
      unit_price: lineUnitPrice,
      quantity: c.qty,
      line_total: lineUnitPrice * c.qty,
      fulfil_status: "fulfilled",
    };
  });

  const { data: insertedItems, error: itemsErr } = await supabase.from("order_items").insert(itemRows).select("*");
  if (itemsErr) throw itemsErr;

  for (const item of cart) {
    const activity = activities.find((candidate) => candidate.id === item.activityId);
    if (!activity || activity.requiresBooking) continue;
    // Inventory is keyed by (variant, outlet) — without the outlet this can
    // decrement another outlet's stock for the same variant.
    const { data: stockUpdated, error: stockError } = await supabase.rpc("decrement_inventory", { p_variant_id: item.variantId, p_quantity: item.qty, p_outlet_id: activity.outletId });
    if (stockError || stockUpdated !== true) throw new Error("One or more products are out of stock.");
  }

  const bookingRows = insertedItems
    .filter((item) => item.slot_id && activities.find((a) => a.id === item.product_id)?.requiresBooking)
    .map((item) => ({
      order_item_id: item.id,
      slot_id: item.slot_id,
      customer_id: userId,
    }));
  if (bookingRows.length > 0) {
    const { error: bookingErr } = await supabase.from("bookings").insert(bookingRows);
    if (bookingErr) throw bookingErr;
  }

  if (appliedVoucherCode && voucher) {
    const { data: redeemed, error: redemptionError } = await supabase.rpc("redeem_voucher", {
      p_voucher_id: voucher.id,
      p_order_id: orderRow.id,
      p_user_id: userId,
      p_discount: totals.discount,
    });
    if (redemptionError || redeemed !== true) throw new Error("This voucher is no longer available.");
  }

  if (selectedKeys) await clearCartItems(userId, selectedKeys);
  else await clearCart(userId);
  emit("order.paid", { orderId: orderRow.id, userId, total: totals.total });

  return {
    id: orderRow.id,
    userId,
    items: cart.map((c) => {
      const activity = activities.find((a) => a.id === c.activityId)!;
      const variant = activity.variants.find((v) => v.id === c.variantId);
      const lineUnitPrice = c.priceOverride ?? unitPrice(activity, c.variantId, c.qty, new Date(), cartProductIds);
      return {
        activityId: activity.id,
        activityName: activity.name,
        imageUrl: activity.image || undefined,
        variantLabel: variant?.label ?? "Standard",
        unitPrice: lineUnitPrice,
        qty: c.qty,
        outletId: activity.outletId,
      };
    }),
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    voucherCode: appliedVoucherCode,
    status: "PAID",
    createdAt: orderRow.created_at,
    paymentMethod,
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

type WalletTransactionRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  order_id: string | null;
  withdrawal_id: string | null;
  type: string;
  amount_sen: number;
  bucket: string;
  direction: WalletTransaction["direction"];
  note: string | null;
  created_at: string;
};

const WALLET_TRANSACTION_SELECT = "id,user_id,wallet_id,order_id,withdrawal_id,type,amount_sen,bucket,direction,note,created_at";

function mapWalletTransaction(row: WalletTransactionRow): WalletTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    orderId: row.order_id,
    withdrawalId: row.withdrawal_id,
    type: row.type,
    amount: Number(row.amount_sen) / 100,
    bucket: row.bucket,
    direction: row.direction,
    note: row.note,
    createdAt: row.created_at,
  };
}

export async function getWalletTransactions(userId: string, limit = 100): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select(WALLET_TRANSACTION_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as WalletTransactionRow[]).map(mapWalletTransaction);
}

export async function getCustomerWalletTransactionPage(userId: string, filters: CustomerHistoryFilters): Promise<{ transactions: WalletTransaction[]; total: number }> {
  const filter = buildCustomerHistoryQuery(filters);
  if (!userId.trim() || !filter.ok) throw new Error("Invalid customer history query");
  let query = supabase.from("wallet_transactions")
    .select(WALLET_TRANSACTION_SELECT, { count: "exact" })
    .eq("user_id", userId)
    // Settlement audit entries duplicate the customer-facing reservation debit.
    .neq("type", "withdrawal_complete");
  if (filter.types) query = query.in("type", filter.types);
  if (filter.direction) query = query.eq("direction", filter.direction);
  if (filter.fromInclusive) query = query.gte("created_at", filter.fromInclusive);
  if (filter.toExclusive) query = query.lt("created_at", filter.toExclusive);
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(filter.offset, filter.offset + filter.pageSize - 1);
  if (error) throw error;
  return { transactions: (data as unknown as WalletTransactionRow[]).map(mapWalletTransaction), total: count ?? 0 };
}

export async function requestWithdrawal(userId: string, amount: number): Promise<WithdrawalRequest> {
  const { data: rpcData, error: rpcErr } = await supabase.rpc("debit_withdrawal", {
    p_user_id:   userId,
    p_amount_rm: amount,
  });
  if (rpcErr) {
    const msg = rpcErr.message;
    if (msg.includes('below_min_withdrawal'))      throw new Error('Amount is below the minimum withdrawal threshold.');
    if (msg.includes('pending_withdrawal_exists')) throw new Error('You already have a pending withdrawal. Please wait for it to be processed.');
    if (msg.includes('insufficient_earnings'))     throw new Error('Insufficient earnings balance.');
    throw rpcErr;
  }
  const requestId = (rpcData as { request_id: string }).request_id;
  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select(WITHDRAWAL_SELECT)
    .eq("id", requestId)
    .single();
  if (error) throw error;
  if (typeof window !== "undefined") {
    void fetch("/api/withdrawals/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ withdrawal_id: requestId }),
    }).catch((emailError) => console.error("[withdrawal-email] notification request failed:", emailError));
  }
  return mapWithdrawal(data as unknown as WithdrawalRow);
}

export async function getWalletBuckets(userId: string): Promise<{ topup: number; earnings: number; pendingEarnings: number }> {
  const { data } = await supabase
    .from("wallets")
    .select("topup_sen,earnings_sen,pending_earnings_sen")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { topup: 0, earnings: 0, pendingEarnings: 0 };
  const row = data as { topup_sen: number; earnings_sen: number; pending_earnings_sen?: number | null };
  return { topup: row.topup_sen / 100, earnings: row.earnings_sen / 100, pendingEarnings: (row.pending_earnings_sen ?? 0) / 100 };
}

export async function getWalletBalance(userId: string): Promise<number> {
  const { topup, earnings } = await getWalletBuckets(userId);
  return topup + earnings;
}

export async function getConnectStatus(userId: string): Promise<{
  accountId: string | null;
  payoutsEnabled: boolean;
  tier: string;
}> {
  const { data } = await supabase
    .from("users")
    .select("stripe_connect_account_id, stripe_payouts_enabled, tier")
    .eq("id", userId)
    .maybeSingle();
  const row = data as {
    stripe_connect_account_id: string | null;
    stripe_payouts_enabled: boolean;
    tier: string;
  } | null;
  return {
    accountId:      row?.stripe_connect_account_id ?? null,
    payoutsEnabled: row?.stripe_payouts_enabled    ?? false,
    tier:           row?.tier                      ?? "email_unverified",
  };
}

export async function reviewWithdrawal(id: string, status: "approved" | "rejected"): Promise<void> {
  const { error } = await supabase.from("withdrawal_requests").update({ status }).eq("id", id);
  if (error) throw error;
  emit("withdrawal.reviewed", { id, status });
}
