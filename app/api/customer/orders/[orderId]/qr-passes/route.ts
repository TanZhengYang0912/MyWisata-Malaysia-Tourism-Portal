import { guestPrivateResponse } from '@/lib/checkout/guest-session';
import { authorizeOrder } from '@/lib/checkout/order-access';
import { apiFail } from "@/lib/validation/schemas";
import { signTicketPassToken } from "@/lib/tickets/tokens";
import { isTicketEligibleProduct } from "@/lib/tickets/product-ticket-policy";
import { loadOrderPickupPasses, loadOrCreateEventPickupCodes, loadOrCreateFoodPickupCodes, loadOrCreateRetailPickupCodes, loadOrCreateTicketPickupCodes, OrderPickupPassError } from "@/lib/checkout/order-pickup-passes";
import { formatPickupCode } from "@/lib/pickup-code";
import { formatRetailPickupCode } from "@/lib/orders/retail-pickup-code";
import { createServiceClient } from "@/lib/supabase/service";

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

type TicketProductRelation = {
  requires_booking: boolean | null;
  product_places: { relation_type: string } | { relation_type: string }[] | null;
};

type TicketOutletRelation = {
  id: string;
  name: string;
  vendor_id: string;
  vendors: { id: string; name: string } | { id: string; name: string }[] | null;
};

type TicketOrderItemRelation = {
  outlet_id: string;
  vendor_id: string;
  products: TicketProductRelation | TicketProductRelation[] | null;
  outlets: TicketOutletRelation | TicketOutletRelation[] | null;
};

export async function GET(request: Request, { params }: Props) {
  const { orderId } = await params;
  const access = await authorizeOrder(request, orderId);
  if (!access) return apiFail("NOT_FOUND", "Order not found", 404);
  const db = access.db;
  const order = access.order;

  if (!order) return apiFail("NOT_FOUND", "Order not found", 404);
  if (!PAID_ORDER_STATES.has(String(order.status).toLowerCase())) {
    return apiFail("ORDER_NOT_PAID", "Pass codes become available after payment is complete", 409);
  }

  const { data: bookings, error: bookingError } = await db
    .from("bookings")
    .select("id,status,order_items!inner(outlet_id,vendor_id,products(requires_booking,product_places(relation_type)),outlets(id,name,vendor_id,vendors(id,name))),ticket_passes(id,policy,entry_limit,entries_used,status,valid_from,valid_until)")
    .eq("order_items.order_id", orderId);
  if (bookingError) return apiFail("DB_ERROR", bookingError.message, 500);

  let missingTicketIdentity = false;
  const tickets = (bookings ?? []).flatMap((booking: {
    id: string;
    status: string;
    order_items: TicketOrderItemRelation | TicketOrderItemRelation[] | null;
    ticket_passes: TicketPassProjection | TicketPassProjection[] | null;
  }) => {
    const item = Array.isArray(booking.order_items) ? booking.order_items[0] : booking.order_items;
    const pass = Array.isArray(booking.ticket_passes) ? booking.ticket_passes[0] : booking.ticket_passes;
    if (!item?.outlet_id || !pass?.id) return [];
    if (!isTicketEligibleProduct(item.products)) return [];
    const outlet = Array.isArray(item.outlets) ? item.outlets[0] : item.outlets;
    const vendor = Array.isArray(outlet?.vendors) ? outlet.vendors[0] : outlet?.vendors;
    if (!outlet?.name || !vendor?.name || outlet.id !== item.outlet_id || outlet.vendor_id !== item.vendor_id || vendor.id !== item.vendor_id) {
      missingTicketIdentity = true;
      return [];
    }
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
      bookingStatus: booking.status,
      ticketPassId: pass.id,
      outletName: outlet.name,
      vendorName: vendor.name,
      passToken,
      ticketCode: null as string | null,
      policy: pass.policy,
      entryLimit: pass.entry_limit,
      entriesUsed: pass.entries_used,
      status: pass.status,
      validFrom: pass.valid_from,
      validUntil: pass.valid_until,
    }];
  });
  if (missingTicketIdentity) return apiFail("MERCHANT_IDENTITY_UNAVAILABLE", "Ticket merchant identity is unavailable", 409);

  try {
    // Order ownership was established above. Use the server client for the
    // exact order-scoped join and refund gate; never expose this client.
    const service = createServiceClient();
    const passes = await loadOrderPickupPasses(service, orderId);
    const now = Date.now();
    const activeTicketPassIds = tickets
      .filter((ticket) => ["confirmed", "in_use"].includes(ticket.bookingStatus)
        && ticket.status === "active"
        && ticket.entriesUsed < ticket.entryLimit
        && (!ticket.validUntil || (Number.isFinite(new Date(ticket.validUntil).getTime()) && new Date(ticket.validUntil).getTime() >= now)))
      .map((ticket) => ticket.ticketPassId);
    const pendingFoodOutletIds = passes.foodOrders
      .filter((pass) => pass.status === "pending" && pass.codeEligible)
      .map((pass) => pass.outletId);
    const pendingEventGroups = passes.eventPickups
      .filter((pass) => pass.status === "pending")
      .map((pass) => pass.codeContext);
    const pendingRetailItemIds = passes.retailPickups
      .filter((pass) => pass.status === "pending")
      .map((pass) => pass.orderItemId);
    const [ticketCodesByPassId, foodCodesByOutletId, eventCodesByGroupKey, codesByOrderItemId] = await Promise.all([
      loadOrCreateTicketPickupCodes(service, activeTicketPassIds),
      loadOrCreateFoodPickupCodes(service, orderId, pendingFoodOutletIds),
      loadOrCreateEventPickupCodes(service, pendingEventGroups),
      loadOrCreateRetailPickupCodes(service, pendingRetailItemIds),
    ]);
    const issuedTickets = tickets.map(({ bookingStatus, ticketPassId, ...ticket }) => ({
      ...ticket,
      ticketCode: ["confirmed", "in_use"].includes(bookingStatus)
        && ticket.status === "active"
        && ticket.entriesUsed < ticket.entryLimit
        && (!ticket.validUntil || (Number.isFinite(new Date(ticket.validUntil).getTime()) && new Date(ticket.validUntil).getTime() >= now))
        && ticketCodesByPassId.has(ticketPassId)
        ? formatPickupCode(ticketCodesByPassId.get(ticketPassId) as string, "ticket")
        : null,
    }));
    const foodOrders = passes.foodOrders.map(({ codeEligible, ...pass }) => ({
      ...pass,
      foodCode: pass.status === "pending" && codeEligible && foodCodesByOutletId.has(pass.outletId)
        ? formatPickupCode(foodCodesByOutletId.get(pass.outletId) as string, "food")
        : null,
    }));
    const eventPickupsWithCodes = passes.eventPickups.map(({ codeContext, ...pass }) => ({
      ...pass,
      eventCode: pass.status === "pending" && eventCodesByGroupKey.has(codeContext.groupKey)
        ? formatPickupCode(eventCodesByGroupKey.get(codeContext.groupKey) as string, "event")
        : null,
    }));
    const retailPickups = passes.retailPickups.map((pass) => ({
      ...pass,
      retailCode: pass.status === "pending" && codesByOrderItemId.has(pass.orderItemId)
        ? formatRetailPickupCode(codesByOrderItemId.get(pass.orderItemId) as string)
        : null,
    }));
    return guestPrivateResponse({ tickets: issuedTickets, ...passes, foodOrders, eventPickups: eventPickupsWithCodes, retailPickups });
  } catch (error) {
    if (error instanceof OrderPickupPassError) {
      return apiFail(error.code, error.message, error.code === "DB_ERROR" ? 500 : 409);
    }
    return apiFail("DB_ERROR", "Unable to load pickup passes", 500);
  }
}
