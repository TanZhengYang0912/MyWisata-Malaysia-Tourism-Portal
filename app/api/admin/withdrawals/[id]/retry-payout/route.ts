import { z } from 'zod';
import { executeApprovedWithdrawalPayout } from '@/lib/payouts/execute-approved-withdrawal';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { requestIp } from '@/lib/wallet/request-ip';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const retrySchema = z.object({
  note: z.string().trim().min(10).max(500),
  reasonCategory: z.string().trim().min(1),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: withdrawalId } = await params;
  const authDb = await createClient();
  const { data: { user } } = await authDb.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: canApprove, error: roleError } = await authDb.rpc('is_approver', { uid: user.id });
  if (roleError || !canApprove) return apiFail('FORBIDDEN', 'Approver or Super Admin access required', 403);

  const parsed = await parseBody(request, retrySchema);
  if (!parsed.ok) return parsed.response;
  const validated = walletReasonSchema.safeParse({
    action: 'approve',
    reason: parsed.data.note,
    reasonCategory: parsed.data.reasonCategory,
  });
  if (!validated.success) {
    return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid retry reason', 422);
  }

  const moderation = await moderateWalletAction({
    actorId: user.id,
    withdrawalId,
    action: 'approve',
    reasonCategory: validated.data.reasonCategory,
    reason: validated.data.reason,
  });
  if (!moderation.ok) {
    return apiFail(
      moderation.code,
      moderation.message,
      moderation.code === 'MODERATION_UNAVAILABLE' ? 503 : moderation.code === 'RATE_LIMITED' ? 429 : 422,
    );
  }

  const db = createServiceClient();
  const { data: withdrawal, error: withdrawalError } = await db
    .from('withdrawal_requests')
    .select('id, user_id, amount, status')
    .eq('id', withdrawalId)
    .single();
  if (withdrawalError || !withdrawal) return apiFail('NOT_FOUND', 'Withdrawal not found', 404);
  if (withdrawal.status !== 'approved') {
    return apiFail('INVALID_STATE', 'Payout can only be retried while the withdrawal remains approved. Refresh the page to review its latest status.', 409);
  }

  const { error: retryError } = await db.rpc('record_withdrawal_payout_retry', {
    p_withdrawal_id: withdrawalId,
    p_actor_id: user.id,
    p_note: validated.data.reason,
    p_ip: requestIp(request),
    p_reason_category: validated.data.reasonCategory,
  });
  if (retryError) {
    const message = retryError.message ?? '';
    if (message.includes('self_dealing')) return apiFail('SELF_DEALING', 'You cannot retry your own withdrawal. Ask another Approver or Super Admin to process it.', 403);
    if (message.includes('withdrawal_not_retryable')) return apiFail('INVALID_STATE', 'Payout can only be retried while the withdrawal remains approved. Refresh the page to review its latest status.', 409);
    if (message.includes('payout_execution_in_progress')) return apiFail('PAYOUT_EXECUTION_IN_PROGRESS', 'Another payout attempt is active. Do not retry. Refresh the page and ask a Super Admin to reconcile it if the lock remains.', 409, { retryable: false });
    if (message.includes('payout_reconciliation_required')) return apiFail('RECONCILIATION_REQUIRED', 'This payout may already exist at the provider. Do not retry; reconcile the provider reference first.', 409, { retryable: false });
    console.error('[admin-retry-payout] record_withdrawal_payout_retry:', retryError);
    return apiFail('RETRY_AUDIT_FAILED', 'The retry could not be recorded safely. No new provider call was made; refresh the page and try again.', 500);
  }

  const execution = await executeApprovedWithdrawalPayout({
    withdrawalId,
    userId: withdrawal.user_id,
    amountRm: Number(withdrawal.amount),
  });
  if (!execution.ok) return execution.response;
  return apiOk(execution.data);
}
