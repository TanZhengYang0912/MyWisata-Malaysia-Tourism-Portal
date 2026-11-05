import type { SupabaseClient } from "@supabase/supabase-js";
import { signEventPickupToken } from "@/lib/events/event-pickup-token";
import { signFoodFulfilmentToken } from "@/lib/food/food-fulfilment-token";
import { signRetailPickupToken } from "@/lib/orders/retail-pickup-token";

type FoodOrderPass = {
  outletId: string;
  outletName: string;
  vendorName: string;
  mode: "dine_in" | "takeaway";
  status: "pending" | "checked_in" | "fulfilled";
  items: { name: string; variant: string | null; quantity: number }[];
  foodToken: string;
};

type EventPickupPass = {
  vendorName: string;
  pickupDate: string;
  pickupLabels: string[];
  status: "pending" | "collected";
  items: { name: string; quantity: number }[];
  eventToken: string;
};

type RetailPickupPass = {
  orderItemId: string;
  vendorName: string;
  outletName: string;
  status: "pending" | "collected" | "legacy_completed" | "refund_paused" | "unavailable";
  quantity: number;
  name: string;
  variant: string | null;
  retailToken: string | null;
};

export class OrderPickupPassError extends Error {
  constructor(readonly code: "DB_ERROR" | "MERCHANT_IDENTITY_UNAVAILABLE" | "FOOD_ORDER_INCONSISTENT", message: string) {
    super(message);
    this.name = "OrderPickupPassError";
  }
}

function isMissingFoodFulfilmentColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" && (
    error.message?.includes("order_items.food_fulfilment_mode") === true
    || error.message?.includes("order_items.food_qr_scanned_at") === true
    || error.message?.includes("order_items.retail_qr_scanned_at") === true
  );
}

type EventPickupRow = {
  vendor_id: string;
  event_location_id: string;
  pickup_date: string;
  pickup_slot_id: string | null;
  slot_starts_at: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  fulfil_status: string;
  vendors: { name: string } | { name: string }[] | null;
};

async function loadEventPickups(db: SupabaseClient, orderId: string): Promise<EventPickupPass[]> {
  const { data, error } = await db
    .from("order_items")
    .select("vendor_id,event_location_id,pickup_date,pickup_slot_id,slot_starts_at,product_name,variant_name,quantity,fulfil_status,vendors(name)")
    .eq("order_id", orderId);
  if (error) throw new OrderPickupPassError("DB_ERROR", "Unable to load event pickup passes");
  const rows = ((data ?? []) as EventPickupRow[]).filter((row) => row.event_location_id && row.pickup_date && row.fulfil_status !== "cancelled");
  const dateGroups = new Map<string, EventPickupRow[]>();
  for (const row of rows) {
    const dateKey = `${row.vendor_id}:${row.event_location_id}:${row.pickup_date}`;
    const group = dateGroups.get(dateKey) ?? [];
    group.push(row);
    dateGroups.set(dateKey, group);
  }
  const groups = new Map<string, {
    vendorName: string;
    pickupDate: string;
    pickupLabels: string[];
    allFulfilled: boolean;
    items: { name: string; quantity: number }[];
    token: string;
  }>();
  for (const dateRows of dateGroups.values()) {
    const allRowsHaveSlot = dateRows.every((row) => Boolean(row.pickup_slot_id && row.slot_starts_at && Number.isFinite(new Date(row.slot_starts_at).getTime())));
    const slotGroups = new Map<string, EventPickupRow[]>();
    for (const row of dateRows) {
      const key = allRowsHaveSlot ? (row.pickup_slot_id as string) : "legacy-date";
      const group = slotGroups.get(key) ?? [];
      group.push(row);
      slotGroups.set(key, group);
    }
    for (const [slotKey, slotRows] of slotGroups) {
      const row = slotRows[0];
      const key = `${row.vendor_id}:${row.event_location_id}:${row.pickup_date}:${slotKey}`;
      let group = groups.get(key);
      if (!group) {
        const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
        group = {
          vendorName: vendor?.name ?? "",
          pickupDate: row.pickup_date,
          pickupLabels: [],
          allFulfilled: true,
          items: [],
          token: signEventPickupToken({
            orderId,
            vendorId: row.vendor_id,
            locationId: row.event_location_id,
            pickupDate: row.pickup_date,
            ...(allRowsHaveSlot ? { pickupSlotId: row.pickup_slot_id as string } : {}),
            issuedAt: Date.now(),
          }),
        };
        groups.set(key, group);
      }
      for (const slotRow of slotRows) {
        if (slotRow.variant_name && !group.pickupLabels.includes(slotRow.variant_name)) group.pickupLabels.push(slotRow.variant_name);
        if (slotRow.fulfil_status !== "fulfilled") group.allFulfilled = false;
        group.items.push({ name: slotRow.product_name, quantity: slotRow.quantity });
      }
    }
  }
  return [...groups.values()].map(({ allFulfilled, token, ...group }) => ({
    ...group,
    status: allFulfilled ? "collected" : "pending",
    eventToken: token,
  }));
}

export async function loadOrderPickupPasses(db: SupabaseClient, orderId: string): Promise<{ foodOrders: FoodOrderPass[]; eventPickups: EventPickupPass[]; retailPickups: RetailPickupPass[] }> {
  const { data: orderItems, error } = await db
    .from("order_items")
    .select("id,vendor_id,outlet_id,product_name,variant_name,quantity,food_fulfilment_mode,food_qr_scanned_at,retail_qr_scanned_at,fulfil_status,event_location_id,event_listing_id,slot_starts_at,products(requires_booking,product_type,categories(slug)),outlets(id,name,status,vendor_id,vendors(id,name,status))")
    .eq("order_id", orderId);
  if (isMissingFoodFulfilmentColumn(error)) {
    return { foodOrders: [], eventPickups: await loadEventPickups(db, orderId), retailPickups: [] };
  }
  if (error) throw new OrderPickupPassError("DB_ERROR", error.message);

  const foodGroups = new Map<string, {
    outletId: string;
    outletName: string;
    vendorName: string;
    mode: "dine_in" | "takeaway";
    allFulfilled: boolean;
    allScanned: boolean;
    items: { name: string; variant: string | null; quantity: number }[];
  }>();
  for (const row of (orderItems ?? []) as Array<{
    outlet_id: string | null;
    product_name: string;
    variant_name: string | null;
    quantity: number;
    food_fulfilment_mode: "dine_in" | "takeaway" | null;
    food_qr_scanned_at: string | null;
    fulfil_status: string;
    products: { requires_booking: boolean | null; product_type: string | null; categories: { slug: string } | { slug: string }[] | null } | { requires_booking: boolean | null; product_type: string | null; categories: { slug: string } | { slug: string }[] | null }[] | null;
    vendor_id: string;
    retail_qr_scanned_at: string | null;
    event_location_id: string | null;
    event_listing_id: string | null;
    slot_starts_at: string | null;
    outlets: { id: string; name: string; status: string; vendor_id: string; vendors: { id: string; name: string; status: string } | { id: string; name: string; status: string }[] | null } | { id: string; name: string; status: string; vendor_id: string; vendors: { id: string; name: string; status: string } | { id: string; name: string; status: string }[] | null }[] | null;
  }>) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
    if (category?.slug !== "food" || !row.outlet_id || !row.food_fulfilment_mode || row.fulfil_status === "cancelled") continue;
    const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
    const vendor = Array.isArray(outlet?.vendors) ? outlet.vendors[0] : outlet?.vendors;
    if (!outlet?.name || !vendor?.name || outlet.id !== row.outlet_id || outlet.vendor_id !== row.vendor_id || vendor.id !== row.vendor_id) {
      throw new OrderPickupPassError("MERCHANT_IDENTITY_UNAVAILABLE", "Food outlet merchant identity is unavailable");
    }
    let group = foodGroups.get(row.outlet_id);
    if (!group) {
      group = { outletId: row.outlet_id, outletName: outlet.name, vendorName: vendor.name, mode: row.food_fulfilment_mode, allFulfilled: true, allScanned: true, items: [] };
      foodGroups.set(row.outlet_id, group);
    }
    if (group.mode !== row.food_fulfilment_mode) throw new OrderPickupPassError("FOOD_ORDER_INCONSISTENT", "Food items at one outlet have inconsistent service modes");
    if (row.fulfil_status !== "fulfilled") group.allFulfilled = false;
    if (!row.food_qr_scanned_at) group.allScanned = false;
    group.items.push({ name: row.product_name, variant: row.variant_name, quantity: row.quantity });
  }

  const foodOrders = [...foodGroups.values()].map(({ allFulfilled, allScanned, ...group }) => ({
    ...group,
    status: allFulfilled ? "fulfilled" as const : group.mode === "dine_in" && allScanned ? "checked_in" as const : "pending" as const,
    foodToken: signFoodFulfilmentToken({ orderId, outletId: group.outletId, issuedAt: Date.now() }),
  }));

  const retailRows = ((orderItems ?? []) as Array<{
    id: string; vendor_id: string; outlet_id: string | null; product_name: string; variant_name: string | null; quantity: number;
    retail_qr_scanned_at: string | null; fulfil_status: string; event_location_id: string | null; event_listing_id: string | null; slot_starts_at: string | null;
    products: { requires_booking: boolean | null; product_type: string | null; categories: { slug: string } | { slug: string }[] | null } | { requires_booking: boolean | null; product_type: string | null; categories: { slug: string } | { slug: string }[] | null }[] | null;
    outlets: { id: string; name: string; status: string; vendor_id: string; vendors: { id: string; name: string; status: string } | { id: string; name: string; status: string }[] | null } | { id: string; name: string; status: string; vendor_id: string; vendors: { id: string; name: string; status: string } | { id: string; name: string; status: string }[] | null }[] | null;
  }>).filter((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
    return category?.slug === "retail" && product?.requires_booking === false && product.product_type === "product"
      && !row.event_location_id && !row.event_listing_id && !row.slot_starts_at && row.fulfil_status !== "cancelled";
  });
  let refunds: Array<{ status: string; provider_refund_id: string | null; provider_failure_code: string | null; provider_failure_message: string | null }> = [];
  if (retailRows.length) {
    const { data, error: refundError } = await db.from("refunds")
      .select("status,provider_refund_id,provider_failure_code,provider_failure_message")
      .eq("order_id", orderId);
    if (refundError) throw new OrderPickupPassError("DB_ERROR", "Unable to verify refund status for retail pickup");
    refunds = (data ?? []) as typeof refunds;
  }
  const refundPaused = refunds.some((refund) => {
    const status = refund.status.toLowerCase();
    return ["pending", "approved", "processed"].includes(status)
      || !["failed", "rejected"].includes(status)
      || Boolean(refund.provider_refund_id || refund.provider_failure_code || refund.provider_failure_message);
  });
  const retailPickups: RetailPickupPass[] = retailRows.map((row) => {
    const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
    const vendor = Array.isArray(outlet?.vendors) ? outlet.vendors[0] : outlet?.vendors;
    if (!row.outlet_id || !outlet?.name || outlet.id !== row.outlet_id || outlet.vendor_id !== row.vendor_id
      || outlet.status !== "active" || vendor?.id !== row.vendor_id || vendor.status !== "approved") {
      throw new OrderPickupPassError("MERCHANT_IDENTITY_UNAVAILABLE", "Retail pickup merchant identity is unavailable");
    }
    const legacyCompleted = row.fulfil_status === "fulfilled" && !row.retail_qr_scanned_at;
    const status: RetailPickupPass["status"] = legacyCompleted
      ? "legacy_completed"
      : row.retail_qr_scanned_at || row.fulfil_status === "fulfilled"
        ? "collected"
        : refundPaused
          ? "refund_paused"
          : ["pending", "ready"].includes(row.fulfil_status)
            ? "pending"
            : "unavailable";
    const retailToken = status === "pending"
      ? signRetailPickupToken({ orderId, orderItemId: row.id, vendorId: row.vendor_id, outletId: row.outlet_id as string, issuedAt: Math.floor(Date.now() / 1000) })
      : null;
    return { orderItemId: row.id, vendorName: vendor?.name ?? "", outletName: outlet.name, status, quantity: row.quantity, name: row.product_name, variant: row.variant_name, retailToken };
  });
  return { foodOrders, eventPickups: await loadEventPickups(db, orderId), retailPickups };
}
