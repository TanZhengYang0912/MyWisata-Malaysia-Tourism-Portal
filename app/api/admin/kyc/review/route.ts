import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { auditAndNotify } from '@/lib/audit';

const kycReviewSchema = z.object({
  userId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
}).strict().refine(
  (d) => d.action === 'approve' || (!!d.reason && d.reason.length >= 10),
  { message: 'Reject requires a reason of at least 10 characters', path: ['reason'] },
);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, kycReviewSchema);
  if (!parsed.ok) return parsed.response;
  const { userId, action, reason } = parsed.data;

  // Atomic: update kyc_submissions + users.kyc_status + gen_affiliate_code (on approve)
  // RPC enforces is_admin(auth.uid()) internally.
  const { error: rpcErr } = await supabase.rpc('admin_review_kyc', {
    p_user_id: userId,
    p_action:  action,
    p_reason:  reason ?? null,
  });

  if (rpcErr) {
    if (rpcErr.message.includes('admin_required'))
      return apiFail('FORBIDDEN', 'Admin role required', 403);
    if (rpcErr.message.includes('self_dealing'))
      return apiFail('FORBIDDEN', 'You cannot review your own KYC submission', 403);
    if (rpcErr.message.includes('kyc_not_pending_or_not_found'))
      return apiFail('CONFLICT', 'KYC already reviewed or user not found. If incorrect, ask the user to re-submit.', 409);
    return apiFail('RPC_ERROR', rpcErr.message, 500);
  }

  const newTier = action === 'approve' ? 'kyc_verified' : 'profile_complete';

  await auditAndNotify(
    {
      action:     `kyc.${action}`,
      entityType: 'user',
      entityId:   userId,
      afterData:  { verificationTier: newTier },
      note:       reason,
    },
    [{
      userId,
      type:  action === 'approve' ? 'kyc_approved' : 'kyc_rejected',
      title: action === 'approve'
        ? 'Your KYC verification was approved!'
        : 'Your KYC submission was rejected',
      body:  action === 'approve'
        ? 'You can now withdraw your earnings and access premium features.'
        : (reason ?? 'Please re-upload your documents and try again.'),
      link:  '/customer/kyc',
    }],
  );

  return apiOk({ userId, verificationTier: newTier });
}
