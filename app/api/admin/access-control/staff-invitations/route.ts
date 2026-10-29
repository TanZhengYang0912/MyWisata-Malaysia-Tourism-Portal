import { z } from "zod";

import {
  createStaffInvitationToken,
  hashStaffInvitationToken,
  normalizeStaffInvitationEmail,
} from "@/lib/staff-invitations/server";
import {
  deliverPreparedInvitation,
  invitationFailure,
  preparedInvitation,
} from "@/lib/staff-invitations/route-helpers";
import { mutationReceipt } from "@/app/api/admin/access-control/_shared";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().trim().email().max(254),
  staffRoleId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
}).strict();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().refine((size) => [25, 50, 100].includes(size)).default(25),
  status: z.enum(["pending", "expired", "accepted", "revoked", "all"]).default("pending"),
});

export async function GET(request: Request) {
  const { response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiFail("VALIDATION_FAILED", "Invalid invitation filters", 422);
  const { page, pageSize, status } = parsed.data;
  const now = new Date().toISOString();
  try {
    const service = createServiceClient();
    let query = service
      .from("staff_invitations")
      .select("id,invited_email,role_name_snapshot,permission_keys_snapshot,status,delivery_status,send_attempt_count,expires_at,created_at,accepted_at,revoked_at", { count: "exact" })
      .order("created_at", { ascending: false }).order("id", { ascending: false });
    if (status === "pending" || status === "expired") {
      query = query.eq("status", "pending");
      query = status === "expired" ? query.lte("expires_at", now) : query.gt("expires_at", now);
    } else if (status !== "all") query = query.eq("status", status);
    const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return apiFail("STAFF_INVITATIONS_UNAVAILABLE", "Unable to load staff invitations", 503);

    return apiOk({
      total: count ?? 0, page, pageSize, totalPages: Math.ceil((count ?? 0) / pageSize),
      invitations: (data ?? []).map((row) => ({
        id: row.id,
        invitedEmail: row.invited_email,
        roleName: row.role_name_snapshot,
        permissionKeys: row.permission_keys_snapshot,
        status: row.status === "pending" && row.expires_at <= now ? "expired" : row.status,
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
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

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
  const delivery = await deliverPreparedInvitation(db, prepared, token, tokenHash);
  const deliveryStatus = !delivery.finalized ? "sending" : delivery.sent ? "sent" : "failed";
  return mutationReceipt(db, user.id, "staff.invitation.created", prepared.id, {
    id: prepared.id,
    status: prepared.status,
    deliveryStatus,
    expiresAt: prepared.expires_at,
  }, delivery.sent && delivery.finalized ? 201 : 202);
}
