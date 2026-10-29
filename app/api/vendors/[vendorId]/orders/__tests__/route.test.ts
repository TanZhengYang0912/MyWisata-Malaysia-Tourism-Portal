import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), from: vi.fn(), select: vi.fn() }));

vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));

import { GET } from '../route';

const VENDOR_ID = '1b173716-4da6-ac21-34c6-26d1384521e5';
const OUTLET_ID = '5cef7583-2294-8350-934a-4f843bca5dfc';
const ORDER_ID = '0828a24f-8095-ce02-5cf9-d9d0eab07498';
const ORDER_ITEM_ID = '078634dc-0424-45f5-9bba-06f5e6e62541';

describe('GET vendor orders by orderId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: {
        userId: 'aaaaaaaa-0000-0000-0000-000000000003',
        vendorId: VENDOR_ID,
        role: 'vendor_owner',
        outletIds: [OUTLET_ID],
        isOwner: true,
        isOutletManager: false,
        authDb: {},
        serviceDb: { from: mocks.from },
      },
    });

    const query = {
      select: mocks.select.mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{
          id: ORDER_ID,
          display_id: 'ORD-20158',
          user_id: 'aaaaaaaa-0000-0000-0000-000000000005',
          status: 'completed',
          paid_at: '2026-09-28T08:00:00.000Z',
          completed_at: '2026-09-28T08:05:00.000Z',
          created_at: '2026-09-28T08:00:00.000Z',
          order_items: [{
            id: ORDER_ITEM_ID,
            order_id: ORDER_ID,
            product_name: 'Fried Wantan',
            variant_name: null,
            slot_starts_at: null,
            quantity: 2,
            line_total: 17.82,
            fulfil_status: 'fulfilled',
            vendor_id: VENDOR_ID,
            stay_details: {
              primaryGuestName: 'Nur Aisyah',
              additionalGuestNames: ['Sam Lee'],
              adults: 2,
              estimatedArrival: 'unknown',
              specialRequest: 'Quiet room if available',
            },
            outlets: { id: OUTLET_ID, name: 'Penang Road Famous Teochew Chendul — Lebuh Keng Kwee', city: 'George Town', state: 'Penang' },
            products: { cover_url: null, categories: { slug: 'accommodation' } },
          }, {
            id: 'other-vendor-item',
            vendor_id: 'other-vendor',
            fulfil_status: 'pending',
            line_total: 100,
            quantity: 1,
            product_name: 'Other vendor room',
            outlets: { id: OUTLET_ID, name: 'Same outlet' },
            stay_details: { primaryGuestName: 'Private Guest', adults: 1, estimatedArrival: 'unknown' },
          }, {
            id: 'outside-outlet-item',
            vendor_id: VENDOR_ID,
            fulfil_status: 'pending',
            line_total: 100,
            quantity: 1,
            product_name: 'Unauthorized outlet room',
            outlets: { id: 'another-outlet', name: 'Another outlet' },
            stay_details: { primaryGuestName: 'Another Private Guest', adults: 1, estimatedArrival: 'unknown' },
          }, {
            id: 'food-item-with-invalid-stay-details',
            vendor_id: VENDOR_ID,
            fulfil_status: 'pending',
            line_total: 100,
            quantity: 1,
            product_name: 'Food item',
            outlets: { id: OUTLET_ID, name: 'Authorized outlet' },
            products: { categories: { slug: 'food' } },
            stay_details: { primaryGuestName: 'Private Food Guest', adults: 1, estimatedArrival: 'unknown' },
          }],
        }],
        error: null,
        count: 1,
      }),
    };
    mocks.from.mockReturnValue(query);
  });

  it('returns PostgreSQL UUID order IDs whose bits are outside the RFC version and variant ranges', async () => {
    const response = await GET(
      new Request(`http://localhost/api/vendors/${VENDOR_ID}/orders?orderId=${ORDER_ID}`),
      { params: Promise.resolve({ vendorId: VENDOR_ID }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({
      id: ORDER_ID,
      display_id: 'ORD-20158',
      product_summary: '2x Fried Wantan, 1x Food item',
      vendor_items: expect.arrayContaining([
        expect.objectContaining({
          id: ORDER_ITEM_ID,
          product_name: 'Fried Wantan',
          outlets: expect.objectContaining({ id: OUTLET_ID }),
          stay_details: expect.objectContaining({ primaryGuestName: 'Nur Aisyah' }),
        }),
        expect.objectContaining({ id: 'food-item-with-invalid-stay-details', stay_details: null }),
      ]),
    });
    expect(payload.data.items[0].vendor_items).toHaveLength(2);
    expect(JSON.stringify(payload.data.items[0].vendor_items)).not.toContain('Private Guest');
    expect(JSON.stringify(payload.data.items[0].vendor_items)).not.toContain('Another Private Guest');
    expect(JSON.stringify(payload.data.items[0].vendor_items)).not.toContain('Private Food Guest');
    expect(JSON.stringify(payload.data.items[0])).not.toContain('Another Private Guest');
    expect(JSON.stringify(payload.data.items[0])).not.toContain('Private Food Guest');
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('stay_details'), expect.anything());
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining('categories(slug)'), expect.anything());
    expect(mocks.from).toHaveBeenCalledWith('orders');
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(VENDOR_ID, undefined, { requireApproved: true });
  });
});
