import { z } from "zod";
import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { getBookingOrderItem } from "@/lib/vendor/booking-scope";
import { verifyTicketPassToken } from "@/lib/tickets/tokens";
import { verifyVoucherStoreToken } from "@/lib/vouchers/store-token";
import { verifyFoodFulfilmentToken } from "@/lib/food/food-fulfilment-token";

interface Props { params: Promise<{ vendorId: string }> }

const scanSchema = z.object({
  rawValue: z.string().trim().min(1).max(4_000),
  outletId: databaseUuidSchema.optional(),
}).strict();

function selectedOutlet(outletId: string | undefined, allowedOutletIds: string[]) {
  const value = outletId ?? (allowedOutletIds.length === 1 ? allowedOutletIds[0] : undefined);
  if (!value) return { ok: false as const, response: apiFail("OUTLET_REQUIRED", "Choose an outlet before scanning", 400) };
  if (!allowedOutletIds.includes(value)) return { ok: false as const, response: apiFail("FORBIDDEN", "This outlet is outside your assigned scope", 403) };
  return { ok: true as const, outletId: value };
}

function parseBookingPayload(rawValue: string) {
  try {
    const url = new URL(rawValue, "http://localhost:3000");
    const match = url.pathname.match(/^\/customer\/bookings\/([^/]+)$/);
    if (!match) return null;
    return { bookingId: decodeURIComponent(match[1]), passToken: url.searchParams.get("t") ?? undefined };
  } catch {
    return null;
  }
}

function parseFoodOrderPayload(rawValue: string) {
  try {
    const url = new URL(rawValue, "http://localhost:3000");
    const match = url.pathname.match(/^\/customer\/orders\/([^/]+)$/);
    const foodToken = url.searchParams.get("food_t");
    if (!match || !foodToken) return null;
    return { orderId: decodeURIComponent(match[1]), foodToken };
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId);
  if (!access.ok) return access.response;

  const parsed = await parseBody(request, scanSchema);
  if (!parsed.ok) return parsed.response;
  const outlet = selectedOutlet(parsed.data.outletId, access.access.outletIds);
  if (!outlet.ok) return outlet.response;

  const ticket = parseBookingPayload(parsed.data.rawValue);
  if (ticket) {
    if (!ticket.passToken) return apiFail("INVALID_TICKET", "This ticket code is invalid", 400);
    const verification = verifyTicketPassToken(ticket.passToken);
    if (!verification.valid || verification.claims?.bookingId !== ticket.bookingId) return apiFail("INVALID_TICKET", "This ticket code is invalid", 400);

    const { data: booking, error } = await access.access.serviceDb
      .from("bookings")
      .select("id,status,order_items(order_id,vendor_id,outlet_id,quantity,product_name,outlets(id,name,vendor_id,vendors(id,name))),ticket_passes(id,policy,entry_limit,entries_used,status,valid_from,valid_until)")
      .eq("id", ticket.bookingId)
      .maybeSingle();
    if (error) return apiFail("DB_ERROR", error.message, 500);
    if (!booking) return apiFail("NOT_FOUND", "Ticket booking not found", 404);

    const orderItem = getBookingOrderItem(booking.order_items);
    const rawOrderItem = Array.isArray(booking.order_items) ? booking.order_items[0] : booking.order_items;
    const productName = rawOrderItem && typeof rawOrderItem === "object" && "product_name" in rawOrderItem && typeof rawOrderItem.product_name === "string" ? rawOrderItem.product_name : "Ticket";
    const quantity = rawOrderItem && typeof rawOrderItem === "object" && "quantity" in rawOrderItem && Number.isFinite(Number(rawOrderItem.quantity)) ? Number(rawOrderItem.quantity) : 1;
    if (orderItem.vendorId !== vendorId || orderItem.outletId !== outlet.outletId) return apiFail("FORBIDDEN", "This ticket is not valid at the selected outlet", 403);
    const pass = Array.isArray(booking.ticket_passes) ? booking.ticket_passes[0] : booking.ticket_passes;
    if (!rawOrderItem || typeof rawOrderItem !== "object" || !("order_id" in rawOrderItem) || typeof rawOrderItem.order_id !== "string") return apiFail("INVALID_TICKET", "This ticket has no associated order", 400);
    const { data: order, error: orderError } = await access.access.serviceDb.from("orders").select("status").eq("id", rawOrderItem.order_id).maybeSingle();
    if (orderError) return apiFail("DB_ERROR", orderError.message, 500);
    if (!order || !["paid", "completed"].includes(String(order.status).toLowerCase())) return apiFail("ORDER_NOT_PAID", "This ticket is not active because its order is unpaid", 409);
    if (!pass?.id || verification.claims?.passId !== pass.id || verification.claims?.outletId !== outlet.outletId) return apiFail("INVALID_TICKET", "This code does not match the ticket pass or outlet", 400);
    if (pass.status === "fully_redeemed" || pass.entries_used >= pass.entry_limit) return apiFail("TICKET_FULLY_REDEEMED", "This ticket has no entries remaining", 409);
    if (pass.status !== "active") return apiFail("TICKET_UNAVAILABLE", "This ticket pass is not active", 409);
    if (pass.valid_from && new Date(pass.valid_from).getTime() > Date.now()) return apiFail("TICKET_NOT_YET_VALID", "This ticket is not valid yet", 409);
    if (pass.valid_until && new Date(pass.valid_until).getTime() < Date.now()) return apiFail("TICKET_EXPIRED", "This ticket has expired", 409);
    const ticketOutlet = rawOrderItem && typeof rawOrderItem === "object" && "outlets" in rawOrderItem
      ? (Array.isArray(rawOrderItem.outlets) ? rawOrderItem.outlets[0] : rawOrderItem.outlets)
      : null;
    const ticketVendor = ticketOutlet && "vendors" in ticketOutlet
      ? (Array.isArray(ticketOutlet.vendors) ? ticketOutlet.vendors[0] : ticketOutlet.vendors)
      : null;
    if (!ticketOutlet?.name || !ticketVendor?.name || ticketOutlet.id !== outlet.outletId || ticketOutlet.vendor_id !== vendorId || ticketVendor.id !== vendorId) return apiFail("MERCHANT_IDENTITY_UNAVAILABLE", "Ticket merchant identity is unavailable", 409);
    return apiOk({ kind: "ticket", bookingId: ticket.bookingId, passToken: ticket.passToken, outletId: outlet.outletId, outletName: ticketOutlet.name, vendorName: ticketVendor.name, status: booking.status, productName, quantity, pass: { ...pass, remaining: Math.max(0, pass.entry_limit - pass.entries_used) } });
  }

  const foodOrder = parseFoodOrderPayload(parsed.data.rawValue);
  if (foodOrder) {
    const verification = verifyFoodFulfilmentToken(foodOrder.foodToken);
    if (!verification.valid || verification.claims?.orderId !== foodOrder.orderId || verification.claims.outletId !== outlet.outletId) {
      return apiFail("INVALID_FOOD_ORDER", "This food order code is invalid for the selected outlet", 400);
    }
    const { data: order, error: orderError } = await access.access.serviceDb.from("orders")
      .select("id,status")
      .eq("id", foodOrder.orderId)
      .maybeSingle();
    if (orderError) return apiFail("DB_ERROR", orderError.message, 500);
    if (!order || !["paid", "completed"].includes(String(order.status).toLowerCase())) return apiFail("ORDER_NOT_PAID", "This food order has not been paid", 409);

    const { data: rows, error: rowsError } = await access.access.serviceDb.from("order_items")
      .select("id,product_name,variant_name,quantity,food_fulfilment_mode,food_qr_scanned_at,fulfil_status,vendor_id,outlet_id,products(categories(slug)),outlets(id,name,vendor_id,vendors(id,name))")
      .eq("order_id", foodOrder.orderId)
      .eq("vendor_id", vendorId)
      .eq("outlet_id", outlet.outletId);
    if (rowsError) return apiFail("DB_ERROR", rowsError.message, 500);
    const foodRows = (rows ?? []).filter((row: { fulfil_status: string; products: { categories: { slug: string } | { slug: string }[] | null } | { categories: { slug: string } | { slug: string }[] | null }[] | null }) => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      const category = Array.isArray(product?.categories) ? product.categories[0] : product?.categories;
      return category?.slug === "food" && row.fulfil_status !== "cancelled";
    });
    if (foodRows.length === 0) return apiFail("FOOD_ORDER_NOT_FOUND", "No food items belong to this order at the selected outlet", 404);
    if (foodRows.some((row: { food_fulfilment_mode: string | null }) => !["dine_in", "takeaway"].includes(row.food_fulfilment_mode ?? ""))) return apiFail("FOOD_ORDER_UNAVAILABLE", "This food order has no valid service mode", 409);
    if (foodRows.some((row: { food_qr_scanned_at: string | null }) => row.food_qr_scanned_at) || foodRows.every((row: { fulfil_status: string }) => row.fulfil_status === "fulfilled")) return apiFail("FOOD_ORDER_FULFILLED", "This food order has already been scanned", 409);
    const modes = [...new Set(foodRows.map((row: { food_fulfilment_mode: string }) => row.food_fulfilment_mode))];
    if (modes.length !== 1) return apiFail("FOOD_ORDER_INCONSISTENT", "Food items at this outlet have different service modes", 409);
    const firstFoodRow = foodRows[0] as { vendor_id: string; outlet_id: string; outlets?: { id: string; name: string; vendor_id: string; vendors?: { id: string; name: string } | { id: string; name: string }[] | null } | { id: string; name: string; vendor_id: string; vendors?: { id: string; name: string } | { id: string; name: string }[] | null }[] | null };
    const foodOutlet = Array.isArray(firstFoodRow.outlets) ? firstFoodRow.outlets[0] : firstFoodRow.outlets;
    const foodVendor = Array.isArray(foodOutlet?.vendors) ? foodOutlet.vendors[0] : foodOutlet?.vendors;
    if (!foodOutlet?.name || !foodVendor?.name || foodOutlet.id !== firstFoodRow.outlet_id || foodOutlet.vendor_id !== vendorId || foodVendor.id !== vendorId) return apiFail("MERCHANT_IDENTITY_UNAVAILABLE", "Food order merchant identity is unavailable", 409);
    return apiOk({
      kind: "food_order",
      orderId: foodOrder.orderId,
      foodToken: foodOrder.foodToken,
      outletId: outlet.outletId,
      outletName: foodOutlet.name,
      vendorName: foodVendor.name,
      mode: modes[0],
      items: foodRows.map((row: { id: string; product_name: string; variant_name: string | null; quantity: number }) => ({ id: row.id, name: row.product_name, variant: row.variant_name, quantity: row.quantity })),
    });
  }

  const voucherToken = verifyVoucherStoreToken(parsed.data.rawValue);
  if (!voucherToken.valid || !voucherToken.payload) return apiFail("INVALID_CODE", "This code is not a valid MyLawatan voucher or ticket", 400);
  const claims = voucherToken.payload;
  if (claims.outletId && claims.outletId !== outlet.outletId) return apiFail("FORBIDDEN", "This voucher is not valid at the selected outlet", 403);

  const [{ data: claim, error: claimError }, { data: voucher, error: voucherError }] = await Promise.all([
    access.access.serviceDb.from("customer_voucher_claims").select("id,status,voucher_id,expires_at").eq("id", claims.claimId).eq("voucher_id", claims.voucherId).maybeSingle(),
    access.access.serviceDb.from("vouchers").select("id,vendor_id,outlet_id,code,name,voucher_type,discount_value,valid_until,redemption_mode,is_active,review_status,outlets(id,name,vendor_id),vendors(id,name)").eq("id", claims.voucherId).eq("vendor_id", vendorId).maybeSingle(),
  ]);
  if (claimError || voucherError) return apiFail("DB_ERROR", claimError?.message ?? voucherError?.message ?? "Unable to resolve code", 500);
  if (!claim || claim.status !== "claimed") return apiFail("VOUCHER_UNAVAILABLE", "This voucher has already been used or is unavailable", 409);
  if (!voucher) return apiFail("NOT_FOUND", "Voucher not found", 404);
  if (voucher.outlet_id && voucher.outlet_id !== outlet.outletId) return apiFail("FORBIDDEN", "This voucher is not valid at the selected outlet", 403);
  if (!voucher.is_active || voucher.review_status !== "approved" || !["in_store", "both"].includes(voucher.redemption_mode)) return apiFail("VOUCHER_UNAVAILABLE", "This voucher cannot be redeemed in store", 409);

  const outletRelation = Array.isArray(voucher.outlets) ? voucher.outlets[0] : voucher.outlets;
  const vendorRelation = Array.isArray(voucher.vendors) ? voucher.vendors[0] : voucher.vendors;
  const { data: selectedOutletRow, error: selectedOutletError } = await access.access.serviceDb.from("outlets").select("id,name,vendor_id").eq("id", outlet.outletId).eq("vendor_id", vendorId).maybeSingle();
  if (selectedOutletError) return apiFail("DB_ERROR", selectedOutletError.message, 500);
  if (!vendorRelation?.name || vendorRelation.id !== vendorId || (voucher.outlet_id && (!outletRelation?.name || outletRelation.id !== voucher.outlet_id || outletRelation.vendor_id !== vendorId)) || selectedOutletRow?.id !== outlet.outletId || selectedOutletRow.vendor_id !== vendorId || !selectedOutletRow.name) return apiFail("MERCHANT_IDENTITY_UNAVAILABLE", "Voucher merchant identity is unavailable", 409);
  return apiOk({ kind: "voucher", claimId: claim.id, voucherId: voucher.id, outletId: outlet.outletId, code: voucher.code, name: voucher.name, voucherType: voucher.voucher_type, discountValue: voucher.discount_value, validUntil: voucher.valid_until, redemptionMode: voucher.redemption_mode, vendorName: vendorRelation.name, outletName: outletRelation?.name ?? selectedOutletRow?.name });
}
