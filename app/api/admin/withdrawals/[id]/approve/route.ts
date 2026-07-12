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

  // Record approval and check if Stripe should fire
  const { data: approvalResult, error: approvalErr } = await db.rpc('record_admin_approval', {
    p_withdrawal_id: withdrawalId,
  });

  if (approvalErr) {
    const msg = approvalErr.message;
    if (msg.includes('admin_required'))                  return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (msg.includes('withdrawal_not_found'))            return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });
    if (msg.includes('already_approved_by_this_admin')) return NextResponse.json({ error: 'You have already approved this withdrawal' }, { status: 409 });
    if (msg.includes('invalid_status'))                  return NextResponse.json({ error: 'Withdrawal is not in pending status' }, { status: 409 });
    console.error('[admin-approve] record_admin_approval:', approvalErr);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }

  const result = approvalResult as {
    ready: boolean;
    user_id: string;
    amount_rm: number;
    approval_count: number;
  };

  if (!result.ready) {
    return NextResponse.json({
      status:         'pending_second_approval',
      approval_count: result.approval_count,
      message:        'First approval recorded — waiting for second approver.',
    });
  }

  // Both approvals satisfied — get user's Connect account
  const { data: userRow } = await db
    .from('users')
    .select('stripe_connect_account_id')
    .eq('id', result.user_id)
    .single();

  const connectAccountId = (userRow as { stripe_connect_account_id?: string | null } | null)
    ?.stripe_connect_account_id;

  if (!connectAccountId) {
    return NextResponse.json(
      { error: 'User has not completed Stripe Connect onboarding — cannot process payout.' },
      { status: 422 },
    );
  }

  const amountSen = Math.round(result.amount_rm * 100);

  let transfer: Stripe.Transfer;
  let payout: Stripe.Payout;
  try {
    transfer = await stripe.transfers.create({
      amount:      amountSen,
      currency:    'myr',
      destination: connectAccountId,
      metadata:    { withdrawal_id: withdrawalId },
    });

    payout = await stripe.payouts.create(
      {
        amount:   amountSen,
        currency: 'myr',
        metadata: { withdrawal_id: withdrawalId },
      },
      { stripeAccount: connectAccountId },
    );
  } catch (stripeErr) {
    console.error('[admin-approve] Stripe error:', stripeErr);
    return NextResponse.json(
      { error: `Stripe error: ${(stripeErr as Error).message}` },
      { status: 502 },
    );
  }

  const { data: updated } = await db.rpc('admin_set_processing', {
    p_withdrawal_id: withdrawalId,
    p_transfer_id:   transfer.id,
    p_payout_id:     payout.id,
  });

  if (!updated) {
    // Another admin already processed it — still a success from the caller's perspective
    console.warn('[admin-approve] admin_set_processing: row already moved out of pending');
  }

  return NextResponse.json({
    status:      'processing',
    transfer_id: transfer.id,
    payout_id:   payout.id,
  });
}
