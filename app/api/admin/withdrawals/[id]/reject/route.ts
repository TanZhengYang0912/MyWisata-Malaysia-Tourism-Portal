import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { requestIp } from '@/lib/wallet/request-ip';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const rejectSchema = z.object({ reasonCategory: z.string().trim().min(1), reason: z.string().trim().min(10).max(500) }).strict();

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
  const validated = walletReasonSchema.safeParse({ action: 'reject', ...parsed.data });
  if (!validated.success) return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid rejection reason', 422);
  const moderation = await moderateWalletAction({ actorId: user.id, withdrawalId: id, action: 'reject', reasonCategory: validated.data.reasonCategory, reason: validated.data.reason });
  if (!moderation.ok) return apiFail(moderation.code, moderation.message, moderation.code === 'MODERATION_UNAVAILABLE' ? 503 : moderation.code === 'RATE_LIMITED' ? 429 : 422);

  const { data, error } = await db.rpc('reject_wallet_withdrawal', {
    p_id: id,
    p_reason: parsed.data.reason,
    p_ip: requestIp(request),
    p_reason_category: validated.data.reasonCategory,
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
