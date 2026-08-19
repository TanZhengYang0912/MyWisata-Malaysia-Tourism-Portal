import { describe, expect, it } from 'vitest';
import {
  hashSimulatorWebhookPayload,
  parseSimulatorWebhookPayload,
  signSimulatorWebhookPayload,
  verifySimulatorWebhookSignature,
} from '@/lib/payments/simulator-webhook';

const secret = 'simulator-webhook-test-secret';
const paymentPayload = {
  kind: 'payment' as const,
  eventId: 'sim_evt_payment_001',
  provider: 'tng_ewallet_simulator' as const,
  providerPaymentId: 'sim_pay_0123456789abcdef0123456789abcdef01234567',
  checkoutSessionId: '9e703f42-7f40-4a4f-a4a0-447eb6319931',
  eventType: 'payment.succeeded' as const,
  amountSen: 5000,
  currency: 'MYR' as const,
};

describe('simulator webhook signatures', () => {
  it('verifies the exact raw body and hashes it', () => {
    const rawBody = JSON.stringify(paymentPayload);
    const signature = signSimulatorWebhookPayload(rawBody, secret);

    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySimulatorWebhookSignature(rawBody, signature, secret)).toBe(true);
    expect(verifySimulatorWebhookSignature(`${rawBody} `, signature, secret)).toBe(false);
    expect(hashSimulatorWebhookPayload(rawBody)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([null, '', 'invalid', '0'.repeat(62)])('rejects missing or malformed signature %s', (signature) => {
    expect(verifySimulatorWebhookSignature(JSON.stringify(paymentPayload), signature, secret)).toBe(false);
  });
});

describe('simulator webhook payload parsing', () => {
  it('parses strict payment and refund events with authoritative amount and currency', () => {
    expect(parseSimulatorWebhookPayload(JSON.stringify(paymentPayload))).toEqual(paymentPayload);

    const refundPayload = {
      kind: 'refund' as const,
      eventId: 'sim_evt_refund_001',
      provider: 'grabpay_simulator' as const,
      providerRefundId: 'sim_refund_0123456789abcdef0123456789abcdef',
      refundId: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
      eventType: 'refund.failed' as const,
      amountSen: 2500,
      currency: 'MYR' as const,
      failure: { code: 'provider_timeout', message: 'Provider timed out', retryable: true },
    };

    expect(parseSimulatorWebhookPayload(JSON.stringify(refundPayload))).toEqual(refundPayload);
  });

  it.each([
    '{',
    JSON.stringify({ ...paymentPayload, extra: true }),
    JSON.stringify({ ...paymentPayload, provider: 'stripe' }),
    JSON.stringify({ ...paymentPayload, checkoutSessionId: 'not-a-uuid' }),
    JSON.stringify({ ...paymentPayload, amountSen: 0 }),
    JSON.stringify({ ...paymentPayload, currency: 'USD' }),
    JSON.stringify({ ...paymentPayload, eventType: 'payment.unknown' }),
    JSON.stringify({ ...paymentPayload, failure: { code: 'x', message: 'x'.repeat(501), retryable: true } }),
  ])('rejects malformed or unsupported payload %s', (rawBody) => {
    expect(() => parseSimulatorWebhookPayload(rawBody)).toThrow('invalid_payment_simulator_webhook_payload');
  });
});
