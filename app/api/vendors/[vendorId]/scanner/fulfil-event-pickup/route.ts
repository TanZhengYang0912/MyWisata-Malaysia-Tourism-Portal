import { z } from "zod";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { verifyEventPickupToken } from "@/lib/events/event-pickup-token";

interface Props { params: Promise<{ vendorId: string }> }

const fulfilSchema = z.object({ eventToken: z.string().trim().min(1).max(2_000) }).strict();

/** POST: mark an event reservation collected. Accepted only on its pickup date, by its vendor. */
export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, undefined, { allowEventVendor: true, requireApproved: true });
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, fulfilSchema);
  if (!parsed.ok) return parsed.response;

  const verification = verifyEventPickupToken(parsed.data.eventToken);
  if (!verification.valid && "expired" in verification) return apiFail("EVENT_PICKUP_EXPIRED", "This pickup code was only valid on its pickup date", 409);
  if (!verification.valid) return apiFail("INVALID_EVENT_PICKUP", "This pickup code is invalid", 400);
  const claims = verification.claims;
  if (claims.vendorId !== vendorId) return apiFail("FORBIDDEN", "This pickup belongs to another vendor", 403);

  const { data, error } = await access.access.serviceDb.rpc("fulfil_event_pickup", {
    p_order_id: claims.orderId,
    p_vendor_id: vendorId,
    p_location_id: claims.locationId,
    p_pickup_date: claims.pickupDate,
    p_pickup_slot_id: claims.pickupSlotId ?? null,
    p_operator_id: access.access.userId,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("event_pickup_not_paid")) return apiFail("ORDER_NOT_PAID", "This reservation has not been paid", 409);
    if (message.includes("event_pickup_wrong_date")) return apiFail("EVENT_PICKUP_WRONG_DATE", `This pickup is for ${claims.pickupDate}`, 409);
    if (message.includes("event_pickup_not_found")) return apiFail("EVENT_PICKUP_NOT_FOUND", "No reservation matches this pickup code", 404);
    if (message.includes("event_pickup_already_fulfilled")) return apiFail("EVENT_PICKUP_COLLECTED", "This reservation has already been collected", 409);
    if (message.includes("event_pickup_not_yet")) return apiFail("EVENT_PICKUP_NOT_YET", "This reservation cannot be collected before its booked time", 409);
    if (message.includes("event_pickup_time_unavailable")) return apiFail("EVENT_PICKUP_TIME_UNAVAILABLE", "The booked pickup time is unavailable", 409);
    return apiFail("DB_ERROR", "The pickup could not be recorded", 500);
  }
  return apiOk(data);
}
