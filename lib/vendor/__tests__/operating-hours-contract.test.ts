import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outletUpdateSchema } from '@/lib/validation/vendor-schemas';

const bookingsPage = readFileSync(
  resolve(process.cwd(), 'app/vendor/bookings/page.tsx'),
  'utf8',
);

describe('operating hours contract', () => {
  it('preserves closed and note fields when validating outlet updates', () => {
    const result = outletUpdateSchema.safeParse({
      operatingHours: {
        mon: {
          open: '09:00',
          close: '18:00',
          closed: true,
          note: 'Public holiday',
        },
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.operatingHours?.mon).toEqual({
        open: '09:00',
        close: '18:00',
        closed: true,
        note: 'Public holiday',
      });
    }
  });

  it('uses distinct labels for operating hours and booking slots', () => {
    expect(bookingsPage).toMatch(/t\(["']ui\.bookings\.operatingHours["']\)/);
    expect(bookingsPage).toMatch(/t\(["']ui\.bookings\.slotsSummary["']/);
  });

  it('offers date shortcuts and explicit exception modes', () => {
    expect(bookingsPage).toMatch(/t\(["']ui\.bookings\.quickAdd["']\)/);
    expect(bookingsPage).toMatch(/t\(["']ui\.bookings\.today["']\)/);
    expect(bookingsPage).toMatch(/t\(["']ui\.bookings\.tomorrow["']\)/);
    expect(bookingsPage).toMatch(/t\(["']ui\.bookings\.thisWeekend["']\)/);
    expect(bookingsPage).toMatch(/t\(["']ui\.bookings\.closedAllDay["']\)/);
    expect(bookingsPage).toMatch(/t\(["']ui\.bookings\.customHours["']\)/);
  });
});
