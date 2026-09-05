import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { verifyToyyibPayCallback } from '@/lib/payments/toyyibpay';
import { createServiceClient } from '@/lib/supabase/service';
import { emitOrderVendorEvent } from '@/lib/vendor-notifications/order-events';

export const dynamic = 'force-dynamic';

type SettlementResult = {
  checkout_session_id: string;
  order_id: string;
  user_id: string;
  status: string;
  idempotent: boolean;
};

function singleFormField(form: URLSearchParams, name: string, maxLength: number): string | null {
  const values = form.getAll(name);
  if (values.length !== 1) return null;
  const value = values[0]?.trim() ?? '';
  return value && value.length <= maxLength ? value : null;
}

function parseAmountSen(value: string): number | null {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [ringgit, sen = ''] = value.split('.');
  const result = Number(ringgit) * 100 + Number(sen.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const refno = singleFormField(form, 'refno', 253);
  const status = singleFormField(form, 'status', 1);
  const billcode = singleFormField(form, 'billcode', 8);
  const checkoutSessionId = singleFormField(form, 'order_id', 36);
  const amount = singleFormField(form, 'amount', 32);
  const receivedHash = singleFormField(form, 'hash', 32);
  const amountSen = amount ? parseAmountSen(amount) : null;

  if (
    !refno
    || !/^[A-Za-z0-9_-]{1,253}$/.test(refno)
    || !status
    || !['1', '2', '3'].includes(status)
    || !billcode
    || !/^[A-Za-z0-9]{8}$/.test(billcode)
    || !checkoutSessionId
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(checkoutSessionId)
    || amountSen === null
    || !receivedHash
  ) {
    return NextResponse.json({ error: 'Invalid ToyyibPay callback' }, { status: 400 });
  }

  const secret = process.env.TOYYIBPAY_USER_SECRET_KEY ?? '';
  if (!verifyToyyibPayCallback({
    userSecretKey: secret,
    status,
    orderId: checkoutSessionId,
    refno,
    receivedHash,
  })) {
    return NextResponse.json({ error: 'Invalid ToyyibPay callback' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: checkout, error: checkoutError } = await service
    .from('checkout_sessions')
    .select('id,order_id,user_id,currency,total_amount,status,payment_method')
    .eq('id', checkoutSessionId)
    .maybeSingle();
  if (checkoutError) {
    return NextResponse.json({ error: 'Unable to verify checkout' }, { status: 503 });
  }
  if (!checkout) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 });

  const { data: payment, error: paymentError } = await service
    .from('payments')
    .select('provider,provider_payment_id,amount')
    .eq('order_id', checkout.order_id)
    .order('created_at', { ascending: false })
    .maybeSingle();
  if (paymentError) {
    return NextResponse.json({ error: 'Unable to verify payment' }, { status: 503 });
  }
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  const expectedAmountSen = Math.round(Number(payment.amount) * 100);
  const expectedCheckoutAmountSen = Math.round(Number(checkout.total_amount) * 100);
  if (
    checkout.payment_method !== 'bank_transfer'
    || checkout.currency !== 'MYR'
    || payment.provider !== 'toyyibpay'
    || payment.provider_payment_id !== billcode
    || !Number.isSafeInteger(expectedAmountSen)
    || !Number.isSafeInteger(expectedCheckoutAmountSen)
    || expectedAmountSen !== amountSen
    || expectedCheckoutAmountSen !== amountSen
  ) {
    return NextResponse.json({ error: 'ToyyibPay evidence does not match checkout' }, { status: 409 });
  }

  const outcome = status === '1' ? 'succeeded' : status === '2' ? 'pending' : 'failed';
  const { data, error } = await service.rpc('settle_provider_checkout', {
    p_checkout_session_id: checkoutSessionId,
    p_provider: 'toyyibpay',
    p_outcome: outcome,
    p_provider_payment_id: billcode,
    p_provider_event_id: `${refno}:${status}`,
    p_payload_sha256: createHash('sha256').update(rawBody).digest('hex'),
    p_amount_sen: amountSen,
    p_currency: 'MYR',
  });
  if (error || !data) {
    return NextResponse.json({ error: 'Unable to settle ToyyibPay callback' }, { status: 409 });
  }

  const result = data as SettlementResult;
  if (outcome === 'succeeded' && !result.idempotent && result.status === 'paid') {
    try {
      await enqueueUserTransactionEmail({
        userId: result.user_id,
        eventType: 'checkout_succeeded',
        eventKey: `toyyibpay-checkout:${refno}:${status}`,
        reference: billcode,
        amountRm: amountSen / 100,
      });
    } catch (emailError) {
      console.error('[toyyibpay-callback] checkout email enqueue failed', emailError);
    }
    try {
      await emitOrderVendorEvent({
        serviceDb: service,
        orderId: result.order_id,
        eventKey: `order:paid:${result.order_id}`,
        type: 'vendor_order_created',
        title: 'New order received',
        body: `Order ${result.order_id} has been paid and is ready for fulfilment.`,
        email: true,
      });
    } catch (notificationError) {
      console.error('[toyyibpay-callback] vendor order event failed', notificationError);
    }
  }

  return NextResponse.json({ received: true, status: result.status, idempotent: Boolean(result.idempotent) });
}
