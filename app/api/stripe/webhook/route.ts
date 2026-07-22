import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';
import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { getPaymentEmailType } from '@/lib/email/payment';
import { emitOrderVendorEvent } from '@/lib/vendor-notifications/order-events';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
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

    if (!userId || !session.amount_total) {
      console.error('[stripe-webhook] Missing user_id metadata or amount_total', session.id);
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
    }

    const db = createServiceClient();

    if (session.metadata?.payment_kind === 'order' && session.metadata.checkout_session_id) {
      const { data: finalizeData, error: finalizeError } = await db.rpc('finalize_checkout', {
        p_checkout_session_id: session.metadata.checkout_session_id,
        p_outcome: 'succeeded',
        p_provider_payment_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
        p_provider_event_id: event.id,
      });
      if (finalizeError) {
        console.error('[stripe-webhook] order finalize RPC failed:', finalizeError);
        return NextResponse.json({ error: 'Failed to finalize order' }, { status: 500 });
      }
      const paymentEmail = getPaymentEmailType('order');
      try {
        await enqueueUserTransactionEmail({
          userId,
          eventType: paymentEmail.eventType,
          eventKey: `${paymentEmail.keyPrefix}:${session.id}`,
          reference: session.id,
          amountRm: session.amount_total / 100,
          occurredAt: new Date(event.created * 1000).toISOString(),
        });
      } catch (emailError) {
        console.error('[stripe-webhook] payment email enqueue failed:', emailError);
      }
      const orderId = finalizeData && typeof finalizeData === 'object' && 'order_id' in finalizeData && typeof finalizeData.order_id === 'string' ? finalizeData.order_id : session.metadata.order_id ?? null;
      if (orderId) {
        void emitOrderVendorEvent({
          serviceDb: db,
          orderId,
          eventKey: `order:paid:${orderId}`,
          type: 'vendor_order_created',
          title: 'New order received',
          body: `Order ${orderId} has been paid and is ready for fulfilment.`,
          email: true,
        }).catch((notificationError) => console.error('[vendor-notifications] webhook order event failed', notificationError));
      }
      return NextResponse.json({ received: true });
    }

    const { error } = await db.rpc('credit_topup', {
      p_user_id:         userId,
      p_amount_sen:      session.amount_total,  // Stripe MYR amount_total is already in sen
      p_stripe_event_id: event.id,
      p_stripe_ref:      typeof session.payment_intent === 'string'
                           ? session.payment_intent
                           : null,
    });

    if (error) {
      console.error('[stripe-webhook] credit_topup RPC failed:', error);
      return NextResponse.json({ error: 'Failed to credit wallet' }, { status: 500 });
    }

    const paymentEmail = getPaymentEmailType(session.metadata?.payment_kind);
    try {
      await enqueueUserTransactionEmail({
        userId,
        eventType: paymentEmail.eventType,
        eventKey: `${paymentEmail.keyPrefix}:${session.id}`,
        reference: session.id,
        amountRm: session.amount_total / 100,
        occurredAt: new Date(event.created * 1000).toISOString(),
      });
    } catch (emailError) {
      console.error('[stripe-webhook] payment email enqueue failed:', emailError);
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
        console.error('[stripe-webhook] top-up failure email enqueue failed:', emailError);
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
        console.error('[stripe-webhook] expired top-up email enqueue failed:', emailError);
      }
    }
  }

  // All other event types → acknowledge immediately (no-op)
  return NextResponse.json({ received: true });
}
