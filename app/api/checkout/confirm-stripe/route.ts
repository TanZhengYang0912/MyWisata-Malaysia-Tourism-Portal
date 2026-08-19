import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { emitOrderVendorEvent } from '@/lib/vendor-notifications/order-events';

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
  if (session.payment_status !== 'paid' || !session.amount_total || !session.currency) {
    return NextResponse.json({ error: 'Stripe payment is not confirmed as paid' }, { status: 409 });
  }
  const canonicalEvent = JSON.stringify({
    stripeSessionId: session.id,
    paymentStatus: session.payment_status,
    amountTotal: session.amount_total,
    currency: session.currency,
    checkoutSessionId: session.metadata.checkout_session_id,
  });
  const service = createServiceClient();
  const { data, error } = await service.rpc('settle_provider_checkout', {
    p_checkout_session_id: session.metadata.checkout_session_id,
    p_provider: 'stripe',
    p_outcome: 'succeeded',
    p_provider_payment_id: session.id,
    p_provider_event_id: `confirm:${session.id}`,
    p_payload_sha256: createHash('sha256').update(canonicalEvent).digest('hex'),
    p_amount_sen: session.amount_total,
    p_currency: session.currency.toUpperCase(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const orderId = data && typeof data === 'object' && 'order_id' in data && typeof data.order_id === 'string' ? data.order_id : null;
  const idempotent = Boolean(data && typeof data === 'object' && 'idempotent' in data && data.idempotent);
  if (!idempotent && orderId) {
    try {
      await enqueueUserTransactionEmail({
        userId: user.id,
        eventType: 'checkout_succeeded',
        eventKey: `stripe-checkout:${session.id}`,
        reference: session.id,
        amountRm: session.amount_total / 100,
      });
    } catch (emailError) {
      console.error('[stripe-confirm] checkout email enqueue failed', emailError);
    }
    void emitOrderVendorEvent({
      serviceDb: service,
      orderId,
      eventKey: `order:paid:${orderId}`,
      type: 'vendor_order_created',
      title: 'New order received',
      body: `Order ${orderId} has been paid and is ready for fulfilment.`,
      email: true,
    }).catch((notificationError) => console.error('[vendor-notifications] stripe order event failed', notificationError));
  }
  return NextResponse.json({ data, error: null });
}
