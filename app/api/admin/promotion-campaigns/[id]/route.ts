import { requireStaffPermission } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { campaignAdminPatchSchema } from "@/lib/promotion-campaigns/validation";
import { databaseUuidSchema } from "@/lib/validation/schemas";

function databaseFailure(error: { message?: string; code?: string } | null) {
  const message = (error?.message ?? "").toLowerCase();
  if (error?.code === "23505" || message.includes("promotion_campaigns_slug_key")) {
    return apiFail("SLUG_EXISTS", "That campaign address is already in use", 409);
  }
  if (message.includes("not_authorized") || message.includes("permission_denied")) {
    return apiFail("FORBIDDEN", "You do not have permission to manage promotion campaigns", 403);
  }
  if (message.includes("not_found")) return apiFail("NOT_FOUND", "Campaign was not found", 404);
  if (message.includes("stale") || message.includes("changed")) return apiFail("CONFLICT", "This campaign changed. Refresh it and try again.", 409);
  if (message.includes("self_approval") || message.includes("creator_cannot_approve")) {
    return apiFail("FORBIDDEN", "The campaign creator cannot approve their own campaign", 403);
  }
  if (message.includes("invalid_state") || message.includes("not_eligible") || message.includes("no_offers")) {
    return apiFail("INVALID_CAMPAIGN", "The campaign or one of its selected offers is no longer eligible", 409);
  }
  return apiFail("CAMPAIGN_UNAVAILABLE", "Unable to update this campaign", 503);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireStaffPermission("admin.promotion_campaign.manage");
  if (auth.response) return auth.response;

  const { id } = await context.params;
  const idResult = databaseUuidSchema.safeParse(id);
  if (!idResult.success) return apiFail("INVALID_ID", "Campaign id is invalid", 422);

  const parsed = await parseBody(request, campaignAdminPatchSchema);
  if (!parsed.ok) return parsed.response;

  let result;
  if (parsed.data.action === "save_draft") {
    result = await auth.db.rpc("save_promotion_campaign_draft", {
        p_campaign_id: id,
        p_expected_updated_at: parsed.data.campaign.expectedUpdatedAt,
        p_title: parsed.data.campaign.title,
        p_slug: parsed.data.campaign.slug,
        p_summary: parsed.data.campaign.summary,
        p_description: parsed.data.campaign.description,
        p_starts_at: parsed.data.campaign.startsAt,
        p_ends_at: parsed.data.campaign.endsAt,
        p_offers: parsed.data.campaign.offers,
      });
  } else {
    result = await auth.db.rpc("transition_promotion_campaign", {
        p_campaign_id: id,
        p_action: parsed.data.action,
        p_expected_updated_at: parsed.data.expectedUpdatedAt,
        p_note: parsed.data.note ?? null,
      });
  }

  const { data, error } = result;
  if (error) return databaseFailure(error);
  return apiOk(data);
}
