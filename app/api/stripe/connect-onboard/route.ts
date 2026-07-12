import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user: authUser } } = await db.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: userRow, error: userErr } = await db
    .from('users')
    .select('kyc_status, stripe_connect_account_id, full_name, email')
    .eq('id', authUser.id)
    .single();

  if (userErr || !userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const row = userRow as {
    kyc_status: string;
    stripe_connect_account_id: string | null;
    full_name: string | null;
    email: string | null;
  };

  if (row.kyc_status !== 'approved') {
    return NextResponse.json(
      { error: 'KYC verification required before setting up withdrawal account' },
      { status: 403 },
    );
  }

  let accountId = row.stripe_connect_account_id ?? '';
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'MY',
      email: row.email ?? authUser.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      business_type: 'individual',
      metadata: { supabase_user_id: authUser.id },
    });
    accountId = account.id;
    await db
      .from('users')
      .update({ stripe_connect_account_id: accountId })
      .eq('id', authUser.id);
  }

  const origin = req.headers.get('origin') ?? 'http://localhost:3000';
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/customer/wallet?connect=refresh`,
    return_url:  `${origin}/customer/wallet?connect=success`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
