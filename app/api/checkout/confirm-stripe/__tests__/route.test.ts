import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '7df122f8-afae-4249-8504-bdd465a78f31';
const CHECKOUT_ID = '9e703f42-7f40-4a4f-a4a0-447eb6319931';
const ORDER_ID = '1d4057cf-c821-4b05-a454-61dbdc42d32c';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  retrieve: vi.fn(),
  rpc: vi.fn(),
  enqueueUserTransactionEmail: vi.fn(),
  emitOrderVendorEvent: vi.fn(),
  service: { rpc: vi.fn() },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mocks.service),
}));
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { retrieve: mocks.retrieve } } } }));
vi.mock('@/lib/email/events', () => ({ enqueueUserTransactionEmail: mocks.enqueueUserTransactionEmail }));
vi.mock('@/lib/vendor-notifications/order-events', () => ({ emitOrderVendorEvent: mocks.emitOrderVendorEvent }));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/checkout/confirm-stripe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stripeSessionId: 'cs_test_order_001' }),
  });
}

describe('POST /api/checkout/confirm-stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.retrieve.mockResolvedValue({
      id: 'cs_test_order_001',
      payment_status: 'paid',
      amount_total: 5000,
      currency: 'myr',
      metadata: { user_id: USER_ID, checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, payment_kind: 'order' },
    });
    mocks.service.rpc.mockResolvedValue({
      data: { order_id: ORDER_ID, user_id: USER_ID, status: 'paid', idempotent: false },
      error: null,
    });
    mocks.enqueueUserTransactionEmail.mockResolvedValue(undefined);
    mocks.emitOrderVendorEvent.mockResolvedValue(undefined);
  });

  it('settles from authoritative Stripe state through the provider RPC', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.service.rpc).toHaveBeenCalledWith('settle_provider_checkout', {
      p_checkout_session_id: CHECKOUT_ID,
      p_provider: 'stripe',
      p_outcome: 'succeeded',
      p_provider_payment_id: 'cs_test_order_001',
      p_provider_event_id: 'confirm:cs_test_order_001',
      p_payload_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_amount_sen: 5000,
      p_currency: 'MYR',
    });
    expect(mocks.enqueueUserTransactionEmail).toHaveBeenCalledTimes(1);
    expect(mocks.emitOrderVendorEvent).toHaveBeenCalledTimes(1);
  });

  it('does not settle a Stripe session that is not paid', async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'cs_test_order_001',
      payment_status: 'unpaid',
      amount_total: 5000,
      currency: 'myr',
      metadata: { user_id: USER_ID, checkout_session_id: CHECKOUT_ID },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.service.rpc).not.toHaveBeenCalled();
  });

  it('does not send duplicate notifications for an idempotent confirmation', async () => {
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
