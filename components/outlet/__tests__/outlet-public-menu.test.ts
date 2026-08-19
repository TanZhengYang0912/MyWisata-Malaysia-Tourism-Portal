import { describe, expect, it } from 'vitest';
import { selectFullOutletMenu } from '@/lib/customer/outlet-shop';

describe('public outlet menu', () => {
  it('keeps all sellable products while putting configured featured products first', () => {
    const products = [
      { id: 'product-a', name: 'A', featured: false },
      { id: 'product-b', name: 'B', featured: false },
      { id: 'product-c', name: 'C', featured: false },
    ];

    expect(selectFullOutletMenu(products, ['product-c'])).toEqual([
      { id: 'product-c', name: 'C', featured: true },
      { id: 'product-a', name: 'A', featured: false },
      { id: 'product-b', name: 'B', featured: false },
    ]);
  });

  it('keeps product details tied to the outlet that owns the purchase context', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('outletId=${encodeURIComponent(outletId)}');
    expect(source).toContain('returnTo=${encodeURIComponent(`/customer/outlet/${outletId}`)}');
  });

  it('uses the professional four-column card treatment for public outlet menus', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('xl:grid-cols-4');
    expect(source).toContain('aspect-[4/3]');
    expect(source).toContain('Available at this outlet');
  });

  it('uses one detail link when a product is not ready for direct purchase', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('components/outlet/outlet-menu.tsx', 'utf8'));
    expect(source).toContain('getOutletDetailActionLabel(action.reason)');
    expect(source).not.toContain('disabled={Boolean(working) || action.kind !== "cart"}');
  });

  it('shows the current outlet position when the vendor has multiple outlets', async () => {
    const source = await import('node:fs').then(({ readFileSync }) => readFileSync('app/customer/vendor/[vendorId]/outlet/[outletId]/page.tsx', 'utf8'));
    expect(source).toContain('t("ui.labels.location")');
    expect(source).toContain('outletNavigation.currentPosition} / {outletNavigation.total');
    expect(source).toContain('t("ui.actions.viewAll")');
    expect(source).toContain('t("ui.vendor.activeOutletCount", { count: outletNavigation.total })');
  });
});
