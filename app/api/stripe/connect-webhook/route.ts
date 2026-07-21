import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueueUserTransactionEmail, enqueueWithdrawalEmail } from '@/lib/email/events';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';
import { normalizeProviderFailure } from '@/lib/payouts/failures';

export const dynamic = 'force-dynamic';

async function approvedVendorIds(db: ReturnType<typeof createServiceClient>, ownerId: string): Promise<string[]> {
  try {
    const { data } = await db.from('vendors').select('id').eq('owner_id', ownerId).eq('status', 'approved');
    return (data ?? []).map((vendor: { id: string }) => vendor.id);
  } catch (error) {
    console.error('[connect-webhook] vendor lookup failed:', error);
    return [];
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const sig    = headersList.get('stripe-signature');
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json(
      { error: 'Missing stripe-signature or STRIPE_CONNECT_WEBHOOK_SECRET' },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const db = createServiceClient();

  if (event.type === 'payout.paid') {
    const payout = event.data.object as Stripe.Payout;
    const { data: withdrawal } = await db.from('withdrawal_requests')
      .select('id, user_id, amount').eq('stripe_payout_id', payout.id).maybeSingle();
    if (!withdrawal) return NextResponse.json({ received: true });
    const { error } = await db.rpc('complete_withdrawal_payout', {
      p_withdrawal_id: withdrawal.id,
      p_payout_id: payout.id,
      p_status: 'paid',
    });
    if (error) {
      console.error('[connect-webhook] complete_withdrawal_payout paid:', error);
      return NextResponse.json({ error: 'Failed to complete withdrawal' }, { status: 500 });
    }
    try {
      await enqueueWithdrawalEmail({
        withdrawalId: withdrawal.id,
        userId: withdrawal.user_id,
        eventType: 'withdrawal_paid',
        amountRm: Number(withdrawal.amount),
      });
    } catch (emailError) {
      console.error('[connect-webhook] paid email enqueue failed:', emailError);
    }
    for (const vendorId of await approvedVendorIds(db, withdrawal.user_id)) {
      void emitVendorNotification({
        eventKey: `vendor:payout:paid:${payout.id}:${vendorId}`,
        vendorId,
        audience: 'owner',
        category: 'vendor_wallet',
        type: 'vendor_payout_paid',
        title: 'Vendor payout completed',
        body: 'Your approved payout has been sent to your connected account.',
        link: '/vendor/wallet',
        email: true,
        reference: 'Payout completed',
        metadata: { amount: Number(withdrawal.amount), status: 'paid' },
        serviceDb: db,
      }).catch((notificationError) => console.error('[vendor-notifications] payout paid event failed', notificationError));
    }
  }

  if (event.type === 'payout.failed') {
    const payout = event.data.object as Stripe.Payout;
    const { data: withdrawal } = await db.from('withdrawal_requests')
      .select('id, user_id, amount').eq('stripe_payout_id', payout.id).maybeSingle();
    if (!withdrawal) return NextResponse.json({ received: true });
    const { error } = await db.rpc('complete_withdrawal_payout', {
      p_withdrawal_id: withdrawal.id,
      p_payout_id: payout.id,
      p_status: 'failed',
    });
    if (error) {
      console.error('[connect-webhook] complete_withdrawal_payout failed:', error);
      return NextResponse.json({ error: 'Failed to handle payout failure' }, { status: 500 });
    }
    const failure = normalizeProviderFailure({
      provider: 'stripe_connect',
      code: payout.failure_code,
      message: payout.failure_message,
    });
    const { error: failureRecordError } = await db.rpc('record_withdrawal_payout_failure', {
      p_withdrawal_id: withdrawal.id,
      p_provider: 'stripe_connect',
      p_provider_event_id: payout.id,
      p_failure_code: failure.code,
      p_failure_message: failure.message,
      p_failure_category: failure.category,
      p_retryable: failure.retryable,
    });
    if (failureRecordError) {
      console.error('[connect-webhook] record_withdrawal_payout_failure:', failureRecordError);
      return NextResponse.json({ error: 'Failed to record payout failure details' }, { status: 500 });
    }
    try {
      await enqueueWithdrawalEmail({
        withdrawalId: withdrawal.id,
        userId: withdrawal.user_id,
        eventType: 'withdrawal_failed',
        amountRm: Number(withdrawal.amount),
      });
    } catch (emailError) {
      console.error('[connect-webhook] failed email enqueue failed:', emailError);
    }
    for (const vendorId of await approvedVendorIds(db, withdrawal.user_id)) {
      void emitVendorNotification({
        eventKey: `vendor:payout:failed:${payout.id}:${vendorId}`,
        vendorId,
        audience: 'owner',
        category: 'vendor_wallet',
        type: 'vendor_payout_failed',
        title: 'Vendor payout failed',
        body: 'Your payout could not be completed. Please review your connected account.',
        link: '/vendor/wallet',
        email: true,
        reference: 'Payout failed',
        metadata: { amount: Number(withdrawal.amount), status: 'failed' },
        serviceDb: db,
      }).catch((notificationError) => console.error('[vendor-notifications] payout failed event failed', notificationError));
    }
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    const { data: userRow } = await db.from('users')
      .select('id,stripe_payouts_enabled')
      .eq('stripe_connect_account_id', account.id)
      .maybeSingle();
    const previousPayoutsEnabled = userRow && typeof userRow.stripe_payouts_enabled === 'boolean'
      ? userRow.stripe_payouts_enabled
      : null;
    const payoutsEnabled = account.payouts_enabled ?? false;
    const { error } = await db.rpc('update_connect_status', {
      p_connect_account_id: account.id,
      p_payouts_enabled:    payoutsEnabled,
    });
    if (error) {
      console.error('[connect-webhook] update_connect_status:', error);
    } else if (userRow && previousPayoutsEnabled !== payoutsEnabled) {
      const eventType = payoutsEnabled ? 'payout_account_connected' : 'payout_account_disconnected';
      const title = payoutsEnabled ? 'Payout account connected' : 'Payout account needs attention';
      const bodyText = payoutsEnabled
        ? 'Your payout account is connected and eligible to receive approved withdrawals.'
        : 'Your payout account is no longer eligible to receive payouts. Please review your Stripe account status.';
      await db.from('notifications').upsert({
        user_id: userRow.id,
        type: eventType,
        title,
        body: bodyText,
        link: '/customer/wallet',
        event_key: `payout-account:${account.id}:${event.id}`,
        category: 'wallet',
        metadata: { payout_account_status: payoutsEnabled ? 'connected' : 'disconnected' },
      }, { onConflict: 'event_key' });
      try {
        await enqueueUserTransactionEmail({
          userId: userRow.id,
          eventType,
          eventKey: `payout-account-email:${account.id}:${event.id}`,
          reference: 'Payout account status',
          amountRm: 0,
          occurredAt: new Date(event.created * 1000).toISOString(),
        });
      } catch (emailError) {
        console.error('[connect-webhook] payout account email enqueue failed:', emailError);
      }
      for (const vendorId of await approvedVendorIds(db, userRow.id)) {
        void emitVendorNotification({
          eventKey: `vendor:payout-account:${account.id}:${event.id}:${vendorId}`,
          vendorId,
          audience: 'owner',
          category: 'vendor_wallet',
          type: eventType,
          title,
          body: bodyText,
          link: '/vendor/wallet',
          email: true,
          reference: 'Payout account status',
          metadata: { status: payoutsEnabled ? 'connected' : 'disconnected' },
          serviceDb: db,
        }).catch((notificationError) => console.error('[vendor-notifications] payout account event failed', notificationError));
      }
    }
  }

  return NextResponse.json({ received: true });
}
