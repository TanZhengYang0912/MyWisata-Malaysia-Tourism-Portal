import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Per-tier top-up limits in sen (100 sen = RM 1)
const TOPUP_LIMIT_SEN: Record<string, number> = {
  guest:            10_000,   // RM 100
  registered:       10_000,   // RM 100
  phone_verified:   10_000,   // RM 100
  profile_complete: 50_000,   // RM 500
  kyc_submitted:    50_000,   // RM 500
  kyc_verified:     Infinity, // unlimited
};

function deriveVerificationTier(row: {
  profile_completed_at: string | null;
  kyc_status: string;
}): string {
  if (row.kyc_status === 'approved') return 'kyc_verified';
  if (row.kyc_status === 'pending')  return 'kyc_submitted';
  if (row.profile_completed_at)      return 'profile_complete';
  return 'registered';
}

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user: authUser }, error: authErr } = await db.auth.getUser();
  if (authErr || !authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { amount_rm?: unknown };
  try { body = await req.json(); } catch { body = {}; }

  const amountRM = Number(body.amount_rm);
  if (!amountRM || amountRM <= 0 || !Number.isFinite(amountRM)) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }
  const amountSen = Math.round(amountRM * 100);
  if (amountSen < 100) {
    return NextResponse.json({ error: 'Minimum top-up is RM 1.00' }, { status: 400 });
  }

  const { data: userRow, error: userErr } = await db
    .from('users')
    .select('email, full_name, stripe_customer_id, profile_completed_at, kyc_status')
    .eq('id', authUser.id)
    .single();
  if (userErr || !userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tier = deriveVerificationTier(userRow as {
    profile_completed_at: string | null;
    kyc_status: string;
  });
  const limitSen = TOPUP_LIMIT_SEN[tier] ?? 10_000;
  if (Number.isFinite(limitSen) && amountSen > limitSen) {
    return NextResponse.json(
      { error: `Your tier allows a maximum top-up of RM ${(limitSen / 100).toFixed(2)}` },
      { status: 400 },
    );
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
    line_items: [{
      price_data: {
        currency: 'myr',
        unit_amount: amountSen,
        product_data: { name: 'Malaysia Tourism Wallet Top-up' },
      },
      quantity: 1,
    }],
    metadata: { user_id: authUser.id },
    success_url: `${origin}/customer/wallet?topup=success`,
    cancel_url:  `${origin}/customer/wallet`,
  });

  return NextResponse.json({ url: session.url });
}
