import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkListingQuality, type VendorScope } from '../revenue-assistant';

interface Product {
  id: string;
  name: string;
  cover_url: string | null;
  description: string | null;
  requires_booking: boolean;
}

/** Mocks products + booking_slots exactly as checkListingQuality() queries them. */
function mockDb(products: Product[], slotPages: { product_id: string }[][] = [[]]): SupabaseClient {
  let slotCallCount = 0;
  return {
    from: (table: string) => {
      if (table === 'products') {
        return { select: () => ({ in: () => Promise.resolve({ data: products }) }) };
      }
      if (table === 'booking_slots') {
        return {
          select: () => ({
            in: () => ({
              eq: () => ({
                gte: () => ({
                  range: () => {
                    const page = slotPages[slotCallCount] ?? [];
                    slotCallCount += 1;
                    return Promise.resolve({ data: page });
                  },
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

const SCOPE: VendorScope = { vendorId: 'v1', vendorName: 'Test Vendor', productIds: ['p1'] };

function product(overrides: Partial<Product> = {}): Product {
  return { id: 'p1', name: 'Test Listing', cover_url: 'photo.jpg', description: 'A'.repeat(50), requires_booking: false, ...overrides };
}

describe('checkListingQuality', () => {
  it('returns an empty summary without querying when the vendor has no listings', async () => {
    const db = mockDb([]);
    const summary = await checkListingQuality({ ...SCOPE, productIds: [] }, db);

    expect(summary).toEqual({ totalListings: 0, flagged: [] });
  });

  it('does not flag a clean listing', async () => {
    const db = mockDb([product()]);
    const summary = await checkListingQuality(SCOPE, db);

    expect(summary.totalListings).toBe(1);
    expect(summary.flagged).toEqual([]);
  });

  it('flags a missing photo', async () => {
    const db = mockDb([product({ cover_url: null })]);
    const summary = await checkListingQuality(SCOPE, db);

    expect(summary.flagged).toEqual([{ productId: 'p1', productName: 'Test Listing', issues: ['missing_photo'] }]);
  });

  it('flags a null description and a too-short description, not a real one', async () => {
    const db1 = mockDb([product({ description: null })]);
    expect((await checkListingQuality(SCOPE, db1)).flagged[0].issues).toContain('missing_description');

    const db2 = mockDb([product({ description: 'Too short.' })]);
    expect((await checkListingQuality(SCOPE, db2)).flagged[0].issues).toContain('missing_description');

    const db3 = mockDb([product({ description: 'A'.repeat(40) })]);
    expect((await checkListingQuality(SCOPE, db3)).flagged).toEqual([]);
  });

  it('flags no_available_slots only for requires_booking listings with none, never for non-booking ones', async () => {
    const bookingNoSlots = mockDb([product({ requires_booking: true })], [[]]);
    expect((await checkListingQuality(SCOPE, bookingNoSlots)).flagged[0].issues).toEqual(['no_available_slots']);

    const nonBookingNoSlots = mockDb([product({ requires_booking: false })], [[]]);
    expect((await checkListingQuality(SCOPE, nonBookingNoSlots)).flagged).toEqual([]);
  });

  it('does not flag a booking-required listing that has a real future available slot', async () => {
    const db = mockDb([product({ requires_booking: true })], [[{ product_id: 'p1' }]]);
    const summary = await checkListingQuality(SCOPE, db);

    expect(summary.flagged).toEqual([]);
  });

  it('paginates the slot query so a result spanning a page boundary is not misreported as slot-less', async () => {
    // Two products, each requiring booking; only p2's slot lands on the second page.
    const scope: VendorScope = { ...SCOPE, productIds: ['p1', 'p2'] };
    const products = [product({ id: 'p1', requires_booking: true }), product({ id: 'p2', name: 'Second', requires_booking: true })];
    const fullPage = Array.from({ length: 1000 }, () => ({ product_id: 'p1' }));
    const secondPage = [{ product_id: 'p2' }];
    const db = mockDb(products, [fullPage, secondPage]);

    const summary = await checkListingQuality(scope, db);

    expect(summary.flagged).toEqual([]); // both p1 and p2 have a real slot once both pages are read
  });

  it('lists multiple real issues on the same listing together', async () => {
    const db = mockDb([product({ cover_url: null, description: null, requires_booking: true })], [[]]);
    const summary = await checkListingQuality(SCOPE, db);

    expect(summary.flagged[0].issues).toEqual(['missing_photo', 'missing_description', 'no_available_slots']);
  });
});
