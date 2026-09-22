import { apiFail, apiOk } from "@/lib/validation/schemas";
import { createClient } from "@/lib/supabase/server";
import { signTicketPassToken } from "@/lib/tickets/tokens";
import { signFoodFulfilmentToken } from "@/lib/food/food-fulfilment-token";

interface Props { params: Promise<{ orderId: string }> }

const PAID_ORDER_STATES = new Set(["paid", "completed"]);

type TicketPassProjection = {
  id: string;
  policy: "single_entry" | "multi_entry" | "group_entry";
  entry_limit: number;
  entries_used: number;
  status: string;
  valid_from: string | null;
  valid_until: string | null;
};

function isMissingFoodFulfilmentColumn(error: { code?: string; message?: string } | null) {
  return error?.code === "42703" && (
    error.message?.includes("order_items.food_fulfilment_mode") === true
    || error.message?.includes("order_items.food_qr_scanned_at") === true
  );
}

export async function GET(_request: Request, { params }: Props) {
  const { orderId } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail("UNAUTHORIZED", "Sign in to view order passes", 401);

  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id,status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (orderError) return apiFail("DB_ERROR", orderError.message, 500);
  if (!order) return apiFail("NOT_FOUND", "Order not found", 404);
  if (!PAID_ORDER_STATES.has(String(order.status).toLowerCase())) {
    return apiFail("ORDER_NOT_PAID", "Pass codes become available after payment is complete", 409);
  }

  const { data: bookings, error: bookingError } = await db
    .from("bookings")
    .select("id,order_items!inner(outlet_id),ticket_passes(id,policy,entry_limit,entries_used,status,valid_from,valid_until)")
    .eq("order_items.order_id", orderId);
  if (bookingError) return apiFail("DB_ERROR", bookingError.message, 500);

  const tickets = (bookings ?? []).flatMap((booking: {
    id: string;
    order_items: { outlet_id: string } | { outlet_id: string }[] | null;
    ticket_passes: TicketPassProjection | TicketPassProjection[] | null;
  }) => {
    const item = Array.isArray(booking.order_items) ? booking.order_items[0] : booking.order_items;
    const pass = Array.isArray(booking.ticket_passes) ? booking.ticket_passes[0] : booking.ticket_passes;
    if (!item?.outlet_id || !pass?.id) return [];
    const passToken = signTicketPassToken({
      passId: pass.id,
      bookingId: booking.id,
      outletId: item.outlet_id,
      policy: pass.policy,
      entryLimit: pass.entry_limit,
      issuedAt: Date.now(),
      ...(pass.valid_until ? { exp: Math.floor(new Date(pass.valid_until).getTime() / 1000) } : {}),
    });
    return [{
      bookingId: booking.id,
      passToken,
      policy: pass.policy,
      entryLimit: pass.entry_limit,
      entriesUsed: pass.entries_used,
      status: pass.status,
      validFrom: pass.valid_from,
      validUntil: pass.valid_until,
    }];
  });

  const { data: orderItems, error: itemError } = await db
    .from("order_items")
    .select("id,outlet_id,product_name,variant_name,quantity,food_fulfilment_mode,food_qr_scanned_at,fulfil_status,products(categories(slug)),outlets(name)")
    .eq("order_id", orderId);
  if (isMissingFoodFulfilmentColumn(itemError)) {
    // Ticket QR passes are independent of the optional food fulfilment schema.
    // Keep them available while an environment is waiting for that migration.
    return apiOk({ tickets, foodOrders: [] });
  }
  if (itemError) return apiFail("DB_ERROR", itemError.message, 500);

  const foodGroups = new Map<string, {
    outletId: string;
    outletName: string;
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
    products: { categories: { slug: string } | { slug: string }[] | null } | { categories: { slug: string } | { slug: string }[] | null }[] | null;
    outlets: { name: string } | { name: string }[] | null;
  }>) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
    if (category?.slug !== "food" || !row.outlet_id || !row.food_fulfilment_mode || row.fulfil_status === "cancelled") continue;
    const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
    let group = foodGroups.get(row.outlet_id);
    if (!group) {
      group = { outletId: row.outlet_id, outletName: outlet?.name ?? "Outlet", mode: row.food_fulfilment_mode, allFulfilled: true, allScanned: true, items: [] };
      foodGroups.set(row.outlet_id, group);
    }
    if (group.mode !== row.food_fulfilment_mode) return apiFail("FOOD_ORDER_INCONSISTENT", "Food items at one outlet have inconsistent service modes", 409);
    if (row.fulfil_status !== "fulfilled") group.allFulfilled = false;
    if (!row.food_qr_scanned_at) group.allScanned = false;
    group.items.push({ name: row.product_name, variant: row.variant_name, quantity: row.quantity });
  }

  const foodOrders = [...foodGroups.values()].map(({ allFulfilled, allScanned, ...group }) => ({
    ...group,
    status: allFulfilled ? "fulfilled" : group.mode === "dine_in" && allScanned ? "checked_in" : "pending",
    foodToken: signFoodFulfilmentToken({ orderId, outletId: group.outletId, issuedAt: Date.now() }),
  }));
  return apiOk({ tickets, foodOrders });
}
