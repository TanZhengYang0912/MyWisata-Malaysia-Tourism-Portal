import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '7df122f8-afae-4249-8504-bdd465a78f31';
const CHECKOUT_ID = '9e703f42-7f40-4a4f-a4a0-447eb6319931';
const ORDER_ID = '1d4057cf-c821-4b05-a454-61dbdc42d32c';

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  rpc: vi.fn(),
  enqueueUserTransactionEmail: vi.fn(),
  emitOrderVendorEvent: vi.fn(),
  service: { rpc: vi.fn(), from: vi.fn() },
}));

vi.mock('next/headers', () => ({ headers: vi.fn(async () => ({ get: () => 'stripe-signature-value' })) }));
vi.mock('@/lib/stripe', () => ({ stripe: { webhooks: { constructEvent: mocks.constructEvent } } }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => mocks.service) }));
vi.mock('@/lib/email/events', () => ({ enqueueUserTransactionEmail: mocks.enqueueUserTransactionEmail }));
vi.mock('@/lib/vendor-notifications/order-events', () => ({ emitOrderVendorEvent: mocks.emitOrderVendorEvent }));

import { POST } from '../webhook/route';

function request() {
  return new Request('http://localhost/api/stripe/webhook', { method: 'POST', body: '{"stripe":"raw-body"}' });
}

describe('Stripe order webhook provider settlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_only');
    mocks.constructEvent.mockReturnValue({
      id: 'evt_order_paid_001',
      type: 'checkout.session.completed',
      created: 1_800_000_000,
      data: { object: {
        id: 'cs_test_order_001',
        amount_total: 5000,
        currency: 'myr',
        payment_status: 'paid',
        metadata: { user_id: USER_ID, checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, payment_kind: 'order' },
      } },
    });
    mocks.service.rpc.mockResolvedValue({
      data: { order_id: ORDER_ID, user_id: USER_ID, status: 'paid', idempotent: false },
      error: null,
    });
    mocks.enqueueUserTransactionEmail.mockResolvedValue(undefined);
    mocks.emitOrderVendorEvent.mockResolvedValue(undefined);
  });

  it('uses the signed raw Stripe event to call provider settlement', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.service.rpc).toHaveBeenCalledWith('settle_provider_checkout', {
      p_checkout_session_id: CHECKOUT_ID,
      p_provider: 'stripe',
      p_outcome: 'succeeded',
      p_provider_payment_id: 'cs_test_order_001',
      p_provider_event_id: 'evt_order_paid_001',
      p_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_amount_sen: 5000,
      p_currency: 'MYR',
    });
    expect(mocks.enqueueUserTransactionEmail).toHaveBeenCalledTimes(1);
    expect(mocks.emitOrderVendorEvent).toHaveBeenCalledTimes(1);
  });

  it('suppresses duplicate notifications when another confirmation already paid the order', async () => {
    mocks.service.rpc.mockResolvedValue({
      data: { order_id: ORDER_ID, user_id: USER_ID, status: 'paid', idempotent: true },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.enqueueUserTransactionEmail).not.toHaveBeenCalled();
    expect(mocks.emitOrderVendorEvent).not.toHaveBeenCalled();
  });
});
