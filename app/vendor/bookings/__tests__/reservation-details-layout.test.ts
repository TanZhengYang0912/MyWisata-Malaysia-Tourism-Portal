import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'app/vendor/bookings/page.tsx'),
  'utf8',
);

describe('vendor reservation details layout', () => {
  it('centers reservation details as a modal instead of a right drawer', () => {
    expect(source).toMatch(
      /<div[\s\S]*className="fixed inset-0 z-40 flex items-center justify-center bg-gray-950\/20 p-4"/,
    );
    expect(source).toMatch(
      /<aside[\s\S]*onClick=\{\(event\) => event\.stopPropagation\(\)\}[\s\S]*className="relative max-h-\[90vh\] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"/,
    );
    expect(source).not.toContain(
      'className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto',
    );
  });

  it('renders the existing product cover in the reservation list and details modal', () => {
    expect(source).toMatch(
      /import CompactThumbnail from ["']@\/components\/vendor\/compact-thumbnail["'];/,
    );
    expect(source).toMatch(
      /import \{ productImageUrl \} from ["']@\/lib\/storage\/product-image["'];/,
    );
    expect(source).toMatch(
      /src=\{productImageUrl\(\s*booking\.slot\?\.products\?\.cover_url\s*,?\s*\)\}/,
    );
    expect(source).toMatch(
      /src=\{productImageUrl\(\s*selectedBooking\.slot\?\.products\?\.cover_url\s*,?\s*\)\}/,
    );
  });
});
