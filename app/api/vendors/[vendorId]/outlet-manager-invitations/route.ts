import { randomBytes } from "node:crypto";
import { z } from "zod";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import {
  buildOutletManagerInvitationLink,
  hashInvitationToken,
  normalizeInvitationEmail,
} from "@/lib/vendor/outlet-manager-invitation";

interface Props { params: Promise<{ vendorId: string }> }

const invitationSchema = z.object({
  outletId: z.string().uuid(),
  email: z.string().trim().email().max(255),
}).strict();

export async function POST(request: Request, { params }: Props) {
  const { vendorId } = await params;
  const access = await authorizeVendor(vendorId, ["vendor_owner"]);
  if (!access.ok) return access.response;

  const parsed = await parseBody(request, invitationSchema);
  if (!parsed.ok) return parsed.response;

  const email = normalizeInvitationEmail(parsed.data.email);
  const db = access.access.serviceDb;
  const [{ data: outlet, error: outletError }, { data: currentAssignment, error: assignmentError }, { data: existingUser, error: userError }] = await Promise.all([
    db.from("outlets").select("id,name,city,state,vendor_id").eq("id", parsed.data.outletId).eq("vendor_id", vendorId).maybeSingle(),
    db.from("outlet_managers").select("user_id").eq("outlet_id", parsed.data.outletId).maybeSingle(),
    db.from("users").select("id").eq("email", email).maybeSingle(),
  ]);

  if (outletError || assignmentError || userError) {
    return apiFail("DB_ERROR", (outletError || assignmentError || userError)?.message || "Unable to create invitation", 500);
  }
  if (!outlet) return apiFail("INVALID_OUTLET", "Outlet not found in this vendor", 400);
  if (currentAssignment) return apiFail("OUTLET_ALREADY_ASSIGNED", "This outlet already has an Outlet Manager", 409);

  const rawToken = randomBytes(32).toString("hex");
  const { error: invitationError } = await db
    .from("outlet_manager_invitations")
    .update({ status: "revoked" })
    .eq("outlet_id", parsed.data.outletId)
    .eq("status", "pending");
  if (invitationError) return apiFail("DB_ERROR", invitationError.message, 500);

  const { data: created, error: createError } = await db
    .from("outlet_manager_invitations")
    .insert({
      vendor_id: vendorId,
      outlet_id: parsed.data.outletId,
      invited_email: email,
      invited_by: access.access.userId,
      token_hash: hashInvitationToken(rawToken),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id,status,expires_at")
    .single();

  if (createError || !created) return apiFail("DB_ERROR", createError?.message || "Unable to create invitation", 500);

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return apiOk({
    id: created.id,
    status: created.status,
    invitedEmail: email,
    expiresAt: created.expires_at,
    existingAccount: Boolean(existingUser),
    outlet: { id: outlet.id, name: outlet.name, city: outlet.city, state: outlet.state },
    inviteUrl: buildOutletManagerInvitationLink(origin, rawToken),
  }, { status: 201 });
}
