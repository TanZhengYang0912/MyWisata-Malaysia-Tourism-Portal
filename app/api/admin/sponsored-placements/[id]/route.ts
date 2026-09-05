import { z } from "zod";

import { requireStaffPermission } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

type RouteContext = { params: Promise<{ id: string }> };

const transitionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "pause"]),
  reason: z.string().trim().min(5).max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === "reject" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason is required" });
  }
  if (value.action !== "reject" && value.reason !== undefined) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Only rejection accepts a reason" });
  }
});

function transitionError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("map_campaign_permission_required")) return apiFail("FORBIDDEN", "Sponsored placement permission required", 403);
  if (message.includes("sponsored_creator_self_approval_denied")) return apiFail("SELF_APPROVAL_DENIED", "Campaign creators cannot approve their own placement", 403);
  if (message.includes("sponsored_product_not_eligible")) return apiFail("PRODUCT_NOT_ELIGIBLE", "Product must be active and approved", 409);
  if (message.includes("sponsored_placement_not_found")) return apiFail("NOT_FOUND", "Sponsored placement not found", 404);
  if (message.includes("sponsored_transition_invalid")) return apiFail("INVALID_STATE", "Campaign is not in a valid state for this action", 409);
  return apiFail("SPONSORED_PLACEMENT_ERROR", "Sponsored placement could not be updated", 500);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { db, user, response } = await requireStaffPermission("admin.map_campaign.manage");
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, transitionSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return apiFail("VALIDATION_FAILED", "Invalid placement ID", 422);

  const { data, error } = await db.rpc("transition_sponsored_discovery_placement", {
    p_placement_id: id,
    p_action: parsed.data.action,
    p_note: parsed.data.reason ?? null,
  });

  if (error) return transitionError(error);
  if (!data) return apiFail("SPONSORED_PLACEMENT_ERROR", "Sponsored placement returned no result", 500);
  return apiOk({ placement: data });
}
