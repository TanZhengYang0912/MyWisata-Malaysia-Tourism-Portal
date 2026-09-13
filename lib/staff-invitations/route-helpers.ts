import { sendStaffInvitationEmail } from "@/lib/email/sender";
import {
  buildStaffInvitationUrl,
  staffInvitationOrigin,
} from "@/lib/staff-invitations/server";
import type { StaffInvitationLocale } from "@/lib/staff-invitations/types";
import { isStaffPermissionKey } from "@/lib/staff-permissions/types";
import { apiFail } from "@/lib/validation/schemas";

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
