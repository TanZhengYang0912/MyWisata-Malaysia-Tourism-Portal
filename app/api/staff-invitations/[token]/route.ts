import { staffPermissionLabel } from "@/lib/email/staff-invitation";
import { hashStaffInvitationToken } from "@/lib/staff-invitations/server";
import type { StaffInvitationLocale } from "@/lib/staff-invitations/types";
import { isStaffPermissionKey } from "@/lib/staff-permissions/types";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ token: string }> }

function localeFromRequest(request: Request): StaffInvitationLocale {
  const locale = new URL(request.url).searchParams.get("locale");
  return locale === "ms" || locale === "zh-CN" ? locale : "en";
}

function withPrivateHeaders(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function relationOne(value: unknown): Record<string, unknown> | null {
  const relation = Array.isArray(value) ? value[0] : value;
  return relation && typeof relation === "object" ? relation as Record<string, unknown> : null;
}

function currentPermissionKeys(role: Record<string, unknown> | null): string[] {
  const relations = Array.isArray(role?.staff_role_permissions) ? role.staff_role_permissions : [];
  return relations.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const permission = relationOne((entry as Record<string, unknown>).staff_permissions);
    return typeof permission?.key === "string" ? [permission.key] : [];
  }).sort();
}

export async function GET(request: Request, { params }: Props) {
  const { token } = await params;
  if (!token || token.length > 256) return withPrivateHeaders(apiFail("NOT_FOUND", "Invitation not found", 404));

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("staff_invitations")
      .select("invited_email,role_name_snapshot,permission_keys_snapshot,status,delivery_status,expires_at,staff_roles(name,is_active,staff_role_permissions(staff_permissions(key)))")
      .eq("token_hash", hashStaffInvitationToken(token))
      .maybeSingle();
    if (error) return withPrivateHeaders(apiFail("INVITATION_UNAVAILABLE", "Unable to load this invitation", 503));
    if (!data) return withPrivateHeaders(apiFail("NOT_FOUND", "Invitation not found", 404));

    const role = relationOne(data.staff_roles);
    const snapshotKeys = Array.isArray(data.permission_keys_snapshot)
      ? data.permission_keys_snapshot.filter((key): key is string => typeof key === "string").sort()
      : [];
    const liveKeys = currentPermissionKeys(role);
    const roleChanged = !role || role.is_active !== true || role.name !== data.role_name_snapshot
      || JSON.stringify(liveKeys) !== JSON.stringify(snapshotKeys);
    const expired = data.status === "pending" && new Date(data.expires_at).getTime() <= Date.now();
    const status = roleChanged && data.status === "pending"
      ? "role_changed"
      : expired ? "expired" : data.status;
    const locale = localeFromRequest(request);
    const permissions = snapshotKeys.filter(isStaffPermissionKey).map((key) => staffPermissionLabel(locale, key));

    return withPrivateHeaders(apiOk({
      email: data.invited_email,
      roleName: data.role_name_snapshot,
      permissions,
      status,
      expiresAt: data.expires_at,
    }));
  } catch {
    return withPrivateHeaders(apiFail("INVITATION_UNAVAILABLE", "Unable to load this invitation", 503));
  }
}

function acceptanceFailure(message: string) {
  const matches: Array<[string, string, string, number]> = [
    ["invalid_invitation", "INVALID_INVITATION", "This invitation is invalid or no longer available", 404],
    ["already_used", "INVITATION_USED", "This invitation has already been accepted or revoked", 409],
    ["invitation_expired", "INVITATION_EXPIRED", "This invitation has expired", 410],
    ["email_not_verified", "EMAIL_NOT_VERIFIED", "Verify the invited email before accepting", 403],
    ["email_mismatch", "EMAIL_MISMATCH", "Sign in with the email address that received this invitation", 403],
    ["identity_mismatch", "IDENTITY_MISMATCH", "This invitation belongs to another account", 403],
    ["staff_identity_has_role", "IDENTITY_ALREADY_IN_USE", "This account already has another role", 409],
    ["staff_role_changed", "ROLE_CHANGED", "The invited role changed; ask a Super Admin to resend", 409],
    ["staff_role_unavailable", "ROLE_UNAVAILABLE", "The invited role is no longer available", 409],
  ];
  const match = matches.find(([needle]) => message.includes(needle));
  return match
    ? apiFail(match[1], match[2], match[3])
    : apiFail("STAFF_INVITATION_ACCEPT_FAILED", "Unable to accept this invitation", 500);
}

export async function POST(_request: Request, { params }: Props) {
  const { token } = await params;
  if (!token || token.length > 256) return apiFail("INVALID_INVITATION", "This invitation is invalid", 404);
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail("UNAUTHORIZED", "Sign in or register with the invited email first", 401);

  const { error } = await db.rpc("accept_staff_invitation", {
    p_token_hash: hashStaffInvitationToken(token),
  });
  if (error) return acceptanceFailure(error.message);
  return withPrivateHeaders(apiOk({ accepted: true }));
}
