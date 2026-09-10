import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/vendor/bookings/page.tsx'), 'utf8');

describe('vendor reservation details layout', () => {
  it('centers reservation details as a modal instead of a right drawer', () => {
    expect(source).toContain(
      '<div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-950/20 p-4"',
    );
    expect(source).toContain(
      '<aside onClick={(event) => event.stopPropagation()} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">',
    );
    expect(source).not.toContain('className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto');
  });

  it('renders the existing product cover in the reservation list and details modal', () => {
    expect(source).toContain("import CompactThumbnail from '@/components/vendor/compact-thumbnail';");
    expect(source).toContain("import { productImageUrl } from '@/lib/storage/product-image';");
    expect(source).toContain('src={productImageUrl(booking.slot?.products?.cover_url)}');
    expect(source).toContain('src={productImageUrl(selectedBooking.slot?.products?.cover_url)}');
  });
});
