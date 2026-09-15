import { z } from "zod";
import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { getBookingOrderItem } from "@/lib/vendor/booking-scope";
import { verifyTicketPassToken } from "@/lib/tickets/tokens";
import { verifyVoucherStoreToken } from "@/lib/vouchers/store-token";

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
      .select("id,status,order_items(vendor_id,outlet_id,quantity,product_name),ticket_passes(policy,entry_limit,entries_used,status)")
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
    return apiOk({ kind: "ticket", bookingId: ticket.bookingId, passToken: ticket.passToken, outletId: outlet.outletId, status: booking.status, productName, quantity, pass: pass ?? null });
  }

  const voucherToken = verifyVoucherStoreToken(parsed.data.rawValue);
  if (!voucherToken.valid || !voucherToken.payload) return apiFail("INVALID_CODE", "This code is not a valid MyLawatan voucher or ticket", 400);
  const claims = voucherToken.payload;
  if (claims.outletId && claims.outletId !== outlet.outletId) return apiFail("FORBIDDEN", "This voucher is not valid at the selected outlet", 403);

  const [{ data: claim, error: claimError }, { data: voucher, error: voucherError }] = await Promise.all([
    access.access.serviceDb.from("customer_voucher_claims").select("id,status,voucher_id,expires_at").eq("id", claims.claimId).eq("voucher_id", claims.voucherId).maybeSingle(),
    access.access.serviceDb.from("vouchers").select("id,vendor_id,outlet_id,code,name,voucher_type,discount_value,valid_until,redemption_mode,is_active,review_status,outlets(name)").eq("id", claims.voucherId).eq("vendor_id", vendorId).maybeSingle(),
  ]);
  if (claimError || voucherError) return apiFail("DB_ERROR", claimError?.message ?? voucherError?.message ?? "Unable to resolve code", 500);
  if (!claim || claim.status !== "claimed") return apiFail("VOUCHER_UNAVAILABLE", "This voucher has already been used or is unavailable", 409);
  if (!voucher) return apiFail("NOT_FOUND", "Voucher not found", 404);
  if (voucher.outlet_id && voucher.outlet_id !== outlet.outletId) return apiFail("FORBIDDEN", "This voucher is not valid at the selected outlet", 403);
  if (!voucher.is_active || voucher.review_status !== "approved" || !["in_store", "both"].includes(voucher.redemption_mode)) return apiFail("VOUCHER_UNAVAILABLE", "This voucher cannot be redeemed in store", 409);

  const outletRelation = Array.isArray(voucher.outlets) ? voucher.outlets[0] : voucher.outlets;
  return apiOk({ kind: "voucher", claimId: claim.id, voucherId: voucher.id, outletId: outlet.outletId, code: voucher.code, name: voucher.name, voucherType: voucher.voucher_type, discountValue: voucher.discount_value, validUntil: voucher.valid_until, redemptionMode: voucher.redemption_mode, outletName: outletRelation?.name ?? "Selected outlet" });
}
