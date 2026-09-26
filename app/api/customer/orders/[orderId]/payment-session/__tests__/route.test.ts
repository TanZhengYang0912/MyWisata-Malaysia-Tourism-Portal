import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const CHECKOUT_ID = '33333333-3333-4333-8333-333333333333';
const STRIPE_SESSION_ID = 'cs_test_order123';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userFrom: vi.fn(),
  serviceFrom: vi.fn(),
  retrieveStripeSession: vi.fn(),
  expireStripeSession: vi.fn(),
  finalizeCheckout: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.userFrom,
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom, rpc: mocks.finalizeCheckout })),
}));

vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { retrieve: mocks.retrieveStripeSession, expire: mocks.expireStripeSession } } },
}));

import { GET, POST } from '../route';

let checkoutStatus = 'requires_action';
let checkoutExpiresAt = '';

function query(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gt', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
  return builder;
}

function request(method: 'GET' | 'POST' = 'GET') {
  const handler = method === 'POST' ? POST : GET;
  return handler(
    new Request(`http://localhost/api/customer/orders/${ORDER_ID}/payment-session`),
    { params: Promise.resolve({ orderId: ORDER_ID }) },
  );
}

describe('GET /api/customer/orders/[orderId]/payment-session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkoutStatus = 'requires_action';
    checkoutExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.finalizeCheckout.mockResolvedValue({ data: { status: 'expired' }, error: null });
    mocks.userFrom.mockReturnValue(query({ id: ORDER_ID, user_id: USER_ID, status: 'pending_payment' }));
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'checkout_sessions') return query({
        id: CHECKOUT_ID,
        user_id: USER_ID,
        order_id: ORDER_ID,
        payment_method: 'stripe_card',
        status: checkoutStatus,
        currency: 'MYR',
        total_amount: 9.6,
        expires_at: checkoutExpiresAt,
      });
      if (table === 'payments') return query({
        provider: 'stripe',
        provider_payment_id: STRIPE_SESSION_ID,
        status: 'requires_action',
        amount: 9.6,
      });
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.retrieveStripeSession.mockResolvedValue({
      id: STRIPE_SESSION_ID,
      mode: 'payment',
      status: 'open',
      payment_status: 'unpaid',
      amount_total: 960,
      currency: 'myr',
      url: 'https://checkout.stripe.com/c/pay/cs_test_order123',
      metadata: { user_id: USER_ID, order_id: ORDER_ID, checkout_session_id: CHECKOUT_ID },
    });
    mocks.expireStripeSession.mockResolvedValue({ id: STRIPE_SESSION_ID, status: 'expired' });
  });

  it('returns the Stripe URL only for the owner’s unexpired, still-open session', async () => {
    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        canResume: true,
        provider: 'stripe',
        url: 'https://checkout.stripe.com/c/pay/cs_test_order123',
      },
      error: null,
    });
    expect(mocks.retrieveStripeSession).toHaveBeenCalledWith(STRIPE_SESSION_ID);
  });

  it('supports a live-mode Stripe Checkout Session ID', async () => {
    const liveSessionId = 'cs_live_order123';
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'checkout_sessions') return query({
        id: CHECKOUT_ID,
        user_id: USER_ID,
        order_id: ORDER_ID,
        payment_method: 'stripe_card',
        status: 'requires_action',
        currency: 'MYR',
        total_amount: 9.6,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
      if (table === 'payments') return query({ provider: 'stripe', provider_payment_id: liveSessionId, status: 'requires_action', amount: 9.6 });
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { canResume: true, provider: 'stripe' } });
    expect(mocks.retrieveStripeSession).toHaveBeenCalledWith(liveSessionId);
  });

  it('does not return a payment URL when the Stripe session belongs to another order', async () => {
    mocks.retrieveStripeSession.mockResolvedValueOnce({
      id: STRIPE_SESSION_ID,
      mode: 'payment',
      status: 'open',
      payment_status: 'unpaid',
      amount_total: 960,
      currency: 'myr',
      url: 'https://checkout.stripe.com/c/pay/cs_test_order123',
      metadata: { user_id: USER_ID, order_id: 'another-order', checkout_session_id: CHECKOUT_ID },
    });

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { canResume: false } });
  });

  it('does not query Stripe or return a URL when the internal checkout session has expired', async () => {
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'checkout_sessions') return query(null);
      if (table === 'payments') return query({ provider: 'stripe', provider_payment_id: STRIPE_SESSION_ID, status: 'requires_action', amount: 9.6 });
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { canResume: false, reason: 'expired' }, error: null });
    expect(mocks.retrieveStripeSession).not.toHaveBeenCalled();
  });

  it('does not reveal whether another customer’s order has a payment session', async () => {
    mocks.userFrom.mockReturnValue(query(null));

    const response = await request();

    expect(response.status).toBe(404);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
    expect(mocks.retrieveStripeSession).not.toHaveBeenCalled();
  });

  it('does not resume a completed or non-open Stripe session', async () => {
    mocks.retrieveStripeSession.mockResolvedValueOnce({
      id: STRIPE_SESSION_ID,
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 960,
      currency: 'myr',
      url: 'https://checkout.stripe.com/c/pay/cs_test_order123',
      metadata: { user_id: USER_ID, order_id: ORDER_ID, checkout_session_id: CHECKOUT_ID },
    });

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { canResume: false } });
  });

  it('closes an old open Stripe session before allowing a replacement checkout', async () => {
    checkoutStatus = 'expired';
    checkoutExpiresAt = new Date(Date.now() - 60_000).toISOString();

    const response = await request('POST');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { canReviewCart: true }, error: null });
    expect(mocks.expireStripeSession).toHaveBeenCalledWith(STRIPE_SESSION_ID);
    expect(mocks.finalizeCheckout).toHaveBeenCalledWith('finalize_checkout', {
      p_checkout_session_id: CHECKOUT_ID,
      p_outcome: 'expired',
      p_provider_payment_id: null,
      p_provider_event_id: null,
    });
  });

  it('finalizes an internally active checkout when Stripe has already expired it', async () => {
    mocks.retrieveStripeSession.mockResolvedValueOnce({
      id: STRIPE_SESSION_ID,
      mode: 'payment',
      status: 'expired',
      payment_status: 'unpaid',
      amount_total: 960,
      currency: 'myr',
      url: null,
      metadata: { user_id: USER_ID, order_id: ORDER_ID, checkout_session_id: CHECKOUT_ID },
    });

    const response = await request('POST');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { canReviewCart: true }, error: null });
    expect(mocks.expireStripeSession).not.toHaveBeenCalled();
    expect(mocks.finalizeCheckout).toHaveBeenCalledWith('finalize_checkout', expect.objectContaining({
      p_checkout_session_id: CHECKOUT_ID,
      p_outcome: 'expired',
    }));
  });

  it('does not allow a new cart checkout if releasing the expired reservation fails', async () => {
    mocks.retrieveStripeSession.mockResolvedValueOnce({
      id: STRIPE_SESSION_ID,
      mode: 'payment',
      status: 'expired',
      payment_status: 'unpaid',
      amount_total: 960,
      currency: 'myr',
      url: null,
      metadata: { user_id: USER_ID, order_id: ORDER_ID, checkout_session_id: CHECKOUT_ID },
    });
    mocks.finalizeCheckout.mockResolvedValueOnce({ data: null, error: new Error('reservation_release_failed') });

    const response = await request('POST');

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'The expired checkout could not be finalized safely' });
  });

  it('does not allow a replacement checkout when Stripe already reports payment complete', async () => {
    checkoutStatus = 'expired';
    checkoutExpiresAt = new Date(Date.now() - 60_000).toISOString();
    mocks.retrieveStripeSession.mockResolvedValueOnce({
      id: STRIPE_SESSION_ID,
      mode: 'payment',
      status: 'complete',
      payment_status: 'paid',
      amount_total: 960,
      currency: 'myr',
      url: null,
      metadata: { user_id: USER_ID, order_id: ORDER_ID, checkout_session_id: CHECKOUT_ID },
    });

    const response = await request('POST');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { canResume: false, reason: 'processing' }, error: null });
    expect(mocks.expireStripeSession).not.toHaveBeenCalled();
  });

  it('does not expire an active internal checkout session', async () => {
    mocks.retrieveStripeSession.mockResolvedValueOnce({
      id: STRIPE_SESSION_ID,
      mode: 'payment',
      status: 'open',
      payment_status: 'unpaid',
      amount_total: 960,
      currency: 'myr',
      url: 'https://checkout.stripe.com/c/pay/cs_test_order123',
      metadata: { user_id: USER_ID, order_id: ORDER_ID, checkout_session_id: CHECKOUT_ID },
    });

    const response = await request('POST');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { canReviewCart: false, reason: 'active' }, error: null });
    expect(mocks.retrieveStripeSession).toHaveBeenCalledWith(STRIPE_SESSION_ID);
    expect(mocks.expireStripeSession).not.toHaveBeenCalled();
    expect(mocks.finalizeCheckout).not.toHaveBeenCalled();
  });
});
