import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

type RouteContext = { params: Promise<{ id: string }> };

const eventSchema = z.object({
  eventType: z.enum(["impression", "click"]),
  productId: z.string().uuid(),
}).strict();

export async function POST(request: Request, context: RouteContext) {
  const parsed = await parseBody(request, eventSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return apiFail("VALIDATION_FAILED", "Invalid placement ID", 422);

  const db = await createClient();
  const { data, error } = await db.rpc("record_sponsored_discovery_event", {
    p_placement_id: id,
    p_product_id: parsed.data.productId,
    p_event_type: parsed.data.eventType,
  });

  if (error) {
    const message = error.message ?? "";
    if (
      message.includes("sponsored_placement_not_effective")
      || message.includes("sponsored_placement_product_mismatch")
      || message.includes("sponsored_product_not_eligible")
    ) {
      return apiFail("SPONSORED_EVENT_INELIGIBLE", "Sponsored placement is not eligible for this event", 409);
    }
    if (message.includes("sponsored_event_type_invalid")) {
      return apiFail("VALIDATION_FAILED", "Unsupported sponsored event type", 422);
    }
    return apiFail("SPONSORED_EVENT_ERROR", "Sponsored event could not be recorded", 500);
  }

  if (!data) return apiFail("SPONSORED_EVENT_ERROR", "Sponsored event returned no result", 500);
  return apiOk({ recorded: true }, { status: 201 });
}
