import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), from: vi.fn(), getOutletProductIds: vi.fn() }));

vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('@/backend/domains/catalogue', () => ({ getOutletProductIds: mocks.getOutletProductIds }));

import { GET } from '../route';

function chainQuery(result: unknown) {
  const query = {
    contains: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
  };
  for (const method of ['contains', 'eq', 'in', 'or', 'range', 'select'] as const) {
    query[method].mockReturnValue(query);
  }
  query.order.mockResolvedValue(result);
  return query;
}

describe('GET /api/vendors/:vendorId/products review-state filter', () => {
  it('applies review_status in the authorized product query and preserves pagination metadata', async () => {
    const productQuery = chainQuery({
      count: 27,
      data: [{
        id: 'approved-product',
        name: 'Approved product',
        base_price: 10,
        outlet_id: 'outlet-a',
        outlets: { id: 'outlet-a', name: 'Outlet A' },
        outlet_offers: [],
        product_variants: [],
        requires_booking: false,
        review_status: 'approved',
        status: 'active',
        tags: [],
      }],
      error: null,
    });
    const metricsQuery = {
      in: vi.fn().mockResolvedValue({ data: [] }),
      select: vi.fn().mockReturnThis(),
    };
    mocks.authorizeVendor.mockResolvedValue({
      access: { outletIds: ['outlet-a'], serviceDb: { from: mocks.from } },
      ok: true,
    });
    mocks.from.mockImplementation((table: string) => table === 'products' ? productQuery : metricsQuery);

    const response = await GET(
      new Request('http://localhost/api/vendors/vendor-a/products?status=active&review_status=approved&page=2&pageSize=24'),
      { params: Promise.resolve({ vendorId: 'vendor-a' }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.items.map((item: { id: string }) => item.id)).toEqual(['approved-product']);
    expect(payload.data.pagination).toMatchObject({ page: 2, pageSize: 24, total: 27, totalPages: 2 });
    expect(productQuery.eq).toHaveBeenCalledWith('vendor_id', 'vendor-a');
    expect(productQuery.eq).toHaveBeenCalledWith('status', 'active');
    expect(productQuery.eq).toHaveBeenCalledWith('review_status', 'approved');
    expect(productQuery.range).toHaveBeenCalledWith(24, 47);
  });
});
