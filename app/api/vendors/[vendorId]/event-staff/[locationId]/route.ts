import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { approvedStall, stallAccessEndsAt } from "@/lib/events/event-staff";
import { signEventStaffLinkToken } from "@/lib/events/event-staff-link-token";

interface Props { params: Promise<{ vendorId: string; locationId: string }> }

const bodySchema = z.object({ rotate: z.boolean().optional() }).strict();

type Scope = { db: SupabaseClient; userId: string; vendorId: string; campaignId: string; locationId: string; expiresAt: string };

/** Owner of a vendor with an approved stall at this event location. */
async function ownerScope({ params }: Props): Promise<{ ok: true; scope: Scope } | { ok: false; response: Response }> {
  const { vendorId, locationId } = await params;
  if (!databaseUuidSchema.safeParse(locationId).success) return { ok: false, response: apiFail("NOT_FOUND", "Stall not found", 404) };
  const access = await authorizeVendor(vendorId, ["vendor_owner"], { allowEventVendor: true, requireApproved: true });
  if (!access.ok) return access;
  const db = access.access.serviceDb;
  const { stall, error } = await approvedStall(db, vendorId, locationId);
  if (error) return { ok: false, response: apiFail("DB_ERROR", "Unable to load your stall", 500) };
  if (!stall) return { ok: false, response: apiFail("NOT_PARTICIPATING", "You have no approved stall at this location", 404) };
  return {
    ok: true,
    scope: { db, userId: access.access.userId, vendorId, campaignId: stall.campaignId, locationId, expiresAt: stallAccessEndsAt(stall.endsOn) },
  };
}

async function activeLinkId(scope: Scope) {
  const { data, error } = await scope.db.from("event_staff_links").select("id")
    .eq("vendor_id", scope.vendorId).eq("event_location_id", scope.locationId).is("revoked_at", null).maybeSingle();
  return { id: (data as { id: string } | null)?.id ?? null, error };
}

const linkBody = (scope: Scope, linkId: string) => ({ token: signEventStaffLinkToken(linkId), expiresAt: scope.expiresAt });

/** GET: this stall's current staff link (re-copyable at any time) and every member with their status. */
export async function GET(_request: Request, props: Props) {
  const result = await ownerScope(props);
  if (!result.ok) return result.response;
  const { scope } = result;
  const [link, members] = await Promise.all([
    activeLinkId(scope),
    scope.db.from("event_staff_members").select("id,display_name,joined_at,approved_at,removed_at,users!event_staff_members_user_id_fkey(email)")
      .eq("vendor_id", scope.vendorId).eq("event_location_id", scope.locationId)
      .order("joined_at", { ascending: false }).limit(200),
  ]);
  if (link.error || members.error) return apiFail("DB_ERROR", "Unable to load event staff", 500);
  type MemberRow = {
    id: string;
    display_name: string;
    joined_at: string;
    approved_at: string | null;
    removed_at: string | null;
    users: { email: string | null } | { email: string | null }[] | null;
  };
  return apiOk({
    link: link.id ? linkBody(scope, link.id) : null,
    members: ((members.data ?? []) as MemberRow[]).map((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const status = row.removed_at ? "removed" : row.approved_at ? "active" : "pending";
      return { id: row.id, displayName: row.display_name, email: user?.email ?? "", joinedAt: row.joined_at, status };
    }),
  });
}

/** POST: return the active link (creating one if needed), or rotate it with { rotate: true }. */
export async function POST(request: Request, props: Props) {
  const result = await ownerScope(props);
  if (!result.ok) return result.response;
  const { scope } = result;
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  if (Date.parse(scope.expiresAt) <= Date.now()) return apiFail("EVENT_ENDED", "This stall has ended", 409);

  const current = await activeLinkId(scope);
  if (current.error) return apiFail("DB_ERROR", "Unable to load the staff link", 500);
  // Unchanged request: hand back the existing link without writing.
  if (current.id && !parsed.data.rotate) return apiOk({ link: linkBody(scope, current.id) });

  if (current.id) {
    // Rotation stops new joins through the old link; members who joined keep access.
    const { error } = await scope.db.from("event_staff_links").update({ revoked_at: new Date().toISOString() })
      .eq("id", current.id).is("revoked_at", null);
    if (error) return apiFail("DB_ERROR", "Unable to reset the staff link", 500);
  }

  const { data: created, error: createError } = await scope.db.from("event_staff_links")
    .insert({ vendor_id: scope.vendorId, campaign_id: scope.campaignId, event_location_id: scope.locationId, created_by: scope.userId })
    .select("id").single();
  if (createError) {
    // A concurrent request created the one active link first: return that one.
    if ((createError as { code?: string }).code === "23505") {
      const winner = await activeLinkId(scope);
      if (winner.id) return apiOk({ link: linkBody(scope, winner.id) });
    }
    return apiFail("DB_ERROR", "Unable to create the staff link", 500);
  }
  const linkId = (created as { id: string }).id;
  const { error: auditError } = await scope.db.from("audit_logs").insert({
    actor_id: scope.userId,
    action: current.id ? "event_staff.link_rotated" : "event_staff.link_created",
    entity_type: "event_staff_link",
    entity_id: linkId,
    after_data: { vendor_id: scope.vendorId, campaign_id: scope.campaignId, event_location_id: scope.locationId, ...(current.id ? { revoked_link_id: current.id } : {}) },
  });
  if (auditError) console.error("[event-staff] link audit failed", { linkId, message: auditError.message });
  return apiOk({ link: linkBody(scope, linkId) });
}
