import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { moderateAccountText } from '@/lib/moderation';
import { requestIp } from '@/lib/wallet/request-ip';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const rejectSchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, rejectSchema);
  if (!parsed.ok) return parsed.response;
  const moderation = await moderateAccountText(parsed.data.reason, 'withdrawal_reject_reason');
  if ('error' in moderation) return apiFail('MODERATION_UNAVAILABLE', 'Content review is temporarily unavailable; please try again', 503);
  if (moderation.flagged) return apiFail('CONTENT_REJECTED', 'The rejection reason contains disallowed content', 422);

  const { data, error } = await db.rpc('reject_wallet_withdrawal', {
    p_id: id,
    p_reason: parsed.data.reason,
    p_ip: requestIp(request),
  });
  if (error) {
    const message = error.message ?? 'Unable to reject withdrawal';
    const code = message.includes('approver_required') ? 'FORBIDDEN'
      : message.includes('self_dealing') ? 'SELF_DEALING'
        : message.includes('withdrawal_not_rejectable') ? 'INVALID_STATE'
          : 'REJECTION_FAILED';
    return apiFail(code, message, code === 'FORBIDDEN' || code === 'SELF_DEALING' ? 403 : 409);
  }

  const result = data as { user_id: string; amount_rm: number };
  try {
    await enqueueWithdrawalEmail({
      withdrawalId: id,
      userId: result.user_id,
      eventType: 'withdrawal_rejected',
      amountRm: Number(result.amount_rm),
    });
  } catch (emailError) {
    console.error('[withdrawal-reject] email enqueue failed:', emailError);
  }
  return apiOk({ status: 'rejected' });
}
