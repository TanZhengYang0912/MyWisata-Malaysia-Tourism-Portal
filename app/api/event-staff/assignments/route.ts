import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { stallAccessEndsAt } from "@/lib/events/event-staff";

export const dynamic = "force-dynamic";

type One<T> = T | T[] | null;
const one = <T,>(value: One<T>) => (Array.isArray(value) ? value[0] ?? null : value);

type MemberRow = {
  vendor_id: string;
  campaign_id: string;
  event_location_id: string;
  approved_at: string | null;
  vendors: One<{ name: string; status: string }>;
  promotion_campaigns: One<{ title: string }>;
  promotion_campaign_locations: One<{ id: string; name: string; starts_on: string; ends_on: string; status: string }>;
};

/**
 * The caller's live stall memberships. Pending memberships are listed with
 * status "pending" so the page can say so; scan access itself is enforced by
 * authorizeVendor, not by this list.
 */
export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const db = createServiceClient() as SupabaseClient;
  const { data, error } = await db.from("event_staff_members")
    .select("vendor_id,campaign_id,event_location_id,approved_at,vendors(name,status),promotion_campaigns(title),promotion_campaign_locations(id,name,starts_on,ends_on,status)")
    .eq("user_id", user.id).is("removed_at", null).limit(50);
  if (error) return apiFail("DB_ERROR", "Unable to load your events", 500);

  const now = Date.now();
  // ponytail: ended/unapproved filtered here, bounded by limit(50) on the caller's own rows.
  const live = ((data ?? []) as MemberRow[]).flatMap((row) => {
    const vendor = one(row.vendors);
    const campaign = one(row.promotion_campaigns);
    const location = one(row.promotion_campaign_locations);
    if (vendor?.status !== "approved" || !campaign || location?.status !== "active") return [];
    const expiresAt = stallAccessEndsAt(location.ends_on);
    if (Date.parse(expiresAt) <= now) return [];
    return [{
      vendorId: row.vendor_id,
      vendorName: vendor.name,
      campaignId: row.campaign_id,
      campaignTitle: campaign.title,
      expiresAt,
      status: row.approved_at ? "active" as const : "pending" as const,
      location: { id: location.id, name: location.name, startsOn: location.starts_on, endsOn: location.ends_on },
    }];
  });
  if (!live.length) return apiOk([]);

  // A stall whose registration is no longer approved (withdrawn, removed) has nothing to scan.
  const { data: stalls, error: stallError } = await db.from("promotion_campaign_vendors")
    .select("vendor_id,event_location_id")
    .eq("status", "approved")
    .in("vendor_id", [...new Set(live.map((entry) => entry.vendorId))])
    .in("event_location_id", [...new Set(live.map((entry) => entry.location.id))]);
  if (stallError) return apiFail("DB_ERROR", "Unable to load your events", 500);
  const approved = new Set(((stalls ?? []) as Array<{ vendor_id: string; event_location_id: string }>).map((row) => `${row.vendor_id}:${row.event_location_id}`));
  return apiOk(live.filter((entry) => approved.has(`${entry.vendorId}:${entry.location.id}`)));
}
