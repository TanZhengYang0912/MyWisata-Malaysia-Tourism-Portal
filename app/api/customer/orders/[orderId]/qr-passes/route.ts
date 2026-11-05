import { guestPrivateResponse } from '@/lib/checkout/guest-session';
import { authorizeOrder } from '@/lib/checkout/order-access';
import { apiFail } from "@/lib/validation/schemas";
import { signTicketPassToken } from "@/lib/tickets/tokens";
import { loadOrderPickupPasses, OrderPickupPassError } from "@/lib/checkout/order-pickup-passes";
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
    .select("id,order_items!inner(outlet_id,vendor_id,outlets(id,name,vendor_id,vendors(id,name))),ticket_passes(id,policy,entry_limit,entries_used,status,valid_from,valid_until)")
    .eq("order_items.order_id", orderId);
  if (bookingError) return apiFail("DB_ERROR", bookingError.message, 500);

  let missingTicketIdentity = false;
  const tickets = (bookings ?? []).flatMap((booking: {
    id: string;
    order_items: { outlet_id: string; vendor_id: string; outlets: { id: string; name: string; vendor_id: string; vendors: { id: string; name: string } | { id: string; name: string }[] | null } | { id: string; name: string; vendor_id: string; vendors: { id: string; name: string } | { id: string; name: string }[] | null }[] | null } | { outlet_id: string; vendor_id: string; outlets: { id: string; name: string; vendor_id: string; vendors: { id: string; name: string } | { id: string; name: string }[] | null } | { id: string; name: string; vendor_id: string; vendors: { id: string; name: string } | { id: string; name: string }[] | null }[] | null }[] | null;
    ticket_passes: TicketPassProjection | TicketPassProjection[] | null;
  }) => {
    const item = Array.isArray(booking.order_items) ? booking.order_items[0] : booking.order_items;
    const pass = Array.isArray(booking.ticket_passes) ? booking.ticket_passes[0] : booking.ticket_passes;
    if (!item?.outlet_id || !pass?.id) return [];
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
      outletName: outlet.name,
      vendorName: vendor.name,
      passToken,
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
    const passes = await loadOrderPickupPasses(createServiceClient(), orderId);
    return guestPrivateResponse({ tickets, ...passes });
  } catch (error) {
    if (error instanceof OrderPickupPassError) {
      return apiFail(error.code, error.message, error.code === "DB_ERROR" ? 500 : 409);
    }
    return apiFail("DB_ERROR", "Unable to load pickup passes", 500);
  }
}
