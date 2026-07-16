import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { stripeSessionId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const stripeSessionId = typeof body.stripeSessionId === 'string' ? body.stripeSessionId : '';
  if (!stripeSessionId) return NextResponse.json({ error: 'Missing Stripe session' }, { status: 400 });

  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
  if (session.metadata?.user_id !== user.id || !session.metadata?.checkout_session_id) {
    return NextResponse.json({ error: 'Stripe session does not belong to this account' }, { status: 403 });
  }
  const outcome = session.payment_status === 'paid' ? 'succeeded' : 'failed';
  const service = createServiceClient();
  const { data, error } = await service.rpc('finalize_checkout', {
    p_checkout_session_id: session.metadata.checkout_session_id,
    p_outcome: outcome,
    p_provider_payment_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
    p_provider_event_id: `confirm:${session.id}`,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ data, error: null });
}
