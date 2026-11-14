import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyEventStaffLinkToken } from "@/lib/events/event-staff-link-token";

// Event staff scope. Every query here runs on the service client: the staff
// tables are service-only, and callers have already proven who the user is.

type Relation<T> = T | T[] | null | undefined;
const one = <T,>(value: Relation<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);
const asError = (error: { message?: string } | null) => (error ? new Error(error.message ?? "query failed") : null);
const isLive = (endsAt: string | null | undefined, now: Date) => Boolean(endsAt) && Date.parse(endsAt as string) > now.getTime();

/** Campaigns this user may scan for at this vendor: not removed, event not ended. */
export async function activeEventStaffCampaignIds(
  db: SupabaseClient,
  userId: string,
  vendorId: string,
  now = new Date(),
): Promise<{ campaignIds: string[]; error: Error | null }> {
  const { data, error } = await db
    .from("event_staff_members")
    .select("campaign_id,promotion_campaigns(ends_at)")
    .eq("user_id", userId)
    .eq("vendor_id", vendorId)
    .is("removed_at", null);
  if (error) return { campaignIds: [], error: asError(error) };
  // ponytail: ends_at filtered here; one user × one vendor is a handful of rows.
  const campaignIds = ((data ?? []) as Array<{ campaign_id: string; promotion_campaigns: Relation<{ ends_at: string }> }>)
    .filter((row) => isLive(one(row.promotion_campaigns)?.ends_at, now))
    .map((row) => row.campaign_id);
  return { campaignIds: [...new Set(campaignIds)], error: null };
}

/** Resolves the location to its campaign; a location id is never compared to campaign ids. */
export async function isEventLocationInCampaigns(
  db: SupabaseClient,
  locationId: string,
  campaignIds: string[],
): Promise<{ inScope: boolean; error: Error | null }> {
  if (campaignIds.length === 0) return { inScope: false, error: null };
  const { data, error } = await db.from("promotion_campaign_locations").select("campaign_id").eq("id", locationId).maybeSingle();
  if (error) return { inScope: false, error: asError(error) };
  const campaignId = (data as { campaign_id?: string } | null)?.campaign_id;
  return { inScope: Boolean(campaignId) && campaignIds.includes(campaignId as string), error: null };
}

export async function vendorHasApprovedRegistration(
  db: SupabaseClient,
  vendorId: string,
  campaignId: string,
): Promise<{ approved: boolean; error: Error | null }> {
  const { data, error } = await db
    .from("promotion_campaign_vendors")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("campaign_id", campaignId)
    .eq("status", "approved")
    .limit(1);
  if (error) return { approved: false, error: asError(error) };
  return { approved: (data ?? []).length > 0, error: null };
}

export type ActiveStaffLink = {
  linkId: string;
  vendorId: string;
  vendorName: string;
  campaignId: string;
  campaignTitle: string;
  expiresAt: string;
};

type LinkRow = {
  id: string;
  vendor_id: string;
  campaign_id: string;
  revoked_at: string | null;
  vendors: Relation<{ name: string; status: string }>;
  promotion_campaigns: Relation<{ title: string; ends_at: string }>;
};

/**
 * A link that can still be joined. Every unusable case returns `link: null`
 * so callers answer with one indistinguishable error (no oracle).
 */
export async function resolveActiveStaffLink(
  db: SupabaseClient,
  token: string,
  now = new Date(),
): Promise<{ link: ActiveStaffLink | null; error: Error | null }> {
  const verified = verifyEventStaffLinkToken(token);
  if (!verified) return { link: null, error: null };
  const { data, error } = await db
    .from("event_staff_links")
    .select("id,vendor_id,campaign_id,revoked_at,vendors(name,status),promotion_campaigns(title,ends_at)")
    .eq("id", verified.linkId)
    .maybeSingle();
  if (error) return { link: null, error: asError(error) };
  const row = data as LinkRow | null;
  const vendor = one(row?.vendors);
  const campaign = one(row?.promotion_campaigns);
  if (!row || row.revoked_at || !vendor || vendor.status !== "approved" || !campaign || !isLive(campaign.ends_at, now)) {
    return { link: null, error: null };
  }
  const registration = await vendorHasApprovedRegistration(db, row.vendor_id, row.campaign_id);
  if (registration.error) return { link: null, error: registration.error };
  if (!registration.approved) return { link: null, error: null };
  return {
    link: {
      linkId: row.id,
      vendorId: row.vendor_id,
      vendorName: vendor.name,
      campaignId: row.campaign_id,
      campaignTitle: campaign.title,
      expiresAt: campaign.ends_at,
    },
    error: null,
  };
}
