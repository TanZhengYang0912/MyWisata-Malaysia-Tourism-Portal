import { describe, expect, it } from 'vitest';
import { getBookingViewCopy, getBookingViewStats } from '@/lib/customer/booking-view';

const now = new Date('2026-07-15T12:00:00.000Z').getTime();
const monthStart = new Date('2026-07-01T00:00:00.000Z');

describe('booking view copy and stats', () => {
  it('uses future-focused copy and stats in upcoming mode', () => {
    expect(getBookingViewCopy('upcoming')).toMatchObject({
      eyebrow: 'Your itinerary',
      title: 'Booking calendar',
      historyAction: 'View booking history',
    });
    expect(getBookingViewStats([
      { slotStartsAt: '2026-07-20T12:00:00.000Z', status: 'confirmed' },
      { slotStartsAt: '2026-08-20T12:00:00.000Z', status: 'confirmed' },
    ], 'upcoming', now, monthStart)).toEqual([
      { label: 'Upcoming bookings', value: 2 },
      { label: 'Next 30 days', value: 1 },
      { label: 'This month', value: 1 },
    ]);
  });

  it('uses history-focused copy and stats in past mode', () => {
    expect(getBookingViewCopy('past')).toMatchObject({
      eyebrow: 'Booking history',
      title: 'Booking history',
      historyAction: 'Back to upcoming',
    });
    expect(getBookingViewStats([
      { slotStartsAt: '2026-07-10T12:00:00.000Z', status: 'confirmed' },
      { slotStartsAt: '2026-07-05T12:00:00.000Z', status: 'no_show' },
    ], 'past', now, monthStart)).toEqual([
      { label: 'Past bookings', value: 2 },
      { label: 'Past this month', value: 2 },
      { label: 'Cancelled / no-show', value: 1 },
    ]);
  });

  it('uses neutral copy and stats when all bookings are shown', () => {
    expect(getBookingViewCopy('all')).toMatchObject({
      eyebrow: 'Booking overview',
      title: 'All bookings',
      historyAction: 'Back to upcoming',
    });
    expect(getBookingViewStats([
      { slotStartsAt: '2026-07-10T12:00:00.000Z', status: 'confirmed' },
      { slotStartsAt: '2026-07-20T12:00:00.000Z', status: 'confirmed' },
    ], 'all', now, monthStart)).toEqual([
      { label: 'All bookings', value: 2 },
      { label: 'Upcoming', value: 1 },
      { label: 'This month', value: 2 },
    ]);
  });
});
