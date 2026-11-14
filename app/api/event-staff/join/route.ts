import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveActiveStaffLink } from "@/lib/events/event-staff";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const schema = z.object({
  token: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(80),
}).strict();

async function membership(db: SupabaseClient, vendorId: string, campaignId: string, userId: string) {
  const { data, error } = await db.from("event_staff_members").select("id,removed_at")
    .eq("vendor_id", vendorId).eq("campaign_id", campaignId).eq("user_id", userId).maybeSingle();
  return { member: data as { id: string; removed_at: string | null } | null, error };
}

/** Join a vendor's event staff through its link. Idempotent; a removed member stays out. */
export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);
  if (!user.email_confirmed_at) return apiFail("EMAIL_UNVERIFIED", "Verify your email first", 403);
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const db = createServiceClient() as SupabaseClient;
  const { link, error: linkError } = await resolveActiveStaffLink(db, parsed.data.token);
  if (linkError) return apiFail("DB_ERROR", "Unable to load this link", 500);
  if (!link) return apiFail("LINK_INVALID", "This link is invalid or has expired", 404);
  const joined = apiOk({ vendorId: link.vendorId, campaignId: link.campaignId });
  const removed = () => apiFail("MEMBER_REMOVED", "You were removed from this event's staff", 403);

  const existing = await membership(db, link.vendorId, link.campaignId, user.id);
  if (existing.error) return apiFail("DB_ERROR", "Unable to join", 500);
  if (existing.member) return existing.member.removed_at ? removed() : joined;

  // ON CONFLICT DO NOTHING: a concurrent join (or an earlier removal) keeps its row and name.
  const { data: inserted, error } = await db.from("event_staff_members")
    .upsert({
      vendor_id: link.vendorId,
      campaign_id: link.campaignId,
      user_id: user.id,
      display_name: parsed.data.displayName,
      joined_via: link.linkId,
    }, { onConflict: "vendor_id,campaign_id,user_id", ignoreDuplicates: true })
    .select("id");
  if (error) return apiFail("DB_ERROR", "Unable to join", 500);
  const memberId = (inserted as { id: string }[] | null)?.[0]?.id;
  if (!memberId) {
    const winner = await membership(db, link.vendorId, link.campaignId, user.id);
    if (winner.error || !winner.member) return apiFail("DB_ERROR", "Unable to join", 500);
    return winner.member.removed_at ? removed() : joined;
  }

  const { error: auditError } = await db.from("audit_logs").insert({
    actor_id: user.id,
    action: "event_staff.joined",
    entity_type: "event_staff_member",
    entity_id: memberId,
    after_data: { vendor_id: link.vendorId, campaign_id: link.campaignId, link_id: link.linkId },
  });
  if (auditError) console.error("[event-staff] join audit failed", { memberId, message: auditError.message });
  return joined;
}
