import { describe, expect, it } from 'vitest';
import { buildProductContextSnapshot, buildOrderContextSnapshot } from '@/lib/chat/context';

function productService(opts: { product?: Record<string, unknown> | null; offer?: { price: number } | null } = {}) {
  return {
    from(table: string) {
      if (table === 'products') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.product ?? null }) }) }) }) };
      }
      if (table === 'outlet_offers') {
        return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.offer ?? null }) }) }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

function orderService(opts: { order?: Record<string, unknown> | null; items?: Array<Record<string, unknown>> } = {}) {
  return {
    from(table: string) {
      if (table === 'orders') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.order ?? null }) }) }) }) };
      }
      if (table === 'order_items') {
        return { select: () => ({ eq: async () => ({ data: opts.items ?? [] }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never;
}

describe('buildProductContextSnapshot', () => {
  it('builds a product card from the product row when the product is native to the outlet', async () => {
    const snap = await buildProductContextSnapshot(
      productService({ product: { id: 'p1', name: 'Sunset Cruise', base_price: 120, cover_url: null, outlet_id: 'o1' } }),
      'p1',
      'o1',
    );
    expect(snap).toMatchObject({ type: 'product', id: 'p1', title: 'Sunset Cruise', href: '/customer/activity/p1' });
    expect(snap?.subtitle).toContain('120');
  });

  it('uses the outlet-offer price when the product is sold at a different outlet', async () => {
    const snap = await buildProductContextSnapshot(
      productService({ product: { id: 'p1', name: 'Cruise', base_price: 120, cover_url: null, outlet_id: 'other' }, offer: { price: 95 } }),
      'p1',
      'o1',
    );
    expect(snap?.subtitle).toContain('95');
  });

  it('returns null for a product not sold at this outlet', async () => {
    const snap = await buildProductContextSnapshot(
      productService({ product: { id: 'p1', name: 'Cruise', base_price: 120, cover_url: null, outlet_id: 'other' }, offer: null }),
      'p1',
      'o1',
    );
    expect(snap).toBeNull();
  });

  it('returns null when the product does not exist', async () => {
    expect(await buildProductContextSnapshot(productService({ product: null }), 'p1', 'o1')).toBeNull();
  });
});

describe('buildOrderContextSnapshot', () => {
  it('builds an order card scoped to the customer and vendor outlets', async () => {
    const snap = await buildOrderContextSnapshot(
      orderService({
        order: { id: 'ord1', display_id: 'ORD-9', status: 'paid', total_amount: 250, user_id: 'cust1' },
        items: [{ product_name: 'A', quantity: 1, outlet_id: 'o1' }, { product_name: 'B', quantity: 2, outlet_id: 'o1' }],
      }),
      'ord1',
      'cust1',
      ['o1', 'o2'],
    );
    expect(snap).toMatchObject({ type: 'order', id: 'ord1', title: 'ORD-9', href: '/vendor/orders?order=ord1' });
    expect(snap?.subtitle).toContain('3 items');
    expect(snap?.subtitle).toContain('250');
    expect(snap?.subtitle).toContain('paid');
  });

  it('returns null when the order is not the thread customer\'s', async () => {
    expect(await buildOrderContextSnapshot(orderService({ order: null }), 'ord1', 'cust1', ['o1'])).toBeNull();
  });

  it("returns null when no order item belongs to a vendor outlet", async () => {
    const snap = await buildOrderContextSnapshot(
      orderService({
        order: { id: 'ord1', display_id: 'ORD-9', status: 'paid', total_amount: 250, user_id: 'cust1' },
        items: [{ product_name: 'A', quantity: 1, outlet_id: 'someone-else' }],
      }),
      'ord1',
      'cust1',
      ['o1'],
    );
    expect(snap).toBeNull();
  });
});
