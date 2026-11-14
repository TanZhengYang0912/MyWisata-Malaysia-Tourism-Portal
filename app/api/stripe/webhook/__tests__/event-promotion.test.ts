import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROMOTION_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  refundsCreate: vi.fn(),
  rpc: vi.fn(),
  log: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'stripe-signature': 'sig_test' })),
}));
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: mocks.constructEvent }, refunds: { create: mocks.refundsCreate } },
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ rpc: mocks.rpc })),
}));
vi.mock('@/lib/email/events', () => ({ enqueueUserTransactionEmail: vi.fn() }));
vi.mock('@/lib/email/payment', () => ({ getPaymentEmailType: vi.fn() }));
vi.mock('@/lib/vendor-notifications/order-events', () => ({ emitOrderVendorEvent: vi.fn() }));
vi.mock('@/lib/log', () => ({ log: mocks.log }));
vi.mock('@/lib/request-id', () => ({ getRequestId: vi.fn(() => 'request-test') }));

import { POST } from '../route';

function promotionSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_promotion_test',
    type: 'checkout.session.completed',
    created: 1_791_408_000,
    data: {
      object: {
        id: 'cs_test_promotion',
        payment_status: 'paid',
        amount_total: 30_000,
        currency: 'myr',
        livemode: false,
        payment_intent: 'pi_test_promotion',
        metadata: { user_id: 'user-1', payment_kind: 'event_promotion', promotion_id: PROMOTION_ID },
        ...overrides,
      },
    },
  };
}

function request() {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"id":"evt_promotion_test"}',
  });
}

describe('POST /api/stripe/webhook event promotion payments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example');
    mocks.constructEvent.mockReturnValue(promotionSession());
    mocks.refundsCreate.mockResolvedValue({ id: 're_test_promotion', amount: 30_000 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['confirmed', 'already_confirmed'])('acknowledges a %s payment without refunding', async (outcome) => {
    mocks.rpc.mockResolvedValueOnce({ data: outcome, error: null });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_vendor_event_promotion_stripe_payment', {
      p_promotion_id: PROMOTION_ID,
      p_checkout_session_id: 'cs_test_promotion',
      p_amount_sen: 30_000,
    });
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it.each(['already_paid', 'not_payable', 'superseded', 'amount_mismatch', 'not_found'])(
    'refunds a %s payment in full, once per session, and stops Stripe retries',
    async (outcome) => {
      mocks.rpc
        .mockResolvedValueOnce({ data: outcome, error: null })
        .mockResolvedValueOnce({ data: null, error: null });

      const response = await POST(request());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ received: true, refunded: true });
      expect(mocks.refundsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_test_promotion', metadata: expect.objectContaining({ promotion_id: PROMOTION_ID, outcome }) }),
        { idempotencyKey: 'event-promotion-refund:cs_test_promotion' },
      );
      // No `amount`: Stripe refunds the full charge.
      expect(mocks.refundsCreate.mock.calls[0][0]).not.toHaveProperty('amount');
      expect(mocks.rpc).toHaveBeenLastCalledWith('record_vendor_event_promotion_stripe_refund', {
        p_promotion_id: PROMOTION_ID,
        p_checkout_session_id: 'cs_test_promotion',
        p_provider_refund_id: 're_test_promotion',
        p_amount_sen: 30_000,
        p_reason: outcome,
      });
    },
  );

  it('asks Stripe to retry when the refund call fails, without recording a refund', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'already_paid', error: null });
    mocks.refundsCreate.mockRejectedValueOnce(new Error('network'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('never refunds on an unknown outcome such as the pre-migration RPC returning null', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it('rejects a session from the wrong currency or Stripe mode before touching the database', async () => {
    mocks.constructEvent.mockReturnValueOnce(promotionSession({ currency: 'usd' }));
    expect((await POST(request())).status).toBe(409);

    mocks.constructEvent.mockReturnValueOnce(promotionSession({ livemode: true }));
    expect((await POST(request())).status).toBe(409);

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['refund.updated', 'succeeded'],
    ['refund.failed', 'failed'],
  ] as const)('records the %s status of an automatic promotion refund', async (type, status) => {
    mocks.constructEvent.mockReturnValueOnce({
      id: 'evt_refund_promotion',
      type,
      created: 1_791_408_000,
      data: { object: { id: 're_test_promotion', status, amount: 30_000, failure_reason: status === 'failed' ? 'expired_or_canceled_card' : null, metadata: { payment_kind: 'event_promotion_refund', promotion_id: PROMOTION_ID, checkout_session_id: 'cs_test_promotion' } } },
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('record_vendor_event_promotion_refund_outcome', {
      p_promotion_id: PROMOTION_ID,
      p_checkout_session_id: 'cs_test_promotion',
      p_provider_refund_id: 're_test_promotion',
      p_status: status,
      p_failure_reason: status === 'failed' ? 'expired_or_canceled_card' : null,
      p_amount_sen: 30_000,
    });
    // Not routed to the order refund ledger.
    expect(mocks.rpc).not.toHaveBeenCalledWith('record_order_refund_provider_outcome', expect.anything());
  });
});
