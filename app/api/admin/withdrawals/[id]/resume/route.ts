import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { enqueueWithdrawalEmail } from '@/lib/email/events';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { requestIp } from '@/lib/wallet/request-ip';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { notifyWithdrawalApprovers } from '@/lib/wallet/approver-notifications';

const resumeSchema = z.object({ reasonCategory: z.string().trim().min(1), reason: z.string().trim().min(10).max(500) }).strict();
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  const parsed = await parseBody(request, resumeSchema);
  if (!parsed.ok) return parsed.response;
  const validated = walletReasonSchema.safeParse({ action: 'resume', ...parsed.data });
  if (!validated.success) return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid resume reason', 422);
  const moderation = await moderateWalletAction({ actorId: user.id, withdrawalId: id, action: 'resume', reasonCategory: validated.data.reasonCategory, reason: validated.data.reason });
  if (!moderation.ok) return apiFail(moderation.code, moderation.message, moderation.code === 'MODERATION_UNAVAILABLE' ? 503 : moderation.code === 'RATE_LIMITED' ? 429 : 422);
  const { data, error } = await db.rpc('resume_wallet_withdrawal', {
    p_id: id,
    p_reason: validated.data.reason,
    p_ip: requestIp(request),
    p_reason_category: validated.data.reasonCategory,
  });
  if (error) {
    const message = error.message ?? 'Unable to resume withdrawal';
    const code = message.includes('approver_required') ? 'FORBIDDEN' : message.includes('self_dealing') ? 'SELF_DEALING' : message.includes('withdrawal_not_resumable') ? 'INVALID_STATE' : 'RESUME_FAILED';
    return apiFail(code, message, code === 'FORBIDDEN' || code === 'SELF_DEALING' ? 403 : 409);
  }
  const result = data as { user_id: string; amount_rm: number; approval_cycle: number };
  try {
    await enqueueWithdrawalEmail({ withdrawalId: `${id}:cycle:${result.approval_cycle}`, userId: result.user_id, eventType: 'withdrawal_resumed', amountRm: Number(result.amount_rm) });
  } catch (emailError) {
    console.error('[withdrawal-resume] email enqueue failed:', emailError);
  }
  await notifyWithdrawalApprovers({
    withdrawalId: id,
    customerUserId: result.user_id,
    amountRm: Number(result.amount_rm),
    approvalCycle: result.approval_cycle,
  });
  return apiOk({ status: 'pending', approval_cycle: result.approval_cycle });
}
