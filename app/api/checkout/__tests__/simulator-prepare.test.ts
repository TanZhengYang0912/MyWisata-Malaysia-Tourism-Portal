import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const OUTLET_ID = '33333333-3333-4333-8333-333333333333';
const VENDOR_ID = '44444444-4444-4444-8444-444444444444';
const CART_ID = '55555555-5555-4555-8555-555555555555';
const CART_ITEM_ID = '66666666-6666-4666-8666-666666666666';
const CHECKOUT_ID = '77777777-7777-4777-8777-777777777777';
const ORDER_ID = '88888888-8888-4888-8888-888888888888';
let productOutletId: string | null = OUTLET_ID;
let productRequiresBooking = false;
let cartItemRow: Record<string, unknown>;
let productLookupError: unknown = null;

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  serviceFrom: vi.fn(),
  getActivities: vi.fn(),
  cartTotals: vi.fn(),
  unitPrice: vi.fn(),
  stripeCreate: vi.fn(),
  resolveEffectiveCapability: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({ resolveEffectiveCapability: mocks.resolveEffectiveCapability }));

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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom, rpc: mocks.rpc })),
}));

vi.mock('@/lib/cache/catalogue-cache', () => ({ getCachedActivities: mocks.getActivities }));
vi.mock('@/backend/domains/catalogue', () => ({ getActivities: mocks.getActivities }));
vi.mock('@/backend/core/helpers', () => ({ cartTotals: mocks.cartTotals, unitPrice: mocks.unitPrice }));
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: mocks.stripeCreate } } } }));

import { POST } from '../prepare/route';

function request(provider = 'tng_ewallet_simulator') {
  return new Request('http://localhost/api/checkout/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({
      paymentMethod: 'ewallet',
      paymentProvider: provider,
      idempotencyKey: 'checkout-simulator-key-123456',
    }),
  });
}

describe('POST /api/checkout/prepare simulator provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productOutletId = OUTLET_ID;
    productRequiresBooking = false;
    productLookupError = null;
    cartItemRow = {
      id: CART_ITEM_ID,
      variant_id: VARIANT_ID,
      slot_id: null,
      outlet_id: OUTLET_ID,
      quantity: 1,
      product_variants: { id: VARIANT_ID, product_id: PRODUCT_ID, name: 'Standard' },
      booking_slots: null,
    };
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENT_SIMULATOR_MODE', 'enabled');
    vi.stubEnv('PAYMENT_SIMULATOR_WEBHOOK_SECRET', 'local-simulator-secret');

    mocks.getUser.mockResolvedValue({ data: { user: { id: '99999999-9999-4999-8999-999999999999' } }, error: null });
    mocks.getActivities.mockResolvedValue([{ id: PRODUCT_ID }]);
    mocks.cartTotals.mockReturnValue({ subtotal: 50, discount: 0, total: 50 });
    mocks.unitPrice.mockReturnValue(50);
    mocks.resolveEffectiveCapability.mockImplementation(async (_userId: string, capability: string) => ({
      capability, allowed: true, blockerCode: null, qualificationPaths: [],
      entitlementGeneration: 7, source: 'policy',
    }));
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'prepare_checkout') {
        return { data: { checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, status: 'pending_payment' }, error: null };
      }
      return { data: null, error: null };
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'users') return queryResult({
        tier: 'phone_verified',
        kyc_status: 'not_started',
        phone_verified_at: '2026-08-17T01:00:00.000Z',
      });
      if (table === 'carts') return queryResult({ id: CART_ID });
      if (table === 'cart_items') return queryResult([cartItemRow]);
      if (table === 'products') return queryResult([{
        id: PRODUCT_ID,
        outlet_id: productOutletId,
        vendor_id: VENDOR_ID,
        name: 'Test activity',
        cover_url: null,
        requires_booking: productRequiresBooking,
      }], productLookupError);
      throw new Error(`unexpected table ${table}`);
    });
    mocks.serviceFrom.mockImplementation(() => queryResult(null));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates an opaque requires-action simulator session without exposing its secret', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      checkout_session_id: CHECKOUT_ID,
      order_id: ORDER_ID,
      simulatorUrl: `/customer/checkout/simulator/${CHECKOUT_ID}`,
    });
    expect(JSON.stringify(body)).not.toContain('local-simulator-secret');
    expect(mocks.serviceFrom).toHaveBeenCalledWith('payments');
    expect(mocks.serviceFrom).toHaveBeenCalledWith('checkout_sessions');
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
  });

  it('prepares a multi-outlet product with the outlet selected on the cart row', async () => {
    productOutletId = null;

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('prepare_checkout', expect.objectContaining({
      p_lines: [expect.objectContaining({ outlet_id: OUTLET_ID })],
    }));
  });

  it('prepares a booking with a slot when the bookable product has no variant', async () => {
    productRequiresBooking = true;
    cartItemRow = {
      id: CART_ITEM_ID,
      variant_id: null,
      slot_id: '99999999-9999-4999-8999-999999999999',
      outlet_id: OUTLET_ID,
      quantity: 1,
      product_variants: null,
      booking_slots: {
        id: '99999999-9999-4999-8999-999999999999',
        product_id: PRODUCT_ID,
        outlet_id: OUTLET_ID,
        starts_at: '2026-09-21T01:00:00.000Z',
        price_override: null,
      },
    };
    mocks.cartTotals.mockReturnValue({ subtotal: 30, discount: 0, total: 30 });
    mocks.unitPrice.mockReturnValue(30);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.simulatorUrl).toBe(`/customer/checkout/simulator/${CHECKOUT_ID}`);
    expect(mocks.rpc).toHaveBeenCalledWith('prepare_checkout', expect.objectContaining({
      p_lines: [expect.objectContaining({
        product_id: PRODUCT_ID,
        variant_id: null,
        variant_name: null,
        slot_id: '99999999-9999-4999-8999-999999999999',
        unit_price: 30,
      })],
    }));
  });

  it('returns a JSON conflict when a booking cart line no longer has an available slot', async () => {
    productRequiresBooking = true;

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: {
        code: 'CART_ITEM_UNAVAILABLE',
        message: 'One or more cart items are no longer available. Refresh your cart and try again.',
      },
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('prepare_checkout', expect.anything());
  });

  it('returns a service error when product availability cannot be checked', async () => {
    productLookupError = { message: 'database unavailable' };

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('PRODUCT_LOOKUP_FAILED');
    expect(mocks.rpc).not.toHaveBeenCalledWith('prepare_checkout', expect.anything());
  });

  it('fails closed when simulator configuration is unavailable', async () => {
    vi.stubEnv('PAYMENT_SIMULATOR_MODE', 'disabled');

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PAYMENT_SIMULATOR_UNAVAILABLE' },
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('prepare_checkout', expect.anything());
  });

  it('rejects a provider that does not belong to the selected method', async () => {
    const response = await POST(request('bank_transfer_simulator'));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'PAYMENT_PROVIDER_MISMATCH' },
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('prepare_checkout', expect.anything());
  });
});
