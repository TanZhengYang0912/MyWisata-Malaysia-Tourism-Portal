import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

// connect_payout_completed / connect_payout_failed are SECURITY DEFINER;
// anon role can call them (Stripe signature is the auth gate here).
function makeDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

export const dynamic = 'force-dynamic';

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

  const db = makeDb();

  if (event.type === 'payout.paid') {
    const payout = event.data.object as Stripe.Payout;
    const { error } = await db.rpc('connect_payout_completed', { p_payout_id: payout.id });
    if (error) {
      console.error('[connect-webhook] connect_payout_completed:', error);
      return NextResponse.json({ error: 'Failed to complete withdrawal' }, { status: 500 });
    }
  }

  if (event.type === 'payout.failed') {
    const payout = event.data.object as Stripe.Payout;
    const { error } = await db.rpc('connect_payout_failed', { p_payout_id: payout.id });
    if (error) {
      console.error('[connect-webhook] connect_payout_failed:', error);
      return NextResponse.json({ error: 'Failed to handle payout failure' }, { status: 500 });
    }
  }

  if (event.type === 'account.updated') {
    const account = event.data.object as Stripe.Account;
    console.log(
      '[connect-webhook] account.updated:',
      account.id,
      '| charges_enabled:', account.charges_enabled,
      '| payouts_enabled:', account.payouts_enabled,
    );
  }

  return NextResponse.json({ received: true });
}
