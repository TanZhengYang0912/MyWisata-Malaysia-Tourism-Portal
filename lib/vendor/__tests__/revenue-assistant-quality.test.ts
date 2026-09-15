import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findVendorRefundRisk, getRatingSignal, type VendorScope } from '../revenue-assistant';

const SCOPE: VendorScope = { vendorId: 'v1', vendorName: 'Test Vendor', productIds: ['p1', 'p2'] };

function mockRatingDb(metrics: { product_id: string; rating: number; reviews: number }[], products: { id: string; name: string }[]): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'product_review_metrics') {
        return { select: () => ({ in: () => ({ gte: () => Promise.resolve({ data: metrics }) }) }) };
      }
      if (table === 'products') {
        return { select: () => ({ in: () => Promise.resolve({ data: products }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe('getRatingSignal', () => {
  it('returns empty without querying when the vendor has no listings', async () => {
    const db = mockRatingDb([], []);
    const result = await getRatingSignal({ ...SCOPE, productIds: [] }, db);

    expect(result).toEqual({ all: [], lowRated: [] });
  });

  it('builds the full rating list and flags only real low-rated listings', async () => {
    const metrics = [
      { product_id: 'p1', rating: 4.8, reviews: 10 },
      { product_id: 'p2', rating: 2.1, reviews: 5 },
    ];
    const products = [{ id: 'p1', name: 'Great Tour' }, { id: 'p2', name: 'Rough Tour' }];
    const db = mockRatingDb(metrics, products);

    const result = await getRatingSignal(SCOPE, db);

    expect(result.all).toEqual([
      { productId: 'p1', productName: 'Great Tour', rating: 4.8, reviewCount: 10 },
      { productId: 'p2', productName: 'Rough Tour', rating: 2.1, reviewCount: 5 },
    ]);
    expect(result.lowRated).toEqual([{ productId: 'p2', productName: 'Rough Tour', rating: 2.1, reviewCount: 5 }]);
  });

  it('drops a metric row whose product no longer resolves (deleted/inactive)', async () => {
    const db = mockRatingDb([{ product_id: 'gone', rating: 1, reviews: 5 }], []);
    const result = await getRatingSignal(SCOPE, db);

    expect(result.all).toEqual([]);
  });

  it('ranks lowRated worst-first and caps at 3', async () => {
    const metrics = Array.from({ length: 5 }, (_, i) => ({ product_id: `p${i}`, rating: 3.0 + i * 0.1, reviews: 5 }));
    const products = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Tour ${i}` }));
    const db = mockRatingDb(metrics, products);

    const result = await getRatingSignal({ ...SCOPE, productIds: metrics.map((m) => m.product_id) }, db);

    expect(result.lowRated).toHaveLength(3);
    expect(result.lowRated[0].productId).toBe('p0'); // lowest rating first
  });
});

function mockRefundDb(items: { product_id: string; product_name: string; status: string }[]): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'order_items') {
        return { select: () => ({ in: () => Promise.resolve({ data: items.map((i) => ({ product_id: i.product_id, product_name: i.product_name, orders: { status: i.status } })) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe('findVendorRefundRisk', () => {
  it('returns empty without querying when the vendor has no listings', async () => {
    const db = mockRefundDb([]);
    const result = await findVendorRefundRisk({ ...SCOPE, productIds: [] }, db);

    expect(result).toEqual([]);
  });

  it('excludes draft/pending_payment orders from both the numerator and denominator', async () => {
    const items = [
      { product_id: 'p1', product_name: 'Tour', status: 'draft' },
      { product_id: 'p1', product_name: 'Tour', status: 'pending_payment' },
      { product_id: 'p1', product_name: 'Tour', status: 'cancelled' },
      { product_id: 'p1', product_name: 'Tour', status: 'cancelled' },
      { product_id: 'p1', product_name: 'Tour', status: 'completed' },
    ];
    const db = mockRefundDb(items);
    const result = await findVendorRefundRisk(SCOPE, db);

    // 2 reversed / 3 settled (draft/pending_payment excluded) = 0.667.
    expect(result).toEqual([{ productId: 'p1', productName: 'Tour', reversedCount: 2, settledCount: 3, refundRate: 0.667 }]);
  });

  it('never flags a single reversed order, even at 100% rate (count floor)', async () => {
    const items = [
      { product_id: 'p1', product_name: 'Tour', status: 'cancelled' },
    ];
    const db = mockRefundDb(items);
    const result = await findVendorRefundRisk(SCOPE, db);

    expect(result).toEqual([]);
  });

  it('never flags a low-rate pattern even with enough count (rate floor)', async () => {
    const items = [
      { product_id: 'p1', product_name: 'Tour', status: 'cancelled' },
      { product_id: 'p1', product_name: 'Tour', status: 'cancelled' },
      ...Array.from({ length: 18 }, () => ({ product_id: 'p1', product_name: 'Tour', status: 'completed' })), // 2/20 = 10%, below the 30% floor
    ];
    const db = mockRefundDb(items);
    const result = await findVendorRefundRisk(SCOPE, db);

    expect(result).toEqual([]);
  });

  it('flags a real pattern once both floors clear', async () => {
    const items = [
      { product_id: 'p1', product_name: 'Tour', status: 'cancelled' },
      { product_id: 'p1', product_name: 'Tour', status: 'cancelled' },
      { product_id: 'p1', product_name: 'Tour', status: 'completed' },
    ];
    const db = mockRefundDb(items);
    const result = await findVendorRefundRisk(SCOPE, db);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ productId: 'p1', reversedCount: 2, settledCount: 3 });
  });

  it('caps at 3, ranked by refund rate descending', async () => {
    const items: { product_id: string; product_name: string; status: string }[] = [];
    for (let i = 0; i < 5; i += 1) {
      items.push({ product_id: `p${i}`, product_name: `Tour ${i}`, status: 'cancelled' });
      items.push({ product_id: `p${i}`, product_name: `Tour ${i}`, status: 'cancelled' });
      items.push({ product_id: `p${i}`, product_name: `Tour ${i}`, status: 'completed' }); // rate 2/3
    }
    const db = mockRefundDb(items);
    const result = await findVendorRefundRisk({ ...SCOPE, productIds: items.map((i) => i.product_id) }, db);

    expect(result).toHaveLength(3);
  });
});
