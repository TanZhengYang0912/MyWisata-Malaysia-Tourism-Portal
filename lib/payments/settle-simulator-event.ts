import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { isPaymentSimulatorEnabled } from '@/lib/payments/simulator-config';
import {
  hashSimulatorWebhookPayload,
  parseSimulatorWebhookPayload,
  verifySimulatorWebhookSignature,
} from '@/lib/payments/simulator-webhook';
import { createServiceClient } from '@/lib/supabase/service';
import { emitOrderVendorEvent } from '@/lib/vendor-notifications/order-events';

type CheckoutSettlementResult = {
  checkout_session_id: string;
  order_id: string;
  user_id: string;
  status: string;
  idempotent: boolean;
};

type RefundSettlementResult = {
  refund_id: string;
  order_id: string;
  status: string;
  idempotent: boolean;
};

function redactFailureMessage(value: string | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/(password|pass|token|secret|auth(?:orization)?)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
    .replace(/\+\d{1,3}(?:[\s().-]*\d){7,14}/g, '[redacted]')
    .slice(0, 500);
}

export type SimulatorSettlementResult = {
  kind: 'payment' | 'refund';
  status: string;
  idempotent: boolean;
  orderId?: string;
  checkoutSessionId?: string;
};

export async function settleSimulatorEvent(
  rawBody: string,
  signature: string | null | undefined,
): Promise<SimulatorSettlementResult> {
  if (!isPaymentSimulatorEnabled()) throw new Error('payment_simulator_unavailable');
  const secret = process.env.PAYMENT_SIMULATOR_WEBHOOK_SECRET ?? '';
  if (!verifySimulatorWebhookSignature(rawBody, signature, secret)) {
    throw new Error('invalid_simulator_webhook_signature');
  }

  const payload = parseSimulatorWebhookPayload(rawBody);
  if (payload.kind === 'refund') {
    const service = createServiceClient();
    const { data, error } = await service.rpc('settle_simulated_refund', {
      p_refund_id: payload.refundId,
      p_provider: payload.provider,
      p_event_id: payload.eventId,
      p_provider_refund_id: payload.providerRefundId,
      p_outcome: payload.eventType.slice('refund.'.length),
      p_payload_sha256: hashSimulatorWebhookPayload(rawBody),
      p_amount_sen: payload.amountSen,
      p_currency: payload.currency,
      p_failure_code: payload.failure?.code ?? null,
      p_failure_message: redactFailureMessage(payload.failure?.message),
      p_retryable: payload.failure?.retryable ?? false,
    });
    if (error || !data) throw new Error(error?.message ?? 'simulator_refund_settlement_failed');

    const result = data as RefundSettlementResult;
    return {
      kind: 'refund',
      status: result.status,
      idempotent: Boolean(result.idempotent),
      orderId: result.order_id,
    };
  }

  const outcome = payload.eventType.slice('payment.'.length);
  const service = createServiceClient();
  const { data, error } = await service.rpc('settle_provider_checkout', {
    p_checkout_session_id: payload.checkoutSessionId,
    p_provider: payload.provider,
    p_outcome: outcome,
    p_provider_payment_id: payload.providerPaymentId,
    p_provider_event_id: payload.eventId,
    p_payload_sha256: hashSimulatorWebhookPayload(rawBody),
    p_amount_sen: payload.amountSen,
    p_currency: payload.currency,
  });
  if (error || !data) throw new Error(error?.message ?? 'simulator_payment_settlement_failed');

  const result = data as CheckoutSettlementResult;
  if (!result.idempotent && result.status === 'paid') {
    try {
      await enqueueUserTransactionEmail({
        userId: result.user_id,
        eventType: 'checkout_succeeded',
        eventKey: `simulator-checkout:${payload.eventId}`,
        reference: payload.providerPaymentId,
        amountRm: payload.amountSen / 100,
      });
    } catch (emailError) {
      console.error('[payment-simulator] checkout email enqueue failed', emailError);
    }
    void emitOrderVendorEvent({
      serviceDb: service,
      orderId: result.order_id,
      eventKey: `order:paid:${result.order_id}`,
      type: 'vendor_order_created',
      title: 'New order received',
      body: `Order ${result.order_id} has been paid and is ready for fulfilment.`,
      email: true,
    }).catch((notificationError) => {
      console.error('[payment-simulator] vendor order event failed', notificationError);
    });
  }

  return {
    kind: 'payment',
    status: result.status,
    idempotent: Boolean(result.idempotent),
    orderId: result.order_id,
    checkoutSessionId: result.checkout_session_id,
  };
}
