// Trigger a Stripe payout for an already-approved withdrawal.
// Called either automatically by the approve route or manually via a retry
// button in /admin/withdrawals when Stripe is temporarily unreachable.

import { createClient } from '@/lib/supabase/server';
import { apiFail } from '@/lib/validation/schemas';
import { initiatePayout, StripeConfigError, StripePayoutError } from '@/lib/stripe';
import { recordAudit } from '@/lib/audit';

interface Props { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Props) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', '', 401);

  const { data: isApprover } = await supabase.rpc('is_approver', { uid: user.id });
  if (!isApprover) return apiFail('FORBIDDEN', 'Approver only', 403);

  // Load the request. Must be in 'approved' state (post single/dual approval, pre-payout).
  const { data: req } = await supabase
    .from('withdrawal_requests')
    .select('id, user_id, amount, status')
    .eq('id', requestId)
    .single();
  if (!req) return apiFail('NOT_FOUND', '', 404);
  if (req.status !== 'approved') {
    return apiFail(
      'INVALID_STATE',
      `Withdrawal must be 'approved' to initiate payout (is '${req.status}')`,
      409,
    );
  }

  // Call Stripe. On network/API error, leave status='approved' so admin can retry.
  let transfer;
  try {
    transfer = await initiatePayout({
      amountRM:            Number(req.amount),
      withdrawalRequestId: req.id,
      recipientUserId:     req.user_id,
    });
  } catch (err) {
    const isConfig = err instanceof StripeConfigError;
    const code    = isConfig ? 'STRIPE_NOT_CONFIGURED'
                             : err instanceof StripePayoutError ? 'STRIPE_PAYOUT_FAILED'
                             : 'STRIPE_UNKNOWN';
    const message = err instanceof Error ? err.message : 'Unknown Stripe error';
    await recordAudit({
      actorId:    user.id,
      action:     'withdrawal.payout_failed',
      entityType: 'withdrawal_request',
      entityId:   requestId,
      note:       `${code}: ${message}`,
    });
    return apiFail(code, message, isConfig ? 503 : 502);
  }

  // Persist the pending payout via RPC (moves withdrawal.status → 'processing')
  const { data: payoutId, error: rpcError } = await supabase.rpc('record_payout_pending', {
    p_request_id:  requestId,
    p_gateway:     'stripe',
    p_gateway_ref: transfer.transferId,
    p_metadata:    { amount_sen: transfer.amountSen, currency: 'myr' },
  });
  if (rpcError) return apiFail('RPC_ERROR', rpcError.message, 500);

  await recordAudit({
    actorId:    user.id,
    action:     'withdrawal.payout_initiated',
    entityType: 'withdrawal_request',
    entityId:   requestId,
    afterData:  { stripe_transfer_id: transfer.transferId, amount_sen: transfer.amountSen },
  });

  return Response.json({
    data: {
      payoutId,
      transferId: transfer.transferId,
      status:     'processing',
    },
    error: null,
  }, { status: 201 });
}
