import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { getPaymentEmailType } from '@/lib/email/payment';
import { emitOrderVendorEvent } from '@/lib/vendor-notifications/order-events';
import { log } from '@/lib/log';
import { getRequestId } from '@/lib/request-id';

export const dynamic = 'force-dynamic';

/** confirm_vendor_event_promotion_stripe_payment outcomes where the charge must be returned. */
const EVENT_PROMOTION_REFUND_OUTCOMES = new Set(['already_paid', 'not_payable', 'superseded', 'amount_mismatch', 'not_found']);

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !secret) {
    return NextResponse.json({ error: 'Missing stripe-signature or webhook secret' }, { status: 400 });
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;

    const db = createServiceClient();

    if (session.metadata?.payment_kind === 'order' && session.metadata.checkout_session_id) {
      if (session.payment_status !== 'paid' || !session.amount_total || !session.currency) {
        return NextResponse.json({ error: 'Order payment is not confirmed as paid' }, { status: 409 });
      }
      const { error: environmentError } = await db.rpc('mark_checkout_payment_environment', {
        p_checkout_session_id: session.metadata.checkout_session_id,
        p_provider_payment_id: session.id,
        p_is_live: session.livemode === true,
      });
      if (environmentError) return NextResponse.json({ error: 'Unable to record verified payment environment' }, { status: 500 });
      const { data: finalizeData, error: finalizeError } = await db.rpc('settle_provider_checkout', {
        p_checkout_session_id: session.metadata.checkout_session_id,
        p_provider: 'stripe',
        p_outcome: 'succeeded',
        p_provider_payment_id: session.id,
        p_provider_event_id: event.id,
        p_payload_sha256: createHash('sha256').update(body).digest('hex'),
        p_amount_sen: session.amount_total,
        p_currency: session.currency.toUpperCase(),
      });
      if (finalizeError) {
        log('error', '[stripe-webhook] order finalize RPC failed', { requestId, error: finalizeError.message });
        return NextResponse.json({ error: 'Failed to finalize order', requestId }, { status: 500 });
      }
      const idempotent = Boolean(finalizeData && typeof finalizeData === 'object' && 'idempotent' in finalizeData && finalizeData.idempotent);
      const orderId = finalizeData && typeof finalizeData === 'object' && 'order_id' in finalizeData && typeof finalizeData.order_id === 'string' ? finalizeData.order_id : null;
      if (!idempotent && finalizeData?.status === 'paid') {
        const paymentEmail = getPaymentEmailType('order');
        try {
          if (userId) await enqueueUserTransactionEmail({
            userId,
            eventType: paymentEmail.eventType,
            eventKey: `${paymentEmail.keyPrefix}:${session.id}`,
            reference: session.id,
            amountRm: session.amount_total / 100,
            orderId: orderId ?? undefined,
            occurredAt: new Date(event.created * 1000).toISOString(),
          });
        } catch (emailError) {
          log('error', '[stripe-webhook] payment email enqueue failed', { requestId, error: emailError instanceof Error ? emailError.message : String(emailError) });
        }
      }
      if (!idempotent && orderId && finalizeData?.status === 'paid') {
        void emitOrderVendorEvent({
          serviceDb: db,
          orderId,
          eventKey: `order:paid:${orderId}`,
          type: 'vendor_order_created',
          title: 'New order received',
          body: `Order ${orderId} has been paid and is ready for fulfilment.`,
          email: true,
        }).catch((notificationError) => log('error', '[vendor-notifications] webhook order event failed', { requestId, error: notificationError instanceof Error ? notificationError.message : String(notificationError) }));
      }
      return NextResponse.json({ received: true });
    }

    if (!userId || !session.amount_total) {
      log('error', '[stripe-webhook] Missing user_id metadata or amount_total', { requestId, sessionId: session.id });
      return NextResponse.json({ error: 'Missing metadata', requestId }, { status: 400 });
    }

    if (session.metadata?.payment_kind === 'event_promotion' && session.metadata.promotion_id) {
      // Same trust checks as wallet top-ups: only a paid MYR session from the
      // Stripe mode this deployment runs in can mark a promotion as paid.
      if (session.payment_status !== 'paid' || !session.amount_total
          || session.currency?.toUpperCase() !== 'MYR'
          || session.livemode !== Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_'))) {
        return NextResponse.json({ error: 'Event promotion payment is not confirmed as paid' }, { status: 409 });
      }
      const promotionId = session.metadata.promotion_id;
      const { data: confirmOutcome, error: confirmError } = await db.rpc('confirm_vendor_event_promotion_stripe_payment', {
        p_promotion_id: promotionId,
        p_checkout_session_id: session.id,
        p_amount_sen: session.amount_total,
      });
      if (confirmError) {
        log('error', '[stripe-webhook] event promotion payment confirm RPC failed', { requestId, error: confirmError.message });
        return NextResponse.json({ error: 'Failed to confirm event promotion payment', requestId }, { status: 500 });
      }
      if (confirmOutcome === 'confirmed' || confirmOutcome === 'already_confirmed') {
        return NextResponse.json({ received: true });
      }
      // Only a known "cannot apply" outcome triggers a refund. Anything else
      // (for example the pre-migration RPC returning null) is retried, never refunded.
      if (typeof confirmOutcome !== 'string' || !EVENT_PROMOTION_REFUND_OUTCOMES.has(confirmOutcome)) {
        log('error', '[stripe-webhook] unexpected event promotion confirm outcome', { requestId, sessionId: session.id, outcome: String(confirmOutcome) });
        return NextResponse.json({ error: 'Unexpected event promotion payment outcome', requestId }, { status: 500 });
      }

      // The money arrived but cannot be applied (already paid another way,
      // edited since, superseded by a newer Checkout, wrong amount, or gone):
      // refund it in full. The idempotency key makes Stripe retries return the
      // same refund instead of a second one. The platform absorbs Stripe's fee.
      const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntentId) {
        log('error', '[stripe-webhook] event promotion refund has no payment intent', { requestId, sessionId: session.id });
        return NextResponse.json({ error: 'Cannot refund event promotion payment', requestId }, { status: 500 });
      }
      let refund: Stripe.Refund;
      try {
        refund = await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            reason: 'duplicate',
            metadata: { payment_kind: 'event_promotion_refund', promotion_id: promotionId, checkout_session_id: session.id, outcome: confirmOutcome },
          },
          { idempotencyKey: `event-promotion-refund:${session.id}` },
        );
      } catch (refundError) {
        log('error', '[stripe-webhook] event promotion refund failed', { requestId, sessionId: session.id, error: refundError instanceof Error ? refundError.message : String(refundError) });
        return NextResponse.json({ error: 'Failed to refund event promotion payment', requestId }, { status: 500 });
      }
      const { error: auditError } = await db.rpc('record_vendor_event_promotion_stripe_refund', {
        p_promotion_id: promotionId,
        p_checkout_session_id: session.id,
        p_provider_refund_id: refund.id,
        p_amount_sen: refund.amount,
        p_reason: confirmOutcome,
      });
      if (auditError) {
        log('error', '[stripe-webhook] event promotion refund audit failed', { requestId, sessionId: session.id, error: auditError.message });
        return NextResponse.json({ error: 'Failed to record event promotion refund', requestId }, { status: 500 });
      }
      log('warn', '[stripe-webhook] event promotion payment refunded', { requestId, sessionId: session.id, outcome: confirmOutcome });
      return NextResponse.json({ received: true, refunded: true });
    }
    if (session.metadata?.payment_kind !== 'topup') {
      log('warn', '[stripe-webhook] Ignoring unsupported Checkout payment kind', { requestId, sessionId: session.id });
      return NextResponse.json({ received: true });
    }
    if (session.payment_status !== 'paid' || !session.amount_total || !session.currency
        || session.currency.toUpperCase() !== 'MYR'
        || session.livemode !== process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) {
      return NextResponse.json({ error: 'Top-up payment is not confirmed' }, { status: 409 });
    }
    const operationId = session.metadata.topup_operation_id ?? null;
    if (operationId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
      log('error', '[stripe-webhook] Invalid top-up operation metadata', { requestId, sessionId: session.id });
      return NextResponse.json({ error: 'Invalid top-up reference', requestId }, { status: 400 });
    }
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
    const { data: settlement, error } = await db.rpc('apply_wallet_topup_payment', {
      p_operation_id: operationId,
      p_owner_user_id: userId,
      p_session_id: session.id,
      p_payment_intent_id: paymentIntentId,
      p_amount_sen: session.amount_total,
      p_currency: session.currency.toUpperCase(),
      p_is_live: session.livemode,
      p_expected_is_live: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ?? false,
      p_payment_status: session.payment_status,
      p_event_id: event.id,
    });

    if (error) {
      log('error', '[stripe-webhook] top-up settlement RPC failed', { requestId, error: error.message, sessionId: session.id });
      return NextResponse.json({ error: 'Failed to credit wallet', requestId }, { status: 500 });
    }
    const credited = Boolean(settlement && typeof settlement === 'object'
      && 'credited' in settlement && settlement.credited === true);
    if (credited) {
      const paymentEmail = getPaymentEmailType('topup');
      try {
        await enqueueUserTransactionEmail({
          userId,
          eventType: paymentEmail.eventType,
          eventKey: `${paymentEmail.keyPrefix}:${session.id}`,
          reference: session.id,
          amountRm: session.amount_total / 100,
          occurredAt: new Date(event.created * 1000).toISOString(),
        });
        if (operationId) {
          const { error: emailStateError } = await db.rpc('mark_wallet_topup_email_queued', {
            p_operation_id: operationId,
            p_owner_user_id: userId,
          });
          if (emailStateError) log('error', '[stripe-webhook] top-up email intent remains pending', { requestId, sessionId: session.id });
        }
      } catch (emailError) {
        log('error', '[stripe-webhook] payment email enqueue failed', { requestId, error: emailError instanceof Error ? emailError.message : String(emailError) });
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const userId = intent.metadata?.user_id;
    if (userId && intent.metadata?.payment_kind === 'topup') {
      try {
        await enqueueUserTransactionEmail({
          userId,
          eventType: 'topup_failed',
          eventKey: `stripe-topup-failed:${event.id}`,
          reference: 'Wallet top-up',
          amountRm: (intent.amount ?? 0) / 100,
          occurredAt: new Date(event.created * 1000).toISOString(),
        });
      } catch (emailError) {
        log('error', '[stripe-webhook] top-up failure email enqueue failed', { requestId, error: emailError instanceof Error ? emailError.message : String(emailError) });
      }
    }
  }

  if (event.type === 'refund.created' || event.type === 'refund.updated' || event.type === 'refund.failed') {
    const providerRefund = event.data.object as Stripe.Refund;
    // Automatic event promotion refunds (see the checkout.session.completed branch):
    // record the final status, and alert Super Admins when Stripe could not pay it back.
    if (providerRefund.metadata?.payment_kind === 'event_promotion_refund' && providerRefund.metadata.promotion_id) {
      const db = createServiceClient();
      const { error } = await db.rpc('record_vendor_event_promotion_refund_outcome', {
        p_promotion_id: providerRefund.metadata.promotion_id,
        p_checkout_session_id: providerRefund.metadata.checkout_session_id ?? '',
        p_provider_refund_id: providerRefund.id,
        p_status: providerRefund.status ?? 'pending',
        p_failure_reason: providerRefund.failure_reason ?? null,
        p_amount_sen: providerRefund.amount,
      });
      if (error) {
        log('error', '[stripe-webhook] event promotion refund outcome RPC failed', { requestId, error: error.message, providerRefundId: providerRefund.id });
        return NextResponse.json({ error: 'Failed to record event promotion refund outcome', requestId }, { status: 500 });
      }
      if (providerRefund.status === 'failed' || providerRefund.status === 'canceled') {
        log('error', '[stripe-webhook] event promotion refund did not complete', { requestId, providerRefundId: providerRefund.id, status: providerRefund.status });
      }
      return NextResponse.json({ received: true });
    }
    const refundId = providerRefund.metadata?.mylawatan_refund_id ?? providerRefund.metadata?.mywisata_refund_id;
    // Ignore Stripe refunds created outside this order refund flow.
    if (refundId) {
      const outcome = providerRefund.status === 'succeeded'
        ? 'succeeded'
        : providerRefund.status === 'pending'
          ? 'pending'
          : 'failed';
      const db = createServiceClient();
      const { error } = await db.rpc('record_order_refund_provider_outcome', {
        p_refund_id: refundId,
        p_provider_refund_id: providerRefund.id,
        p_outcome: outcome,
        p_amount_sen: providerRefund.amount,
        p_currency: providerRefund.currency?.toUpperCase() ?? '',
        p_failure_code: providerRefund.failure_reason ?? null,
        p_failure_message: outcome === 'failed' ? 'Stripe could not complete this refund.' : null,
        p_actor_id: null,
        p_note: null,
        p_event_id: event.id,
      });
      if (error) {
        log('error', '[stripe-webhook] refund outcome RPC failed', { requestId, error: error.message, providerRefundId: providerRefund.id });
        return NextResponse.json({ error: 'Failed to record refund outcome', requestId }, { status: 500 });
      }
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    if (userId && session.metadata?.payment_kind === 'topup') {
      try {
        await enqueueUserTransactionEmail({
          userId,
          eventType: 'topup_failed',
          eventKey: `stripe-topup-expired:${event.id}`,
          reference: 'Wallet top-up',
          amountRm: (session.amount_total ?? 0) / 100,
          occurredAt: new Date(event.created * 1000).toISOString(),
        });
      } catch (emailError) {
        log('error', '[stripe-webhook] expired top-up email enqueue failed', { requestId, error: emailError instanceof Error ? emailError.message : String(emailError) });
      }
    }
  }

  if (event.type === 'charge.dispute.created') {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
    if (chargeId) {
      const db = createServiceClient();
      const { data: payment } = await db.from('payments').select('order_id').eq('provider_payment_id', chargeId).maybeSingle();
      if (payment?.order_id) {
        const { error } = await db.rpc('mark_order_financial_outcome', { p_order_id: payment.order_id, p_status: 'chargeback', p_actor_id: null, p_provider_event_id: event.id });
        if (error) log('error', '[stripe-webhook] dispute outcome failed', { requestId, error: error.message });
      }
    }
  }

  // All other event types → acknowledge immediately (no-op)
  return NextResponse.json({ received: true });
}
