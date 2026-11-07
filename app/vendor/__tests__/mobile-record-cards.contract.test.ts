import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('vendor mobile record lists and outlet cards', () => {
  it('shows redemption history as readable cards on phones and keeps the desktop table', () => {
    const source = read('app/vendor/redemptions/page.tsx');
    expect(source).toContain('data-mobile-redemption-list');
    expect(source).toContain('md:hidden');
    expect(source).toContain('hidden md:block');
  });

  it('shows event pickup orders as readable cards on phones and keeps the desktop table', () => {
    const source = read('app/vendor/event-orders/page.tsx');
    expect(source).toContain('data-mobile-event-order-list');
    expect(source).toContain('md:hidden');
    expect(source).toContain('hidden md:block');
  });

  it('uses one shared mobile card frame across orders, event orders, and redemptions', () => {
    const routePaths = [
      'app/vendor/orders/page.tsx',
      'app/vendor/event-orders/page.tsx',
      'app/vendor/redemptions/page.tsx',
      'app/vendor/outlets/page.tsx',
    ];

    for (const routePath of routePaths) {
      expect(read(routePath).includes('VendorMobileRecordCard')).toBe(true);
    }
  });

  it('shows a compact mobile orders list and preserves the desktop grid', () => {
    const source = read('app/vendor/orders/page.tsx');

    expect(source.includes('data-mobile-order-list')).toBe(true);
    expect(source.includes('xl:hidden')).toBe(true);
    expect(source.includes('hidden overflow-x-auto xl:block')).toBe(true);
    expect(source.includes('xl:grid-cols-[32px_minmax(120px,1.2fr)_minmax(170px,1.5fr)')).toBe(true);
  });

  it('uses shared mobile safe area and tops it up from the lg breakpoint', () => {
    const layout = read('app/vendor/layout.tsx');
    expect(layout.includes('pb-24')).toBe(true);

    for (const routePath of [
      'app/vendor/orders/page.tsx',
      'app/vendor/event-orders/page.tsx',
      'app/vendor/redemptions/page.tsx',
    ]) {
      expect(read(routePath).includes('pb-0 lg:pb-24')).toBe(true);
    }
  });
});
