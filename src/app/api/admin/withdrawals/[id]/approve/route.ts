// P-TMF — Admin/Approver acts on a withdrawal request
// POST /api/admin/withdrawals/[id]/approve
//   Body: { action: 'approve'|'reject'|'hold', note? }
//   Auth: approver / super_admin
//   Transaction: approve_withdrawal RPC handles ledger + status + segregation of duties

import { createClient } from '@/lib/supabase/server';
import { withdrawalApproveSchema, parseBody, apiFail } from '@/lib/validation/schemas';
import { withIdempotency } from '@/lib/idempotency';
import { onWithdrawalReviewed } from '@/lib/domain-events';
import { initiatePayout, StripeConfigError, StripePayoutError } from '@/lib/stripe';
import { recordAudit } from '@/lib/audit';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', '', 401);

  const { data: isApprover } = await supabase.rpc('is_approver', { uid: user.id });
  if (!isApprover) return apiFail('FORBIDDEN', 'Approver only', 403);

  const parsed = await parseBody(request, withdrawalApproveSchema);
  if (!parsed.ok) return parsed.response;

  const idem = await withIdempotency(
    request, user.id, `/api/admin/withdrawals/${requestId}/approve`, parsed.data,
  );
  if (idem.replayed) return idem.replayed;

  // Fetch the request for post-action notification
  const { data: req } = await supabase
    .from('withdrawal_requests')
    .select('user_id, amount, requires_dual_approval, status')
    .eq('id', requestId)
    .single();

  if (!req) return apiFail('NOT_FOUND', '', 404);
  if (req.status !== 'pending') {
    return apiFail('INVALID_STATE', `Request is ${req.status}, cannot act`, 409);
  }

  const { data: result, error } = await supabase.rpc('approve_withdrawal', {
    p_request_id:  requestId,
    p_approver_id: user.id,
    p_action:      parsed.data.action,
    p_note:        parsed.data.note ?? null,
  });

  if (error) {
    if (error.message.includes('own withdrawal')) {
      return apiFail('SELF_APPROVAL_FORBIDDEN', error.message, 403);
    }
    if (error.message.includes('already acted')) {
      return apiFail('ALREADY_ACTED', error.message, 409);
    }
    return apiFail('RPC_ERROR', error.message, 500);
  }

  // Domain event → audit + notify recipient
  await onWithdrawalReviewed(requestId, user.id, req.user_id, parsed.data.action === 'approve');

  // Auto-trigger Stripe payout when the withdrawal reaches 'approved' state.
  // The RPC only returns 'approved' when single/final dual approval passes.
  // If Stripe fails or is not configured, we leave status='approved' so admin can retry
  // via POST /api/admin/withdrawals/[id]/payout.
  let payoutInfo: { transferId?: string; status: string; error?: string } | null = null;
  if (result?.status === 'approved') {
    try {
      const transfer = await initiatePayout({
        amountRM:            Number(req.amount),
        withdrawalRequestId: requestId,
        recipientUserId:     req.user_id,
      });
      const { error: rpcErr } = await supabase.rpc('record_payout_pending', {
        p_request_id:  requestId,
        p_gateway:     'stripe',
        p_gateway_ref: transfer.transferId,
        p_metadata:    { amount_sen: transfer.amountSen, currency: 'myr' },
      });
      if (rpcErr) throw rpcErr;
      payoutInfo = { transferId: transfer.transferId, status: 'processing' };
      await recordAudit({
        actorId:    user.id,
        action:     'withdrawal.payout_initiated',
        entityType: 'withdrawal_request',
        entityId:   requestId,
        afterData:  { stripe_transfer_id: transfer.transferId },
      });
    } catch (err) {
      const isConfig = err instanceof StripeConfigError;
      const code = isConfig ? 'STRIPE_NOT_CONFIGURED'
                            : err instanceof StripePayoutError ? 'STRIPE_PAYOUT_FAILED'
                            : 'STRIPE_UNKNOWN';
      const message = err instanceof Error ? err.message : 'unknown';
      console.warn(`[approve] payout deferred: ${code} — ${message}`);
      payoutInfo = { status: 'deferred', error: `${code}: ${message}` };
      await recordAudit({
        actorId:    user.id,
        action:     'withdrawal.payout_deferred',
        entityType: 'withdrawal_request',
        entityId:   requestId,
        note:       `${code}: ${message}`,
      });
    }
  }

  return idem.record({ data: { ...result, payout: payoutInfo }, error: null });
}
