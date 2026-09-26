import { requireStaffPermission } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { campaignCreateSchema } from "@/lib/promotion-campaigns/validation";

const CAMPAIGN_COLUMNS = "id,slug,title,summary,description,status,starts_at,ends_at,created_by,approved_by,approved_at,rejection_note,created_at,updated_at";

function databaseFailure(error: { message?: string; code?: string } | null, fallback: string) {
  const message = (error?.message ?? "").toLowerCase();
  if (error?.code === "23505" || message.includes("promotion_campaigns_slug_key")) {
    return apiFail("SLUG_EXISTS", "That campaign address is already in use", 409);
  }
  if (message.includes("not_authorized") || message.includes("permission_denied")) {
    return apiFail("FORBIDDEN", "You do not have permission to manage promotion campaigns", 403);
  }
  if (message.includes("not_found")) return apiFail("NOT_FOUND", "Campaign was not found", 404);
  if (message.includes("stale") || message.includes("changed")) {
    return apiFail("CONFLICT", "This campaign changed. Refresh it and try again.", 409);
  }
  if (message.includes("invalid_state") || message.includes("not_eligible") || message.includes("no_offers")) {
    return apiFail("INVALID_CAMPAIGN", "The campaign or one of its selected offers is no longer eligible", 409);
  }
  if (message.includes("slug_exists")) return apiFail("SLUG_EXISTS", "That campaign address is already in use", 409);
  return apiFail("CAMPAIGN_UNAVAILABLE", fallback, 503);
}

export async function GET() {
  const auth = await requireStaffPermission("admin.promotion_campaign.manage");
  if (auth.response) return auth.response;

  const [campaignResult, sourceResult] = await Promise.all([
    auth.db.from("promotion_campaigns").select(CAMPAIGN_COLUMNS).order("created_at", { ascending: false }),
    auth.db.rpc("get_admin_promotion_campaign_sources"),
  ]);
  if (campaignResult.error || sourceResult.error) {
    return databaseFailure(campaignResult.error ?? sourceResult.error, "Unable to load promotion campaigns");
  }

  const campaigns = campaignResult.data ?? [];
  const ids = campaigns.map((campaign) => campaign.id);
  let offers: Array<Record<string, unknown>> = [];
  if (ids.length > 0) {
    const offerResult = await auth.db.from("promotion_campaign_offers")
      .select("id,campaign_id,voucher_id,product_id,outlet_id,position,created_at")
      .in("campaign_id", ids)
      .order("position", { ascending: true });
    if (offerResult.error) return databaseFailure(offerResult.error, "Unable to load campaign offers");
    offers = (offerResult.data ?? []) as Array<Record<string, unknown>>;
  }

  return apiOk({
    campaigns: campaigns.map((campaign) => ({
      ...campaign,
      offers: offers.filter((offer) => offer.campaign_id === campaign.id),
    })),
    sources: sourceResult.data,
  });
}

export async function POST(request: Request) {
  const auth = await requireStaffPermission("admin.promotion_campaign.manage");
  if (auth.response) return auth.response;

  const parsed = await parseBody(request, campaignCreateSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await auth.db.rpc("save_promotion_campaign_draft", {
    p_campaign_id: null,
    p_expected_updated_at: null,
    p_title: parsed.data.title,
    p_slug: parsed.data.slug,
    p_summary: parsed.data.summary,
    p_description: parsed.data.description,
    p_starts_at: parsed.data.startsAt,
    p_ends_at: parsed.data.endsAt,
    p_offers: parsed.data.offers,
  });
  if (error) return databaseFailure(error, "Unable to save the campaign draft");
  return apiOk(data, { status: 201 });
}
