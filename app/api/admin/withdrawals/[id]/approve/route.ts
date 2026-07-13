import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: withdrawalId } = await params;

  const db = await createClient();
  const { data: { user: authUser } } = await db.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch current withdrawal — include Stripe IDs and updated_at to detect partial-completion
  const { data: w, error: fetchErr } = await db
    .from('withdrawal_requests')
    .select('status, user_id, amount, stripe_transfer_id, stripe_payout_id, updated_at')
    .eq('id', withdrawalId)
    .single();

  if (fetchErr || !w) return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });

  const row = w as {
    status:             string;
    user_id:            string;
    amount:             number;
    stripe_transfer_id: string | null;
    stripe_payout_id:   string | null;
    updated_at:         string;
  };

  let stripeUserId: string;
  let amountRM: number;

  if (row.status === 'approved') {
    // Retry path: status already 'approved' from a prior attempt.
    // stripe_transfer_id / stripe_payout_id may or may not be set
    // depending on how far the previous attempt got.

    // (d) Stripe idempotency expiry guard: if no transfer was recorded and
    // more than 24 h have passed since approval, Stripe's idempotency key
    // (wr-{id}-transfer) has expired. A new create() call would be treated as a
    // fresh request — double-charge risk if a transfer was created but the DB
    // save failed. Block and require manual Stripe Dashboard verification.
    if (!row.stripe_transfer_id) {
      const msSinceApproval = Date.now() - new Date(row.updated_at).getTime();
      if (msSinceApproval > 24 * 3_600_000) {
        return NextResponse.json(
          {
            error:   'Stripe idempotency window expired: more than 24 h have passed since approval with no transfer recorded. Verify in the Stripe Dashboard that no transfer exists for this withdrawal before retrying.',
            code:    'idempotency_window_expired',
            retryable: false,
          },
          { status: 409 },
        );
      }
    }

    stripeUserId = row.user_id;
    amountRM     = row.amount;
  } else if (row.status === 'pending') {
    // First-approval path: record this admin's approval
    const { data: approvalResult, error: approvalErr } = await db.rpc('record_admin_approval', {
      p_withdrawal_id: withdrawalId,
    });

    if (approvalErr) {
      const msg = approvalErr.message;
      if (msg.includes('admin_required'))                  return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      if (msg.includes('self_dealing'))                    return NextResponse.json({ error: 'You cannot approve your own withdrawal' }, { status: 403 });
      if (msg.includes('withdrawal_not_found'))            return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });
      if (msg.includes('already_approved_by_this_admin')) return NextResponse.json({ error: 'You have already approved this withdrawal' }, { status: 409 });
      if (msg.includes('invalid_status'))                  return NextResponse.json({ error: 'Wrong status' }, { status: 409 });
      console.error('[admin-approve] record_admin_approval:', approvalErr);
      return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
    }

    const result = approvalResult as { ready: boolean; user_id: string; amount_rm: number; approval_count: number };

    if (!result.ready) {
      return NextResponse.json({
        status:         'pending_second_approval',
        approval_count: result.approval_count,
        message:        'First approval recorded — waiting for second approver.',
      });
    }

    stripeUserId = result.user_id;
    amountRM     = result.amount_rm;
  } else {
    return NextResponse.json({ error: `Cannot approve withdrawal in status: ${row.status}` }, { status: 409 });
  }

  // ── Get Connect account ───────────────────────────────────────────────────
  const { data: userRow } = await db
    .from('users')
    .select('stripe_connect_account_id')
    .eq('id', stripeUserId)
    .single();

  const connectAccountId = (userRow as { stripe_connect_account_id?: string | null } | null)
    ?.stripe_connect_account_id;

  if (!connectAccountId) {
    return NextResponse.json(
      { error: 'User has not completed Stripe Connect onboarding. Status stays approved for retry.' },
      { status: 422 },
    );
  }

  const amountSen = Math.round(amountRM * 100);

  // Deterministic idempotency key — stable across all retries of this withdrawal.
  // Stripe deduplicates within 24 h; after that a genuine new transfer would be needed.
  const idemBase = `wr-${withdrawalId}`;

  // (f) payouts_enabled pre-check — only when we still need to create the payout.
  // Avoids a confusing Stripe 502 and surfaces a clear 422 with actionable guidance.
  if (!row.stripe_payout_id) {
    try {
      const account = await stripe.accounts.retrieve(connectAccountId);
      if (!account.payouts_enabled) {
        return NextResponse.json(
          {
            error:     'Stripe Connect payouts are disabled for this user. They must complete Stripe onboarding before funds can be paid out. Status stays approved for retry.',
            code:      'payouts_disabled',
            retryable: false,
          },
          { status: 422 },
        );
      }
    } catch (stripeErr) {
      console.error('[admin-approve] Stripe account retrieve error:', stripeErr);
      return NextResponse.json(
        { error: 'Could not verify Stripe Connect account status', retryable: true },
        { status: 502 },
      );
    }
  }

  // ── Transfer — skip if already created in a previous attempt ─────────────
  let transfer: Stripe.Transfer;
  try {
    if (row.stripe_transfer_id) {
      // Retrieve the existing transfer (retry path, transfer already created)
      transfer = await stripe.transfers.retrieve(row.stripe_transfer_id);
    } else {
      transfer = await stripe.transfers.create(
        {
          amount:      amountSen,
          currency:    'myr',
          destination: connectAccountId,
          metadata:    { withdrawal_id: withdrawalId },
        },
        { idempotencyKey: `${idemBase}-transfer` },
      );

      // Persist transfer ID immediately — BEFORE the Payout call.
      // If the server crashes here, retry will retrieve this transfer
      // instead of creating a duplicate.
      await db.rpc('record_stripe_transfer', {
        p_withdrawal_id: withdrawalId,
        p_transfer_id:   transfer.id,
      });
    }
  } catch (stripeErr) {
    console.error('[admin-approve] Stripe transfer error:', stripeErr);
    return NextResponse.json(
      { error: `Stripe transfer error: ${(stripeErr as Error).message}`, retryable: true },
      { status: 502 },
    );
  }

  // ── Payout — skip if already created in a previous attempt ───────────────
  let payout: Stripe.Payout;
  try {
    if (row.stripe_payout_id) {
      // Retrieve the existing payout (retry path, payout already created)
      payout = await stripe.payouts.retrieve(
        row.stripe_payout_id,
        undefined,
        { stripeAccount: connectAccountId },
      );
    } else {
      payout = await stripe.payouts.create(
        {
          amount:   amountSen,
          currency: 'myr',
          metadata: { withdrawal_id: withdrawalId },
        },
        {
          stripeAccount:  connectAccountId,
          idempotencyKey: `${idemBase}-payout`,
        },
      );
    }
  } catch (stripeErr) {
    console.error('[admin-approve] Stripe payout error:', stripeErr);
    // Transfer already recorded — safe to retry from payout step
    return NextResponse.json(
      { error: `Stripe payout error: ${(stripeErr as Error).message}`, retryable: true },
      { status: 502 },
    );
  }

  // ── Move to processing ────────────────────────────────────────────────────
  await db.rpc('admin_set_processing', {
    p_withdrawal_id: withdrawalId,
    p_transfer_id:   transfer.id,
    p_payout_id:     payout.id,
  });

  return NextResponse.json({
    status:      'processing',
    transfer_id: transfer.id,
    payout_id:   payout.id,
  });
}
