import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyEventStaffLinkToken } from "@/lib/events/event-staff-link-token";

// Event staff scope: one vendor's stall (event location). Every query here runs
// on the service client: the staff tables are service-only, and callers have
// already proven who the user is.

type Relation<T> = T | T[] | null | undefined;
const one = <T,>(value: Relation<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value ?? null);
const asError = (error: { message?: string } | null) => (error ? new Error(error.message ?? "query failed") : null);

type StallRow = { ends_on: string; status: string };

/** Staff access to a stall ends when its last day ends in Malaysia time. */
export const stallAccessEndsAt = (endsOn: string) => new Date(`${endsOn}T23:59:59.999+08:00`).toISOString();
const isLiveStall = (stall: StallRow | null, now: Date) =>
  Boolean(stall) && stall?.status === "active" && Date.parse(stallAccessEndsAt(stall.ends_on)) > now.getTime();

/** Stalls (event locations) this user may scan for at this vendor: owner-approved, not removed, stall still running. */
export async function activeEventStaffLocationIds(
  db: SupabaseClient,
  userId: string,
  vendorId: string,
  now = new Date(),
): Promise<{ locationIds: string[]; error: Error | null }> {
  const { data, error } = await db
    .from("event_staff_members")
    .select("event_location_id,promotion_campaign_locations(ends_on,status)")
    .eq("user_id", userId)
    .eq("vendor_id", vendorId)
    .is("removed_at", null)
    // Pending members (joined through the link, not yet approved) get no scan access.
    .not("approved_at", "is", null);
  if (error) return { locationIds: [], error: asError(error) };
  // ponytail: stall end filtered here; one user × one vendor is a handful of rows.
  const locationIds = ((data ?? []) as Array<{ event_location_id: string; promotion_campaign_locations: Relation<StallRow> }>)
    .filter((row) => isLiveStall(one(row.promotion_campaign_locations), now))
    .map((row) => row.event_location_id);
  return { locationIds: [...new Set(locationIds)], error: null };
}

export type ApprovedStall = { campaignId: string; locationName: string; endsOn: string; isLive: boolean };

/** The vendor's approved stall at this location, or null. A stall is one registration row. */
export async function approvedStall(
  db: SupabaseClient,
  vendorId: string,
  locationId: string,
  now = new Date(),
): Promise<{ stall: ApprovedStall | null; error: Error | null }> {
  const { data, error } = await db
    .from("promotion_campaign_vendors")
    .select("campaign_id,promotion_campaign_locations(name,ends_on,status)")
    .eq("vendor_id", vendorId)
    .eq("event_location_id", locationId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) return { stall: null, error: asError(error) };
  const row = data as { campaign_id: string; promotion_campaign_locations: Relation<StallRow & { name: string }> } | null;
  const location = one(row?.promotion_campaign_locations);
  if (!row || !location) return { stall: null, error: null };
  return {
    stall: { campaignId: row.campaign_id, locationName: location.name, endsOn: location.ends_on, isLive: isLiveStall(location, now) },
    error: null,
  };
}

export type ActiveStaffLink = {
  linkId: string;
  vendorId: string;
  vendorName: string;
  campaignId: string;
  campaignTitle: string;
  locationId: string;
  locationName: string;
  expiresAt: string;
};

type LinkRow = {
  id: string;
  vendor_id: string;
  campaign_id: string;
  event_location_id: string;
  revoked_at: string | null;
  vendors: Relation<{ name: string; status: string }>;
  promotion_campaigns: Relation<{ title: string }>;
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
    .select("id,vendor_id,campaign_id,event_location_id,revoked_at,vendors(name,status),promotion_campaigns(title)")
    .eq("id", verified.linkId)
    .maybeSingle();
  if (error) return { link: null, error: asError(error) };
  const row = data as LinkRow | null;
  const vendor = one(row?.vendors);
  const campaign = one(row?.promotion_campaigns);
  if (!row || row.revoked_at || !vendor || vendor.status !== "approved" || !campaign) return { link: null, error: null };
  const { stall, error: stallError } = await approvedStall(db, row.vendor_id, row.event_location_id, now);
  if (stallError) return { link: null, error: stallError };
  if (!stall?.isLive) return { link: null, error: null };
  return {
    link: {
      linkId: row.id,
      vendorId: row.vendor_id,
      vendorName: vendor.name,
      campaignId: row.campaign_id,
      campaignTitle: campaign.title,
      locationId: row.event_location_id,
      locationName: stall.locationName,
      expiresAt: stallAccessEndsAt(stall.endsOn),
    },
    error: null,
  };
}
