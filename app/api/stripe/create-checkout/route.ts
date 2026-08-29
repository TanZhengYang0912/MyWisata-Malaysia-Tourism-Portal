import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import {
  STRIPE_TOP_UP_MAXIMUM_RM,
  STRIPE_TOP_UP_MAXIMUM_SEN,
  STRIPE_TOP_UP_MINIMUM_RM,
} from '@/lib/stripe/top-up-limits';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user: authUser }, error: authErr } = await db.auth.getUser();
  if (authErr || !authUser) {
    return customerCapabilityFailure(
      CUSTOMER_CAPABILITY.CHECKOUT,
      resolveCustomerCapability(null, CUSTOMER_CAPABILITY.CHECKOUT),
      'Sign in before topping up your wallet',
    )!;
  }

  const topUpDecision = await resolveServerCustomerCapability(authUser.id, CUSTOMER_CAPABILITY.CHECKOUT);
  const topUpFailure = customerCapabilityFailure(
    CUSTOMER_CAPABILITY.CHECKOUT,
    topUpDecision,
    'Phone verification is required before wallet top-up',
  );
  if (topUpFailure) return topUpFailure;

  let body: { amount_rm?: unknown };
  try { body = await req.json(); } catch { body = {}; }

  const amountRM = Number(body.amount_rm);
  if (!amountRM || amountRM <= 0 || !Number.isFinite(amountRM)) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  if (amountRM < STRIPE_TOP_UP_MINIMUM_RM) {
    return NextResponse.json({ error: `Minimum top-up is RM ${STRIPE_TOP_UP_MINIMUM_RM.toFixed(2)}` }, { status: 400 });
  }
  const amountSen = Math.round(amountRM * 100);
  if (!Number.isSafeInteger(amountSen) || amountSen > STRIPE_TOP_UP_MAXIMUM_SEN) {
    const maximum = STRIPE_TOP_UP_MAXIMUM_RM.toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return NextResponse.json({ error: `Maximum top-up is RM ${maximum}` }, { status: 400 });
  }

  const { data: userRow, error: userErr } = await db
    .from('users')
    .select('email, full_name, stripe_customer_id')
    .eq('id', authUser.id)
    .single();
  if (userErr || !userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Get or create Stripe Customer (stored on users row)
  let customerId: string = (userRow as { stripe_customer_id?: string | null }).stripe_customer_id ?? '';
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: (userRow as { email?: string | null }).email ?? authUser.email ?? undefined,
      name:  (userRow as { full_name?: string | null }).full_name ?? undefined,
      metadata: { supabase_user_id: authUser.id },
    });
    customerId = customer.id;
    await db
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', authUser.id);
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    payment_intent_data: { metadata: { user_id: authUser.id, payment_kind: 'topup' } },
    line_items: [{
      price_data: {
        currency: 'myr',
        unit_amount: amountSen,
        product_data: { name: 'Malaysia Tourism Wallet Top-up' },
      },
      quantity: 1,
    }],
    metadata: { user_id: authUser.id, payment_kind: 'topup' },
    success_url: `${origin}/customer/wallet?topup=success`,
    cancel_url:  `${origin}/customer/wallet`,
  });

  return NextResponse.json({ url: session.url });
}
