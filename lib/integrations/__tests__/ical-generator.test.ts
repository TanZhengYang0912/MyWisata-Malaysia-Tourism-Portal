import { describe, expect, it } from 'vitest';
import { generateOutletIcalFeed } from '@/lib/integrations/ical-generator';

describe('iCalendar generator for external booking sync', () => {
  it('generates standard RFC 5545 VCALENDAR feed with VEVENT records', () => {
    const feed = generateOutletIcalFeed('Penang Heritage Hub', [
      {
        id: 'slot-1',
        productName: 'George Town Street Tour',
        startsAt: '2026-09-10T10:00:00.000Z',
        endsAt: '2026-09-10T12:00:00.000Z',
        capacity: 15,
        booked: 10,
        status: 'available',
      },
      {
        id: 'slot-2',
        productName: 'Penang Food Trail',
        startsAt: '2026-09-10T14:00:00.000Z',
        endsAt: '2026-09-10T16:00:00.000Z',
        capacity: 8,
        booked: 8,
        status: 'full',
      },
    ]);

    expect(feed).toContain('BEGIN:VCALENDAR');
    expect(feed).toContain('VERSION:2.0');
    expect(feed).toContain('X-WR-CALNAME:MyWisata - Penang Heritage Hub');
    expect(feed).toContain('UID:slot-1@mywisata.com');
    expect(feed).toContain('SUMMARY:George Town Street Tour (10/15 Booked)');
    expect(feed).toContain('UID:slot-2@mywisata.com');
    expect(feed).toContain('SUMMARY:Penang Food Trail (8/8 Booked)');
    expect(feed).toContain('END:VCALENDAR');
  });

  it('handles empty slots array cleanly', () => {
    const feed = generateOutletIcalFeed('Empty Outlet', []);
    expect(feed).toContain('BEGIN:VCALENDAR');
    expect(feed).toContain('END:VCALENDAR');
    expect(feed).not.toContain('BEGIN:VEVENT');
  });
});
