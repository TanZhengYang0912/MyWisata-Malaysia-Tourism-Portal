import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const OUTLET_ID = '33333333-3333-4333-8333-333333333333';
const VENDOR_ID = '44444444-4444-4444-8444-444444444444';
const CART_ID = '55555555-5555-4555-8555-555555555555';
const CART_ITEM_ID = '66666666-6666-4666-8666-666666666666';
const CHECKOUT_ID = '77777777-7777-4777-8777-777777777777';
const ORDER_ID = '88888888-8888-4888-8888-888888888888';
const USER_ID = '99999999-9999-4999-8999-999999999999';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  serviceRpc: vi.fn(),
  serviceFrom: vi.fn(),
  getActivities: vi.fn(),
  cartTotals: vi.fn(),
  unitPrice: vi.fn(),
  stripeCreate: vi.fn(),
  resolveEffectiveCapability: vi.fn(),
  providerConfigured: vi.fn(),
  createPayment: vi.fn(),
  calls: [] as string[],
}));

function queryResult(data: unknown, error: unknown = null) {
  const terminal = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'ilike', 'order', 'update']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => terminal);
  builder.single = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal);
  return builder;
}

vi.mock('@/lib/entitlements/server', () => ({ resolveEffectiveCapability: mocks.resolveEffectiveCapability }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom, rpc: mocks.serviceRpc })),
}));
vi.mock('@/lib/cache/catalogue-cache', () => ({ getCachedActivities: mocks.getActivities }));
vi.mock('@/backend/domains/catalogue', () => ({ getActivities: mocks.getActivities }));
vi.mock('@/backend/core/helpers', () => ({ cartTotals: mocks.cartTotals, unitPrice: mocks.unitPrice }));
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: mocks.stripeCreate } } } }));
vi.mock('@/lib/payments/toyyibpay', () => ({
  ToyyibPayProvider: class {
    isConfigured() { return mocks.providerConfigured(); }
    createPayment(input: unknown) { return mocks.createPayment(input); }
  },
}));

import { POST } from '../prepare/route';

function request(provider = 'toyyibpay') {
  return new Request('https://api.mywisata.example/api/checkout/prepare', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://attacker.example',
    },
    body: JSON.stringify({
      paymentMethod: 'bank_transfer',
      paymentProvider: provider,
      idempotencyKey: 'checkout-toyyibpay-key-123456',
    }),
  });
}

describe('POST /api/checkout/prepare with ToyyibPay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_URL', 'https://mywisata.example');
    vi.stubEnv('TOYYIBPAY_ENV', 'sandbox');
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email: 'aisyah@example.com',
          phone: '+60123456789',
          user_metadata: { full_name: 'Nur Aisyah' },
        },
      },
      error: null,
    });
    mocks.resolveEffectiveCapability.mockResolvedValue({
      capability: 'commerce.checkout', allowed: true, blockerCode: null,
      qualificationPaths: [], entitlementGeneration: 7, source: 'policy',
    });
    mocks.getActivities.mockResolvedValue([{ id: PRODUCT_ID }]);
    mocks.cartTotals.mockReturnValue({ subtotal: 50, discount: 0, total: 50 });
    mocks.unitPrice.mockReturnValue(50);
    mocks.providerConfigured.mockReturnValue(true);
    mocks.createPayment.mockImplementation(async () => {
      mocks.calls.push('provider.createPayment');
      return {
        provider: 'toyyibpay',
        providerPaymentId: 'A1b2C3d4',
        actionUrl: 'https://dev.toyyibpay.com/A1b2C3d4',
      };
    });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'prepare_checkout') {
        mocks.calls.push('prepare_checkout');
        return {
          data: {
            checkout_session_id: CHECKOUT_ID,
            order_id: ORDER_ID,
            status: 'pending_payment',
          },
          error: null,
        };
      }
      throw new Error(`unexpected authenticated rpc ${name}`);
    });
    mocks.serviceRpc.mockImplementation(async (name: string) => {
      mocks.calls.push(name);
      if (name === 'begin_toyyibpay_checkout') {
        return {
          data: {
            state: 'ready', checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID,
            user_id: USER_ID, amount_sen: 5000, currency: 'MYR', provider_payment_id: null,
          },
          error: null,
        };
      }
      if (name === 'complete_toyyibpay_checkout') {
        return { data: { state: 'created', provider_payment_id: 'A1b2C3d4' }, error: null };
      }
      throw new Error(`unexpected service rpc ${name}`);
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'carts') return queryResult({ id: CART_ID });
      if (table === 'cart_items') return queryResult([{
        id: CART_ITEM_ID,
        variant_id: VARIANT_ID,
        slot_id: null,
        outlet_id: OUTLET_ID,
        quantity: 1,
        product_variants: { id: VARIANT_ID, product_id: PRODUCT_ID, name: 'Standard' },
        booking_slots: null,
      }]);
      if (table === 'products') return queryResult([{
        id: PRODUCT_ID, outlet_id: OUTLET_ID, vendor_id: VENDOR_ID,
        name: 'Test activity', cover_url: null, base_price: 50, requires_booking: false,
      }]);
      throw new Error(`unexpected table ${table}`);
    });
    mocks.serviceFrom.mockImplementation(() => queryResult(null));
  });

  afterEach(() => vi.unstubAllEnvs());

  it('creates the database checkout before one fixed-amount bill and persists its BillCode', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      checkout_session_id: CHECKOUT_ID,
      order_id: ORDER_ID,
      toyyibpayUrl: 'https://dev.toyyibpay.com/A1b2C3d4',
    });
    expect(mocks.calls).toEqual([
      'prepare_checkout',
      'begin_toyyibpay_checkout',
      'provider.createPayment',
      'complete_toyyibpay_checkout',
    ]);
    expect(mocks.createPayment).toHaveBeenCalledWith({
      checkoutSessionId: CHECKOUT_ID,
      orderId: ORDER_ID,
      amountSen: 5000,
      currency: 'MYR',
      customer: {
        name: 'Nur Aisyah', email: 'aisyah@example.com', phone: '+60123456789',
      },
      returnUrl: 'https://mywisata.example/customer/checkout?toyyibpay_return=1',
      callbackUrl: 'https://mywisata.example/api/payments/toyyibpay/callback',
    });
    expect(JSON.stringify(body)).not.toContain('attacker.example');
    expect(mocks.serviceRpc).toHaveBeenCalledWith('complete_toyyibpay_checkout', {
      p_checkout_session_id: CHECKOUT_ID,
      p_provider_payment_id: 'A1b2C3d4',
    });
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it('reuses a completed database attempt without creating another provider bill', async () => {
    mocks.serviceRpc.mockResolvedValueOnce({
      data: {
        state: 'created', checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID,
        user_id: USER_ID, amount_sen: 5000, currency: 'MYR', provider_payment_id: 'A1b2C3d4',
      },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { toyyibpayUrl: 'https://dev.toyyibpay.com/A1b2C3d4' },
    });
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('fails closed for an indeterminate prior provider attempt', async () => {
    mocks.serviceRpc.mockResolvedValueOnce({ data: { state: 'indeterminate' }, error: null });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TOYYIBPAY_CREATE_INDETERMINATE' },
    });
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('returns a stable unavailable error when configuration or provider creation fails', async () => {
    mocks.providerConfigured.mockReturnValueOnce(false);
    const missing = await POST(request());
    expect(missing.status).toBe(503);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: 'TOYYIBPAY_UNAVAILABLE' } });

    mocks.providerConfigured.mockReturnValue(true);
    mocks.createPayment.mockRejectedValueOnce(new Error('secret provider response'));
    const failed = await POST(request());
    expect(failed.status).toBe(503);
    const failedBody = await failed.json();
    expect(failedBody).toMatchObject({ error: { code: 'TOYYIBPAY_PREPARE_FAILED' } });
    expect(JSON.stringify(failedBody)).not.toContain('secret provider response');
    expect(mocks.serviceRpc).not.toHaveBeenCalledWith('complete_toyyibpay_checkout', expect.anything());
  });

  it.each([
    [{ email: undefined, phone: '+60123456789' }, 'TOYYIBPAY_EMAIL_REQUIRED'],
    [{ email: 'aisyah@example.com', phone: undefined }, 'TOYYIBPAY_PHONE_REQUIRED'],
  ])('requires provider customer contact details without preparing checkout', async (contact, code) => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, ...contact, user_metadata: { full_name: 'Nur Aisyah' } } },
      error: null,
    });

    const response = await POST(request());

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
    expect(mocks.rpc).not.toHaveBeenCalledWith('prepare_checkout', expect.anything());
  });

  it('rejects mismatched methods through the existing provider boundary', async () => {
    const response = await POST(request('grabpay_simulator'));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'PAYMENT_PROVIDER_MISMATCH' } });
    expect(mocks.rpc).not.toHaveBeenCalledWith('prepare_checkout', expect.anything());
  });
});
