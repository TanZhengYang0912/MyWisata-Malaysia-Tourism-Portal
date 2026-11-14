import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { vendorHasApprovedRegistration } from "@/lib/events/event-staff";
import { signEventStaffLinkToken } from "@/lib/events/event-staff-link-token";

interface Props { params: Promise<{ vendorId: string; campaignId: string }> }

const bodySchema = z.object({ rotate: z.boolean().optional() }).strict();

type Scope = { db: SupabaseClient; userId: string; vendorId: string; campaignId: string; expiresAt: string };

/** Owner of a vendor with an approved registration in this event. */
async function ownerScope({ params }: Props): Promise<{ ok: true; scope: Scope } | { ok: false; response: Response }> {
  const { vendorId, campaignId } = await params;
  if (!databaseUuidSchema.safeParse(campaignId).success) return { ok: false, response: apiFail("NOT_FOUND", "Event not found", 404) };
  const access = await authorizeVendor(vendorId, ["vendor_owner"], { allowEventVendor: true, requireApproved: true });
  if (!access.ok) return access;
  const db = access.access.serviceDb;
  const registration = await vendorHasApprovedRegistration(db, vendorId, campaignId);
  if (registration.error) return { ok: false, response: apiFail("DB_ERROR", "Unable to load your event registration", 500) };
  if (!registration.approved) return { ok: false, response: apiFail("NOT_PARTICIPATING", "You have no approved registration in this event", 404) };
  const { data: campaign, error } = await db.from("promotion_campaigns").select("ends_at").eq("id", campaignId).maybeSingle();
  if (error) return { ok: false, response: apiFail("DB_ERROR", "Unable to load the event", 500) };
  if (!campaign) return { ok: false, response: apiFail("NOT_FOUND", "Event not found", 404) };
  return { ok: true, scope: { db, userId: access.access.userId, vendorId, campaignId, expiresAt: (campaign as { ends_at: string }).ends_at } };
}

async function activeLinkId(scope: Scope) {
  const { data, error } = await scope.db.from("event_staff_links").select("id")
    .eq("vendor_id", scope.vendorId).eq("campaign_id", scope.campaignId).is("revoked_at", null).maybeSingle();
  return { id: (data as { id: string } | null)?.id ?? null, error };
}

const linkBody = (scope: Scope, linkId: string) => ({ token: signEventStaffLinkToken(linkId), expiresAt: scope.expiresAt });

/** GET: the current staff link (re-copyable at any time) and the active staff. */
export async function GET(_request: Request, props: Props) {
  const result = await ownerScope(props);
  if (!result.ok) return result.response;
  const { scope } = result;
  const [link, members] = await Promise.all([
    activeLinkId(scope),
    scope.db.from("event_staff_members").select("id,display_name,joined_at,users!event_staff_members_user_id_fkey(email)")
      .eq("vendor_id", scope.vendorId).eq("campaign_id", scope.campaignId).is("removed_at", null)
      .order("joined_at", { ascending: false }).limit(200),
  ]);
  if (link.error || members.error) return apiFail("DB_ERROR", "Unable to load event staff", 500);
  type MemberRow = { id: string; display_name: string; joined_at: string; users: { email: string | null } | { email: string | null }[] | null };
  return apiOk({
    link: link.id ? linkBody(scope, link.id) : null,
    members: ((members.data ?? []) as MemberRow[]).map((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return { id: row.id, displayName: row.display_name, email: user?.email ?? "", joinedAt: row.joined_at };
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
  if (Date.parse(scope.expiresAt) <= Date.now()) return apiFail("EVENT_ENDED", "This event has ended", 409);

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
    .insert({ vendor_id: scope.vendorId, campaign_id: scope.campaignId, created_by: scope.userId })
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
    after_data: { vendor_id: scope.vendorId, campaign_id: scope.campaignId, ...(current.id ? { revoked_link_id: current.id } : {}) },
  });
  if (auditError) console.error("[event-staff] link audit failed", { linkId, message: auditError.message });
  return apiOk({ link: linkBody(scope, linkId) });
}
