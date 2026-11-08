import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOMMODATION_CATEGORY_ID } from '@/lib/customer/hotel-outlet';

const mocks = vi.hoisted(() => ({
  authorizeVendor: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/vendor-authorization', () => ({
  authorizeVendor: mocks.authorizeVendor,
}));

import { GET } from '../route';

function createQuery(result: unknown) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    not: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };

  for (const method of ['eq', 'in', 'is', 'not', 'or', 'order', 'range', 'select'] as const) {
    query[method].mockReturnValue(query);
  }

  return query;
}

function outletRecord(id: string, productsCount: number) {
  return {
    id,
    display_id: id,
    name: `Outlet ${id}`,
    slug: id,
    address: null,
    city: 'George Town',
    state: 'Penang',
    lat: null,
    lng: null,
    phone: null,
    email: null,
    status: 'active',
    outlet_pages: [],
    products: [{ count: productsCount }],
    outlet_managers: [],
    outlet_manager_invitations: [],
  };
}

function setupOutletsApi(
  outlets: ReturnType<typeof outletRecord>[],
  listingSummaries: Array<{
    outlet_id: string;
    products_count: number;
    is_accommodation_outlet: boolean;
  }>,
  listingSummaryError: { message: string } | null = null,
) {
  const results: Record<string, unknown[]> = {
    outlets: [
      { data: outlets, count: outlets.length, error: null },
      { data: [{ state: 'Penang' }], error: null },
    ],
    places: [{ data: [], error: null }],
    media_assets: [{ data: [], error: null }],
  };
  const queries = new Map<string, ReturnType<typeof createQuery>[]>();

  mocks.from.mockImplementation((table: string) => {
    const result = results[table]?.shift();
    if (!result) throw new Error(`Unexpected query for ${table}`);
    const query = createQuery(result);
    queries.set(table, [...(queries.get(table) ?? []), query]);
    return query;
  });
  mocks.rpc.mockResolvedValue({
    data: listingSummaries,
    error: listingSummaryError,
  });
  mocks.authorizeVendor.mockResolvedValue({
    ok: true,
    access: {
      outletIds: outlets.map(({ id }) => id),
      serviceDb: { from: mocks.from, rpc: mocks.rpc },
      isOutletManager: false,
    },
  });

  return queries;
}

describe('GET /api/vendors/:vendorId/outlets listing counts', () => {
  beforeEach(() => {
    mocks.authorizeVendor.mockReset();
    mocks.from.mockReset();
    mocks.rpc.mockReset();
  });

  it('maps database listing summaries and defaults outlets with no rows to zero', async () => {
    const queries = setupOutletsApi(
      [outletRecord('outlet-a', 1), outletRecord('outlet-b', 0)],
      [{ outlet_id: 'outlet-a', products_count: 2, is_accommodation_outlet: true }],
    );

    const response = await GET(
      new Request('http://localhost/api/vendors/vendor-a/outlets'),
      { params: Promise.resolve({ vendorId: 'vendor-a' }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.items.map((item: { id: string; productsCount: number }) => ({
      id: item.id,
      productsCount: item.productsCount,
    }))).toEqual([
      { id: 'outlet-a', productsCount: 2 },
      { id: 'outlet-b', productsCount: 0 },
    ]);

    expect(payload.data.items.map((item: { id: string; isAccommodationOutlet: boolean }) => ({
      id: item.id,
      isAccommodationOutlet: item.isAccommodationOutlet,
    }))).toEqual([
      { id: 'outlet-a', isAccommodationOutlet: true },
      { id: 'outlet-b', isAccommodationOutlet: false },
    ]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_vendor_outlet_listing_summary',
      expect.objectContaining({
        p_vendor_id: 'vendor-a',
        p_outlet_ids: ['outlet-a', 'outlet-b'],
        p_accommodation_category_id: ACCOMMODATION_CATEGORY_ID,
      }),
    );
    expect(queries.has('products')).toBe(false);
    expect(queries.has('outlet_offers')).toBe(false);
  });

  it('uses one database aggregation instead of loading product and offer rows', async () => {
    const queries = setupOutletsApi(
      [outletRecord('outlet-a', 0)],
      [{ outlet_id: 'outlet-a', products_count: 502, is_accommodation_outlet: false }],
    );

    const response = await GET(
      new Request('http://localhost/api/vendors/vendor-a/outlets'),
      { params: Promise.resolve({ vendorId: 'vendor-a' }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { items: [{ id: 'outlet-a', productsCount: 502 }] },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_vendor_outlet_listing_summary',
      expect.objectContaining({ p_outlet_ids: ['outlet-a'] }),
    );
    expect(queries.has('products')).toBe(false);
    expect(queries.has('outlet_offers')).toBe(false);
  });

  it('fails the request if the summary RPC cannot return complete counts', async () => {
    const queries = setupOutletsApi(
      [outletRecord('outlet-a', 0)],
      [],
      { message: 'summary unavailable' },
    );

    const response = await GET(
      new Request('http://localhost/api/vendors/vendor-a/outlets'),
      { params: Promise.resolve({ vendorId: 'vendor-a' }) },
    );

    expect(response.status).toBe(500);
    expect(queries.has('products')).toBe(false);
    expect(queries.has('outlet_offers')).toBe(false);
  });
});
