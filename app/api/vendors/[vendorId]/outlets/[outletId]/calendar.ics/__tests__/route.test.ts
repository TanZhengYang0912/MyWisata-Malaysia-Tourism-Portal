import { describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from '@/lib/supabase/service';

describe('GET /api/vendors/[vendorId]/outlets/[outletId]/calendar.ics', () => {
  const vendorId = 'v-1';
  const outletId = 'out-1';

  it('generates an RFC 5545 iCalendar stream with correct headers and slots', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'outlets') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: outletId, name: 'Heritage Walk Outlet', vendor_id: vendorId },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'booking_slots') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'slot-100',
                        starts_at: '2026-09-12T09:00:00.000Z',
                        ends_at: '2026-09-12T11:00:00.000Z',
                        capacity: 20,
                        booked: 12,
                        status: 'available',
                        products: { name: 'Old Town Heritage Tour' },
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      }),
    } as any);

    const response = await GET(new Request('http://localhost:3000'), {
      params: Promise.resolve({ vendorId, outletId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/calendar');
    const text = await response.text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('Old Town Heritage Tour (12/20 Booked)');
    expect(text).toContain('UID:slot-100@mywisata.com');
  });

  it('returns 404 when outlet is not found', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any);

    const response = await GET(new Request('http://localhost:3000'), {
      params: Promise.resolve({ vendorId, outletId: 'missing' }),
    });

    expect(response.status).toBe(404);
  });
});
