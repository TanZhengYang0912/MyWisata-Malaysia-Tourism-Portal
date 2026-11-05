import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/backend/supabase', () => ({ supabase: {} }));
import { findGlobalSearchCandidates } from '../catalogue';

type Call = { table: string; filters: [string, ...unknown[]][] };

/** A chainable fake PostgREST client: each awaited query resolves from `answer`. */
function fakeDb(answer: (call: Call) => unknown[]) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'ilike', 'or', 'in', 'limit', 'order']) {
        builder[method] = (...args: unknown[]) => { call.filters.push([method, ...args]); return builder; };
      }
      builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: answer(call), error: null });
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const has = (call: Call, method: string, ...args: unknown[]) => call.filters.some(([m, ...rest]) => m === method && JSON.stringify(rest) === JSON.stringify(args));

describe('findGlobalSearchCandidates', () => {
  it('collects products by name, category label and outlet place, and vendors by name and outlet place', async () => {
    const { db, calls } = fakeDb((call) => {
      if (call.table === 'categories') return [{ id: 'cat-food', name: 'Food', slug: 'food' }, { id: 'cat-other', name: 'Stays', slug: 'stays' }];
      if (call.table === 'vendors') return [{ id: 'vendor-named' }];
      if (call.table === 'outlets') return [{ id: 'outlet-1', vendor_id: 'vendor-placed' }];
      if (call.table === 'outlet_offers') return [{ product_id: 'product-offer' }];
      if (has(call, 'ilike', 'name', '%Food%')) return [{ id: 'product-named' }];
      if (call.filters.some(([m, column]) => m === 'in' && column === 'category_id')) return [{ id: 'product-category' }];
      if (call.filters.some(([m, column]) => m === 'in' && column === 'outlet_id')) return [{ id: 'product-outlet' }, { id: 'product-named' }];
      return [];
    });

    const result = await findGlobalSearchCandidates(' Food ', db);

    expect(result.productIds).toEqual(['product-named', 'product-category', 'product-outlet', 'product-offer']);
    expect(result.vendorIds).toEqual(['vendor-named', 'vendor-placed']);
    const categoryRead = calls.find((call) => call.filters.some(([m, column]) => m === 'in' && column === 'category_id'));
    expect(categoryRead && has(categoryRead, 'in', 'category_id', ['cat-food'])).toBe(true);
    const outletRead = calls.find((call) => call.table === 'outlets');
    expect(outletRead && has(outletRead, 'or', 'city.ilike.%Food%,state.ilike.%Food%')).toBe(true);
  });

  it('sends long outlet lists in batches of 100', async () => {
    const outlets = Array.from({ length: 250 }, (_, index) => ({ id: `outlet-${index}`, vendor_id: null }));
    const { db, calls } = fakeDb((call) => (call.table === 'outlets' ? outlets : call.table === 'categories' ? [] : []));

    await findGlobalSearchCandidates('Penang', db);

    const batchSizes = calls
      .filter((call) => call.table === 'outlet_offers')
      .map((call) => (call.filters.find(([m, column]) => m === 'in' && column === 'outlet_id')?.[2] as string[]).length);
    expect(batchSizes).toEqual([100, 100, 50]);
  });

  it('reads nothing for a query made only of filter syntax', async () => {
    const { db, calls } = fakeDb(() => []);
    expect(await findGlobalSearchCandidates('(),%', db)).toEqual({ productIds: [], vendorIds: [] });
    expect(calls).toHaveLength(0);
  });
});
