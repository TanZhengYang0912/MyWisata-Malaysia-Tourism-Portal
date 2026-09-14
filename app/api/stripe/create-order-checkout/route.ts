import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return customerCapabilityFailure(
    CUSTOMER_CAPABILITY.CHECKOUT,
    resolveCustomerCapability(null, CUSTOMER_CAPABILITY.CHECKOUT),
    'Sign in before checkout',
  )!;

  const checkoutDecision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.CHECKOUT);
  const checkoutFailure = customerCapabilityFailure(CUSTOMER_CAPABILITY.CHECKOUT, checkoutDecision, 'Phone verification is required before checkout');
  if (checkoutFailure) return checkoutFailure;

  let body: { amount_rm?: unknown; voucher_code?: unknown } = {};
  try { body = await request.json(); } catch { /* use empty body */ }
  const amount = Number(body.amount_rm);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid checkout amount' }, { status: 400 });

  const origin = request.headers.get('origin') ?? 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    payment_intent_data: { metadata: { user_id: user.id, payment_kind: 'order' } },
    line_items: [{
      price_data: {
        currency: 'myr',
        unit_amount: Math.round(amount * 100),
        product_data: { name: 'MyLawatan demo order' },
      },
      quantity: 1,
    }],
    metadata: {
      user_id: user.id,
      voucher_code: String(body.voucher_code ?? ''),
      payment_kind: 'order',
    },
    success_url: `${origin}/customer/checkout?stripe_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/customer/checkout`,
  });
  return NextResponse.json({ url: session.url });
}
