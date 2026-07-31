import { describe, expect, it } from 'vitest';
import { getBookingOrderItem, selectBookingOutlet } from '@/lib/vendor/booking-scope';

describe('vendor booking scope', () => {
  it('normalizes an array-shaped order item relation for ownership checks', () => {
    expect(getBookingOrderItem([{ vendor_id: 'vendor-1', outlet_id: 'outlet-1' }])).toEqual({
      vendorId: 'vendor-1',
      outletId: 'outlet-1',
    });
  });

  it('uses the order-item outlet before a conflicting booking-slot outlet', () => {
    expect(selectBookingOutlet(
      { id: 'order-outlet', name: 'Rasa Malaysia — Kuah' },
      { id: 'slot-outlet', name: 'Warisan Cultural Journeys — Johor Bahru' },
    )).toEqual({ id: 'order-outlet', name: 'Rasa Malaysia — Kuah' });
  });

  it('falls back to the slot outlet when the order-item outlet is unavailable', () => {
    expect(selectBookingOutlet(null, { id: 'slot-outlet', name: 'Fallback outlet' })).toEqual({
      id: 'slot-outlet',
      name: 'Fallback outlet',
    });
  });
});
