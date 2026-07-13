import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { amount_rm?: unknown; voucher_code?: unknown } = {};
  try { body = await request.json(); } catch { /* use empty body */ }
  const amount = Number(body.amount_rm);
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Invalid checkout amount' }, { status: 400 });

  const origin = request.headers.get('origin') ?? 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'myr',
        unit_amount: Math.round(amount * 100),
        product_data: { name: 'MyWisata demo order' },
      },
      quantity: 1,
    }],
    metadata: { user_id: user.id, voucher_code: String(body.voucher_code ?? '') },
    success_url: `${origin}/customer/checkout?stripe_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/customer/checkout`,
  });
  return NextResponse.json({ url: session.url });
}
