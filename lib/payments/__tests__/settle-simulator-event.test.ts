import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signSimulatorWebhookPayload } from '@/lib/payments/simulator-webhook';

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  rpc: vi.fn(),
  enqueueUserTransactionEmail: vi.fn(),
  emitOrderVendorEvent: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/email/events', () => ({ enqueueUserTransactionEmail: mocks.enqueueUserTransactionEmail }));
vi.mock('@/lib/vendor-notifications/order-events', () => ({ emitOrderVendorEvent: mocks.emitOrderVendorEvent }));

import { settleSimulatorEvent } from '@/lib/payments/settle-simulator-event';

const secret = 'simulator-settlement-test-secret';
const payload = {
  kind: 'payment' as const,
  eventId: 'sim_evt_paid_001',
  provider: 'tng_ewallet_simulator' as const,
  providerPaymentId: 'sim_pay_0123456789abcdef0123456789abcdef01234567',
  checkoutSessionId: '9e703f42-7f40-4a4f-a4a0-447eb6319931',
  eventType: 'payment.succeeded' as const,
  amountSen: 5000,
  currency: 'MYR' as const,
};

function signedBody(value: object = payload) {
  const rawBody = JSON.stringify(value);
  return { rawBody, signature: signSimulatorWebhookPayload(rawBody, secret) };
}

describe('settleSimulatorEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENT_SIMULATOR_MODE', 'enabled');
    vi.stubEnv('PAYMENT_SIMULATOR_WEBHOOK_SECRET', secret);
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.enqueueUserTransactionEmail.mockResolvedValue(undefined);
    mocks.emitOrderVendorEvent.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({
      data: {
        checkout_session_id: payload.checkoutSessionId,
        order_id: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
        user_id: '7df122f8-afae-4249-8504-bdd465a78f31',
        status: 'paid',
        idempotent: false,
      },
      error: null,
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('maps a verified payment event to atomic provider settlement and notifications', async () => {
    const input = signedBody();
    const result = await settleSimulatorEvent(input.rawBody, input.signature);

    expect(mocks.rpc).toHaveBeenCalledWith('settle_provider_checkout', {
      p_checkout_session_id: payload.checkoutSessionId,
      p_provider: payload.provider,
      p_outcome: 'succeeded',
      p_provider_payment_id: payload.providerPaymentId,
      p_provider_event_id: payload.eventId,
      p_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_amount_sen: 5000,
      p_currency: 'MYR',
    });
    expect(result).toMatchObject({ kind: 'payment', status: 'paid', idempotent: false });
    expect(mocks.enqueueUserTransactionEmail).toHaveBeenCalledTimes(1);
    expect(mocks.emitOrderVendorEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects a tampered signature before constructing a service client', async () => {
    const input = signedBody();
    await expect(settleSimulatorEvent(`${input.rawBody} `, input.signature)).rejects.toThrow('invalid_simulator_webhook_signature');
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('suppresses customer and vendor notifications for an idempotent replay', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        checkout_session_id: payload.checkoutSessionId,
        order_id: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
        user_id: '7df122f8-afae-4249-8504-bdd465a78f31',
        status: 'paid',
        idempotent: true,
      },
      error: null,
    });
    const input = signedBody();

    const result = await settleSimulatorEvent(input.rawBody, input.signature);

    expect(result.idempotent).toBe(true);
    expect(mocks.enqueueUserTransactionEmail).not.toHaveBeenCalled();
    expect(mocks.emitOrderVendorEvent).not.toHaveBeenCalled();
  });

  it('fails closed in Production without touching Supabase', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const input = signedBody();

    await expect(settleSimulatorEvent(input.rawBody, input.signature)).rejects.toThrow('payment_simulator_unavailable');
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('maps a verified refund event to the service-only refund settlement RPC', async () => {
    const refundPayload = {
      kind: 'refund' as const,
      eventId: 'sim_evt_refund_001',
      provider: 'tng_ewallet_simulator' as const,
      providerRefundId: 'sim_refund_0123456789abcdef0123456789abcdef01234567',
      refundId: '33333333-3333-4333-8333-333333333333',
      eventType: 'refund.failed' as const,
      amountSen: 5000,
      currency: 'MYR' as const,
      failure: {
        code: 'simulator_timeout',
        message: 'The simulated provider timed out.',
        retryable: true,
      },
    };
    mocks.rpc.mockResolvedValue({
      data: {
        refund_id: refundPayload.refundId,
        order_id: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
        status: 'pending',
        idempotent: false,
      },
      error: null,
    });
    const input = signedBody(refundPayload);

    const result = await settleSimulatorEvent(input.rawBody, input.signature);

    expect(mocks.rpc).toHaveBeenCalledWith('settle_simulated_refund', {
      p_refund_id: refundPayload.refundId,
      p_provider: refundPayload.provider,
      p_event_id: refundPayload.eventId,
      p_provider_refund_id: refundPayload.providerRefundId,
      p_outcome: 'failed',
      p_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_amount_sen: 5000,
      p_currency: 'MYR',
      p_failure_code: 'simulator_timeout',
      p_failure_message: 'The simulated provider timed out.',
      p_retryable: true,
    });
    expect(result).toEqual({
      kind: 'refund',
      status: 'pending',
      idempotent: false,
      orderId: '1d4057cf-c821-4b05-a454-61dbdc42d32c',
    });
    expect(mocks.enqueueUserTransactionEmail).not.toHaveBeenCalled();
    expect(mocks.emitOrderVendorEvent).not.toHaveBeenCalled();
  });
});
