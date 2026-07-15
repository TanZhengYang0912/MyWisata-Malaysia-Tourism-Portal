import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { userManagementActionSchema } from "@/lib/validation/user-management-schemas";
import { getUserManagementEmailType } from "@/lib/user-management/email";
import { enqueueUserAccountEmail } from "@/lib/email/events";
import { moderateAccountText } from "@/lib/moderation";

interface Props { params: Promise<{ userId: string }> }

function mapRpcError(message: string) {
  if (message.includes("super_admin_required")) return apiFail("FORBIDDEN", "Super Admin access required", 403);
  if (message.includes("privileged_target") || message.includes("self_target_forbidden")) return apiFail("FORBIDDEN", "This account cannot be managed here", 403);
  if (message.includes("user_not_found")) return apiFail("NOT_FOUND", "User not found", 404);
  if (message.includes("pending_withdrawal_blocks_delete")) return apiFail("CONFLICT", "Resolve pending or processing withdrawals before closing this account", 409);
  if (message.includes("reason_too_short")) return apiFail("VALIDATION_FAILED", "Reason must be at least 10 characters", 422);
  if (message.includes("user_must_be_")) return apiFail("INVALID_STATE", "This user is not in a state eligible for that action", 409);
  return apiFail("USER_MANAGEMENT_FAILED", "Unable to update this user", 500);
}

async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, response: apiFail("UNAUTHORIZED", "Sign in required", 401) };
  const { data: isSuperAdmin, error } = await supabase.rpc("is_super_admin", { uid: user.id });
  if (error || !isSuperAdmin) return { supabase, user, response: apiFail("FORBIDDEN", "Super Admin access required", 403) };
  return { supabase, user, response: null };
}

export async function GET(_request: Request, { params }: Props) {
  const { userId } = await params;
  const { supabase, response } = await requireSuperAdmin();
  if (response) return response;
  const { data, error } = await supabase.rpc("admin_get_user", { p_user_id: userId });
  if (error) return mapRpcError(error.message);
  return apiOk(data);
}

export async function POST(request: Request, { params }: Props) {
  const { userId } = await params;
  const { user, response } = await requireSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  let body: unknown;
  try { body = await request.json(); } catch { return apiFail("INVALID_BODY", "A JSON body is required", 400); }
  const parsed = userManagementActionSchema.safeParse({ ...(body as Record<string, unknown>), userId });
  if (!parsed.success) return apiFail("VALIDATION_FAILED", "Action and a reason of at least 10 characters are required", 422, parsed.error.flatten());

  const moderationContext = {
    suspend: "suspend_reason",
    soft_delete: "soft_delete_reason",
    unsuspend: "unsuspend_reason",
  } as const;
  const context = moderationContext[parsed.data.action as keyof typeof moderationContext];
  if (context) {
    const moderation = await moderateAccountText(parsed.data.reason, context);
    if ("error" in moderation && moderation.error === "api_unavailable") {
      return apiFail("MODERATION_UNAVAILABLE", "Content review is temporarily unavailable; please try again", 503);
    }
    if ("flagged" in moderation && moderation.flagged) {
      return apiFail("CONTENT_REJECTED", "This reason contains disallowed content", 422);
    }
  }

  const { data, error } = await createServiceClient().rpc("admin_manage_user", {
    p_actor_id: user.id,
    p_user_id: userId,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason,
  });
  if (error) return mapRpcError(error.message);

  const emailType = getUserManagementEmailType(parsed.data.action);
  if (emailType) {
    const result = data as { email?: string; name?: string; userId?: string };
    try {
      await enqueueUserAccountEmail({
        userId: result.userId ?? userId,
        eventType: emailType,
        eventKey: `${emailType}:${result.userId ?? userId}:${Date.now()}`,
        reason: parsed.data.reason,
      });
    } catch (emailError) {
      console.error("[user-management] account email enqueue failed", emailError);
    }
  }
  return apiOk(data);
}
