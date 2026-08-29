import { createClient } from '@/lib/supabase/server';
import { kycReviewSchema, parseBody, apiOk, apiFail } from '@/lib/validation/schemas';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: canReview, error: capabilityError } = await supabase.rpc('can_review_kyc', {
    uid: user.id,
  });
  if (capabilityError || canReview !== true) {
    return apiFail('FORBIDDEN', 'KYC reviewer role required', 403);
  }

  const parsed = await parseBody(request, kycReviewSchema);
  if (!parsed.ok) return parsed.response;
  const { submissionId, userId, action, reasonCode, reasonDetail } = parsed.data;
  const trimmedReasonDetail = reasonDetail?.trim() || null;

  const { error: rpcErr } = await supabase.rpc('admin_review_kyc', {
    p_submission_id: submissionId,
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
    if (rpcErr.message.includes('kyc_not_assigned'))
      return apiFail('CONFLICT', 'This KYC submission is assigned to another reviewer', 409);
    return apiFail('RPC_ERROR', rpcErr.message, 500);
  }

  const kycStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';

  return apiOk({ userId, kycStatus, action });
}
