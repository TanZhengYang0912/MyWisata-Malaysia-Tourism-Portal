import { z } from 'zod';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { moderateWalletAction } from '@/lib/wallet/moderation-guard';
import { walletReasonSchema } from '@/lib/validation/wallet-reason-schemas';
import { requestIp } from '@/lib/wallet/request-ip';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { enqueueWithdrawalEmail } from '@/lib/email/events';

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
  const db = await createClient();
  const { data: { user: authUser } } = await db.auth.getUser();
  if (!authUser) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, approveSchema);
  if (!parsed.ok) return parsed.response;
  const { note, reasonCategory } = parsed.data;

  const validated = walletReasonSchema.safeParse({ action: 'approve', reason: note, reasonCategory });
  if (!validated.success) return apiFail('VALIDATION_FAILED', validated.error.issues[0]?.message ?? 'Invalid approval reason', 422);
  const moderation = await moderateWalletAction({ actorId: authUser.id, withdrawalId, action: 'approve', reasonCategory: validated.data.reasonCategory, reason: validated.data.reason });
  if (!moderation.ok) return apiFail(moderation.code, moderation.message, moderation.code === 'MODERATION_UNAVAILABLE' ? 503 : moderation.code === 'RATE_LIMITED' ? 429 : 422);

  const ip = requestIp(request);

  // ── Call governed RPC ─────────────────────────────────────────────────────
  const { data: approvalResult, error: approvalErr } = await db.rpc(
    'approve_wallet_withdrawal',
    {
      p_withdrawal_id: withdrawalId,
      p_note:          note ?? null,
      p_ip:            ip,
      p_reason_category: validated.data.reasonCategory,
    },
  );

  if (approvalErr) {
    const msg = approvalErr.message ?? '';
    if (msg.includes('approver_required'))           return apiFail('FORBIDDEN', 'Approver or Super Admin access required', 403);
    if (msg.includes('self_dealing'))                return apiFail('SELF_DEALING', 'You cannot approve your own withdrawal', 403);
    if (msg.includes('withdrawal_not_found'))        return apiFail('NOT_FOUND', 'Withdrawal not found', 404);
    if (msg.includes('withdrawal_not_approvable'))   return apiFail('INVALID_STATE', `Cannot approve withdrawal in its current status`, 409);
    if (msg.includes('already_approved_by_this_actor')) return apiFail('DUPLICATE_APPROVAL', 'You have already approved this withdrawal', 409);
    if (msg.includes('high_risk_override_required')) return apiFail('HIGH_RISK_OVERRIDE_REQUIRED', 'A Super Admin must record a risk override before this withdrawal can be approved', 409);
    if (msg.includes('note_length_invalid'))         return apiFail('VALIDATION_FAILED', 'Note must be 10–500 characters', 422);
    console.error('[admin-approve] approve_wallet_withdrawal:', approvalErr);
    return apiFail('APPROVAL_FAILED', 'Approval failed', 500);
  }

  const result = approvalResult as {
    request_id: string;
    status: string;
    ready: boolean;
    approval_count: number;
    required_approvals: number;
    risk_level: string;
    user_id: string;
    amount_rm: number;
  };

  // First approval on a dual-approval request — no Stripe call yet.
  if (!result.ready) {
    return apiOk({
      status:             result.status,
      approval_count:     result.approval_count,
      required_approvals: result.required_approvals,
      message:            'First approval recorded — waiting for second approver.',
    });
  }

  // ── Stripe payout (only when ready=true) ─────────────────────────────────
  const { data: userRow } = await db
    .from('users')
    .select('stripe_connect_account_id')
    .eq('id', result.user_id)
    .single();

  const connectAccountId = (userRow as { stripe_connect_account_id?: string | null } | null)
    ?.stripe_connect_account_id;

  if (!connectAccountId) {
    return apiFail('PAYOUT_ACCOUNT_MISSING', 'User has not completed Stripe Connect onboarding. Status stays approved for retry.', 422);
  }

  // Re-fetch withdrawal for existing Stripe IDs (idempotency retry path).
  const { data: wRow } = await db
    .from('withdrawal_requests')
    .select('stripe_transfer_id, stripe_payout_id, updated_at')
    .eq('id', withdrawalId)
    .single();

  const row = wRow as {
    stripe_transfer_id: string | null;
    stripe_payout_id:   string | null;
    updated_at:         string;
  } | null;

  const amountSen = Math.round(result.amount_rm * 100);
  const idemBase  = `wr-${withdrawalId}`;

  // Guard: if transfer not recorded and >24 h have elapsed, block (idempotency key expired).
  if (!row?.stripe_transfer_id) {
    const msSinceApproval = Date.now() - new Date(row?.updated_at ?? 0).getTime();
    if (msSinceApproval > 24 * 3_600_000) {
      return apiFail(
        'IDEMPOTENCY_WINDOW_EXPIRED',
        'More than 24 h have passed since approval with no transfer recorded. Verify in the Stripe Dashboard before retrying.',
        409,
      );
    }
  }

  // Payouts-enabled pre-check (only when payout not yet created).
  if (!row?.stripe_payout_id) {
    try {
      const account = await stripe.accounts.retrieve(connectAccountId);
      if (!account.payouts_enabled) {
        return apiFail('PAYOUTS_DISABLED', 'Stripe Connect payouts are disabled for this user. Status stays approved for retry.', 422);
      }
    } catch (err) {
      console.error('[admin-approve] Stripe account retrieve error:', err);
      return NextResponse.json({ data: null, error: { code: 'STRIPE_UNAVAILABLE', message: 'Could not verify Stripe Connect account status', retryable: true } }, { status: 502 });
    }
  }

  // ── Transfer ─────────────────────────────────────────────────────────────
  let transfer: Stripe.Transfer;
  try {
    if (row?.stripe_transfer_id) {
      transfer = await stripe.transfers.retrieve(row.stripe_transfer_id);
    } else {
      transfer = await stripe.transfers.create(
        { amount: amountSen, currency: 'myr', destination: connectAccountId, metadata: { withdrawal_id: withdrawalId } },
        { idempotencyKey: `${idemBase}-transfer` },
      );
      // Persist transfer ID before creating payout (crash-safe retry).
      const { error: transferRecordError } = await db.rpc('record_stripe_transfer', {
        p_withdrawal_id: withdrawalId,
        p_transfer_id: transfer.id,
      });
      if (transferRecordError) {
        console.error('[admin-approve] record_stripe_transfer:', transferRecordError);
        return apiFail('TRANSFER_STATE_FAILED', 'Stripe Transfer was created but could not be recorded. Retry after checking Stripe.', 502, { retryable: true });
      }
    }
  } catch (err) {
    console.error('[admin-approve] Stripe transfer error:', err);
    return NextResponse.json({ data: null, error: { code: 'STRIPE_TRANSFER_FAILED', message: (err as Error).message, retryable: true } }, { status: 502 });
  }

  // ── Payout ───────────────────────────────────────────────────────────────
  let payout: Stripe.Payout;
  try {
    if (row?.stripe_payout_id) {
      payout = await stripe.payouts.retrieve(row.stripe_payout_id, undefined, { stripeAccount: connectAccountId });
    } else {
      payout = await stripe.payouts.create(
        { amount: amountSen, currency: 'myr', metadata: { withdrawal_id: withdrawalId } },
        { stripeAccount: connectAccountId, idempotencyKey: `${idemBase}-payout` },
      );
    }
  } catch (err) {
    console.error('[admin-approve] Stripe payout error:', err);
    return NextResponse.json({ data: null, error: { code: 'STRIPE_PAYOUT_FAILED', message: (err as Error).message, retryable: true } }, { status: 502 });
  }

  // ── Mark processing ───────────────────────────────────────────────────────
  const serviceDb = createServiceClient();
  const { error: processingError } = await serviceDb.rpc('mark_withdrawal_processing', {
    p_withdrawal_id: withdrawalId,
    p_transfer_id:   transfer.id,
    p_payout_id:     payout.id,
  });
  if (processingError) {
    console.error('[admin-approve] mark_withdrawal_processing:', processingError);
    return apiFail('PROCESSING_STATE_FAILED', 'Stripe payout was created but the withdrawal state could not be updated. Do not retry until it is reconciled.', 502, { retryable: true });
  }

  try {
    await enqueueWithdrawalEmail({
      withdrawalId,
      userId:    result.user_id,
      eventType: 'withdrawal_approved',
      amountRm:  result.amount_rm,
    });
  } catch (emailError) {
    console.error('[admin-approve] withdrawal email enqueue failed:', emailError);
  }

  return apiOk({ status: 'processing', transfer_id: transfer.id, payout_id: payout.id });
}
