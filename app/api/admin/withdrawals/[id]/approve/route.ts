import { z } from 'zod';
import { executeApprovedWithdrawalPayout } from '@/lib/payouts/execute-approved-withdrawal';
import { scheduleTngMockCallbackAcceleration } from '@/lib/payouts/tng-mock-callbacks';
import { requireStaffPermission } from '@/lib/staff-permissions/server';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { requestIp } from '@/lib/wallet/request-ip';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

export const dynamic = 'force-dynamic';

const approveSchema = z.object({
  note: z.string().trim().min(10).max(500),
  reasonCategory: z.string().trim().min(1),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: withdrawalId } = await params;
  const { db, user: authUser, response } = await requireStaffPermission('admin.withdrawal.approve');
  if (response) return response;
  if (!authUser) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, approveSchema);
  if (!parsed.ok) return parsed.response;
  const { note, reasonCategory } = parsed.data;

  const validated = walletReasonSchema.safeParse({ action: 'approve', reason: note, reasonCategory });
  if (!validated.success) {
    return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid approval reason', 422);
  }

  const moderation = await moderateWalletAction({
    actorId: authUser.id,
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

  const { data: approvalResult, error: approvalError } = await db.rpc('approve_wallet_withdrawal', {
    p_withdrawal_id: withdrawalId,
    p_note: note,
    p_ip: requestIp(request),
    p_reason_category: validated.data.reasonCategory,
  });

  if (approvalError) {
    const message = approvalError.message ?? '';
    if (message.includes('approver_required')) return apiFail('FORBIDDEN', 'Approver or Super Admin access required', 403);
    if (message.includes('self_dealing')) return apiFail('SELF_DEALING', 'You cannot approve your own withdrawal. Ask another Approver or Super Admin to process it.', 403);
    if (message.includes('withdrawal_not_found')) return apiFail('NOT_FOUND', 'Withdrawal not found', 404);
    if (message.includes('withdrawal_not_approvable')) return apiFail('INVALID_STATE', 'This withdrawal is no longer awaiting approval. Refresh the page to review its latest status.', 409);
    if (message.includes('already_approved_by_this_actor')) return apiFail('DUPLICATE_APPROVAL', 'You have already approved this withdrawal. Ask another Approver or Super Admin to provide the required second approval.', 409);
    if (message.includes('high_risk_override_required')) return apiFail('HIGH_RISK_OVERRIDE_REQUIRED', 'A Super Admin must record a risk override before this withdrawal can be approved', 409);
    if (message.includes('note_length_invalid')) return apiFail('VALIDATION_FAILED', 'Note must be 10–500 characters', 422);
    console.error('[admin-approve] approve_wallet_withdrawal:', approvalError);
    return apiFail('APPROVAL_FAILED', 'The approval could not be recorded. No payout was started; refresh the page and try again, or ask a Super Admin for help.', 500);
  }

  const result = approvalResult as {
    status: string;
    ready: boolean;
    approval_count: number;
    required_approvals: number;
    user_id: string;
    amount_rm: number;
  };

  if (!result.ready) {
    return apiOk({
      status: result.status,
      approval_count: result.approval_count,
      required_approvals: result.required_approvals,
      message: 'First approval recorded — waiting for second approver.',
    });
  }

  const execution = await executeApprovedWithdrawalPayout({
    withdrawalId,
    userId: result.user_id,
    amountRm: result.amount_rm,
  });
  if (!execution.ok) return execution.response;
  const { callbackJobId, callbackAvailableAt, ...publicResult } = execution.data;
  if (callbackJobId && callbackAvailableAt) {
    scheduleTngMockCallbackAcceleration(callbackJobId, callbackAvailableAt);
  }
  return apiOk(publicResult);
}
