import { createClient } from '@/lib/supabase/server';
import { kycReviewSchema, parseBody, apiOk, apiFail } from '@/lib/validation/schemas';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, kycReviewSchema);
  if (!parsed.ok) return parsed.response;
  const { userId, action, reasonCode, reasonDetail } = parsed.data;
  const trimmedReasonDetail = reasonDetail?.trim() || null;

  const { error: rpcErr } = await supabase.rpc('admin_review_kyc', {
    p_user_id: userId,
    p_action: action,
    p_reason_code: action === 'approve' ? null : reasonCode ?? null,
    p_reason_detail: action === 'approve' ? null : trimmedReasonDetail,
  });

  if (rpcErr) {
    if (rpcErr.message.includes('admin_required'))
      return apiFail('FORBIDDEN', 'Admin role required', 403);
    if (rpcErr.message.includes('kyc_not_active_or_not_found'))
      return apiFail('CONFLICT', 'No active KYC submission found for this user', 409);
    if (rpcErr.message.includes('tier_insufficient'))
      return apiFail('CONFLICT', 'User has not completed profile — use admin_set_tier first', 409);
    return apiFail('RPC_ERROR', rpcErr.message, 500);
  }

  const tierAfter = action === 'approve' ? 'kyc_verified' : 'profile_complete';

  return apiOk({ userId, tier: tierAfter, action });
}
