import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createServiceClient } from '@/lib/supabase/service';
import type Stripe from 'stripe';

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
  }

  // All other event types → acknowledge immediately (no-op)
  return NextResponse.json({ received: true });
}
