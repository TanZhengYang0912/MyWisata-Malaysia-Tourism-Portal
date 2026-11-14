import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

type One<T> = T | T[] | null;
const one = <T,>(value: One<T>) => (Array.isArray(value) ? value[0] ?? null : value);

type MemberRow = {
  vendor_id: string;
  campaign_id: string;
  vendors: One<{ name: string; status: string }>;
  promotion_campaigns: One<{ title: string; ends_at: string }>;
};
type RegistrationRow = {
  vendor_id: string;
  campaign_id: string;
  location: One<{ id: string; name: string; starts_on: string; ends_on: string; status: string }>;
};

/** The caller's live staff memberships and the locations where each vendor is set up. */
export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const db = createServiceClient() as SupabaseClient;
  const { data, error } = await db.from("event_staff_members")
    .select("vendor_id,campaign_id,vendors(name,status),promotion_campaigns(title,ends_at)")
    .eq("user_id", user.id).is("removed_at", null).limit(50);
  if (error) return apiFail("DB_ERROR", "Unable to load your events", 500);

  const now = Date.now();
  // ponytail: ended/unapproved filtered here, bounded by limit(50) on the caller's own rows.
  const live = ((data ?? []) as MemberRow[]).flatMap((row) => {
    const vendor = one(row.vendors);
    const campaign = one(row.promotion_campaigns);
    if (vendor?.status !== "approved" || !campaign || Date.parse(campaign.ends_at) <= now) return [];
    return [{ vendorId: row.vendor_id, vendorName: vendor.name, campaignId: row.campaign_id, campaignTitle: campaign.title, expiresAt: campaign.ends_at }];
  });
  if (!live.length) return apiOk([]);

  const { data: registrations, error: registrationError } = await db.from("promotion_campaign_vendors")
    .select("vendor_id,campaign_id,location:promotion_campaign_locations(id,name,starts_on,ends_on,status)")
    .eq("status", "approved")
    .in("vendor_id", [...new Set(live.map((entry) => entry.vendorId))])
    .in("campaign_id", [...new Set(live.map((entry) => entry.campaignId))]);
  if (registrationError) return apiFail("DB_ERROR", "Unable to load your events", 500);

  return apiOk(live.map((entry) => ({
    ...entry,
    locations: ((registrations ?? []) as RegistrationRow[])
      .filter((row) => row.vendor_id === entry.vendorId && row.campaign_id === entry.campaignId)
      .map((row) => one(row.location))
      .filter((location): location is NonNullable<typeof location> => location?.status === "active")
      .map((location) => ({ id: location.id, name: location.name, startsOn: location.starts_on, endsOn: location.ends_on })),
  })));
}
