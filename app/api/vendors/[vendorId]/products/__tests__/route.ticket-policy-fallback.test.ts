import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeVendor: vi.fn(),
  from: vi.fn(),
  getOutletProductIds: vi.fn(),
}));

vi.mock('@/lib/vendor-authorization', () => ({
  authorizeVendor: mocks.authorizeVendor,
}));

vi.mock('@/backend/domains/catalogue', () => ({
  getOutletProductIds: mocks.getOutletProductIds,
}));

import { GET } from '../route';

function productsQuery(result: unknown) {
  const query = {
    contains: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
    range: vi.fn(),
    select: vi.fn(),
  };

  for (const method of ['contains', 'eq', 'ilike', 'in', 'or', 'range', 'select'] as const) {
    query[method].mockReturnValue(query);
  }

  return query;
}

describe('GET /api/vendors/:vendorId/products ticket-policy schema fallback', () => {
  it('retries the legacy selection and supplies historical defaults for an unapplied ticket migration', async () => {
    const missingColumnQuery = productsQuery({
      count: null,
      data: null,
      error: { message: 'column products.ticket_entry_policy does not exist' },
    });
    const legacyQuery = productsQuery({
      count: 1,
      data: [
        {
          id: 'product-1',
          name: 'Morning beach pass',
          outlet_id: 'outlet-1',
          outlet_offers: [],
          outlets: { city: 'Kuantan', id: 'outlet-1', name: 'Pine Beach' },
          product_variants: [],
          requires_booking: true,
          status: 'active',
          tags: [],
        },
      ],
      error: null,
    });
    const metricsQuery = {
      in: vi.fn().mockResolvedValue({ data: [] }),
      select: vi.fn().mockReturnThis(),
    };

    mocks.authorizeVendor.mockResolvedValue({
      access: {
        outletIds: ['outlet-1'],
        serviceDb: { from: mocks.from },
      },
      ok: true,
    });
    mocks.from
      .mockReturnValueOnce(missingColumnQuery)
      .mockReturnValueOnce(legacyQuery)
      .mockReturnValueOnce(metricsQuery);

    const response = await GET(new Request('http://localhost/api/vendors/vendor-1/products'), {
      params: Promise.resolve({ vendorId: 'vendor-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        items: [
          {
            ticket_entry_limit: 1,
            ticket_entry_policy: 'single_entry',
            ticket_validity_days: null,
          },
        ],
      },
    });
    expect(missingColumnQuery.select).toHaveBeenCalledWith(expect.stringContaining('ticket_entry_policy'), {
      count: 'exact',
    });
    expect(legacyQuery.select).toHaveBeenCalledWith(expect.not.stringContaining('ticket_entry_policy'), {
      count: 'exact',
    });
  });
});
