import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'app/vendor/bookings/page.tsx'),
  'utf8',
);

describe('vendor bookings operating-hours layout', () => {
  it('only shows the outlet selector when there is more than one outlet', () => {
    expect(source).toContain(
      'const showOutletSelector = metadataLoading || outlets.length > 1;',
    );
    expect(source).toMatch(/\{showOutletSelector &&\s*\(\s*<aside/);
  });

  it('uses a dedicated compact row for each day instead of repeating a time summary', () => {
    expect(source).toContain('function WeeklyOperatingHoursRow');
    expect(source).toContain('<WeeklyOperatingHoursRow');
    expect(source).toContain('ui.bookings.opensAt');
    expect(source).toContain('ui.bookings.closesAt');
    expect(source).toMatch(/aria-hidden="true"[\s\S]*>\s*–\s*<\/span>/);
  });
});
