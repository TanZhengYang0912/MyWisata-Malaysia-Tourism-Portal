import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function isRealStripeAccountId(value: string | null): value is string {
  return Boolean(value && /^acct_[A-Za-z0-9]+$/.test(value) && !value.startsWith('acct_demo_'));
}

function stripeFailure(error: unknown) {
  const details = error as {
    type?: string;
    code?: string;
    param?: string;
    message?: string;
    requestId?: string;
    statusCode?: number;
  };
  console.error('[stripe-connect-onboard] Stripe request failed', {
    type: details?.type ?? 'unknown',
    code: details?.code ?? null,
    param: details?.param ?? null,
    message: details?.message ?? 'unknown',
    requestId: details?.requestId ?? null,
    statusCode: details?.statusCode ?? null,
  });
  return NextResponse.json({ error: 'Unable to start Stripe onboarding' }, { status: 502 });
}

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user: authUser } } = await db.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow, error: userErr } = await db
    .from('users')
    .select('tier, stripe_connect_account_id, full_name, phone, email')
    .eq('id', authUser.id)
    .single();

  if (userErr || !userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const row = userRow as {
    tier: string;
    stripe_connect_account_id: string | null;
    full_name: string | null;
    phone: string | null;
    email: string | null;
  };

  if (row.tier !== 'kyc_verified') {
    return NextResponse.json(
      { error: 'KYC verification required before setting up withdrawal account' },
      { status: 403 },
    );
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3000';

  let accountId = isRealStripeAccountId(row.stripe_connect_account_id)
    ? row.stripe_connect_account_id
    : null;

  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        country: 'MY',
        email: row.email ?? authUser.email ?? undefined,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        controller: {
          losses: { payments: 'stripe' },
          fees: { payer: 'account' },
          requirement_collection: 'stripe',
          stripe_dashboard: { type: 'full' },
        },
        metadata: { supabase_user_id: authUser.id },
      });
      accountId = account.id;
    } catch (error) {
      return stripeFailure(error);
    }

    const { error: updateError } = await db
      .from('users')
      .update({
        stripe_connect_account_id: accountId,
        stripe_payouts_enabled: false,
      })
      .eq('id', authUser.id);

    if (updateError) {
      console.error('[stripe-connect-onboard] Failed to persist account ID', {
        code: updateError.code ?? null,
      });
      return NextResponse.json({ error: 'Unable to save Stripe onboarding state' }, { status: 502 });
    }
  }

  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/customer/wallet?onboarding=refresh`,
      return_url: `${origin}/customer/wallet?onboarding=complete`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    return stripeFailure(error);
  }
}
