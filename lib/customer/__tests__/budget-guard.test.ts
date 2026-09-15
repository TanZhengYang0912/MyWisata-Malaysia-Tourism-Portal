import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ComputedActivity } from '@/backend/core/types';

const mocks = vi.hoisted(() => ({ getComputedActivity: vi.fn(), searchActivities: vi.fn() }));
vi.mock('@/backend/domains/catalogue', () => ({
  getComputedActivity: mocks.getComputedActivity,
  searchActivities: mocks.searchActivities,
}));

const { resolveBudgetItems, evaluateBudget } = await import('../budget-guard');

function activity(overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id: 'p1',
    outletId: 'o1',
    name: 'Penang Hill Funicular',
    category: 'Nature',
    categorySlug: 'activity',
    description: '',
    image: null,
    price: 30,
    rating: 4.6,
    reviews: 120,
    duration: '2h',
    requiresBooking: true,
    variants: [],
    isHiddenGem: false,
    outlet: { id: 'o1', vendorId: 'v1', name: 'Penang Hill', category: 'activity', state: 'Penang', city: 'George Town', address: '', lat: 5.4141, lng: 100.3288 } as ComputedActivity['outlet'],
    ...overrides,
  } as ComputedActivity;
}

/** Mocks products.product_type lookups — the finer real signal fetchProductTypes() reads directly. */
function mockDb(productTypeById: Record<string, string> = {}): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'products') {
        return {
          select: () => ({
            in: (_column: string, ids: string[]) => Promise.resolve({
              data: ids.map((id) => ({ id, product_type: productTypeById[id] ?? 'activity' })),
              error: null,
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe('resolveBudgetItems', () => {
  it('resolves real product data for each line, including the real product_type, never trusting a caller-supplied price', async () => {
    mocks.getComputedActivity.mockResolvedValue(activity());

    const items = await resolveBudgetItems([{ productId: 'p1', qty: 2 }], mockDb({ p1: 'experience' }));

    expect(items).toEqual([{
      productId: 'p1', name: 'Penang Hill Funicular', price: 30, qty: 2, category: 'Nature', categorySlug: 'activity', state: 'Penang', productType: 'experience',
    }]);
  });

  it('drops a line whose product is gone or inactive rather than guessing at it', async () => {
    mocks.getComputedActivity.mockResolvedValue(null);

    const items = await resolveBudgetItems([{ productId: 'gone', qty: 1 }], mockDb());

    expect(items).toEqual([]);
  });
});

describe('evaluateBudget', () => {
  it('reports not-over-budget and never queries for alternatives when the total is within budget', async () => {
    const items = [
      { productId: 'p1', name: 'A', price: 30, qty: 2, category: 'Nature', categorySlug: 'activity', state: 'Penang', productType: 'experience' },
      { productId: 'p2', name: 'B', price: 10, qty: 1, category: 'Food', categorySlug: 'food', state: 'Penang', productType: 'food' },
    ];

    const result = await evaluateBudget(items, 100, mockDb());

    expect(result).toEqual({ totalRM: 70, budgetRM: 100, isOverBudget: false, overBudgetByRM: 0, overBudgetItems: [] });
    expect(mocks.searchActivities).not.toHaveBeenCalled();
  });

  it('when over budget, ranks the priciest line items and finds real, cheaper same-category, same-product_type alternatives', async () => {
    const items = [
      { productId: 'p1', name: 'Expensive Stay', price: 500, qty: 1, category: 'Accommodation', categorySlug: 'accommodation', state: 'Penang', productType: 'accommodation' },
      { productId: 'p2', name: 'Cheap Snack', price: 5, qty: 1, category: 'Food', categorySlug: 'food', state: 'Penang', productType: 'food' },
    ];
    mocks.searchActivities.mockResolvedValue([
      activity({ id: 'alt1', name: 'Cheaper Stay', price: 300, rating: 4.5, reviews: 50, categorySlug: 'accommodation' }),
      activity({ id: 'alt2', name: 'Even Cheaper Stay', price: 200, rating: 4.2, reviews: 20, categorySlug: 'accommodation' }),
    ]);
    const db = mockDb({ alt1: 'accommodation', alt2: 'accommodation' });

    const result = await evaluateBudget(items, 100, db);

    expect(result.totalRM).toBe(505);
    expect(result.isOverBudget).toBe(true);
    expect(result.overBudgetByRM).toBe(405);
    expect(result.overBudgetItems).toHaveLength(2);
    // Ranked priciest-first.
    expect(result.overBudgetItems[0].productId).toBe('p1');
    expect(mocks.searchActivities).toHaveBeenCalledWith(
      { state: 'Penang', categorySlug: 'accommodation', priceMax: 500, sort: 'rating_desc' },
      db,
    );
    expect(result.overBudgetItems[0].alternatives).toEqual([
      { productId: 'alt1', name: 'Cheaper Stay', price: 300, rating: 4.5, reviews: 50, savingsRM: 200, lat: 5.4141, lng: 100.3288, image: null },
      { productId: 'alt2', name: 'Even Cheaper Stay', price: 200, rating: 4.2, reviews: 20, savingsRM: 300, lat: 5.4141, lng: 100.3288, image: null },
    ]);
  });

  it('excludes a real listing whose product_type does not match, even though categorySlug matches (the reported landmark/food-tour bug)', async () => {
    const items = [{ productId: 'p1', name: 'PETRONAS Admission', price: 20, qty: 1, category: 'Activity', categorySlug: 'activity', state: 'Kuala Lumpur', productType: 'experience' }];
    mocks.searchActivities.mockResolvedValue([
      activity({ id: 'food-tour', name: 'Jalan Alor Street Food Crawl', price: 15, categorySlug: 'activity' }), // same categorySlug, product_type='food' — must be excluded
      activity({ id: 'real-landmark', name: 'Batu Caves Entry', price: 10, rating: 4.8, reviews: 40, categorySlug: 'activity' }),
    ]);
    const db = mockDb({ 'food-tour': 'food', 'real-landmark': 'experience' });

    const result = await evaluateBudget(items, 5, db);

    expect(result.overBudgetItems[0].alternatives).toHaveLength(1);
    expect(result.overBudgetItems[0].alternatives[0].productId).toBe('real-landmark');
  });

  it('excludes items already picked and anything not actually cheaper from alternatives', async () => {
    const items = [{ productId: 'p1', name: 'Pricey', price: 100, qty: 1, category: 'Activity', categorySlug: 'activity', state: 'Penang', productType: 'activity' }];
    mocks.searchActivities.mockResolvedValue([
      activity({ id: 'p1', name: 'Pricey', price: 100 }), // itself — must be excluded
      activity({ id: 'same-price', name: 'Same Price', price: 100 }), // not actually cheaper — excluded
      activity({ id: 'real-alt', name: 'Real Alternative', price: 60, rating: 4.0, reviews: 10 }),
    ]);
    const db = mockDb({ p1: 'activity', 'same-price': 'activity', 'real-alt': 'activity' });

    const result = await evaluateBudget(items, 50, db);

    expect(result.overBudgetItems[0].alternatives).toEqual([
      { productId: 'real-alt', name: 'Real Alternative', price: 60, rating: 4.0, reviews: 10, savingsRM: 40, lat: 5.4141, lng: 100.3288, image: null },
    ]);
  });

  it('returns an honest empty alternatives list rather than padding when nothing cheaper exists', async () => {
    const items = [{ productId: 'p1', name: 'Pricey', price: 100, qty: 1, category: 'Activity', categorySlug: 'activity', state: 'Penang', productType: 'activity' }];
    mocks.searchActivities.mockResolvedValue([]);

    const result = await evaluateBudget(items, 50, mockDb());

    expect(result.overBudgetItems[0].alternatives).toEqual([]);
  });

  it('caps at the top 3 priciest items even with more over-budget lines', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      productId: `p${i}`, name: `Item ${i}`, price: 10 + i, qty: 1, category: 'Activity', categorySlug: 'activity', state: 'Penang', productType: 'activity',
    }));
    mocks.searchActivities.mockResolvedValue([]);

    const result = await evaluateBudget(items, 5, mockDb());

    expect(result.overBudgetItems).toHaveLength(3);
    // Priciest three: p4 (14), p3 (13), p2 (12).
    expect(result.overBudgetItems.map((i) => i.productId)).toEqual(['p4', 'p3', 'p2']);
  });
});
