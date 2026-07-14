import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { auditAndNotify } from '@/lib/audit';

const kycReviewSchema = z.object({
  userId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  action: z.enum(['approve', 'reject', 'request_info']),
  reason: z.string().max(500).optional(),
}).strict().refine(
  (d) => d.action === 'approve' || (!!d.reason && d.reason.length >= 10),
  { message: 'Non-approve actions require a reason of at least 10 characters', path: ['reason'] },
);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, kycReviewSchema);
  if (!parsed.ok) return parsed.response;
  const { userId, action, reason } = parsed.data;

  const { error: rpcErr } = await supabase.rpc('admin_review_kyc', {
    p_user_id: userId,
    p_action:  action,
    p_reason:  reason ?? null,
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

  const notifType = action === 'approve' ? 'kyc_approved'
                  : action === 'reject'   ? 'kyc_rejected'
                  :                         'kyc_info_requested';

  await auditAndNotify(
    {
      action:     `kyc.${action}`,
      entityType: 'user',
      entityId:   userId,
      afterData:  { tier: tierAfter },
      note:       reason,
    },
    [{
      userId,
      type:  notifType,
      title: action === 'approve'       ? 'KYC verification approved!'
           : action === 'request_info'  ? 'Additional info needed for your KYC'
           :                              'KYC submission rejected',
      body: action === 'approve'
          ? 'You can now withdraw your earnings and access premium features.'
          : (reason ?? 'Please check your notification for details and re-submit.'),
      link: '/customer/kyc',
    }],
  );

  return apiOk({ userId, tier: tierAfter, action });
}
