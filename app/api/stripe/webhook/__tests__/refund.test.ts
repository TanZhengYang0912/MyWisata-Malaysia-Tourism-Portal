import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REFUND_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  rpc: vi.fn(),
  log: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'stripe-signature': 'sig_test' })),
}));
vi.mock('@/lib/stripe', () => ({
  stripe: { webhooks: { constructEvent: mocks.constructEvent } },
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

function stripeRefundEvent(
  type: 'refund.created' | 'refund.updated' | 'refund.failed',
  status: 'pending' | 'succeeded' | 'failed',
) {
  return {
    id: 'evt_refund_test',
    type,
    created: 1_791_408_000,
    data: {
      object: {
        id: 're_test_refund',
        status,
        amount: 2800,
        currency: 'myr',
        failure_reason: status === 'failed' ? 'failed_to_process' : null,
        metadata: { mylawatan_refund_id: REFUND_ID } as Record<string, string>,
      },
    },
  };
}

function request() {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"id":"evt_refund_test"}',
  });
}

describe('POST /api/stripe/webhook refund outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test');
    mocks.constructEvent.mockReturnValue(stripeRefundEvent('refund.created', 'pending'));
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['refund.created', 'pending', 'pending'],
    ['refund.updated', 'succeeded', 'succeeded'],
    ['refund.failed', 'failed', 'failed'],
  ] as const)('records a signed %s event as %s', async (type, status, outcome) => {
    mocks.constructEvent.mockReturnValue(stripeRefundEvent(type, status));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.rpc).toHaveBeenCalledWith('record_order_refund_provider_outcome', {
      p_refund_id: REFUND_ID,
      p_provider_refund_id: 're_test_refund',
      p_outcome: outcome,
      p_amount_sen: 2800,
      p_currency: 'MYR',
      p_failure_code: status === 'failed' ? 'failed_to_process' : null,
      p_failure_message: status === 'failed' ? 'Stripe could not complete this refund.' : null,
      p_actor_id: null,
      p_note: null,
      p_event_id: 'evt_refund_test',
    });
  });

  it('acknowledges Stripe refunds outside the MYLawatan refund flow without writing', async () => {
    const event = stripeRefundEvent('refund.created', 'pending');
    event.data.object.metadata = {};
    mocks.constructEvent.mockReturnValue(event);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('continues to accept refunds created with the previous metadata key', async () => {
    const event = stripeRefundEvent('refund.created', 'pending');
    event.data.object.metadata = { mywisata_refund_id: REFUND_ID };
    mocks.constructEvent.mockReturnValue(event);

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('record_order_refund_provider_outcome', expect.objectContaining({
      p_refund_id: REFUND_ID,
    }));
  });

  it('rejects an invalid Stripe signature without a database write', async () => {
    mocks.constructEvent.mockImplementation(() => { throw new Error('bad signature'); });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns a server error when the provider outcome RPC fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'Failed to record refund outcome' });
    expect(mocks.log).toHaveBeenCalledWith('error', '[stripe-webhook] refund outcome RPC failed', expect.objectContaining({
      error: 'database unavailable',
      providerRefundId: 're_test_refund',
    }));
  });
});
