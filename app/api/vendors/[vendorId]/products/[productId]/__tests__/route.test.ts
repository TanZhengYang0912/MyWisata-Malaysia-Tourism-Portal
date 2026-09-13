import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeVendor: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));

import { PATCH } from '../route';

const vendorId = 'vendor-1';
const productId = 'product-shared';
const assignedOutletId = 'outlet-assigned';

function access() {
  return {
    ok: true,
    access: {
      userId: 'user-1',
      vendorId,
      role: 'vendor_owner',
      outletIds: [assignedOutletId],
      isOwner: true,
      isOutletManager: false,
      authDb: {},
      serviceDb: { from: mocks.from },
    },
  };
}

describe('PATCH vendor product shared outlet scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue(access());

    const productQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockImplementation(() => {
        productQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
        return productQuery;
      }),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: productId,
          outlet_id: null,
          outlet_offers: [{ outlet_id: assignedOutletId, status: 'active' }],
        },
        error: null,
      }),
    };
    const updateQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: productId, status: 'active' }, error: null }),
    };
    mocks.from.mockImplementation((table: string) => table === 'products' && mocks.from.mock.calls.length === 1 ? productQuery : updateQuery);
  });

  it('restores a shared product through its active outlet offer', async () => {
    const response = await PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ status: 'active' }) }),
      { params: Promise.resolve({ vendorId, productId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('products');
  });

  it('persists draft content with a draft review status', async () => {
    let updatePayload: Record<string, unknown> | undefined;
    const updateQuery = {
      update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        updatePayload = payload;
        return updateQuery;
      }),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: productId, review_status: 'draft', status: 'inactive' }, error: null }),
    };
    const productQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: productId, outlet_id: null, outlet_offers: [{ outlet_id: assignedOutletId, status: 'active' }] },
        error: null,
      }),
    };
    mocks.from.mockImplementationOnce(() => productQuery).mockImplementationOnce(() => updateQuery);

    const response = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Draft chicken rice',
          description: 'Updated draft description',
          productType: 'food',
          requiresBooking: false,
          basePrice: 24,
          coverUrl: 'https://example.com/chicken-rice.jpg',
          submissionMode: 'draft',
        }),
      }),
      { params: Promise.resolve({ vendorId, productId }) },
    );

    expect(response.status).toBe(200);
    expect(updatePayload).toMatchObject({ review_status: 'draft', status: 'inactive' });
  });

  it('persists a multi-entry admission policy with its visit limit and validity', async () => {
    let updatePayload: Record<string, unknown> | undefined;
    const updateQuery = {
      update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
        updatePayload = payload;
        return updateQuery;
      }),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: productId }, error: null }),
    };
    const productQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: productId,
          outlet_id: null,
          requires_booking: true,
          ticket_entry_policy: 'single_entry',
          ticket_entry_limit: 1,
          ticket_validity_days: null,
          outlet_offers: [{ outlet_id: assignedOutletId, status: 'active' }],
        },
        error: null,
      }),
    };
    mocks.from.mockImplementationOnce(() => productQuery).mockImplementationOnce(() => updateQuery);

    const response = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          requiresBooking: true,
          ticketEntryPolicy: 'multi_entry',
          ticketEntryLimit: 5,
          ticketValidityDays: 30,
        }),
      }),
      { params: Promise.resolve({ vendorId, productId }) },
    );

    expect(response.status).toBe(200);
    expect(updatePayload).toMatchObject({
      ticket_entry_policy: 'multi_entry',
      ticket_entry_limit: 5,
      ticket_validity_days: 30,
    });
  });
});
