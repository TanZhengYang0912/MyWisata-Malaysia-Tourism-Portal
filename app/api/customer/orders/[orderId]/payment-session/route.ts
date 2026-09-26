import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { stripe } from '@/lib/stripe';
import { resolveToyyibPayActionUrl } from '@/lib/payments/app-url';
import { isSimulatorCheckoutProvider } from '@/lib/payments/providers';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ orderId: string }> };

type CheckoutSessionRow = {
  id: string;
  user_id: string;
  order_id: string;
  payment_method: string;
  status: string;
  currency: string;
  total_amount: number | string;
  expires_at: string;
};

type PaymentRow = {
  provider: string;
  provider_payment_id: string | null;
  status: string;
  amount: number | string;
};

function unavailable(reason: 'expired' | 'processing' | 'unsupported') {
  return NextResponse.json({ data: { canResume: false, reason }, error: null });
}

function safeStripeCheckoutUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.stripe.com' && !url.username && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

async function finalizeExpiredCheckout(service: ReturnType<typeof createServiceClient>, checkoutSessionId: string) {
  const { error } = await service.rpc('finalize_checkout', {
    p_checkout_session_id: checkoutSessionId,
    p_outcome: 'expired',
    p_provider_payment_id: null,
    p_provider_event_id: null,
  });
  return !error;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id,status')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: 'Order status is temporarily unavailable' }, { status: 503 });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (String(order.status).toLowerCase() !== 'pending_payment') {
    return NextResponse.json({ error: 'This order is not waiting for payment' }, { status: 409 });
  }

  try {
    const service = createServiceClient();
    const now = new Date().toISOString();
    const { data: checkout, error: checkoutError } = await service
      .from('checkout_sessions')
      .select('id,user_id,order_id,payment_method,status,currency,total_amount,expires_at')
      .eq('order_id', orderId)
      .eq('user_id', user.id)
      .in('status', ['requires_action', 'pending_payment'])
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (checkoutError) return NextResponse.json({ error: 'Payment status is temporarily unavailable' }, { status: 503 });
    if (!checkout) return unavailable('expired');

    const session = checkout as CheckoutSessionRow;
    const { data: payment, error: paymentError } = await service
      .from('payments')
      .select('provider,provider_payment_id,status,amount')
      .eq('order_id', orderId)
      .in('status', ['pending', 'requires_action'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) return NextResponse.json({ error: 'Payment status is temporarily unavailable' }, { status: 503 });
    if (!payment) return unavailable('expired');

    const providerPayment = payment as PaymentRow;
    if (providerPayment.status !== 'requires_action' || !providerPayment.provider_payment_id) {
      return unavailable('expired');
    }

    if (providerPayment.provider === 'stripe' && ['stripe_card', 'wallet_split'].includes(session.payment_method)) {
      if (!/^cs_(?:(?:test|live)_)?[A-Za-z0-9]+$/.test(providerPayment.provider_payment_id)) {
        return unavailable('unsupported');
      }
      let stripeSession;
      try {
        stripeSession = await stripe.checkout.sessions.retrieve(providerPayment.provider_payment_id);
      } catch {
        return NextResponse.json({ error: 'Payment status is temporarily unavailable' }, { status: 503 });
      }

      if (
        stripeSession.metadata?.user_id !== user.id
        || stripeSession.metadata?.order_id !== orderId
        || stripeSession.metadata?.checkout_session_id !== session.id
        || stripeSession.mode !== 'payment'
      ) {
        return unavailable('unsupported');
      }
      if (stripeSession.payment_status === 'paid') return unavailable('processing');
      const stripeUrl = stripeSession.status === 'open' && stripeSession.payment_status === 'unpaid'
        ? safeStripeCheckoutUrl(stripeSession.url)
        : null;
      if (!stripeUrl) return unavailable('expired');

      const amountSen = Math.round(Number(providerPayment.amount) * 100);
      if (
        !Number.isSafeInteger(amountSen)
        || amountSen <= 0
        || stripeSession.amount_total !== amountSen
        || stripeSession.currency?.toUpperCase() !== session.currency.toUpperCase()
      ) {
        return unavailable('unsupported');
      }

      return NextResponse.json({ data: { canResume: true, provider: 'stripe', url: stripeUrl }, error: null });
    }

    if (providerPayment.provider === 'toyyibpay' && session.payment_method === 'bank_transfer') {
      try {
        const paymentAmountSen = Math.round(Number(providerPayment.amount) * 100);
        const checkoutAmountSen = Math.round(Number(session.total_amount) * 100);
        if (
          session.currency.toUpperCase() !== 'MYR'
          || !Number.isSafeInteger(paymentAmountSen)
          || paymentAmountSen <= 0
          || paymentAmountSen !== checkoutAmountSen
        ) return unavailable('unsupported');
        const url = resolveToyyibPayActionUrl(providerPayment.provider_payment_id);
        return NextResponse.json({ data: { canResume: true, provider: 'toyyibpay', url }, error: null });
      } catch {
        return unavailable('unsupported');
      }
    }

    if (
      isSimulatorCheckoutProvider(providerPayment.provider)
      && process.env.NODE_ENV !== 'production'
      && process.env.PAYMENT_SIMULATOR_MODE === 'enabled'
    ) {
      return NextResponse.json({
        data: { canResume: true, provider: providerPayment.provider, url: `/customer/checkout/simulator/${session.id}` },
        error: null,
      });
    }

    return unavailable('unsupported');
  } catch {
    return NextResponse.json({ error: 'Payment status is temporarily unavailable' }, { status: 503 });
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id,status')
    .eq('id', orderId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: 'Order status is temporarily unavailable' }, { status: 503 });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (String(order.status).toLowerCase() !== 'pending_payment') {
    return NextResponse.json({ error: 'This order is not waiting for payment' }, { status: 409 });
  }

  try {
    const service = createServiceClient();
    const { data: checkout, error: checkoutError } = await service
      .from('checkout_sessions')
      .select('id,user_id,order_id,payment_method,status,currency,total_amount,expires_at')
      .eq('order_id', orderId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (checkoutError) return NextResponse.json({ error: 'Payment status is temporarily unavailable' }, { status: 503 });
    if (!checkout) return unavailable('unsupported');

    const session = checkout as CheckoutSessionRow;
    if (session.status === 'paid') return unavailable('processing');
    if (!['pending_payment', 'requires_action', 'expired'].includes(session.status)) return unavailable('unsupported');
    if (!['stripe_card', 'wallet_split'].includes(session.payment_method)) return unavailable('unsupported');

    const { data: payment, error: paymentError } = await service
      .from('payments')
      .select('provider,provider_payment_id,status,amount')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) return NextResponse.json({ error: 'Payment status is temporarily unavailable' }, { status: 503 });
    if (!payment || payment.provider !== 'stripe' || !payment.provider_payment_id) return unavailable('unsupported');

    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.retrieve(payment.provider_payment_id);
    } catch {
      return NextResponse.json({ error: 'Payment status is temporarily unavailable' }, { status: 503 });
    }
    if (
      stripeSession.metadata?.user_id !== user.id
      || stripeSession.metadata?.order_id !== orderId
      || stripeSession.metadata?.checkout_session_id !== session.id
      || stripeSession.mode !== 'payment'
    ) return unavailable('unsupported');
    if (stripeSession.payment_status === 'paid' || stripeSession.status === 'complete') {
      return unavailable('processing');
    }
    if (stripeSession.status === 'expired') {
      if (!await finalizeExpiredCheckout(service, session.id)) {
        return NextResponse.json({ error: 'The expired checkout could not be finalized safely' }, { status: 503 });
      }
      return NextResponse.json({ data: { canReviewCart: true }, error: null });
    }
    if (stripeSession.status !== 'open' || stripeSession.payment_status !== 'unpaid') return unavailable('unsupported');

    const checkoutIsActive = new Date(session.expires_at).getTime() > Date.now()
      && ['pending_payment', 'requires_action'].includes(session.status);
    if (checkoutIsActive) {
      return NextResponse.json({ data: { canReviewCart: false, reason: 'active' }, error: null });
    }

    try {
      await stripe.checkout.sessions.expire(payment.provider_payment_id);
      if (!await finalizeExpiredCheckout(service, session.id)) {
        return NextResponse.json({ error: 'The expired checkout could not be finalized safely' }, { status: 503 });
      }
      return NextResponse.json({ data: { canReviewCart: true }, error: null });
    } catch {
      // A payment can complete between retrieval and expiration. Re-read Stripe
      // before allowing a retry so the user is never encouraged to pay twice.
      try {
        const latestSession = await stripe.checkout.sessions.retrieve(payment.provider_payment_id);
        if (latestSession.payment_status === 'paid' || latestSession.status === 'complete') {
          return unavailable('processing');
        }
        if (latestSession.status === 'expired') {
          if (!await finalizeExpiredCheckout(service, session.id)) {
            return NextResponse.json({ error: 'The expired checkout could not be finalized safely' }, { status: 503 });
          }
          return NextResponse.json({ data: { canReviewCart: true }, error: null });
        }
      } catch {
        // Fall through to the stable unavailable response.
      }
      return NextResponse.json({ error: 'The old payment session could not be closed safely' }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ error: 'Payment status is temporarily unavailable' }, { status: 503 });
  }
}
