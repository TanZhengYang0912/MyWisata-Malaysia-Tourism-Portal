import { z } from "zod";

import { sendStaffInvitationEmail } from "@/lib/email/sender";
import {
  buildStaffInvitationUrl,
  createStaffInvitationToken,
  hashStaffInvitationToken,
  normalizeStaffInvitationEmail,
  staffInvitationOrigin,
} from "@/lib/staff-invitations/server";
import type { StaffInvitationLocale } from "@/lib/staff-invitations/types";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { isStaffPermissionKey } from "@/lib/staff-permissions/types";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().trim().email().max(254),
  staffRoleId: z.string().uuid(),
  locale: z.enum(["en", "ms", "zh-CN"]).optional().default("en"),
  reason: z.string().trim().min(10).max(500),
}).strict();

export type PreparedStaffInvitation = {
  id: string;
  invited_email: string;
  role_name: string;
  permission_keys: string[];
  status: "pending";
  delivery_status: "sending";
  expires_at: string;
};

export function invitationFailure(message: string) {
  if (message.includes("staff_invitation_identity_has_role") || message.includes("staff_invitation_identity_exists")) {
    return apiFail("IDENTITY_ALREADY_IN_USE", "This email already belongs to an existing account or role", 409);
  }
  if (message.includes("staff_invitation_pending_exists")) {
    return apiFail("INVITATION_ALREADY_PENDING", "A pending invitation already exists for this email", 409);
  }
  if (message.includes("staff_invitation_resend_cooldown")) {
    return apiFail("RESEND_COOLDOWN", "Please wait before resending this invitation", 429);
  }
  if (message.includes("staff_invitation_not_found")) {
    return apiFail("NOT_FOUND", "The staff invitation was not found", 404);
  }
  if (message.includes("staff_invitation_terminal") || message.includes("staff_role_inactive")) {
    return apiFail("INVITATION_UNAVAILABLE", "This invitation can no longer be changed", 409);
  }
  if (message.includes("super_admin_required")) {
    return apiFail("FORBIDDEN", "Active global Super Admin access required", 403);
  }
  return apiFail("STAFF_INVITATION_FAILED", "Unable to complete the staff invitation operation", 500);
}

export function preparedInvitation(value: unknown): PreparedStaffInvitation | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.invited_email !== "string"
      || typeof row.role_name !== "string" || !Array.isArray(row.permission_keys)
      || !row.permission_keys.every((key) => typeof key === "string" && isStaffPermissionKey(key))
      || typeof row.expires_at !== "string") return null;
  return row as PreparedStaffInvitation;
}

export async function deliverPreparedInvitation(
  db: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  prepared: PreparedStaffInvitation,
  token: string,
  tokenHash: string,
  locale: StaffInvitationLocale,
) {
  let sent = false;
  try {
    await sendStaffInvitationEmail({
      to: prepared.invited_email,
      locale,
      roleName: prepared.role_name,
      permissionKeys: prepared.permission_keys.filter(isStaffPermissionKey),
      invitationUrl: buildStaffInvitationUrl(staffInvitationOrigin(), token),
      expiresAt: prepared.expires_at,
    });
    sent = true;
  } catch {
    sent = false;
  }

  const { error } = await db.rpc("finalize_staff_invitation_delivery", {
    p_invitation_id: prepared.id,
    p_token_hash: tokenHash,
    p_succeeded: sent,
  });
  return { sent, finalized: !error };
}

export async function GET() {
  const { response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("staff_invitations")
      .select("id,invited_email,role_name_snapshot,permission_keys_snapshot,status,delivery_status,send_attempt_count,expires_at,created_at,accepted_at,revoked_at")
      .order("created_at", { ascending: false });
    if (error) return apiFail("STAFF_INVITATIONS_UNAVAILABLE", "Unable to load staff invitations", 503);

    return apiOk({
      invitations: (data ?? []).map((row) => ({
        id: row.id,
        invitedEmail: row.invited_email,
        roleName: row.role_name_snapshot,
        permissionKeys: row.permission_keys_snapshot,
        status: row.status,
        deliveryStatus: row.delivery_status,
        sendAttemptCount: row.send_attempt_count,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        acceptedAt: row.accepted_at,
        revokedAt: row.revoked_at,
      })),
    });
  } catch {
    return apiFail("STAFF_INVITATIONS_UNAVAILABLE", "Unable to load staff invitations", 503);
  }
}

export async function POST(request: Request) {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  const token = createStaffInvitationToken();
  const tokenHash = hashStaffInvitationToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.rpc("prepare_staff_invitation", {
    p_invited_email: normalizeStaffInvitationEmail(parsed.data.email),
    p_staff_role_id: parsed.data.staffRoleId,
    p_reason: parsed.data.reason,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) return invitationFailure(error.message);

  const prepared = preparedInvitation(data);
  if (!prepared) return apiFail("STAFF_INVITATION_FAILED", "Unable to prepare the staff invitation", 500);
  const delivery = await deliverPreparedInvitation(db, prepared, token, tokenHash, parsed.data.locale);
  if (!delivery.sent || !delivery.finalized) {
    return apiFail("STAFF_INVITATION_DELIVERY_FAILED", "The invitation was created but email delivery could not be confirmed", 503);
  }

  return apiOk({
    id: prepared.id,
    status: prepared.status,
    deliveryStatus: "sent",
    expiresAt: prepared.expires_at,
  }, { status: 201 });
}
