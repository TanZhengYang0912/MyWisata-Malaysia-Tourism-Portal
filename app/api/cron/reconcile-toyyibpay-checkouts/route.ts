import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { ToyyibPayProvider } from '@/lib/payments/toyyibpay';
import { createServiceClient } from '@/lib/supabase/service';
import { emitOrderVendorEvent } from '@/lib/vendor-notifications/order-events';

export const dynamic = 'force-dynamic';

const MAX_CANDIDATES = 50;
const MINIMUM_AGE_MS = 5 * 60 * 1000;
const BILL_CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

type PaymentCandidate = {
  order_id: string;
  provider_payment_id: string;
  amount: number | string;
};

type CheckoutCandidate = {
  id: string;
  order_id: string;
  user_id: string;
  currency: string;
  total_amount: number | string;
  status: string;
  payment_method: string;
};

type SettlementResult = {
  order_id: string;
  user_id: string;
  status: string;
  idempotent: boolean;
};

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const provider = new ToyyibPayProvider();
  if (!provider.isConfigured()) {
    return NextResponse.json({ error: 'toyyibpay_reconciliation_unavailable' }, { status: 503 });
  }

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - MINIMUM_AGE_MS).toISOString();
  const { data: paymentData, error: paymentError } = await service
    .from('payments')
    .select('order_id,provider_payment_id,amount,status,updated_at,provider_create_status')
    .eq('provider', 'toyyibpay')
    .eq('provider_create_status', 'created')
    .in('status', ['pending', 'requires_action'])
    .not('provider_payment_id', 'is', null)
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(MAX_CANDIDATES);
  if (paymentError) {
    return NextResponse.json({ error: 'toyyibpay_reconciliation_unavailable' }, { status: 503 });
  }

  const payments = (paymentData ?? []) as PaymentCandidate[];
  const emptyCounts = { examined: 0, settled: 0, pending: 0, failed: 0, skipped: 0, errors: 0 };
  if (payments.length === 0) return NextResponse.json(emptyCounts);

  const orderIds = [...new Set(payments.map((payment) => payment.order_id).filter(Boolean))];
  const { data: checkoutData, error: checkoutError } = await service
    .from('checkout_sessions')
    .select('id,order_id,user_id,currency,total_amount,status,payment_method')
    .in('order_id', orderIds)
    .in('status', ['pending_payment', 'requires_action']);
  if (checkoutError) {
    return NextResponse.json({ error: 'toyyibpay_reconciliation_unavailable' }, { status: 503 });
  }
  const checkoutsByOrder = new Map(
    ((checkoutData ?? []) as CheckoutCandidate[]).map((checkout) => [checkout.order_id, checkout]),
  );

  const counts = { ...emptyCounts, examined: payments.length };
  for (const payment of payments) {
    const checkout = checkoutsByOrder.get(payment.order_id);
    const billCode = payment.provider_payment_id;
    const paymentAmountSen = Math.round(Number(payment.amount) * 100);
    const checkoutAmountSen = checkout ? Math.round(Number(checkout.total_amount) * 100) : 0;
    if (
      !checkout
      || checkout.payment_method !== 'bank_transfer'
      || checkout.currency !== 'MYR'
      || !BILL_CODE_PATTERN.test(billCode)
      || !Number.isSafeInteger(paymentAmountSen)
      || paymentAmountSen <= 0
      || checkoutAmountSen !== paymentAmountSen
    ) {
      counts.skipped += 1;
      continue;
    }

    let evidence;
    try {
      evidence = await provider.getPaymentEvidence(billCode);
    } catch {
      counts.errors += 1;
      continue;
    }
    if (!evidence) {
      counts.pending += 1;
      continue;
    }
    if (
      evidence.externalReference !== checkout.id
      || evidence.amountSen !== paymentAmountSen
      || !/^[A-Za-z0-9_-]{1,243}$/.test(evidence.providerEventReference)
    ) {
      counts.skipped += 1;
      continue;
    }

    const outcome = evidence.status === 'succeeded'
      ? 'succeeded'
      : evidence.status === 'pending'
        ? 'pending'
        : 'failed';
    const eventId = `reconcile:${evidence.providerEventReference}:${evidence.rawStatus}`;
    const evidenceHash = createHash('sha256').update(JSON.stringify({
      billCode,
      externalReference: evidence.externalReference,
      amountSen: evidence.amountSen,
      providerEventReference: evidence.providerEventReference,
      rawStatus: evidence.rawStatus,
    })).digest('hex');
    const { data, error } = await service.rpc('settle_provider_checkout', {
      p_checkout_session_id: checkout.id,
      p_provider: 'toyyibpay',
      p_outcome: outcome,
      p_provider_payment_id: billCode,
      p_provider_event_id: eventId,
      p_payload_sha256: evidenceHash,
      p_amount_sen: evidence.amountSen,
      p_currency: 'MYR',
    });
    if (error || !data) {
      counts.errors += 1;
      continue;
    }

    if (outcome === 'succeeded') counts.settled += 1;
    else if (outcome === 'pending') counts.pending += 1;
    else counts.failed += 1;

    const result = data as SettlementResult;
    if (outcome === 'succeeded' && !result.idempotent && result.status === 'paid') {
      try {
        await enqueueUserTransactionEmail({
          userId: result.user_id,
          eventType: 'checkout_succeeded',
          eventKey: `toyyibpay-checkout:${eventId}`,
          reference: billCode,
          amountRm: evidence.amountSen / 100,
        });
      } catch {
        // Settlement is authoritative; notification delivery is best-effort.
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
      } catch {
        // Settlement is authoritative; notification delivery is best-effort.
      }
    }
  }

  return NextResponse.json(counts);
}
