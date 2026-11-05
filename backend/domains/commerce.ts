import { WITHDRAWAL_IN_PROGRESS_STATUSES } from "@/lib/wallet/withdrawal-display";
import type { SupabaseClient } from "@supabase/supabase-js";
// Owner: Member 2/4 (Cart/Order/Booking/Wallet)
import { supabase } from "@/backend/supabase";
import { assertCartItemHasBackingRecord, canMergeCartItemLines, cartItemKey, cartTotals, unitPrice } from "@/backend/core/helpers";
import { emit } from "@/backend/core/events";
import { getActivities, getVoucherByCode } from "./catalogue";
import type { PaymentMethod } from "@/lib/constants";
import type { Booking, CartItem, LegacyStayBookingDetails, Order, OrderItem, StayBookingDetails, WalletTransaction, WithdrawalRequest } from "@/backend/core/types";
import { buildCustomerHistoryQuery, type CustomerHistoryFilters } from "@/lib/wallet/customer-transaction-filters";
import { stayBookingDetailsSchema } from "@/lib/validation/schemas";


// ─── Supabase cart ──────────────────────────────────────────────────────────
type CartItemRow = {
  id: string;
  stay_details?: StayBookingDetails | null;
  variant_id: string | null;
  slot_id: string | null;
  outlet_id: string | null;
  quantity: number;
  nights?: number | null;
  unit_price: number;
  product_variants: { product_id: string } | { product_id: string }[] | null;
  booking_slots: { product_id: string } | { product_id: string }[] | null;
};

const CART_ITEM_SELECT = "id,variant_id,slot_id,outlet_id,quantity,nights,unit_price,stay_details,product_variants(product_id),booking_slots(product_id)";

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
  const { data, error } = await supabase
    .from("cart_items")
    .select(CART_ITEM_SELECT)
    .eq("cart_id", cart.id)
    .order("last_added_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as CartItemRow[]).filter((row) =>
    Boolean(relation(row.product_variants)?.product_id ?? relation(row.booking_slots)?.product_id),
  );
}

export function mapCartItem(row: CartItemRow): CartItem {
  const productId = relation(row.product_variants)?.product_id ?? relation(row.booking_slots)?.product_id;
  return { cartItemId: row.id, activityId: productId ?? "", variantId: row.variant_id ?? "", slotId: row.slot_id ?? undefined, outletId: row.outlet_id ?? undefined, qty: row.quantity, nights: row.nights ?? 1, priceOverride: row.unit_price > 0 ? Number(row.unit_price) : undefined, stayDetails: row.stay_details ?? null };
}

export async function getCart(userId: string): Promise<CartItem[]> {
  return (await getCartRows(userId)).map(mapCartItem).filter((item) => item.activityId);
}

export async function addToCart(userId: string, item: CartItem): Promise<{ items: CartItem[]; cartItemId: string }> {
  assertCartItemHasBackingRecord(item);
  const parsedDetails = item.stayDetails ? stayBookingDetailsSchema.parse(item.stayDetails) : null;
  const { data: product, error: productError } = await supabase.from("products").select("id,categories(slug)").eq("id", item.activityId).maybeSingle();
  if (productError) throw productError;
  if (!product) throw new Error("cart_product_unavailable");
  const category = relation(product.categories as { slug: string } | { slug: string }[] | null)?.slug;
  if ((category === "accommodation") !== Boolean(parsedDetails)) throw new Error("stay_guest_details_required");
  const validatedItem = { ...item, stayDetails: parsedDetails };
  const cart = await getOrCreateCart(userId);
  const rows = await getCartRows(userId);
  // The outlet is part of the line's identity: the same variant bought from two
  // outlets must stay two lines (different price and stock).
  const existing = rows.find((row) => canMergeCartItemLines(mapCartItem(row), validatedItem));
  if (existing) {
    const { error } = await supabase
      .from("cart_items")
      .update({
        quantity: existing.quantity + item.qty,
        last_added_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("cart_items").insert({ cart_id: cart.id, variant_id: item.variantId || null, slot_id: item.slotId ?? null, outlet_id: item.outletId ?? null, quantity: item.qty, nights: item.nights ?? 1, unit_price: item.priceOverride ?? 0, stay_details: parsedDetails });
    if (error) throw error;
  }
  const items = await getCart(userId);
  const savedLine = items.find((candidate) => canMergeCartItemLines(candidate, validatedItem));
  if (!savedLine?.cartItemId) throw new Error("cart_line_not_saved");
  return { items, cartItemId: savedLine.cartItemId };
}

export async function updateCartStayDetails(userId: string, cartItemId: string, input: StayBookingDetails): Promise<CartItem[]> {
  const details = stayBookingDetailsSchema.parse(input);
  const cart = await getOrCreateCart(userId);
  const { data: row, error: rowError } = await supabase.from("cart_items")
    .select("id,variant_id,slot_id,product_variants(product_id),booking_slots(product_id)")
    .eq("cart_id", cart.id).eq("id", cartItemId).maybeSingle();
  if (rowError) throw rowError;
  if (!row) throw new Error("cart_item_not_found");
  const productId = relation(row.product_variants as { product_id: string } | { product_id: string }[] | null)?.product_id
    ?? relation(row.booking_slots as { product_id: string } | { product_id: string }[] | null)?.product_id;
  if (!productId) throw new Error("cart_item_not_found");
  const { data: product, error: productError } = await supabase.from("products").select("id,categories(slug)").eq("id", productId).maybeSingle();
  if (productError) throw productError;
  if (relation(product?.categories as { slug: string } | { slug: string }[] | null)?.slug !== "accommodation") {
    throw new Error("stay_details_not_allowed");
  }
  const { data: updated, error: updateError } = await supabase.from("cart_items").update({ stay_details: details }).eq("cart_id", cart.id).eq("id", cartItemId).select("id").maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error("cart_item_not_found");
  return getCart(userId);
}

export async function updateCartQty(userId: string, cartItemId: string, qty: number): Promise<CartItem[]> {
  const cart = await getOrCreateCart(userId);
  const { error } = qty <= 0
    ? await supabase.from("cart_items").delete().eq("id", cartItemId).eq("cart_id", cart.id)
    : await supabase.from("cart_items").update({ quantity: qty }).eq("id", cartItemId).eq("cart_id", cart.id);
  if (error) throw error;
  return getCart(userId);
}

export async function removeFromCart(userId: string, cartItemId: string): Promise<CartItem[]> {
  return updateCartQty(userId, cartItemId, 0);
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
  nights?: number | null;
  unit_price: number;
  quantity: number;
  stay_details?: StayBookingDetails | null;
  /** null for event reservations, which are collected at an event location. */
  outlet_id: string | null;
  products?: { cover_url: string | null; categories?: { slug: string } | null } | null;
};

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    activityId: row.product_id ?? "",
    activityName: row.product_name,
    imageUrl: row.image_url ?? row.products?.cover_url ?? undefined,
    variantLabel: row.variant_name ?? (row.slot_starts_at ? "" : "Standard"),
    slotStartsAt: row.slot_starts_at ?? undefined,
    nights: row.nights ?? 1,
    stayDetails: row.stay_details ?? undefined,
    categorySlug: row.products?.categories?.slug,
    unitPrice: Number(row.unit_price),
    qty: row.quantity,
    outletId: row.outlet_id ?? "",
  };
}

type OrderRow = {
  id: string;
  display_id?: string | null;
  user_id: string | null;
  contact_email?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  stay_details?: LegacyStayBookingDetails | null;
  status: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string | null;
  voucher_code: string | null;
  created_at: string;
  order_items: OrderItemRow[];
};

export const ORDER_SELECT =
  "id,display_id,user_id,contact_email,contact_name,contact_phone,stay_details,status,subtotal,discount_amount,total_amount,payment_method,voucher_code,created_at,order_items(product_id,product_name,image_url,variant_name,slot_starts_at,nights,stay_details,unit_price,quantity,outlet_id,products(cover_url,categories(slug)))";

export function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    displayId: row.display_id ?? null,
    userId: row.user_id,
    contact: { email: row.contact_email ?? null, name: row.contact_name ?? null, phone: row.contact_phone ?? null },
    stayDetails: row.stay_details && Object.keys(row.stay_details).length > 0 ? row.stay_details : undefined,
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
  const pageSize = 1000;
  const orders: Order[] = [];
  const seenOrderIds = new Set<string>();
  let cursor: Pick<OrderRow, "created_at" | "id"> | undefined;

  while (true) {
    let query = supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (cursor) {
      query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    }

    const { data, error } = await query.range(0, pageSize - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as OrderRow[];
    for (const row of rows) {
      if (seenOrderIds.has(row.id)) continue;
      seenOrderIds.add(row.id);
      orders.push(mapOrder(row));
    }

    const lastRow = rows.at(-1);
    if (!lastRow || rows.length < pageSize) break;
    if (cursor?.created_at === lastRow.created_at && cursor.id === lastRow.id) {
      throw new Error("Customer order pagination did not advance past its previous cursor.");
    }
    cursor = { created_at: lastRow.created_at, id: lastRow.id };
  }

  return orders;
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
  valid_from?: string | null;
  valid_until?: string | null;
};

type BookingRow = {
  id: string;
  status: Booking["status"];
  order_items: { order_id: string; product_id: string | null; product_name: string; outlet_id: string; slot_starts_at: string | null; nights?: number | null; quantity: number; products?: { categories?: { slug: string } | null } | null };
  ticket_passes?: TicketPassRow | TicketPassRow[] | null;
};

export function mapBooking(row: BookingRow): Booking | null {
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
    nights: row.order_items.nights ?? 1,
    categorySlug: row.order_items.products?.categories?.slug,
    qty: row.order_items.quantity,
    status: row.status,
    qrCode: row.id,
    passToken,
    policy: pass?.policy,
    entryLimit: pass?.entry_limit,
    entriesUsed: pass?.entries_used,
    validFrom: pass?.valid_from ?? undefined,
    validUntil: pass?.valid_until ?? undefined,
  };
}

export const BOOKING_SELECT = "id,status,order_items!inner(order_id,product_id,product_name,outlet_id,slot_starts_at,nights,quantity,products(categories(slug))),ticket_passes(id,policy,entry_limit,entries_used,status,valid_from,valid_until)";
const SETTLED_BOOKING_SELECT = "id,status,order_items!inner(order_id,product_id,product_name,outlet_id,slot_starts_at,nights,quantity,products(categories(slug)),orders!inner(status)),ticket_passes(id,policy,entry_limit,entries_used,status,valid_from,valid_until)";

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

/** My Activity only shows bookings backed by a settled customer order. */
export async function getSettledBookingsForUser(userId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(SETTLED_BOOKING_SELECT)
    .eq("customer_id", userId)
    .in("order_items.orders.status", ["paid", "completed"])
    .order("created_at", { ascending: true });
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

export type WithdrawalHistoryCursor = { createdAt: string; id: string };
export type WithdrawalHistoryPage = {
  requests: WithdrawalRequest[];
  pageSize: 25;
  totalCount: number | null;
  hasMore: boolean;
  nextCursor: WithdrawalHistoryCursor | null;
};

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

export async function getMyWithdrawals(userId: string, signal?: AbortSignal): Promise<WithdrawalRequest[]> {
  let query = supabase.from("withdrawal_requests").select(WITHDRAWAL_SELECT).eq("user_id", userId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as WithdrawalRow[]).map(mapWithdrawal);
}

export async function getMyActiveWithdrawals(userId: string, signal?: AbortSignal): Promise<WithdrawalRequest[]> {
  let query = supabase.from("withdrawal_requests").select(WITHDRAWAL_SELECT).eq("user_id", userId)
    .in("status", [...WITHDRAWAL_IN_PROGRESS_STATUSES])
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(10);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as WithdrawalRow[]).map(mapWithdrawal);
}

export async function getMyWithdrawalById(userId: string, requestId: string, signal?: AbortSignal): Promise<WithdrawalRequest | null> {
  let query = supabase.from("withdrawal_requests").select(WITHDRAWAL_SELECT).eq("user_id", userId).eq("id", requestId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapWithdrawal(data as unknown as WithdrawalRow) : null;
}

export async function getMyWithdrawalHistoryPage(
  service: SupabaseClient,
  userId: string,
  query: { pageSize: 25; cursor: WithdrawalHistoryCursor | null },
): Promise<WithdrawalHistoryPage> {
  let request = service.from("withdrawal_requests")
    .select(WITHDRAWAL_SELECT, query.cursor ? {} : { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.pageSize + 1);

  if (query.cursor) {
    request = request.or(
      `created_at.lt.${query.cursor.createdAt},and(created_at.eq.${query.cursor.createdAt},id.lt.${query.cursor.id})`,
    );
  }

  const { data, error, count } = await request;
  if (error) throw error;

  const rows = (data ?? []) as unknown as WithdrawalRow[];
  const hasMore = rows.length > query.pageSize;
  const pageRows = rows.slice(0, query.pageSize);
  const lastRow = pageRows.at(-1);
  return {
    requests: pageRows.map(mapWithdrawal),
    pageSize: query.pageSize,
    totalCount: query.cursor ? null : count ?? 0,
    hasMore,
    nextCursor: hasMore && lastRow ? { createdAt: lastRow.created_at, id: lastRow.id } : null,
  };
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

type ExternalPurchaseRow = {
  id: string;
  user_id: string;
  status: string;
  total_amount: number;
  payment_method: string | null;
  created_at: string;
};

type ExternalRefundRow = {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  processed_at: string | null;
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

function mapExternalPurchase(row: ExternalPurchaseRow): WalletTransaction {
  return {
    id: `order:${row.id}`,
    userId: row.user_id,
    walletId: null,
    orderId: row.id,
    withdrawalId: null,
    type: "spend",
    amount: Number(row.total_amount),
    bucket: "external",
    direction: "debit",
    note: row.payment_method ? `Paid with ${row.payment_method}` : "External purchase",
    createdAt: row.created_at,
  };
}

function mapExternalRefund(row: ExternalRefundRow, userId: string): WalletTransaction {
  return {
    id: `refund:${row.id}`,
    userId,
    walletId: null,
    orderId: row.order_id,
    withdrawalId: null,
    type: "refund",
    amount: Number(row.amount),
    bucket: "external",
    direction: "credit",
    note: "External purchase refund",
    createdAt: row.processed_at ?? row.created_at,
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

export async function getCustomerWalletTransactionPage(
  userId: string,
  filters: CustomerHistoryFilters,
  signal?: AbortSignal,
): Promise<{ transactions: WalletTransaction[]; total: number }> {
  const filter = buildCustomerHistoryQuery(filters);
  if (!userId.trim() || !filter.ok) throw new Error("Invalid customer history query");
  const fetchLimit = filter.offset + filter.pageSize;
  let walletQuery = supabase.from("wallet_transactions")
    .select(WALLET_TRANSACTION_SELECT, { count: "exact" })
    .eq("user_id", userId)
    // Settlement audit entries duplicate the customer-facing reservation debit.
    .neq("type", "withdrawal_complete");
  if (filter.types) walletQuery = walletQuery.in("type", filter.types);
  if (filter.direction) walletQuery = walletQuery.eq("direction", filter.direction);
  if (filter.fromInclusive) walletQuery = walletQuery.gte("created_at", filter.fromInclusive);
  if (filter.toExclusive) walletQuery = walletQuery.lt("created_at", filter.toExclusive);
  let walletPromise = walletQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, fetchLimit - 1);
  if (signal) walletPromise = walletPromise.abortSignal(signal);

  const includeExternalPurchases = (!filter.types || filter.types.includes("spend"))
    && (!filter.direction || filter.direction === "debit");
  const purchasePromise = includeExternalPurchases
    ? (() => {
        let query = supabase.from("orders")
          .select("id,user_id,status,total_amount,payment_method,created_at", { count: "exact" })
          .eq("user_id", userId)
          .in("status", ["paid", "completed", "refunded"])
          .not("payment_method", "in", "(wallet,wallet_split)");
        if (filter.fromInclusive) query = query.gte("created_at", filter.fromInclusive);
        if (filter.toExclusive) query = query.lt("created_at", filter.toExclusive);
        let purchaseQuery = query
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(0, fetchLimit - 1);
        if (signal) purchaseQuery = purchaseQuery.abortSignal(signal);
        return purchaseQuery;
      })()
    : Promise.resolve({ data: [], error: null, count: 0 });

  const includeExternalRefunds = (!filter.types || filter.types.includes("refund"))
    && (!filter.direction || filter.direction === "credit");
  const refundPromise = includeExternalRefunds
    ? (() => {
        let query = supabase.from("refunds")
          .select("id,order_id,amount,status,processed_at,created_at,orders!inner(user_id,payment_method)", { count: "exact" })
          .eq("status", "processed")
          .eq("orders.user_id", userId)
          .not("orders.payment_method", "in", "(wallet,wallet_split)");
        if (filter.fromInclusive) query = query.gte("processed_at", filter.fromInclusive);
        if (filter.toExclusive) query = query.lt("processed_at", filter.toExclusive);
        let refundQuery = query
          .order("processed_at", { ascending: false })
          .order("id", { ascending: false })
          .range(0, fetchLimit - 1);
        if (signal) refundQuery = refundQuery.abortSignal(signal);
        return refundQuery;
      })()
    : Promise.resolve({ data: [], error: null, count: 0 });

  const [walletResult, purchaseResult, refundResult] = await Promise.all([
    walletPromise,
    purchasePromise,
    refundPromise,
  ]);
  if (walletResult.error) throw walletResult.error;
  if (purchaseResult.error) throw purchaseResult.error;
  if (refundResult.error) throw refundResult.error;

  const transactions = [
    ...(walletResult.data as unknown as WalletTransactionRow[]).map(mapWalletTransaction),
    ...(purchaseResult.data as unknown as ExternalPurchaseRow[]).map(mapExternalPurchase),
    ...(refundResult.data as unknown as ExternalRefundRow[]).map((row) => mapExternalRefund(row, userId)),
  ].sort((left, right) =>
    Date.parse(right.createdAt) - Date.parse(left.createdAt)
      || right.id.localeCompare(left.id),
  );

  return {
    transactions: transactions.slice(filter.offset, filter.offset + filter.pageSize),
    total: (walletResult.count ?? 0) + (purchaseResult.count ?? 0) + (refundResult.count ?? 0),
  };
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
