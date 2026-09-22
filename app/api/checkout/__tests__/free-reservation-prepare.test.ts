import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const OUTLET_ID = '33333333-3333-4333-8333-333333333333';
const VENDOR_ID = '44444444-4444-4444-8444-444444444444';
const CART_ID = '55555555-5555-4555-8555-555555555555';
const CART_ITEM_ID = '66666666-6666-4666-8666-666666666666';
const SLOT_ID = '99999999-9999-4999-8999-999999999999';
const CHECKOUT_ID = '77777777-7777-4777-8777-777777777777';
const ORDER_ID = '88888888-8888-4888-8888-888888888888';

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

function request(foodServiceModes?: { outletId: string; mode: "dine_in" | "takeaway" }[]) {
  return new Request('http://localhost/api/checkout/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({
      paymentMethod: 'free_reservation',
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      selectedKeys: [`${PRODUCT_ID}|${VARIANT_ID}|${SLOT_ID}|${OUTLET_ID}`],
      foodServiceModes,
    }),
  });
}

describe('POST /api/checkout/prepare with free_reservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'usr-customer-1' } }, error: null });
    mocks.resolveEffectiveCapability.mockResolvedValue({
      state: 'granted',
      reasonCode: 'ok',
      evaluatedAt: new Date().toISOString(),
      metadata: {},
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'carts') return queryResult({ id: CART_ID });
      if (table === 'cart_items') {
        return queryResult([
          {
            id: CART_ITEM_ID,
            variant_id: VARIANT_ID,
            slot_id: SLOT_ID,
            outlet_id: OUTLET_ID,
            quantity: 2,
            product_variants: { id: VARIANT_ID, product_id: PRODUCT_ID, name: 'Standard' },
            booking_slots: { id: SLOT_ID, product_id: PRODUCT_ID, outlet_id: OUTLET_ID, starts_at: '2026-09-15T09:00:00Z', price_override: 0 },
          },
        ]);
      }
      if (table === 'products') {
        return queryResult([
          {
            id: PRODUCT_ID,
            outlet_id: OUTLET_ID,
            vendor_id: VENDOR_ID,
            name: 'Merdeka Square Free Heritage Tour',
            cover_url: null,
            requires_booking: true,
          },
        ]);
      }
      return queryResult(null);
    });
    mocks.getActivities.mockResolvedValue([
      {
        id: PRODUCT_ID,
        name: 'Merdeka Square Free Heritage Tour',
        variants: [{ id: VARIANT_ID, label: 'Standard', price: 0 }],
      },
    ]);
    mocks.unitPrice.mockReturnValue(0);
    mocks.cartTotals.mockReturnValue({ subtotal: 0, discount: 0, total: 0 });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'prepare_checkout') {
        return Promise.resolve({
          data: {
            checkout_session_id: CHECKOUT_ID,
            order_id: ORDER_ID,
            status: 'paid',
            expires_at: '2026-09-15T10:00:00Z',
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    delete process.env.PAYMENT_SIMULATOR_ENABLED;
  });

  it('bypasses external payment providers and prepares free order atomically', async () => {
    const res = await POST(request());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.order_id).toBe(ORDER_ID);
    expect(body.data.status).toBe('paid');
    expect(mocks.stripeCreate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      'prepare_checkout',
      expect.objectContaining({
        p_payment_method: 'free_reservation',
        p_subtotal: 0,
        p_discount: 0,
        p_total: 0,
      }),
    );
  });

  it("persists an explicitly selected food mode through the transactional checkout wrapper", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "carts") return queryResult({ id: CART_ID });
      if (table === "cart_items") return queryResult([{
        id: CART_ITEM_ID,
        variant_id: VARIANT_ID,
        slot_id: SLOT_ID,
        outlet_id: OUTLET_ID,
        quantity: 2,
        product_variants: { id: VARIANT_ID, product_id: PRODUCT_ID, name: "Standard" },
        booking_slots: { id: SLOT_ID, product_id: PRODUCT_ID, outlet_id: OUTLET_ID, starts_at: "2026-09-15T09:00:00Z", price_override: 0 },
      }]);
      if (table === "products") return queryResult([{
        id: PRODUCT_ID,
        outlet_id: OUTLET_ID,
        vendor_id: VENDOR_ID,
        name: "Food tour",
        cover_url: null,
        requires_booking: true,
        categories: { slug: "food" },
      }]);
      if (table === "outlets") return queryResult([{ id: OUTLET_ID, food_service_modes: ["takeaway"] }]);
      return queryResult(null);
    });
    mocks.getActivities.mockResolvedValue([{
      id: PRODUCT_ID,
      name: "Food tour",
      categorySlug: "food",
      variants: [{ id: VARIANT_ID, label: "Standard", price: 0 }],
    }]);
    mocks.rpc.mockResolvedValue({
      data: { checkout_session_id: CHECKOUT_ID, order_id: ORDER_ID, status: "paid" },
      error: null,
    });

    const res = await POST(request([{ outletId: OUTLET_ID, mode: "takeaway" }]));
    expect(res.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_checkout_with_food_service_modes", expect.objectContaining({
      p_claim_id: null,
      p_food_service_modes: [{ outlet_id: OUTLET_ID, mode: "takeaway" }],
    }));
  });

  it("rejects a food mode that the selected outlet does not support", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "carts") return queryResult({ id: CART_ID });
      if (table === "cart_items") return queryResult([{
        id: CART_ITEM_ID,
        variant_id: VARIANT_ID,
        slot_id: SLOT_ID,
        outlet_id: OUTLET_ID,
        quantity: 2,
        product_variants: { id: VARIANT_ID, product_id: PRODUCT_ID, name: "Standard" },
        booking_slots: { id: SLOT_ID, product_id: PRODUCT_ID, outlet_id: OUTLET_ID, starts_at: "2026-09-15T09:00:00Z", price_override: 0 },
      }]);
      if (table === "products") return queryResult([{
        id: PRODUCT_ID,
        outlet_id: OUTLET_ID,
        vendor_id: VENDOR_ID,
        name: "Food tour",
        cover_url: null,
        requires_booking: true,
        categories: { slug: "food" },
      }]);
      if (table === "outlets") return queryResult([{ id: OUTLET_ID, food_service_modes: ["takeaway"] }]);
      return queryResult(null);
    });
    mocks.getActivities.mockResolvedValue([{
      id: PRODUCT_ID,
      name: "Food tour",
      categorySlug: "food",
      variants: [{ id: VARIANT_ID, label: "Standard", price: 0 }],
    }]);

    const res = await POST(request([{ outletId: OUTLET_ID, mode: "dine_in" }]));
    expect(res.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
