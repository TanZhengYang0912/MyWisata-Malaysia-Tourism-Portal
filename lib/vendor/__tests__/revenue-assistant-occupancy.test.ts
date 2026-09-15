import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { computeOccupancySignal, type VendorScope } from '../revenue-assistant';

interface Slot { product_id: string; starts_at: string; capacity: number; booked: number }

function mockDb(bookingProducts: { id: string; name: string }[], slotPages: Slot[][]): SupabaseClient {
  let slotCallCount = 0;
  return {
    from: (table: string) => {
      if (table === 'products') {
        return { select: () => ({ in: () => ({ eq: () => Promise.resolve({ data: bookingProducts }) }) }) };
      }
      if (table === 'booking_slots') {
        return {
          select: () => ({
            in: () => ({
              neq: () => ({
                lt: () => ({
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
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

const SCOPE: VendorScope = { vendorId: 'v1', vendorName: 'Test Vendor', productIds: ['p1'] };
const PRODUCTS = [{ id: 'p1', name: 'City Tour' }];

// 2026-09-15 is a Tuesday. UTC noon avoids any UTC/MYT day-boundary ambiguity.
const TUESDAY = '2026-09-15T12:00:00Z';
const WEDNESDAY = '2026-09-16T12:00:00Z';

function slot(overrides: Partial<Slot> = {}): Slot {
  return { product_id: 'p1', starts_at: TUESDAY, capacity: 10, booked: 1, ...overrides };
}

describe('computeOccupancySignal', () => {
  it('returns empty without querying slots when the vendor has no listings', async () => {
    const db = mockDb([], [[]]);
    const result = await computeOccupancySignal({ ...SCOPE, productIds: [] }, db);

    expect(result).toEqual({ underbooked: [], wellBooked: [] });
  });

  it('returns empty when the vendor has no booking-required listings', async () => {
    const db = mockDb([], [[]]);
    const result = await computeOccupancySignal(SCOPE, db);

    expect(result).toEqual({ underbooked: [], wellBooked: [] });
  });

  it('buckets slots by real Malaysia-local weekday', async () => {
    const slots = [slot({ starts_at: TUESDAY }), slot({ starts_at: TUESDAY }), slot({ starts_at: TUESDAY, capacity: 10, booked: 0 })];
    const db = mockDb(PRODUCTS, [slots]);

    const result = await computeOccupancySignal(SCOPE, db);

    expect(result.underbooked).toHaveLength(1);
    expect(result.underbooked[0]).toMatchObject({ weekdayName: 'Tuesday', slotCount: 3, totalCapacity: 30, totalBooked: 2 });
  });

  it('excludes a weekday bucket below the minimum slot-count floor (noise, not a pattern)', async () => {
    // Only 2 Tuesday slots — below MIN_SLOTS_FOR_WEEKDAY_SIGNAL(3).
    const slots = [slot({ booked: 0 }), slot({ booked: 0 })];
    const db = mockDb(PRODUCTS, [slots]);

    const result = await computeOccupancySignal(SCOPE, db);

    expect(result.underbooked).toEqual([]);
    expect(result.wellBooked).toEqual([]);
  });

  it('flags a real underbooked weekday pattern (<20% occupancy)', async () => {
    const slots = Array.from({ length: 4 }, () => slot({ capacity: 20, booked: 1 })); // 5%
    const db = mockDb(PRODUCTS, [slots]);

    const result = await computeOccupancySignal(SCOPE, db);

    expect(result.underbooked[0].occupancyRate).toBeCloseTo(0.05);
    expect(result.wellBooked).toEqual([]);
  });

  it('flags a real well-booked weekday pattern (>=80% occupancy)', async () => {
    const slots = Array.from({ length: 4 }, () => slot({ capacity: 10, booked: 9 })); // 90%
    const db = mockDb(PRODUCTS, [slots]);

    const result = await computeOccupancySignal(SCOPE, db);

    expect(result.wellBooked[0].occupancyRate).toBeCloseTo(0.9);
    expect(result.underbooked).toEqual([]);
  });

  it('does not flag a healthy mid-range occupancy weekday as either underbooked or well-booked', async () => {
    const slots = Array.from({ length: 4 }, () => slot({ capacity: 10, booked: 5 })); // 50%
    const db = mockDb(PRODUCTS, [slots]);

    const result = await computeOccupancySignal(SCOPE, db);

    expect(result.underbooked).toEqual([]);
    expect(result.wellBooked).toEqual([]);
  });

  it('separates weekdays into distinct buckets and ranks underbooked worst-first', async () => {
    const tuesdaySlots = Array.from({ length: 3 }, () => slot({ starts_at: TUESDAY, capacity: 20, booked: 0 })); // 0%
    const wednesdaySlots = Array.from({ length: 3 }, () => slot({ starts_at: WEDNESDAY, capacity: 20, booked: 2 })); // 10%
    const db = mockDb(PRODUCTS, [[...tuesdaySlots, ...wednesdaySlots]]);

    const result = await computeOccupancySignal(SCOPE, db);

    expect(result.underbooked.map((s) => s.weekdayName)).toEqual(['Tuesday', 'Wednesday']);
  });

  it('paginates the slot query across pages', async () => {
    const page1 = Array.from({ length: 1000 }, () => slot({ starts_at: TUESDAY, capacity: 10, booked: 0 }));
    const page2 = Array.from({ length: 3 }, () => slot({ starts_at: TUESDAY, capacity: 10, booked: 0 }));
    const db = mockDb(PRODUCTS, [page1, page2]);

    const result = await computeOccupancySignal(SCOPE, db);

    expect(result.underbooked[0].slotCount).toBe(1003);
  });
});
